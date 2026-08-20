import { daysBetween } from './dates.js';
import type { Insight, SpendingAnalysis, VendorProfile } from './types.js';

export function generateInsights(
  vendors: VendorProfile[],
  subscriptions: VendorProfile[],
  categoryBreakdown: SpendingAnalysis['categoryBreakdown'],
  statementEnd: Date,
  unusedDays: number
): Insight[] {
  const insights: Insight[] = [];

  const monthlySubscriptionCost = monthlyEquivalentTotal(subscriptions);
  if (monthlySubscriptionCost > 50) {
    insights.push({
      type: 'subscription_cost',
      message: `Recurring services are about $${monthlySubscriptionCost.toFixed(2)}/month ($${(monthlySubscriptionCost * 12).toFixed(2)}/year).`,
      actionable: true,
      savingsOpportunity: monthlySubscriptionCost * 0.2,
    });
  }

  const unused = subscriptions.filter((sub) => daysBetween(sub.lastSeen, statementEnd) > unusedDays);
  if (unused.length > 0) {
    insights.push({
      type: 'unused_subscriptions',
      message: `${unused.length} subscription${unused.length === 1 ? '' : 's'} had no charge in the last ${unusedDays} days of this statement: ${unused.map((sub) => sub.displayName).join(', ')}.`,
      actionable: true,
      savingsOpportunity: monthlyEquivalentTotal(unused),
    });
  }

  const topCategory = Object.entries(categoryBreakdown).sort((a, b) => b[1].total - a[1].total)[0];
  if (topCategory) {
    insights.push({
      type: 'spending_pattern',
      message: `${topCategory[0]} is the largest category at $${topCategory[1].total.toFixed(2)} (${topCategory[1].percentage.toFixed(1)}%).`,
      actionable: false,
    });
  }

  const highValue = vendors.filter((vendor) => vendor.netSpent > 1000);
  if (highValue.length > 0) {
    insights.push({
      type: 'high_value_vendors',
      message: `${highValue.length} vendor${highValue.length === 1 ? '' : 's'} over $1000: ${highValue.slice(0, 5).map((vendor) => vendor.displayName).join(', ')}.`,
      actionable: false,
    });
  }

  return insights;
}

export function monthlyEquivalent(vendor: VendorProfile): number {
  if (!vendor.recurringPattern) {
    return vendor.metadata.isSubscription ? vendor.averageAmount : 0;
  }

  const multipliers: Record<string, number> = {
    daily: 30,
    weekly: 4.33,
    biweekly: 2.17,
    monthly: 1,
    quarterly: 1 / 3,
    annual: 1 / 12,
  };

  return vendor.averageAmount * (multipliers[vendor.recurringPattern.frequency] ?? 1);
}

export function monthlyEquivalentTotal(vendors: VendorProfile[]): number {
  return vendors.reduce((sum, vendor) => sum + monthlyEquivalent(vendor), 0);
}
