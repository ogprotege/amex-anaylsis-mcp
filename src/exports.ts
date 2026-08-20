import { createObjectCsvWriter } from 'csv-writer';
import ExcelJS from 'exceljs';
import * as fs from 'fs/promises';
import { formatDate } from './dates.js';
import type { SpendingAnalysis } from './types.js';

export async function exportToExcel(analysis: SpendingAnalysis, outputPath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();

  const summary = workbook.addWorksheet('Summary');
  summary.addRow(['Amex Spending Analysis']);
  summary.addRow(['Generated', analysis.scanDate.toISOString()]);
  summary.addRow(['Source', analysis.sourcePath ?? '']);
  summary.addRow(['Date range', formatDate(analysis.dateRange.start), formatDate(analysis.dateRange.end)]);
  summary.addRow([]);
  summary.addRow(['Charges', analysis.totalSpent]);
  summary.addRow(['Credits / refunds', analysis.creditsTotal]);
  summary.addRow(['Payments', analysis.paymentsTotal]);
  summary.addRow(['Net spend', analysis.netSpent]);
  summary.addRow(['Vendors', analysis.vendorCount]);
  summary.addRow(['Transactions', analysis.transactionCount]);
  summary.addRow(['Subscriptions', analysis.subscriptionCount]);
  summary.addRow(['Monthly subscription cost', analysis.monthlySubscriptionCost]);

  if (analysis.unmaskingReport) {
    summary.addRow([]);
    summary.addRow(['Payment processors']);
    summary.addRow(['Obscured merchants', analysis.unmaskingReport.totalObscured]);
    summary.addRow(['Needing review', analysis.unmaskingReport.needingReview.length]);
    for (const [processor, count] of Object.entries(analysis.unmaskingReport.byProcessor)) {
      summary.addRow([processor, count]);
    }
  }

  const vendorsSheet = workbook.addWorksheet('Vendors');
  vendorsSheet.columns = [
    { header: 'Vendor', key: 'vendor', width: 30 },
    { header: 'Original description', key: 'original', width: 35 },
    { header: 'Processor', key: 'processor', width: 15 },
    { header: 'Charges', key: 'total', width: 14 },
    { header: 'Credits', key: 'credits', width: 14 },
    { header: 'Net', key: 'net', width: 14 },
    { header: 'Transactions', key: 'count', width: 14 },
    { header: 'Average', key: 'average', width: 14 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Subscription', key: 'subscription', width: 14 },
    { header: 'Frequency', key: 'frequency', width: 14 },
    { header: 'Needs review', key: 'review', width: 14 },
  ];

  for (const vendor of analysis.vendors) {
    vendorsSheet.addRow({
      vendor: vendor.displayName,
      original: vendor.metadata.originalDescription || vendor.name,
      processor: vendor.metadata.processor || 'Direct',
      total: vendor.totalSpent,
      credits: vendor.totalCredits,
      net: vendor.netSpent,
      count: vendor.transactionCount,
      average: vendor.averageAmount,
      category: vendor.category,
      subscription: vendor.metadata.isSubscription ? 'Yes' : 'No',
      frequency: vendor.recurringPattern?.frequency || '',
      review: vendor.metadata.needsManualReview ? 'Yes' : '',
    });
  }

  const subsSheet = workbook.addWorksheet('Subscriptions');
  subsSheet.columns = [
    { header: 'Service', key: 'service', width: 30 },
    { header: 'Monthly cost', key: 'monthly', width: 16 },
    { header: 'Frequency', key: 'frequency', width: 14 },
    { header: 'Last charged', key: 'lastCharged', width: 16 },
    { header: 'Next expected', key: 'nextExpected', width: 16 },
  ];
  for (const sub of analysis.vendors.filter((vendor) => vendor.metadata.isSubscription)) {
    const monthly =
      sub.recurringPattern?.frequency === 'annual'
        ? sub.averageAmount / 12
        : sub.recurringPattern?.frequency === 'quarterly'
          ? sub.averageAmount / 3
          : sub.averageAmount;
    subsSheet.addRow({
      service: sub.displayName,
      monthly,
      frequency: sub.recurringPattern?.frequency || 'unknown',
      lastCharged: formatDate(sub.lastSeen),
      nextExpected: sub.recurringPattern?.nextExpectedDate ? formatDate(sub.recurringPattern.nextExpectedDate) : '',
    });
  }

  const categoriesSheet = workbook.addWorksheet('Categories');
  categoriesSheet.columns = [
    { header: 'Category', key: 'category', width: 25 },
    { header: 'Total spent', key: 'total', width: 15 },
    { header: 'Percentage', key: 'percentage', width: 15 },
    { header: 'Transactions', key: 'count', width: 15 },
  ];
  for (const [category, data] of Object.entries(analysis.categoryBreakdown)) {
    categoriesSheet.addRow({
      category,
      total: data.total,
      percentage: `${data.percentage.toFixed(1)}%`,
      count: data.count,
    });
  }

  if (analysis.anomalies.length > 0) {
    const anomaliesSheet = workbook.addWorksheet('Anomalies');
    anomaliesSheet.columns = [
      { header: 'Vendor', key: 'vendor', width: 30 },
      { header: 'Reason', key: 'reason', width: 40 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Date', key: 'date', width: 16 },
      { header: 'Severity', key: 'severity', width: 12 },
    ];
    for (const anomaly of analysis.anomalies) {
      anomaliesSheet.addRow({
        vendor: anomaly.vendor,
        reason: anomaly.reason,
        amount: anomaly.amount,
        date: formatDate(anomaly.date),
        severity: anomaly.severity,
      });
    }
  }

  const insightsSheet = workbook.addWorksheet('Insights');
  insightsSheet.columns = [
    { header: 'Type', key: 'type', width: 22 },
    { header: 'Insight', key: 'message', width: 80 },
    { header: 'Actionable', key: 'actionable', width: 12 },
    { header: 'Savings', key: 'savings', width: 14 },
  ];
  for (const insight of analysis.insights) {
    insightsSheet.addRow({
      type: insight.type,
      message: insight.message,
      actionable: insight.actionable ? 'Yes' : 'No',
      savings: insight.savingsOpportunity ?? '',
    });
  }

  await workbook.xlsx.writeFile(outputPath);
}

export async function exportToCsv(analysis: SpendingAnalysis, outputPath: string): Promise<void> {
  const writer = createObjectCsvWriter({
    path: outputPath,
    header: [
      { id: 'vendor', title: 'Vendor' },
      { id: 'total', title: 'Charges' },
      { id: 'credits', title: 'Credits' },
      { id: 'net', title: 'Net' },
      { id: 'count', title: 'Transactions' },
      { id: 'average', title: 'Average' },
      { id: 'category', title: 'Category' },
      { id: 'isSubscription', title: 'Is Subscription' },
      { id: 'frequency', title: 'Frequency' },
      { id: 'firstSeen', title: 'First Transaction' },
      { id: 'lastSeen', title: 'Last Transaction' },
    ],
  });

  await writer.writeRecords(
    analysis.vendors.map((vendor) => ({
      vendor: vendor.displayName,
      total: vendor.totalSpent.toFixed(2),
      credits: vendor.totalCredits.toFixed(2),
      net: vendor.netSpent.toFixed(2),
      count: vendor.transactionCount,
      average: vendor.averageAmount.toFixed(2),
      category: vendor.category,
      isSubscription: vendor.metadata.isSubscription,
      frequency: vendor.recurringPattern?.frequency || '',
      firstSeen: formatDate(vendor.firstSeen),
      lastSeen: formatDate(vendor.lastSeen),
    }))
  );
}

export async function exportToJson(analysis: SpendingAnalysis, outputPath: string): Promise<void> {
  await fs.writeFile(outputPath, JSON.stringify(serializeAnalysis(analysis), null, 2));
}

export function serializeAnalysis(analysis: SpendingAnalysis) {
  return {
    ...analysis,
    scanDate: analysis.scanDate.toISOString(),
    dateRange: {
      start: formatDate(analysis.dateRange.start),
      end: formatDate(analysis.dateRange.end),
    },
    vendors: analysis.vendors.map(serializeVendor),
    topVendors: analysis.topVendors.map(serializeVendor),
    recurringCharges: analysis.recurringCharges.map(serializeVendor),
    anomalies: analysis.anomalies.map((anomaly) => ({
      ...anomaly,
      date: formatDate(anomaly.date),
    })),
    duplicateCharges: analysis.duplicateCharges.map((duplicate) => ({
      ...duplicate,
      date: formatDate(duplicate.date),
    })),
  };
}

function serializeVendor(vendor: SpendingAnalysis['vendors'][number]) {
  return {
    name: vendor.name,
    normalizedName: vendor.normalizedName,
    displayName: vendor.displayName,
    totalSpent: vendor.totalSpent,
    totalCredits: vendor.totalCredits,
    netSpent: vendor.netSpent,
    transactionCount: vendor.transactionCount,
    firstSeen: formatDate(vendor.firstSeen),
    lastSeen: formatDate(vendor.lastSeen),
    averageAmount: vendor.averageAmount,
    minAmount: vendor.minAmount,
    maxAmount: vendor.maxAmount,
    isRecurring: vendor.isRecurring,
    recurringPattern: vendor.recurringPattern
      ? {
          ...vendor.recurringPattern,
          nextExpectedDate: vendor.recurringPattern.nextExpectedDate
            ? formatDate(vendor.recurringPattern.nextExpectedDate)
            : undefined,
        }
      : undefined,
    category: vendor.category,
    metadata: vendor.metadata,
  };
}
