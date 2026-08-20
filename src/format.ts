import { formatDate } from './dates.js';
import { monthlyEquivalent } from './insights.js';
import type { SpendingAnalysis, VendorProfile } from './types.js';

export function formatSummary(analysis: SpendingAnalysis): string {
  const lines = [
    'Amex spending analysis',
    '======================',
    '',
    `Period: ${formatDate(analysis.dateRange.start)} to ${formatDate(analysis.dateRange.end)}`,
    `Charges: $${money(analysis.totalSpent)} (${analysis.chargeCount} charges)`,
    `Credits / refunds: $${money(analysis.creditsTotal)}`,
    `Payments: $${money(analysis.paymentsTotal)}`,
    `Net spend: $${money(analysis.netSpent)}`,
    `Vendors: ${analysis.vendorCount}  Transactions: ${analysis.transactionCount}`,
    `Sign convention: ${analysis.signConvention}`,
    analysis.skippedRows ? `Skipped rows: ${analysis.skippedRows}` : '',
    '',
    'Subscriptions',
    `  Count: ${analysis.subscriptionCount}`,
    `  Monthly equivalent: $${money(analysis.monthlySubscriptionCost)}`,
    `  Annual equivalent: $${money(analysis.monthlySubscriptionCost * 12)}`,
    '',
    'Top vendors',
  ];

  for (const vendor of analysis.topVendors.slice(0, 10)) {
    const masked = vendor.metadata.processor ? ` [${vendor.metadata.processor}]` : '';
    lines.push(`  ${vendor.displayName}${masked}: $${money(vendor.totalSpent)} (${vendor.transactionCount} tx)`);
  }

  lines.push('', 'Top categories');
  const categories = Object.entries(analysis.categoryBreakdown)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 6);
  for (const [category, data] of categories) {
    lines.push(`  ${category}: $${money(data.total)} (${data.percentage.toFixed(1)}%)`);
  }

  if (analysis.insights.length > 0) {
    lines.push('', 'Insights');
    for (const insight of analysis.insights) {
      lines.push(`  • ${insight.message}`);
    }
  }

  if (analysis.anomalies.length > 0) {
    lines.push('', `Anomalies: ${analysis.anomalies.length}`);
    for (const anomaly of analysis.anomalies.slice(0, 5)) {
      lines.push(`  • ${anomaly.vendor} [${anomaly.severity}]: ${anomaly.reason}`);
    }
  }

  return lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n').trim();
}

export function formatSubscriptions(analysis: SpendingAnalysis): string {
  const subscriptions = analysis.vendors
    .filter((vendor) => vendor.metadata.isSubscription)
    .sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a));

  if (subscriptions.length === 0) {
    return 'No subscriptions detected.';
  }

  const lines = [
    `Subscriptions: ${subscriptions.length}`,
    `Monthly equivalent: $${money(analysis.monthlySubscriptionCost)}`,
    `Annual equivalent: $${money(analysis.monthlySubscriptionCost * 12)}`,
    '',
  ];

  for (const sub of subscriptions) {
    lines.push(sub.displayName);
    lines.push(`  Frequency: ${sub.recurringPattern?.frequency ?? 'unknown'}`);
    lines.push(`  Monthly: $${money(monthlyEquivalent(sub))}`);
    lines.push(`  Last charged: ${formatDate(sub.lastSeen)}`);
    if (sub.recurringPattern?.nextExpectedDate) {
      lines.push(`  Next expected: ${formatDate(sub.recurringPattern.nextExpectedDate)}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

export function formatVendor(vendor: VendorProfile): string {
  const lines = [
    vendor.displayName,
    `Total charges: $${money(vendor.totalSpent)}`,
    `Credits: $${money(vendor.totalCredits)}`,
    `Net: $${money(vendor.netSpent)}`,
    `Transactions: ${vendor.transactionCount}`,
    `Average: $${money(vendor.averageAmount)}`,
    `Range: $${money(vendor.minAmount)} - $${money(vendor.maxAmount)}`,
    `Category: ${vendor.category}`,
    `First / last: ${formatDate(vendor.firstSeen)} / ${formatDate(vendor.lastSeen)}`,
  ];

  if (vendor.metadata.processor) {
    lines.push(`Processor: ${vendor.metadata.processor} (${Math.round((vendor.metadata.unmaskingConfidence ?? 0) * 100)}%)`);
    if (vendor.metadata.originalDescription) {
      lines.push(`Original: ${vendor.metadata.originalDescription}`);
    }
  }
  if (vendor.metadata.isSubscription) {
    lines.push(`Subscription: yes (${vendor.recurringPattern?.frequency ?? 'unknown frequency'})`);
  }
  if (vendor.metadata.tags.length) lines.push(`Tags: ${vendor.metadata.tags.join(', ')}`);

  lines.push('', 'Recent transactions');
  for (const tx of vendor.transactions.slice(-8).reverse()) {
    lines.push(`  ${formatDate(tx.date)}  $${money(tx.amount)}  ${tx.kind}  ${tx.description}`);
  }

  return lines.join('\n');
}

export function formatCategories(analysis: SpendingAnalysis): string {
  const sorted = Object.entries(analysis.categoryBreakdown).sort((a, b) => b[1].total - a[1].total);
  const lines = ['Spending by category', ''];
  for (const [category, data] of sorted) {
    lines.push(category);
    lines.push(`  Total: $${money(data.total)} (${data.percentage.toFixed(1)}%)`);
    lines.push(`  Transactions: ${data.count}`);
    lines.push(`  Top vendors: ${data.vendors.slice(0, 3).join(', ')}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function formatAnomalies(analysis: SpendingAnalysis, threshold: 'low' | 'medium' | 'high' = 'medium'): string {
  const rank = { low: 0, medium: 1, high: 2 };
  const anomalies = analysis.anomalies.filter((item) => rank[item.severity] >= rank[threshold]);
  const lines = [`Anomalies (${threshold}+): ${anomalies.length}`, ''];
  for (const anomaly of anomalies) {
    lines.push(`${anomaly.vendor} [${anomaly.severity}]`);
    lines.push(`  ${anomaly.reason}`);
    lines.push(`  $${money(anomaly.amount)} on ${formatDate(anomaly.date)}`);
    lines.push('');
  }
  if (analysis.duplicateCharges.length) {
    lines.push('Possible same-day duplicate charges');
    for (const duplicate of analysis.duplicateCharges) {
      lines.push(`  ${duplicate.vendor}: ${duplicate.count} × $${money(duplicate.amount)} on ${formatDate(duplicate.date)}`);
    }
  }
  return lines.join('\n').trim() || 'No anomalies found.';
}

export function money(value: number): string {
  return value.toFixed(2);
}
