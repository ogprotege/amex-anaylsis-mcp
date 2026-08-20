import { addDays, daysBetween } from './dates.js';
import { exportToCsv, exportToExcel, exportToJson } from './exports.js';
import { generateInsights, monthlyEquivalentTotal } from './insights.js';
import { parseAmexCsvContent, parseAmexCsvFile } from './parser.js';
import { VendorUnmasker } from './unmasker.js';
import type {
  AmexTransaction,
  AnalyzeOptions,
  Anomaly,
  DuplicateCharge,
  ParseResult,
  RecurringFrequency,
  SpendingAnalysis,
  VendorProfile,
} from './types.js';

const KNOWN_SUBSCRIPTIONS = [
  'netflix',
  'spotify',
  'hulu',
  'disney',
  'hbo',
  'max.com',
  'youtube premium',
  'youtube music',
  'adobe',
  'microsoft 365',
  'office 365',
  'dropbox',
  'icloud',
  'google one',
  'google storage',
  'apple music',
  'apple tv',
  'amazon prime',
  'prime video',
  'kindle',
  'audible',
  'chatgpt',
  'openai',
  'anthropic',
  'claude.ai',
  'github',
  'notion',
  'canva',
  'patreon',
  'substack',
  'nytimes',
  'new york times',
  'wsj',
  'washington post',
];

const SUBSCRIPTION_HINTS = ['subscription', 'membership', 'auto-renew', 'renewal'];

const COMPANY_ALIASES: Array<[string, string]> = [
  ['amazonses', 'Amazon'],
  ['amazon web services', 'Amazon Web Services'],
  ['amazon prime', 'Amazon Prime'],
  ['amazon', 'Amazon'],
  ['microsoft 365', 'Microsoft 365'],
  ['msft', 'Microsoft'],
  ['microsoft', 'Microsoft'],
  ['google one', 'Google One'],
  ['google storage', 'Google One'],
  ['google', 'Google'],
  ['apple music', 'Apple Music'],
  ['apple', 'Apple'],
  ['netflix', 'Netflix'],
  ['spotify', 'Spotify'],
  ['adobe', 'Adobe'],
  ['starbucks', 'Starbucks'],
  ['whole foods', 'Whole Foods'],
  ['walmart', 'Walmart'],
  ['target', 'Target'],
  ['uber eats', 'Uber Eats'],
  ['uber', 'Uber'],
  ['lyft', 'Lyft'],
];

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/restaurant|food|pizza|burger|cafe|coffee|grubhub|doordash|ubereats|uber eats/i, 'Food & Dining'],
  [/uber|lyft|taxi|transit|parking/i, 'Transportation'],
  [/amazon|walmart|target|store|shop|marketplace/i, 'Shopping'],
  [/netflix|spotify|hulu|disney|hbo|entertainment/i, 'Entertainment'],
  [/gas|fuel|shell|exxon|chevron/i, 'Gas & Fuel'],
  [/hotel|airbnb|lodging|resort/i, 'Travel & Lodging'],
  [/gym|fitness|health|medical|pharmacy/i, 'Health & Wellness'],
  [/software|saas|cloud|adobe|microsoft|github|openai|chatgpt/i, 'Software & Services'],
  [/insurance|bank|finance/i, 'Financial Services'],
];

const SCAM_KEYWORDS = ['verify', 'urgent', 'suspended', 'locked', 'prize', 'winner', 'claim', 'verify account'];

export class AmexSpendingAnalyzer {
  private vendors = new Map<string, VendorProfile>();
  private transactions: AmexTransaction[] = [];
  private vendorUnmasker = new VendorUnmasker();
  private lastParse: ParseResult | null = null;
  private sourcePath?: string;

  reset(): void {
    this.vendors.clear();
    this.transactions = [];
    this.lastParse = null;
    this.sourcePath = undefined;
  }

  async parseAmexCsv(filePath: string): Promise<ParseResult> {
    this.reset();
    const parsed = await parseAmexCsvFile(filePath);
    this.sourcePath = filePath;
    this.applyParse(parsed);
    return parsed;
  }

  parseCsvContent(content: string, sourceName = 'csv'): ParseResult {
    this.reset();
    const parsed = parseAmexCsvContent(content, sourceName);
    this.applyParse(parsed);
    return parsed;
  }

  getTransactions(): AmexTransaction[] {
    return this.transactions;
  }

  getVendors(): VendorProfile[] {
    return Array.from(this.vendors.values());
  }

  getSourcePath(): string | undefined {
    return this.sourcePath;
  }

  getLastParse(): ParseResult | null {
    return this.lastParse;
  }

  analyze(options: AnalyzeOptions = {}): SpendingAnalysis {
    const filtered = this.filterTransactions(options);
    if (filtered.length === 0) {
      throw new Error('No transactions matched the requested filters.');
    }
    const vendors = this.buildVendorProfiles(filtered);

    const charges = filtered.filter((tx) => tx.kind === 'charge');
    const credits = filtered.filter((tx) => tx.kind === 'credit');
    const payments = filtered.filter((tx) => tx.kind === 'payment');
    const totalSpent = charges.reduce((sum, tx) => sum + tx.amount, 0);
    const creditsTotal = credits.reduce((sum, tx) => sum + tx.amount, 0);
    const paymentsTotal = payments.reduce((sum, tx) => sum + tx.amount, 0);

    const dates = filtered.map((tx) => tx.date.getTime());
    const dateRange = {
      start: new Date(Math.min(...dates)),
      end: new Date(Math.max(...dates)),
    };

    const subscriptions = vendors.filter((vendor) => vendor.metadata.isSubscription);
    const categoryBreakdown: SpendingAnalysis['categoryBreakdown'] = {};
    for (const vendor of vendors) {
      const category = vendor.category || 'Other';
      if (!categoryBreakdown[category]) {
        categoryBreakdown[category] = { total: 0, count: 0, percentage: 0, vendors: [] };
      }
      categoryBreakdown[category].total += vendor.totalSpent;
      categoryBreakdown[category].count += vendor.transactionCount;
      categoryBreakdown[category].vendors.push(vendor.displayName);
    }
    for (const stats of Object.values(categoryBreakdown)) {
      stats.percentage = totalSpent > 0 ? (stats.total / totalSpent) * 100 : 0;
    }

    const obscured = vendors.filter((vendor) => vendor.metadata.isObscured);
    const unmaskingReport = obscured.length
      ? this.vendorUnmasker.generateObscuredVendorReport(
          obscured.map((vendor) => ({
            originalDescription: vendor.metadata.originalDescription || vendor.name,
            processor: vendor.metadata.processor || 'Unknown',
            extractedVendor: vendor.displayName,
            confidence: vendor.metadata.unmaskingConfidence || 0,
            category: vendor.category,
            metadata: {
              extractionMethod: 'automated',
              isObscured: true,
              needsManualReview: vendor.metadata.needsManualReview || false,
              possibleVendors: vendor.metadata.possibleVendors,
            },
          }))
        )
      : undefined;

    const unusedDays = options.unusedSubscriptionDays ?? 60;
    const insights = generateInsights(vendors, subscriptions, categoryBreakdown, dateRange.end, unusedDays);

    if (unmaskingReport && unmaskingReport.totalObscured > 0) {
      insights.push({
        type: 'obscured_vendors',
        message: `${unmaskingReport.totalObscured} processor-masked merchant${unmaskingReport.totalObscured === 1 ? '' : 's'}; ${unmaskingReport.needingReview.length} need review.`,
        actionable: true,
      });
    }

    const sortedVendors = [...vendors].sort((a, b) => b.totalSpent - a.totalSpent);

    return {
      scanDate: new Date(),
      dateRange,
      totalSpent,
      creditsTotal,
      paymentsTotal,
      netSpent: totalSpent - creditsTotal,
      vendorCount: vendors.length,
      transactionCount: filtered.length,
      chargeCount: charges.length,
      subscriptionCount: subscriptions.length,
      subscriptionTotal: subscriptions.reduce((sum, vendor) => sum + vendor.totalSpent, 0),
      monthlySubscriptionCost: monthlyEquivalentTotal(subscriptions),
      topVendors: sortedVendors.slice(0, 20),
      vendors: sortedVendors,
      categoryBreakdown,
      recurringCharges: vendors.filter((vendor) => vendor.isRecurring),
      anomalies: this.collectAnomalies(vendors),
      duplicateCharges: this.findDuplicateCharges(filtered),
      insights,
      unmaskingReport,
      parseWarnings: this.lastParse?.warnings ?? [],
      skippedRows: this.lastParse?.skippedRows ?? 0,
      signConvention: this.lastParse?.signConvention ?? 'positive-charges',
      sourcePath: this.sourcePath,
    };
  }

  async exportToExcel(analysis: SpendingAnalysis, outputPath: string): Promise<void> {
    return exportToExcel(analysis, outputPath);
  }

  async exportToCsv(analysis: SpendingAnalysis, outputPath: string): Promise<void> {
    return exportToCsv(analysis, outputPath);
  }

  async exportToJson(analysis: SpendingAnalysis, outputPath: string): Promise<void> {
    return exportToJson(analysis, outputPath);
  }

  private applyParse(parsed: ParseResult): void {
    this.lastParse = parsed;
    this.transactions = parsed.transactions;
    this.vendors = this.groupVendors(this.transactions);
  }

  private filterTransactions(options: AnalyzeOptions): AmexTransaction[] {
    return this.transactions.filter((tx) => {
      if (options.minAmount !== undefined && tx.amount < options.minAmount) return false;
      if (options.dateRange?.start && tx.date < options.dateRange.start) return false;
      if (options.dateRange?.end && tx.date > options.dateRange.end) return false;
      return true;
    });
  }

  private buildVendorProfiles(transactions: AmexTransaction[]): VendorProfile[] {
    const grouped = this.groupVendors(transactions);
    return Array.from(grouped.values());
  }

  private groupVendors(transactions: AmexTransaction[]): Map<string, VendorProfile> {
    const vendors = new Map<string, VendorProfile>();

    for (const transaction of transactions) {
      if (transaction.kind === 'payment') continue;

      const unmasked = this.vendorUnmasker.unmaskVendor(
        transaction.description,
        transaction.extendedDetails,
        transaction.appearsOnStatementAs
      );
      const vendorName =
        unmasked.metadata.isObscured && unmasked.confidence > 0.5
          ? unmasked.extractedVendor
          : this.extractVendorName(transaction);
      const normalizedName = this.normalizeVendorName(vendorName);

      if (!vendors.has(normalizedName)) {
        vendors.set(normalizedName, {
          name: vendorName,
          normalizedName,
          displayName: this.getDisplayName(vendorName, normalizedName),
          totalSpent: 0,
          totalCredits: 0,
          netSpent: 0,
          transactionCount: 0,
          firstSeen: transaction.date,
          lastSeen: transaction.date,
          averageAmount: 0,
          minAmount: transaction.amount,
          maxAmount: transaction.amount,
          isRecurring: false,
          category: transaction.category || unmasked.category || this.inferCategory(vendorName),
          transactions: [],
          metadata: {
            isSubscription: false,
            isFraudulent: false,
            anomalyScore: 0,
            tags: [],
            isObscured: unmasked.metadata.isObscured,
            originalDescription: unmasked.metadata.isObscured ? transaction.description : undefined,
            processor: unmasked.processor !== 'Direct' ? unmasked.processor : undefined,
            unmaskingConfidence: unmasked.confidence,
            needsManualReview: unmasked.metadata.needsManualReview,
            possibleVendors: unmasked.metadata.possibleVendors,
          },
        });
      }

      const vendor = vendors.get(normalizedName)!;
      vendor.transactions.push(transaction);
      vendor.transactionCount += 1;
      if (transaction.kind === 'charge') vendor.totalSpent += transaction.amount;
      if (transaction.kind === 'credit') vendor.totalCredits += transaction.amount;
      vendor.minAmount = Math.min(vendor.minAmount, transaction.amount);
      vendor.maxAmount = Math.max(vendor.maxAmount, transaction.amount);
      if (transaction.date < vendor.firstSeen) vendor.firstSeen = transaction.date;
      if (transaction.date > vendor.lastSeen) vendor.lastSeen = transaction.date;
    }

    for (const vendor of vendors.values()) {
      vendor.netSpent = vendor.totalSpent - vendor.totalCredits;
      const chargeCount = vendor.transactions.filter((tx) => tx.kind === 'charge').length;
      vendor.averageAmount = chargeCount > 0 ? vendor.totalSpent / chargeCount : 0;
      this.analyzeRecurringPattern(vendor);
      this.detectSubscription(vendor);
      this.detectAnomalies(vendor);
    }

    return vendors;
  }

  private extractVendorName(transaction: AmexTransaction): string {
    const candidate = transaction.appearsOnStatementAs || transaction.description || transaction.extendedDetails;
    if (!candidate) return 'Unknown Vendor';
    return candidate
      .replace(/\*\d+$/, '')
      .replace(/\s+\d{2}\/\d{2}$/, '')
      .replace(/\s+#\d+$/, '')
      .trim();
  }

  normalizeVendorName(name: string): string {
    let normalized = name
      .toLowerCase()
      .replace(/[^\w\s&'-]/g, ' ')
      .replace(/\s+(inc|llc|ltd|corp|company|co)\.?$/i, '')
      .replace(/\s+#?\d+$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    const alias = this.matchAlias(normalized);
    if (alias) return alias.toLowerCase();
    return normalized || name.toLowerCase();
  }

  private getDisplayName(name: string, normalizedName: string): string {
    const alias = this.matchAlias(normalizedName);
    if (alias) return alias;
    return name
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private matchAlias(normalized: string): string | null {
    for (const [pattern, display] of COMPANY_ALIASES) {
      if (normalized === pattern || normalized.startsWith(`${pattern} `) || normalized.includes(` ${pattern} `)) {
        return display;
      }
    }
    return null;
  }

  private inferCategory(description: string): string {
    for (const [pattern, category] of CATEGORY_RULES) {
      if (pattern.test(description)) return category;
    }
    return 'Other';
  }

  private analyzeRecurringPattern(vendor: VendorProfile): void {
    const charges = vendor.transactions
      .filter((tx) => tx.kind === 'charge')
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    if (charges.length < 2) return;

    const intervals: number[] = [];
    for (let i = 1; i < charges.length; i++) {
      intervals.push(daysBetween(charges[i - 1]!.date, charges[i]!.date));
    }

    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = Math.sqrt(
      intervals.reduce((sum, interval) => sum + (interval - avgInterval) ** 2, 0) / intervals.length
    );

    const detected = detectFrequency(avgInterval, variance);
    if (!detected) return;

    vendor.isRecurring = true;
    vendor.recurringPattern = {
      frequency: detected.frequency,
      expectedAmount: vendor.averageAmount,
      variance,
      confidence: detected.confidence,
      nextExpectedDate: addDays(vendor.lastSeen, Math.round(avgInterval)),
    };
  }

  private detectSubscription(vendor: VendorProfile): void {
    const haystack = `${vendor.name} ${vendor.displayName} ${vendor.transactions[0]?.description ?? ''}`
      .toLowerCase()
      .replace(/[*:]/g, ' ')
      .replace(/\s+/g, ' ');
    const known = KNOWN_SUBSCRIPTIONS.some((name) => haystack.includes(name));
    const hinted = SUBSCRIPTION_HINTS.some((hint) => haystack.includes(hint));
    const recurring = (vendor.recurringPattern?.confidence ?? 0) >= 0.8;
    const amounts = vendor.transactions.filter((tx) => tx.kind === 'charge').map((tx) => tx.amount);
    const uniqueAmounts = new Set(amounts.map((amount) => amount.toFixed(2)));
    const consistent = uniqueAmounts.size === 1 || (uniqueAmounts.size <= 2 && amounts.length > 3);

    vendor.metadata.isSubscription = known || hinted || (recurring && consistent);
    if (vendor.metadata.isSubscription) vendor.metadata.tags.push('subscription');
  }

  private detectAnomalies(vendor: VendorProfile): void {
    let score = 0;
    const name = vendor.name.toLowerCase();

    if (SCAM_KEYWORDS.some((keyword) => name.includes(keyword))) score += 0.45;
    if (/^(email|mail|account|verify|service)$/i.test(vendor.name)) score += 0.25;

    const byDay = new Map<string, number>();
    for (const tx of vendor.transactions.filter((item) => item.kind === 'charge')) {
      const key = tx.date.toISOString().slice(0, 10);
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    if ([...byDay.values()].some((count) => count >= 3) && vendor.averageAmount > 100) score += 0.3;

    if (vendor.transactionCount > 2) {
      const amounts = vendor.transactions.map((tx) => tx.amount);
      const stdDev = standardDeviation(amounts);
      if (stdDev > vendor.averageAmount * 0.5) score += 0.2;
      const recent = vendor.transactions[vendor.transactions.length - 1]!.amount;
      if (recent > vendor.averageAmount * 2 && vendor.averageAmount > 0) score += 0.25;
    }

    vendor.metadata.anomalyScore = Math.min(score, 1);
    vendor.metadata.isFraudulent = score >= 0.6;
    if (vendor.metadata.isFraudulent) vendor.metadata.tags.push('potential_fraud');
    if (score > 0.5) vendor.metadata.tags.push('anomaly_detected');
  }

  private collectAnomalies(vendors: VendorProfile[]): Anomaly[] {
    return vendors
      .filter((vendor) => vendor.metadata.anomalyScore > 0.5)
      .map((vendor) => ({
        vendor: vendor.displayName,
        reason: this.anomalyReason(vendor),
        amount: vendor.totalSpent,
        date: vendor.lastSeen,
        severity:
          vendor.metadata.anomalyScore > 0.8 ? 'high' : vendor.metadata.anomalyScore > 0.6 ? 'medium' : 'low',
      }));
  }

  private anomalyReason(vendor: VendorProfile): string {
    const reasons: string[] = [];
    if (vendor.metadata.isFraudulent) reasons.push('Scam-like merchant wording');
    if (vendor.transactionCount > 2) {
      const amounts = vendor.transactions.map((tx) => tx.amount);
      if (standardDeviation(amounts) > vendor.averageAmount * 0.5) {
        reasons.push('High variance in amounts');
      }
    }
    return reasons.join('; ') || 'Unusual activity';
  }

  private findDuplicateCharges(transactions: AmexTransaction[]): DuplicateCharge[] {
    const grouped = new Map<string, AmexTransaction[]>();
    for (const tx of transactions.filter((item) => item.kind === 'charge')) {
      const vendor = this.normalizeVendorName(this.extractVendorName(tx));
      const key = `${tx.date.toISOString().slice(0, 10)}_${tx.amount.toFixed(2)}_${vendor}`;
      const list = grouped.get(key) ?? [];
      list.push(tx);
      grouped.set(key, list);
    }

    const duplicates: DuplicateCharge[] = [];
    for (const txs of grouped.values()) {
      if (txs.length < 2) continue;
      duplicates.push({
        vendor: this.getDisplayName(this.extractVendorName(txs[0]!), this.normalizeVendorName(this.extractVendorName(txs[0]!))),
        date: txs[0]!.date,
        amount: txs[0]!.amount,
        count: txs.length,
      });
    }
    return duplicates;
  }
}

function detectFrequency(
  avgInterval: number,
  variance: number
): { frequency: RecurringFrequency; confidence: number } | null {
  const checks: Array<{ frequency: RecurringFrequency; min: number; max: number; maxVar: number; confidence: number }> = [
    { frequency: 'daily', min: 1, max: 2, maxVar: 1, confidence: 0.9 },
    { frequency: 'weekly', min: 6, max: 8, maxVar: 2, confidence: 0.85 },
    { frequency: 'biweekly', min: 13, max: 15, maxVar: 3, confidence: 0.85 },
    { frequency: 'monthly', min: 27, max: 33, maxVar: 5, confidence: 0.9 },
    { frequency: 'quarterly', min: 85, max: 95, maxVar: 10, confidence: 0.8 },
    { frequency: 'annual', min: 350, max: 380, maxVar: 30, confidence: 0.85 },
  ];

  for (const check of checks) {
    if (avgInterval >= check.min && avgInterval <= check.max && variance <= check.maxVar) {
      return { frequency: check.frequency, confidence: check.confidence };
    }
  }
  return null;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
