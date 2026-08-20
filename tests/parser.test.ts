import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAmexCsvContent } from '../src/parser.js';
import { NEGATIVE_CHARGE_CSV, POSITIVE_CHARGE_CSV, PREAMBLE_CSV } from './fixtures.js';

test('detects Amex negative-charge convention and excludes payments from charges', () => {
  const parsed = parseAmexCsvContent(NEGATIVE_CHARGE_CSV, 'neg.csv');
  assert.equal(parsed.signConvention, 'negative-charges');

  const payments = parsed.transactions.filter((tx) => tx.kind === 'payment');
  const credits = parsed.transactions.filter((tx) => tx.kind === 'credit');
  const charges = parsed.transactions.filter((tx) => tx.kind === 'charge');

  assert.equal(payments.length, 1);
  assert.equal(payments[0]?.amount, 500);
  assert.equal(credits.length, 1);
  assert.equal(credits[0]?.amount, 12);
  assert.ok(charges.every((tx) => tx.direction === 'debit'));
  assert.ok(charges.find((tx) => tx.description === 'NETFLIX.COM')?.amount === 15.99);
});

test('detects positive-charge convention', () => {
  const parsed = parseAmexCsvContent(POSITIVE_CHARGE_CSV, 'pos.csv');
  assert.equal(parsed.signConvention, 'positive-charges');
  assert.equal(parsed.transactions.find((tx) => tx.description === 'NETFLIX.COM')?.kind, 'charge');
  assert.equal(parsed.transactions.find((tx) => tx.description.includes('PAYMENT'))?.kind, 'payment');
  assert.equal(parsed.transactions.find((tx) => tx.description === 'AMAZON MARKETPLACE')?.kind, 'credit');
});

test('skips preamble rows and unparseable dates', () => {
  const parsed = parseAmexCsvContent(PREAMBLE_CSV, 'preamble.csv');
  assert.equal(parsed.transactions.length, 2);
  assert.equal(parsed.skippedRows, 1);
  assert.ok(parsed.warnings.some((warning) => warning.message.includes('Unparseable date')));
});
