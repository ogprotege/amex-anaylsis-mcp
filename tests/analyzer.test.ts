import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AmexSpendingAnalyzer } from '../src/analyzer.js';
import { NEGATIVE_CHARGE_CSV } from './fixtures.js';

test('totals exclude payments and keep refunds off charge total', () => {
  const analyzer = new AmexSpendingAnalyzer();
  analyzer.parseCsvContent(NEGATIVE_CHARGE_CSV, 'neg.csv');
  const analysis = analyzer.analyze();

  assert.equal(analysis.paymentsTotal, 500);
  assert.equal(analysis.creditsTotal, 12);
  assert.ok(analysis.totalSpent > 300 && analysis.totalSpent < 500);
  assert.equal(Number(analysis.netSpent.toFixed(2)), Number((analysis.totalSpent - 12).toFixed(2)));
});

test('detects known subscriptions from recurring history', () => {
  const analyzer = new AmexSpendingAnalyzer();
  analyzer.parseCsvContent(NEGATIVE_CHARGE_CSV, 'neg.csv');
  const analysis = analyzer.analyze();
  const names = analysis.vendors.filter((vendor) => vendor.metadata.isSubscription).map((vendor) => vendor.displayName.toLowerCase());
  assert.ok(names.some((name) => name.includes('netflix')));
  assert.ok(names.some((name) => name.includes('spotify')));
  assert.ok(names.some((name) => name.includes('adobe')));
  assert.ok(analysis.monthlySubscriptionCost > 0);
});

test('unused subscriptions are relative to statement end, not now', () => {
  const csv = `Date,Description,Amount
01/01/2024,NETFLIX.COM,-15.99
12/01/2023,NETFLIX.COM,-15.99
11/01/2023,NETFLIX.COM,-15.99
01/15/2024,STARBUCKS,-4.50
`;
  const analyzer = new AmexSpendingAnalyzer();
  analyzer.parseCsvContent(csv, 'hist.csv');
  const unused = analyzer.analyze({ unusedSubscriptionDays: 60 });
  assert.equal(
    unused.insights.some((insight) => insight.type === 'unused_subscriptions'),
    false
  );
});

test('reset clears previous statement vendors', () => {
  const analyzer = new AmexSpendingAnalyzer();
  analyzer.parseCsvContent(NEGATIVE_CHARGE_CSV, 'a.csv');
  const firstCount = analyzer.getTransactions().length;
  analyzer.parseCsvContent(`Date,Description,Amount\n01/01/2024,NETFLIX.COM,-15.99\n`, 'b.csv');
  assert.ok(firstCount > 1);
  assert.equal(analyzer.getTransactions().length, 1);
  assert.equal(analyzer.getVendors().length, 1);
});

test('does not drop spend when a vendor is flagged', () => {
  const csv = `Date,Description,Amount
01/01/2024,VERIFY ACCOUNT NOW,-120.00
01/02/2024,NETFLIX.COM,-15.99
`;
  const analyzer = new AmexSpendingAnalyzer();
  analyzer.parseCsvContent(csv, 'flag.csv');
  const analysis = analyzer.analyze();
  assert.ok(analysis.totalSpent >= 135.99);
  assert.ok(analysis.vendors.some((vendor) => vendor.metadata.isFraudulent || vendor.metadata.anomalyScore > 0.4));
});

test('unmasks paypal grubhub into the vendor list', () => {
  const analyzer = new AmexSpendingAnalyzer();
  analyzer.parseCsvContent(NEGATIVE_CHARGE_CSV, 'neg.csv');
  const grubhub = analyzer.getVendors().find((vendor) => vendor.displayName.toLowerCase().includes('grubhub'));
  assert.ok(grubhub);
  assert.equal(grubhub?.metadata.processor, 'PayPal');
});
