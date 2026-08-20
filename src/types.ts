export type TransactionKind = 'charge' | 'credit' | 'payment';
export type TransactionDirection = 'debit' | 'credit';
export type RecurringFrequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'annual';
export type AnomalySeverity = 'low' | 'medium' | 'high';
export type SignConvention = 'negative-charges' | 'positive-charges';
export type ServerMode = 'basic' | 'standard' | 'enhanced';

export interface AmexTransaction {
  date: Date;
  description: string;
  amount: number;
  direction: TransactionDirection;
  kind: TransactionKind;
  rawAmount: number;
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
  rowNumber: number;
}

export interface RecurringPattern {
  frequency: RecurringFrequency;
  expectedAmount: number;
  variance: number;
  confidence: number;
  nextExpectedDate?: Date;
}

export interface VendorMetadata {
  isSubscription: boolean;
  isFraudulent: boolean;
  anomalyScore: number;
  tags: string[];
  isObscured: boolean;
  originalDescription?: string;
  processor?: string;
  unmaskingConfidence?: number;
  needsManualReview?: boolean;
  possibleVendors?: string[];
}

export interface VendorProfile {
  name: string;
  normalizedName: string;
  displayName: string;
  totalSpent: number;
  totalCredits: number;
  netSpent: number;
  transactionCount: number;
  firstSeen: Date;
  lastSeen: Date;
  averageAmount: number;
  minAmount: number;
  maxAmount: number;
  isRecurring: boolean;
  recurringPattern?: RecurringPattern;
  category: string;
  transactions: AmexTransaction[];
  metadata: VendorMetadata;
}

export interface CategoryStats {
  total: number;
  count: number;
  percentage: number;
  vendors: string[];
}

export interface Anomaly {
  vendor: string;
  reason: string;
  amount: number;
  date: Date;
  severity: AnomalySeverity;
}

export interface DuplicateCharge {
  vendor: string;
  date: Date;
  amount: number;
  count: number;
}

export interface Insight {
  type: string;
  message: string;
  actionable: boolean;
  savingsOpportunity?: number;
}

export interface UnmaskingReport {
  totalObscured: number;
  byProcessor: Record<string, number>;
  needingReview: Array<{
    originalDescription: string;
    processor: string;
    extractedVendor: string;
    confidence: number;
    category?: string;
    metadata: {
      extractionMethod: string;
      isObscured: boolean;
      needsManualReview: boolean;
      possibleVendors?: string[];
    };
  }>;
  suspiciousPatterns: { pattern: string; count: number; examples: string[] }[];
}

export interface ParseWarning {
  rowNumber: number;
  message: string;
}

export interface ParseResult {
  transactions: AmexTransaction[];
  skippedRows: number;
  warnings: ParseWarning[];
  signConvention: SignConvention;
  sourceName: string;
}

export interface SpendingAnalysis {
  scanDate: Date;
  dateRange: { start: Date; end: Date };
  totalSpent: number;
  creditsTotal: number;
  paymentsTotal: number;
  netSpent: number;
  vendorCount: number;
  transactionCount: number;
  chargeCount: number;
  subscriptionCount: number;
  subscriptionTotal: number;
  monthlySubscriptionCost: number;
  topVendors: VendorProfile[];
  vendors: VendorProfile[];
  categoryBreakdown: Record<string, CategoryStats>;
  recurringCharges: VendorProfile[];
  anomalies: Anomaly[];
  duplicateCharges: DuplicateCharge[];
  insights: Insight[];
  unmaskingReport?: UnmaskingReport;
  parseWarnings: ParseWarning[];
  skippedRows: number;
  signConvention: SignConvention;
  sourcePath?: string;
}

export interface AnalyzeOptions {
  dateRange?: { start?: Date; end?: Date };
  minAmount?: number;
  unusedSubscriptionDays?: number;
}

export interface UnmaskedVendor {
  originalDescription: string;
  processor: string;
  extractedVendor: string;
  confidence: number;
  category?: string;
  metadata: {
    extractionMethod: string;
    isObscured: boolean;
    needsManualReview: boolean;
    possibleVendors?: string[];
  };
}
