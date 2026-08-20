import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { AnalysisSession } from '../src/session.js';
import { tools } from '../src/tools.js';
import { NEGATIVE_CHARGE_CSV } from './fixtures.js';

function tool(name: string) {
  const found = tools.find((item) => item.name === name);
  assert.ok(found, name);
  return found;
}

test('load_statement then analyze without csvPath', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'amex-tools-'));
  const csvPath = join(dir, 'amex.csv');
  await writeFile(csvPath, NEGATIVE_CHARGE_CSV);
  const session = new AnalysisSession();

  const loaded = await tool('load_statement').handler({ csvPath }, { session });
  assert.equal(loaded.isError, undefined);
  assert.match(loaded.content[0]!.text, /Loaded/);

  const summary = await tool('analyze_amex_spending').handler({}, { session });
  assert.match(summary.content[0]!.text, /Charges:/);
  assert.ok((summary.structuredContent?.totalSpent as number) > 0);

  const subs = await tool('find_subscriptions').handler({}, { session });
  assert.match(subs.content[0]!.text, /Monthly equivalent/);

  const unmasked = await tool('unmask_payment_processors').handler({}, { session });
  assert.match(unmasked.content[0]!.text, /Grubhub|PayPal|Square|Stripe/i);
});

test('analyze without a session explains how to recover', async () => {
  const session = new AnalysisSession();
  await assert.rejects(() => tool('analyze_amex_spending').handler({}, { session }), /load_statement/);
});
