#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
// import * as path from 'path'; // Unused import
import Papa from 'papaparse';
import { z } from 'zod';
import { createObjectCsvWriter } from 'csv-writer';
import ExcelJS from 'exceljs';
import { VendorUnmasker } from './amex-vendor-unmasker.js';

// Amex CSV transaction schema
interface AmexTransaction {
  date: Date;
  description: string;
  amount: number;
  extendedDetails?: string;
  appearsOnStatementAs?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  reference?: string;
  category?: string;
  cardMember?: string;
}

// Vendor profile for tracking
interface VendorProfile {
  name: string;
  normalizedName: string;
  displayName: string;
  totalSpent: number;
  transactionCount: number;
  firstSeen: Date;
  lastSeen: Date;
  averageAmount: number;
  minAmount: number;
  maxAmount: number;
  isRecurring: boolean;
  recurringPattern?: {
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual';
    expectedAmount: number;
    variance: number;
    confidence: number;
    nextExpectedDate?: Date;
  };
  category: string;
  transactions: AmexTransaction[];
  metadata: {
    isSubscription: boolean;
    isFraudulent: boolean;
    anomalyScore: number;
    tags: string[];
    // Vendor unmasking metadata
    isObscured: boolean;
    originalDescription?: string;
    processor?: string;
    unmaskingConfidence?: number;
    needsManualReview?: boolean;
    possibleVendors?: string[];
  };
}

// Spending analysis result
interface SpendingAnalysis {
  scanDate: Date;
  dateRange: { start: Date; end: Date };
  totalSpent: number;
  vendorCount: number;
  transactionCount: number;
  subscriptionCount: number;
  subscriptionTotal: number;
  topVendors: VendorProfile[];
  categoryBreakdown: Record<string, {
    total: number;
    count: number;
    percentage: number;
    vendors: string[];
  }>;
  recurringCharges: VendorProfile[];
  anomalies: {
    vendor: string;
    reason: string;
    amount: number;
    date: Date;
    severity: 'low' | 'medium' | 'high';
  }[];
  duplicateCharges: {
    vendor: string;
    date: Date;
    amount: number;
    count: number;
  }[];
  insights: {
    type: string;
    message: string;
    actionable: boolean;
    savingsOpportunity?: number;
  }[];
  // Vendor unmasking report
  unmaskingReport?: {
    totalObscured: number;
    byProcessor: Record<string, number>;
    needingReview: any[];
    suspiciousPatterns: { pattern: string; count: number; examples: string[] }[];
  };
}

export class AmexSpendingAnalyzer {
  private vendors: Map<string, VendorProfile> = new Map();
  private transactions: AmexTransaction[] = [];
  private vendorUnmasker: VendorUnmasker;
  
  constructor() {
    this.vendorUnmasker = new VendorUnmasker();
  }
  
  // Subscription detection patterns (from subscripz-buster)
  private subscriptionKeywords = [
    'subscription', 'membership', 'premium', 'plan', 'recurring',
    'auto-renew', 'renewal', 'monthly', 'annual', 'weekly',
    'netflix', 'spotify', 'hulu', 'disney', 'amazon prime',
    'adobe', 'microsoft', 'google', 'apple', 'dropbox',
    'gym', 'fitness', 'club', 'insurance', 'software'
  ];

  // Fraud detection patterns
  private fraudPatterns = {
    suspiciousAmounts: [999, 399, 299, 199, 99.99],
    highDailyThreshold: 100,
    blacklistedKeywords: ['verify', 'urgent', 'suspended', 'locked'],
    knownScamPatterns: /\b(prize|winner|claim|verify account|suspended)\b/i
  };

  // Company name normalization map
  private companyNormalization: Record<string, string> = {
    'amazonses': 'Amazon',
    'aws': 'Amazon Web Services',
    'msft': 'Microsoft',
    'goog': 'Google',
    'aapl': 'Apple',
    'nflx': 'Netflix',
    'spfy': 'Spotify',
    'adbe': 'Adobe',
    'uber': 'Uber',
    'lyft': 'Lyft',
    'amzn': 'Amazon',
    'wmt': 'Walmart',
    'tgt': 'Target',
    'sbux': 'Starbucks'
  };

  async parseAmexCsv(filePath: string): Promise<void> {
    const fileContent = await fs.readFile(filePath, 'utf-8');
    
    return new Promise((resolve, reject) => {
      Papa.parse(fileContent, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          this.transactions = results.data.map((row: any) => this.parseTransaction(row));
          this.processTransactions();
          resolve();
        },
        error: (error: any) => reject(error)
      });
    });
  }

  private parseTransaction(row: any): AmexTransaction {
    // Handle different Amex CSV formats
    const dateStr = row['Date'] || row['Transaction Date'] || row['date'];
    const description = row['Description'] || row['Merchant Name'] || row['description'] || '';
    const amount = parseFloat(row['Amount'] || row['amount'] || '0');
    
    return {
      date: new Date(dateStr),
      description: description,
      amount: Math.abs(amount), // Amex may use negative for credits
      extendedDetails: row['Extended Details'] || row['Additional Info'],
      appearsOnStatementAs: row['Appears On Your Statement As'] || row['Statement Description'],
      address: row['Address'],
      city: row['City/Town'] || row['City'],
      state: row['State/Province'] || row['State'],
      zipCode: row['Zip Code'] || row['Postal Code'],
      country: row['Country'],
      reference: row['Reference'] || row['Transaction ID'],
      category: row['Category'] || this.inferCategory(description),
      cardMember: row['Card Member'] || row['Account Name']
    };
  }

  private inferCategory(description: string): string {
    const desc = description.toLowerCase();
    
    // Category inference rules
    if (desc.match(/restaurant|food|pizza|burger|cafe|coffee/)) return 'Food & Dining';
    if (desc.match(/uber|lyft|taxi|transit|parking/)) return 'Transportation';
    if (desc.match(/amazon|walmart|target|store|shop/)) return 'Shopping';
    if (desc.match(/netflix|spotify|hulu|disney|entertainment/)) return 'Entertainment';
    if (desc.match(/gas|fuel|shell|exxon|chevron/)) return 'Gas & Fuel';
    if (desc.match(/hotel|airbnb|lodging|resort/)) return 'Travel & Lodging';
    if (desc.match(/insurance|bank|finance|payment/)) return 'Financial Services';
    if (desc.match(/gym|fitness|health|medical|pharmacy/)) return 'Health & Wellness';
    if (desc.match(/software|saas|cloud|adobe|microsoft/)) return 'Software & Services';
    
    return 'Other';
  }

  private processTransactions(): void {
    // Group transactions by vendor
    for (const transaction of this.transactions) {
      // First, attempt to unmask the vendor if it's obscured
      const unmaskedResult = this.vendorUnmasker.unmaskVendor(
        transaction.description,
        transaction.extendedDetails,
        transaction.appearsOnStatementAs
      );
      
      // Use the unmasked vendor name if extraction was successful
      const vendorName = unmaskedResult.metadata.isObscured && unmaskedResult.confidence > 0.5
        ? unmaskedResult.extractedVendor
        : this.extractVendorName(transaction);
      
      const normalizedName = this.normalizeVendorName(vendorName);
      
      if (!this.vendors.has(normalizedName)) {
        this.vendors.set(normalizedName, {
          name: vendorName,
          normalizedName,
          displayName: this.getDisplayName(vendorName),
          totalSpent: 0,
          transactionCount: 0,
          firstSeen: transaction.date,
          lastSeen: transaction.date,
          averageAmount: 0,
          minAmount: transaction.amount,
          maxAmount: transaction.amount,
          isRecurring: false,
          category: unmaskedResult.category || transaction.category || 'Other',
          transactions: [],
          metadata: {
            isSubscription: false,
            isFraudulent: false,
            anomalyScore: 0,
            tags: [],
            // Store unmasking metadata
            isObscured: unmaskedResult.metadata.isObscured,
            originalDescription: unmaskedResult.metadata.isObscured ? transaction.description : undefined,
            processor: unmaskedResult.processor !== 'Direct' ? unmaskedResult.processor : undefined,
            unmaskingConfidence: unmaskedResult.confidence,
            needsManualReview: unmaskedResult.metadata.needsManualReview,
            possibleVendors: unmaskedResult.metadata.possibleVendors
          }
        });
      }
      
      const vendor = this.vendors.get(normalizedName)!;
      vendor.transactions.push(transaction);
      vendor.totalSpent += transaction.amount;
      vendor.transactionCount++;
      vendor.minAmount = Math.min(vendor.minAmount, transaction.amount);
      vendor.maxAmount = Math.max(vendor.maxAmount, transaction.amount);
      
      if (transaction.date < vendor.firstSeen) vendor.firstSeen = transaction.date;
      if (transaction.date > vendor.lastSeen) vendor.lastSeen = transaction.date;
    }
    
    // Analyze each vendor
    for (const vendor of this.vendors.values()) {
      vendor.averageAmount = vendor.totalSpent / vendor.transactionCount;
      this.analyzeRecurringPattern(vendor);
      this.detectSubscription(vendor);
      this.detectFraud(vendor);
      this.calculateAnomalyScore(vendor);
    }
  }

  private extractVendorName(transaction: AmexTransaction): string {
    // Try multiple fields in order of preference
    const candidates = [
      transaction.appearsOnStatementAs,
      transaction.description,
      transaction.extendedDetails
    ].filter(Boolean);
    
    if (candidates.length === 0) return 'Unknown Vendor';
    
    let name = candidates[0]!;
    
    // Clean up common patterns
    name = name.replace(/\*\d+$/, ''); // Remove trailing *1234
    name = name.replace(/\s+\d{2}\/\d{2}$/, ''); // Remove dates
    name = name.replace(/\s+#\d+$/, ''); // Remove store numbers
    name = name.trim();
    
    return name;
  }

  private normalizeVendorName(name: string): string {
    let normalized = name.toLowerCase();
    
    // Remove common suffixes
    normalized = normalized.replace(/\s+(inc|llc|ltd|corp|company|co)\.?$/i, '');
    
    // Apply known normalizations
    for (const [pattern, replacement] of Object.entries(this.companyNormalization)) {
      if (normalized.includes(pattern)) {
        return replacement;
      }
    }
    
    // Extract core name
    const match = normalized.match(/^([a-z]+(?:\s+[a-z]+)?)/);
    return match ? match[1]! : normalized;
  }

  private getDisplayName(name: string): string {
    // Create a clean display name
    const normalized = this.normalizeVendorName(name);
    
    // Check if we have a known good name
    for (const goodName of Object.values(this.companyNormalization)) {
      if (normalized === goodName.toLowerCase()) {
        return goodName;
      }
    }
    
    // Title case the name
    return name.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private analyzeRecurringPattern(vendor: VendorProfile): void {
    if (vendor.transactionCount < 2) return;
    
    // Sort transactions by date
    const sorted = vendor.transactions.sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Calculate intervals
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const days = Math.round((sorted[i]!.date.getTime() - sorted[i-1]!.date.getTime()) / (1000 * 60 * 60 * 24));
      intervals.push(days);
    }
    
    if (intervals.length === 0) return;
    
    // Detect pattern
    const avgInterval = intervals.reduce((a, b) => a + b) / intervals.length;
    const variance = Math.sqrt(intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length);
    
    let frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual' | null = null;
    let confidence = 0;
    
    // Check for common patterns
    if (avgInterval >= 1 && avgInterval <= 2 && variance < 1) {
      frequency = 'daily';
      confidence = 0.9;
    } else if (avgInterval >= 6 && avgInterval <= 8 && variance < 2) {
      frequency = 'weekly';
      confidence = 0.85;
    } else if (avgInterval >= 13 && avgInterval <= 15 && variance < 3) {
      frequency = 'biweekly';
      confidence = 0.85;
    } else if (avgInterval >= 28 && avgInterval <= 32 && variance < 5) {
      frequency = 'monthly';
      confidence = 0.9;
    } else if (avgInterval >= 85 && avgInterval <= 95 && variance < 10) {
      frequency = 'quarterly';
      confidence = 0.8;
    } else if (avgInterval >= 350 && avgInterval <= 380 && variance < 30) {
      frequency = 'annual';
      confidence = 0.85;
    }
    
    if (frequency && confidence > 0.7) {
      vendor.isRecurring = true;
      vendor.recurringPattern = {
        frequency,
        expectedAmount: vendor.averageAmount,
        variance: variance,
        confidence,
        nextExpectedDate: this.calculateNextDate(vendor.lastSeen, avgInterval)
      };
    }
  }

  private calculateNextDate(lastDate: Date, intervalDays: number): Date {
    const next = new Date(lastDate);
    next.setDate(next.getDate() + Math.round(intervalDays));
    return next;
  }

  private detectSubscription(vendor: VendorProfile): void {
    const nameLC = vendor.name.toLowerCase();
    const descLC = vendor.transactions[0]?.description?.toLowerCase() || '';
    
    // Check for subscription keywords
    const hasKeyword = this.subscriptionKeywords.some(keyword => 
      nameLC.includes(keyword) || descLC.includes(keyword)
    );
    
    // Check for recurring pattern
    const isLikelyRecurring = vendor.isRecurring && 
      vendor.recurringPattern?.confidence! > 0.8;
    
    // Check for consistent amounts (typical of subscriptions)
    const amounts = vendor.transactions.map(t => t.amount);
    const uniqueAmounts = new Set(amounts);
    const hasConsistentAmount = uniqueAmounts.size === 1 || 
      (uniqueAmounts.size <= 2 && vendor.transactionCount > 3);
    
    vendor.metadata.isSubscription = hasKeyword || (isLikelyRecurring && hasConsistentAmount);
    
    if (vendor.metadata.isSubscription) {
      vendor.metadata.tags.push('subscription');
    }
  }

  private detectFraud(vendor: VendorProfile): void {
    const name = vendor.name.toLowerCase();
    let fraudScore = 0;
    
    // Check for suspicious amounts
    for (const amount of vendor.transactions.map(t => t.amount)) {
      if (this.fraudPatterns.suspiciousAmounts.includes(amount)) {
        fraudScore += 20;
      }
      
      // Check for daily charges over threshold
      const dailyCharges = vendor.transactions.filter(t => 
        t.date.toDateString() === vendor.transactions[0]!.date.toDateString()
      ).length;
      
      if (dailyCharges > 1 && amount > this.fraudPatterns.highDailyThreshold) {
        fraudScore += 50;
      }
    }
    
    // Check for blacklisted keywords
    if (this.fraudPatterns.blacklistedKeywords.some(keyword => name.includes(keyword))) {
      fraudScore += 30;
    }
    
    // Check for known scam patterns
    if (this.fraudPatterns.knownScamPatterns.test(name)) {
      fraudScore += 40;
    }
    
    // Generic vendor names
    if (name.match(/^(email|mail|account|verify|service)$/)) {
      fraudScore += 25;
    }
    
    vendor.metadata.isFraudulent = fraudScore > 50;
    vendor.metadata.anomalyScore = Math.max(vendor.metadata.anomalyScore, fraudScore / 100);
    
    if (vendor.metadata.isFraudulent) {
      vendor.metadata.tags.push('potential_fraud');
    }
  }

  private calculateAnomalyScore(vendor: VendorProfile): void {
    let score = vendor.metadata.anomalyScore || 0;
    
    // Check for amount anomalies
    if (vendor.transactionCount > 2) {
      const amounts = vendor.transactions.map(t => t.amount);
      const stdDev = this.calculateStdDev(amounts);
      
      // High variance in amounts
      if (stdDev > vendor.averageAmount * 0.5) {
        score += 0.2;
      }
      
      // Sudden spike
      const recentAmount = vendor.transactions[vendor.transactions.length - 1]!.amount;
      if (recentAmount > vendor.averageAmount * 2) {
        score += 0.3;
      }
    }
    
    // Unusual timing
    if (vendor.isRecurring && vendor.recurringPattern) {
      const lastInterval = this.daysBetween(
        vendor.transactions[vendor.transactions.length - 2]?.date,
        vendor.lastSeen
      );
      
      const expectedInterval = this.getExpectedInterval(vendor.recurringPattern.frequency);
      if (Math.abs(lastInterval - expectedInterval) > expectedInterval * 0.3) {
        score += 0.15;
      }
    }
    
    vendor.metadata.anomalyScore = Math.min(score, 1);
    
    if (score > 0.5) {
      vendor.metadata.tags.push('anomaly_detected');
    }
  }

  private calculateStdDev(values: number[]): number {
    const avg = values.reduce((a, b) => a + b) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b) / values.length;
    return Math.sqrt(avgSquareDiff);
  }

  private daysBetween(date1: Date | undefined, date2: Date): number {
    if (!date1) return 0;
    return Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
  }

  private getExpectedInterval(frequency: string): number {
    const intervals: Record<string, number> = {
      'daily': 1,
      'weekly': 7,
      'biweekly': 14,
      'monthly': 30,
      'quarterly': 90,
      'annual': 365
    };
    return intervals[frequency] || 30;
  }

  analyze(): SpendingAnalysis {
    const vendors = Array.from(this.vendors.values());
    const legitVendors = vendors.filter(v => !v.metadata.isFraudulent);
    
    // Separate obscured vendors that need review
    const obscuredVendors = vendors.filter(v => 
      v.metadata.isObscured && v.metadata.needsManualReview
    );
    
    // Generate unmasking report if there are obscured vendors
    let unmaskingReport;
    if (obscuredVendors.length > 0) {
      const unmaskedResults = vendors
        .filter(v => v.metadata.isObscured)
        .map(v => ({
          originalDescription: v.metadata.originalDescription || v.name,
          processor: v.metadata.processor || 'Unknown',
          extractedVendor: v.displayName,
          confidence: v.metadata.unmaskingConfidence || 0,
          category: v.category,
          metadata: {
            extractionMethod: 'automated',
            isObscured: true,
            needsManualReview: v.metadata.needsManualReview || false,
            possibleVendors: v.metadata.possibleVendors
          }
        }));
      
      unmaskingReport = this.vendorUnmasker.generateObscuredVendorReport(unmaskedResults);
    }
    
    // Calculate date range
    const allDates = this.transactions.map(t => t.date);
    const dateRange = {
      start: new Date(Math.min(...allDates.map(d => d.getTime()))),
      end: new Date(Math.max(...allDates.map(d => d.getTime())))
    };
    
    // Calculate totals
    const totalSpent = legitVendors.reduce((sum, v) => sum + v.totalSpent, 0);
    const subscriptions = legitVendors.filter(v => v.metadata.isSubscription);
    const subscriptionTotal = subscriptions.reduce((sum, v) => sum + v.totalSpent, 0);
    
    // Category breakdown
    const categoryBreakdown: SpendingAnalysis['categoryBreakdown'] = {};
    for (const vendor of legitVendors) {
      const cat = vendor.category;
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = {
          total: 0,
          count: 0,
          percentage: 0,
          vendors: []
        };
      }
      categoryBreakdown[cat].total += vendor.totalSpent;
      categoryBreakdown[cat].count += vendor.transactionCount;
      categoryBreakdown[cat].vendors.push(vendor.displayName);
    }
    
    // Calculate percentages
    for (const cat of Object.values(categoryBreakdown)) {
      cat.percentage = (cat.total / totalSpent) * 100;
    }
    
    // Find anomalies
    const anomalies = vendors
      .filter(v => v.metadata.anomalyScore > 0.5)
      .map(v => ({
        vendor: v.displayName,
        reason: this.getAnomalyReason(v),
        amount: v.totalSpent,
        date: v.lastSeen,
        severity: v.metadata.anomalyScore > 0.8 ? 'high' as const : 
                  v.metadata.anomalyScore > 0.6 ? 'medium' as const : 'low' as const
      }));
    
    // Find duplicate charges
    const duplicates = this.findDuplicateCharges();
    
    // Generate insights including unmasking insights
    const insights = this.generateInsights(legitVendors, subscriptions, categoryBreakdown);
    
    // Add unmasking-specific insights
    if (unmaskingReport && unmaskingReport.totalObscured > 0) {
      insights.push({
        type: 'obscured_vendors',
        message: `Found ${unmaskingReport.totalObscured} transactions through payment processors. ${unmaskingReport.needingReview.length} need manual review to identify the actual vendor.`,
        actionable: true
      });
      
      // Identify most used payment processors
      const topProcessor = Object.entries(unmaskingReport.byProcessor)
        .sort((a, b) => (b[1] as number) - (a[1] as number))[0];
      
      if (topProcessor) {
        insights.push({
          type: 'payment_processor_usage',
          message: `${topProcessor[0]} is your most used payment processor with ${topProcessor[1]} transactions. Consider reviewing these for subscription services.`,
          actionable: false
        });
      }
    }
    
    return {
      scanDate: new Date(),
      dateRange,
      totalSpent,
      vendorCount: legitVendors.length,
      transactionCount: this.transactions.length,
      subscriptionCount: subscriptions.length,
      subscriptionTotal,
      topVendors: legitVendors.sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 20),
      categoryBreakdown,
      recurringCharges: legitVendors.filter(v => v.isRecurring),
      anomalies,
      duplicateCharges: duplicates,
      insights,
      // Include unmasking report in analysis
      unmaskingReport
    } as SpendingAnalysis;
  }

  private getAnomalyReason(vendor: VendorProfile): string {
    const reasons = [];
    
    if (vendor.metadata.isFraudulent) {
      reasons.push('Potential fraud detected');
    }
    
    if (vendor.transactionCount > 2) {
      const amounts = vendor.transactions.map(t => t.amount);
      const stdDev = this.calculateStdDev(amounts);
      if (stdDev > vendor.averageAmount * 0.5) {
        reasons.push('High variance in transaction amounts');
      }
      
      const recentAmount = vendor.transactions[vendor.transactions.length - 1]!.amount;
      if (recentAmount > vendor.averageAmount * 2) {
        reasons.push('Recent amount spike');
      }
    }
    
    if (vendor.isRecurring && reasons.length === 0) {
      reasons.push('Irregular recurring pattern');
    }
    
    return reasons.join('; ') || 'Unusual activity detected';
  }

  private findDuplicateCharges(): SpendingAnalysis['duplicateCharges'] {
    const duplicates: SpendingAnalysis['duplicateCharges'] = [];
    
    // Group transactions by date and amount
    const grouped = new Map<string, AmexTransaction[]>();
    
    for (const tx of this.transactions) {
      const key = `${tx.date.toDateString()}_${tx.amount}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(tx);
    }
    
    // Find duplicates
    for (const [_key, txs] of grouped.entries()) {
      if (txs.length > 1) {
        // Check if they're from the same vendor (fuzzy match)
        const vendors = txs.map(tx => this.normalizeVendorName(this.extractVendorName(tx)));
        const uniqueVendors = new Set(vendors);
        
        if (uniqueVendors.size === 1) {
          duplicates.push({
            vendor: this.getDisplayName(this.extractVendorName(txs[0]!)),
            date: txs[0]!.date,
            amount: txs[0]!.amount,
            count: txs.length
          });
        }
      }
    }
    
    return duplicates;
  }

  private generateInsights(
    vendors: VendorProfile[], 
    subscriptions: VendorProfile[],
    categoryBreakdown: SpendingAnalysis['categoryBreakdown']
  ): SpendingAnalysis['insights'] {
    const insights: SpendingAnalysis['insights'] = [];
    
    // Subscription insights
    const monthlySubscriptionCost = subscriptions
      .filter(s => s.recurringPattern?.frequency === 'monthly')
      .reduce((sum, s) => sum + s.averageAmount, 0);
    
    if (monthlySubscriptionCost > 200) {
      insights.push({
        type: 'subscription_cost',
        message: `Your monthly subscriptions total $${monthlySubscriptionCost.toFixed(2)}. Consider reviewing unused services.`,
        actionable: true,
        savingsOpportunity: monthlySubscriptionCost * 0.2 // Assume 20% could be saved
      });
    }
    
    // Duplicate subscription check
    const subNames = subscriptions.map(s => s.normalizedName);
    const duplicateSubs = subNames.filter((name, index) => subNames.indexOf(name) !== index);
    
    if (duplicateSubs.length > 0) {
      insights.push({
        type: 'duplicate_subscriptions',
        message: `Found potential duplicate subscriptions: ${duplicateSubs.join(', ')}`,
        actionable: true,
        savingsOpportunity: subscriptions
          .filter(s => duplicateSubs.includes(s.normalizedName))
          .reduce((sum, s) => sum + s.averageAmount, 0)
      });
    }
    
    // Category insights
    const topCategory = Object.entries(categoryBreakdown)
      .sort((a, b) => b[1].total - a[1].total)[0];
    
    if (topCategory) {
      insights.push({
        type: 'spending_pattern',
        message: `${topCategory[0]} is your highest spending category at $${topCategory[1].total.toFixed(2)} (${topCategory[1].percentage.toFixed(1)}%)`,
        actionable: false
      });
    }
    
    // Unused subscriptions
    const now = new Date();
    const unusedSubs = subscriptions.filter(s => {
      const daysSinceLastCharge = this.daysBetween(s.lastSeen, now);
      return daysSinceLastCharge > 60 && s.recurringPattern;
    });
    
    if (unusedSubs.length > 0) {
      insights.push({
        type: 'unused_subscriptions',
        message: `${unusedSubs.length} subscriptions haven't charged in over 60 days. They may be cancelled or paused.`,
        actionable: true,
        savingsOpportunity: unusedSubs.reduce((sum, s) => sum + s.averageAmount, 0)
      });
    }
    
    // High-value vendor alert
    const highValueVendors = vendors.filter(v => v.totalSpent > 1000);
    if (highValueVendors.length > 0) {
      insights.push({
        type: 'high_value_vendors',
        message: `${highValueVendors.length} vendors account for over $1000 in spending each.`,
        actionable: false
      });
    }
    
    return insights;
  }

  async exportToExcel(analysis: SpendingAnalysis, outputPath: string): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    
    // Summary sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.addRow(['Amex Spending Analysis']);
    summarySheet.addRow(['Generated', analysis.scanDate.toLocaleString()]);
    summarySheet.addRow([]);
    summarySheet.addRow(['Total Spent', `${analysis.totalSpent.toFixed(2)}`]);
    summarySheet.addRow(['Vendors', analysis.vendorCount]);
    summarySheet.addRow(['Transactions', analysis.transactionCount]);
    summarySheet.addRow(['Subscriptions', analysis.subscriptionCount]);
    summarySheet.addRow(['Subscription Total', `${analysis.subscriptionTotal.toFixed(2)}`]);
    
    // Add unmasking summary if available
    if (analysis.unmaskingReport) {
      summarySheet.addRow([]);
      summarySheet.addRow(['Payment Processor Analysis']);
      summarySheet.addRow(['Obscured Transactions', analysis.unmaskingReport.totalObscured]);
      summarySheet.addRow(['Needing Manual Review', analysis.unmaskingReport.needingReview.length]);
      
      for (const [processor, count] of Object.entries(analysis.unmaskingReport.byProcessor)) {
        summarySheet.addRow([`${processor} Transactions`, count]);
      }
    }
    
    // Top vendors sheet with unmasking info
    const vendorsSheet = workbook.addWorksheet('Top Vendors');
    vendorsSheet.columns = [
      { header: 'Vendor', key: 'vendor', width: 30 },
      { header: 'Original Description', key: 'original', width: 35 },
      { header: 'Processor', key: 'processor', width: 15 },
      { header: 'Total Spent', key: 'total', width: 15 },
      { header: 'Transactions', key: 'count', width: 15 },
      { header: 'Average', key: 'average', width: 15 },
      { header: 'Category', key: 'category', width: 20 },
      { header: 'Is Subscription', key: 'subscription', width: 15 },
      { header: 'Frequency', key: 'frequency', width: 15 },
      { header: 'Needs Review', key: 'review', width: 15 }
    ];
    
    for (const vendor of analysis.topVendors) {
      vendorsSheet.addRow({
        vendor: vendor.displayName,
        original: vendor.metadata.originalDescription || vendor.name,
        processor: vendor.metadata.processor || 'Direct',
        total: vendor.totalSpent,
        count: vendor.transactionCount,
        average: vendor.averageAmount,
        category: vendor.category,
        subscription: vendor.metadata.isSubscription ? 'Yes' : 'No',
        frequency: vendor.recurringPattern?.frequency || 'N/A',
        review: vendor.metadata.needsManualReview ? 'Yes' : ''
      });
    }
    
    // Subscriptions sheet
    const subsSheet = workbook.addWorksheet('Subscriptions');
    subsSheet.columns = [
      { header: 'Service', key: 'service', width: 30 },
      { header: 'Monthly Cost', key: 'monthly', width: 15 },
      { header: 'Annual Cost', key: 'annual', width: 15 },
      { header: 'Frequency', key: 'frequency', width: 15 },
      { header: 'Last Charged', key: 'lastCharged', width: 20 },
      { header: 'Next Expected', key: 'nextExpected', width: 20 }
    ];
    
    for (const sub of analysis.recurringCharges.filter(v => v.metadata.isSubscription)) {
      const monthlyCost = sub.recurringPattern?.frequency === 'monthly' ? sub.averageAmount :
                         sub.recurringPattern?.frequency === 'annual' ? sub.averageAmount / 12 :
                         sub.recurringPattern?.frequency === 'quarterly' ? sub.averageAmount / 3 :
                         sub.averageAmount;
      
      subsSheet.addRow({
        service: sub.displayName,
        monthly: monthlyCost,
        annual: monthlyCost * 12,
        frequency: sub.recurringPattern?.frequency || 'Unknown',
        lastCharged: sub.lastSeen.toLocaleDateString(),
        nextExpected: sub.recurringPattern?.nextExpectedDate?.toLocaleDateString() || 'N/A'
      });
    }
    
    // Add Obscured Vendors sheet if there are any needing review
    if (analysis.unmaskingReport && analysis.unmaskingReport.needingReview.length > 0) {
      const obscuredSheet = workbook.addWorksheet('Obscured Vendors');
      obscuredSheet.columns = [
        { header: 'Original Description', key: 'original', width: 40 },
        { header: 'Extracted Vendor', key: 'extracted', width: 30 },
        { header: 'Processor', key: 'processor', width: 15 },
        { header: 'Confidence', key: 'confidence', width: 15 },
        { header: 'Possible Vendors', key: 'possible', width: 50 },
        { header: 'Total Spent', key: 'total', width: 15 },
        { header: 'Transaction Count', key: 'count', width: 15 }
      ];
      
      // Add helpful instructions at the top
      obscuredSheet.addRow(['These vendors were processed through payment systems and may need manual review']);
      obscuredSheet.addRow(['The "Possible Vendors" column shows our best guesses based on context']);
      obscuredSheet.addRow([]);
      
      // Find vendor data for each obscured transaction
      for (const obscured of analysis.unmaskingReport.needingReview.slice(0, 100)) {
        const vendor = analysis.topVendors.find(v => 
          v.metadata.originalDescription === obscured.originalDescription
        );
        
        if (vendor) {
          obscuredSheet.addRow({
            original: obscured.originalDescription,
            extracted: obscured.extractedVendor,
            processor: obscured.processor,
            confidence: `${Math.round(obscured.confidence * 100)}%`,
            possible: obscured.metadata.possibleVendors?.join(', ') || 'Unknown',
            total: vendor.totalSpent,
            count: vendor.transactionCount
          });
        }
      }
      
      // Add pattern analysis
      obscuredSheet.addRow([]);
      obscuredSheet.addRow(['Common Patterns Found:']);
      
      if (analysis.unmaskingReport.suspiciousPatterns) {
        for (const pattern of analysis.unmaskingReport.suspiciousPatterns) {
          obscuredSheet.addRow([
            pattern.pattern,
            `${pattern.count} occurrences`,
            `Examples: ${pattern.examples.slice(0, 2).join(', ')}`
          ]);
        }
      }
    }
    const categoriesSheet = workbook.addWorksheet('Categories');
    categoriesSheet.columns = [
      { header: 'Category', key: 'category', width: 25 },
      { header: 'Total Spent', key: 'total', width: 15 },
      { header: 'Percentage', key: 'percentage', width: 15 },
      { header: 'Transactions', key: 'count', width: 15 }
    ];
    
    for (const [category, data] of Object.entries(analysis.categoryBreakdown)) {
      categoriesSheet.addRow({
        category,
        total: data.total,
        percentage: `${data.percentage.toFixed(1)}%`,
        count: data.count
      });
    }
    
    // Anomalies sheet
    if (analysis.anomalies.length > 0) {
      const anomaliesSheet = workbook.addWorksheet('Anomalies');
      anomaliesSheet.columns = [
        { header: 'Vendor', key: 'vendor', width: 30 },
        { header: 'Reason', key: 'reason', width: 40 },
        { header: 'Amount', key: 'amount', width: 15 },
        { header: 'Date', key: 'date', width: 20 },
        { header: 'Severity', key: 'severity', width: 15 }
      ];
      
      for (const anomaly of analysis.anomalies) {
        anomaliesSheet.addRow({
          vendor: anomaly.vendor,
          reason: anomaly.reason,
          amount: anomaly.amount,
          date: anomaly.date.toLocaleDateString(),
          severity: anomaly.severity.toUpperCase()
        });
      }
    }
    
    // Insights sheet
    const insightsSheet = workbook.addWorksheet('Insights');
    insightsSheet.columns = [
      { header: 'Type', key: 'type', width: 20 },
      { header: 'Insight', key: 'message', width: 60 },
      { header: 'Actionable', key: 'actionable', width: 15 },
      { header: 'Savings Opportunity', key: 'savings', width: 20 }
    ];
    
    for (const insight of analysis.insights) {
      insightsSheet.addRow({
        type: insight.type.replace(/_/g, ' ').toUpperCase(),
        message: insight.message,
        actionable: insight.actionable ? 'Yes' : 'No',
        savings: insight.savingsOpportunity ? `$${insight.savingsOpportunity.toFixed(2)}` : 'N/A'
      });
    }
    
    await workbook.xlsx.writeFile(outputPath);
  }

  async exportToCsv(analysis: SpendingAnalysis, outputPath: string): Promise<void> {
    const csvWriter = createObjectCsvWriter({
      path: outputPath,
      header: [
        { id: 'vendor', title: 'Vendor' },
        { id: 'total', title: 'Total Spent' },
        { id: 'count', title: 'Transactions' },
        { id: 'average', title: 'Average Amount' },
        { id: 'category', title: 'Category' },
        { id: 'isSubscription', title: 'Is Subscription' },
        { id: 'frequency', title: 'Frequency' },
        { id: 'firstSeen', title: 'First Transaction' },
        { id: 'lastSeen', title: 'Last Transaction' }
      ]
    });
    
    const records = analysis.topVendors.map(vendor => ({
      vendor: vendor.displayName,
      total: vendor.totalSpent.toFixed(2),
      count: vendor.transactionCount,
      average: vendor.averageAmount.toFixed(2),
      category: vendor.category,
      isSubscription: vendor.metadata.isSubscription,
      frequency: vendor.recurringPattern?.frequency || 'N/A',
      firstSeen: vendor.firstSeen.toLocaleDateString(),
      lastSeen: vendor.lastSeen.toLocaleDateString()
    }));
    
    await csvWriter.writeRecords(records);
  }

  async exportToJson(analysis: SpendingAnalysis, outputPath: string): Promise<void> {
    await fs.writeFile(outputPath, JSON.stringify(analysis, null, 2));
  }
}

// MCP Server implementation
class AmexMcpServer {
  private server: Server;
  private analyzer: AmexSpendingAnalyzer;

  constructor() {
    this.server = new Server(
      {
        name: 'amex-spending-analyzer',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.analyzer = new AmexSpendingAnalyzer();
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'analyze_amex_spending',
          description: 'Analyze Amex credit card spending from CSV file',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: {
                type: 'string',
                description: 'Path to Amex CSV file',
              },
              outputFormat: {
                type: 'string',
                enum: ['json', 'excel', 'csv', 'summary'],
                description: 'Output format for results',
                default: 'summary',
              },
              outputPath: {
                type: 'string',
                description: 'Output file path (optional)',
              },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'find_subscriptions',
          description: 'Find all subscriptions in Amex transactions',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: {
                type: 'string',
                description: 'Path to Amex CSV file',
              },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'analyze_vendor',
          description: 'Get detailed analysis of a specific vendor',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: {
                type: 'string',
                description: 'Path to Amex CSV file',
              },
              vendorName: {
                type: 'string',
                description: 'Name of vendor to analyze',
              },
            },
            required: ['csvPath', 'vendorName'],
          },
        },
        {
          name: 'find_anomalies',
          description: 'Find spending anomalies and potential fraud',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: {
                type: 'string',
                description: 'Path to Amex CSV file',
              },
              severityThreshold: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
                description: 'Minimum severity to report',
                default: 'medium',
              },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'spending_by_category',
          description: 'Analyze spending broken down by category',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: {
                type: 'string',
                description: 'Path to Amex CSV file',
              },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'export_analysis',
          description: 'Export comprehensive spending analysis',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: {
                type: 'string',
                description: 'Path to Amex CSV file',
              },
              format: {
                type: 'string',
                enum: ['excel', 'csv', 'json'],
                description: 'Export format',
              },
              outputPath: {
                type: 'string',
                description: 'Output file path',
              },
            },
            required: ['csvPath', 'format', 'outputPath'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'analyze_amex_spending':
            return await this.analyzeSpending(args);
          
          case 'find_subscriptions':
            return await this.findSubscriptions(args);
          
          case 'analyze_vendor':
            return await this.analyzeVendor(args);
          
          case 'find_anomalies':
            return await this.findAnomalies(args);
          
          case 'spending_by_category':
            return await this.spendingByCategory(args);
          
          case 'export_analysis':
            return await this.exportAnalysis(args);
          
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing ${name}: ${(error as Error).message}`
        );
      }
    });
  }

  private async analyzeSpending(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      outputFormat: z.enum(['json', 'excel', 'csv', 'summary']).default('summary'),
      outputPath: z.string().optional(),
    });

    const { csvPath, outputFormat, outputPath } = schema.parse(args);

    // Reset analyzer for new analysis
    this.analyzer = new AmexSpendingAnalyzer();
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();

    // Handle output
    if (outputFormat === 'summary' || !outputPath) {
      return {
        content: [
          {
            type: 'text',
            text: this.formatSummary(analysis),
          },
        ],
      };
    }

    switch (outputFormat) {
      case 'excel':
        await this.analyzer.exportToExcel(analysis, outputPath);
        break;
      case 'csv':
        await this.analyzer.exportToCsv(analysis, outputPath);
        break;
      case 'json':
        await this.analyzer.exportToJson(analysis, outputPath);
        break;
    }

    return {
      content: [
        {
          type: 'text',
          text: `Analysis exported to ${outputPath}`,
        },
      ],
    };
  }

  private async findSubscriptions(args: any) {
    const schema = z.object({
      csvPath: z.string(),
    });

    const { csvPath } = schema.parse(args);

    this.analyzer = new AmexSpendingAnalyzer();
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();

    const subscriptions = analysis.recurringCharges
      .filter(v => v.metadata.isSubscription)
      .sort((a, b) => b.totalSpent - a.totalSpent);

    let text = `Found ${subscriptions.length} subscriptions:\n\n`;
    
    let totalMonthly = 0;
    for (const sub of subscriptions) {
      const monthly = this.getMonthlyEquivalent(sub);
      totalMonthly += monthly;
      
      text += `${sub.displayName}\n`;
      text += `  Frequency: ${sub.recurringPattern?.frequency || 'Unknown'}\n`;
      text += `  Monthly cost: $${monthly.toFixed(2)}\n`;
      text += `  Total spent: $${sub.totalSpent.toFixed(2)}\n`;
      text += `  Last charged: ${sub.lastSeen.toLocaleDateString()}\n`;
      if (sub.recurringPattern?.nextExpectedDate) {
        text += `  Next expected: ${sub.recurringPattern.nextExpectedDate.toLocaleDateString()}\n`;
      }
      text += '\n';
    }
    
    text += `\nTotal monthly subscription cost: $${totalMonthly.toFixed(2)}`;
    text += `\nTotal annual subscription cost: $${(totalMonthly * 12).toFixed(2)}`;

    return {
      content: [
        {
          type: 'text',
          text,
        },
      ],
    };
  }

  private async analyzeVendor(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      vendorName: z.string(),
    });

    const { csvPath, vendorName } = schema.parse(args);

    this.analyzer = new AmexSpendingAnalyzer();
    await this.analyzer.parseAmexCsv(csvPath);
    
    // Find matching vendor
    const vendors = Array.from(this.analyzer['vendors'].values());
    const vendor = vendors.find(v => 
      v.displayName.toLowerCase().includes(vendorName.toLowerCase()) ||
      v.name.toLowerCase().includes(vendorName.toLowerCase())
    );

    if (!vendor) {
      return {
        content: [
          {
            type: 'text',
            text: `No vendor found matching "${vendorName}"`,
          },
        ],
      };
    }

    let text = `Analysis for ${vendor.displayName}:\n\n`;
    text += `Total spent: $${vendor.totalSpent.toFixed(2)}\n`;
    text += `Transactions: ${vendor.transactionCount}\n`;
    text += `Average amount: $${vendor.averageAmount.toFixed(2)}\n`;
    text += `Amount range: $${vendor.minAmount.toFixed(2)} - $${vendor.maxAmount.toFixed(2)}\n`;
    text += `Category: ${vendor.category}\n`;
    text += `First seen: ${vendor.firstSeen.toLocaleDateString()}\n`;
    text += `Last seen: ${vendor.lastSeen.toLocaleDateString()}\n`;
    
    if (vendor.metadata.isSubscription) {
      text += `\nSubscription: YES\n`;
      if (vendor.recurringPattern) {
        text += `Frequency: ${vendor.recurringPattern.frequency}\n`;
        text += `Confidence: ${(vendor.recurringPattern.confidence * 100).toFixed(0)}%\n`;
      }
    }
    
    if (vendor.metadata.tags.length > 0) {
      text += `\nTags: ${vendor.metadata.tags.join(', ')}\n`;
    }
    
    text += `\nRecent transactions:\n`;
    const recent = vendor.transactions.slice(-5).reverse();
    for (const tx of recent) {
      text += `  ${tx.date.toLocaleDateString()}: $${tx.amount.toFixed(2)}\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text,
        },
      ],
    };
  }

  private async findAnomalies(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      severityThreshold: z.enum(['low', 'medium', 'high']).default('medium'),
    });

    const { csvPath, severityThreshold } = schema.parse(args);

    this.analyzer = new AmexSpendingAnalyzer();
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();

    const severityMap = { low: 0, medium: 1, high: 2 };
    const threshold = severityMap[severityThreshold];
    
    const anomalies = analysis.anomalies.filter(a => 
      severityMap[a.severity] >= threshold
    );

    let text = `Found ${anomalies.length} anomalies (${severityThreshold}+ severity):\n\n`;
    
    for (const anomaly of anomalies) {
      text += `${anomaly.vendor} [${anomaly.severity.toUpperCase()}]\n`;
      text += `  Reason: ${anomaly.reason}\n`;
      text += `  Amount: $${anomaly.amount.toFixed(2)}\n`;
      text += `  Date: ${anomaly.date.toLocaleDateString()}\n\n`;
    }
    
    if (analysis.duplicateCharges.length > 0) {
      text += `\nDuplicate charges found:\n`;
      for (const dup of analysis.duplicateCharges) {
        text += `  ${dup.vendor}: ${dup.count} charges of $${dup.amount.toFixed(2)} on ${dup.date.toLocaleDateString()}\n`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text,
        },
      ],
    };
  }

  private async spendingByCategory(args: any) {
    const schema = z.object({
      csvPath: z.string(),
    });

    const { csvPath } = schema.parse(args);

    this.analyzer = new AmexSpendingAnalyzer();
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();

    const sorted = Object.entries(analysis.categoryBreakdown)
      .sort((a, b) => b[1].total - a[1].total);

    let text = 'Spending by Category:\n\n';
    
    for (const [category, data] of sorted) {
      text += `${category}\n`;
      text += `  Total: $${data.total.toFixed(2)} (${data.percentage.toFixed(1)}%)\n`;
      text += `  Transactions: ${data.count}\n`;
      text += `  Top vendors: ${data.vendors.slice(0, 3).join(', ')}\n\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text,
        },
      ],
    };
  }

  private async exportAnalysis(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      format: z.enum(['excel', 'csv', 'json']),
      outputPath: z.string(),
    });

    const { csvPath, format, outputPath } = schema.parse(args);

    this.analyzer = new AmexSpendingAnalyzer();
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();

    switch (format) {
      case 'excel':
        await this.analyzer.exportToExcel(analysis, outputPath);
        break;
      case 'csv':
        await this.analyzer.exportToCsv(analysis, outputPath);
        break;
      case 'json':
        await this.analyzer.exportToJson(analysis, outputPath);
        break;
    }

    return {
      content: [
        {
          type: 'text',
          text: `Analysis exported to ${outputPath}`,
        },
      ],
    };
  }

  private formatSummary(analysis: SpendingAnalysis): string {
    let text = 'Amex Spending Analysis Summary\n';
    text += '================================\n\n';
    
    text += `Date Range: ${analysis.dateRange.start.toLocaleDateString()} - ${analysis.dateRange.end.toLocaleDateString()}\n`;
    text += `Total Spent: $${analysis.totalSpent.toFixed(2)}\n`;
    text += `Vendors: ${analysis.vendorCount}\n`;
    text += `Transactions: ${analysis.transactionCount}\n\n`;
    
    text += 'Subscriptions:\n';
    text += `  Count: ${analysis.subscriptionCount}\n`;
    text += `  Total: $${analysis.subscriptionTotal.toFixed(2)}\n`;
    text += `  Monthly equivalent: $${this.getMonthlyTotal(analysis.recurringCharges.filter(v => v.metadata.isSubscription)).toFixed(2)}\n\n`;
    
    text += 'Top 10 Vendors:\n';
    for (const vendor of analysis.topVendors.slice(0, 10)) {
      text += `  ${vendor.displayName}: $${vendor.totalSpent.toFixed(2)} (${vendor.transactionCount} transactions)\n`;
    }
    
    text += '\nTop Categories:\n';
    const topCategories = Object.entries(analysis.categoryBreakdown)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);
    
    for (const [category, data] of topCategories) {
      text += `  ${category}: $${data.total.toFixed(2)} (${data.percentage.toFixed(1)}%)\n`;
    }
    
    if (analysis.insights.length > 0) {
      text += '\nKey Insights:\n';
      for (const insight of analysis.insights) {
        text += `  • ${insight.message}\n`;
        if (insight.savingsOpportunity) {
          text += `    Potential savings: $${insight.savingsOpportunity.toFixed(2)}/month\n`;
        }
      }
    }

    return text;
  }

  private getMonthlyEquivalent(vendor: VendorProfile): number {
    if (!vendor.recurringPattern) return 0;
    
    const multipliers: Record<string, number> = {
      'daily': 30,
      'weekly': 4.33,
      'biweekly': 2.17,
      'monthly': 1,
      'quarterly': 0.33,
      'annual': 0.083
    };
    
    return vendor.averageAmount * (multipliers[vendor.recurringPattern.frequency] || 1);
  }

  private getMonthlyTotal(vendors: VendorProfile[]): number {
    return vendors.reduce((sum, v) => sum + this.getMonthlyEquivalent(v), 0);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Amex MCP server running...');
  }
}

// Run the server only if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new AmexMcpServer();
  server.run().catch(console.error);
}