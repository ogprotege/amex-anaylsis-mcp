import assert from 'node:assert/strict';
import { mkdtemp, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { AnalysisSession } from '../src/session.js';
import { NEGATIVE_CHARGE_CSV } from './fixtures.js';

test('session reuses a loaded file until mtime changes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'amex-session-'));
  const csvPath = join(dir, 'amex.csv');
  await writeFile(csvPath, NEGATIVE_CHARGE_CSV);

  const session = new AnalysisSession();
  const first = await session.load(csvPath);
  const second = await session.ensure();
  assert.equal(first.analyzer, second.analyzer);

  await writeFile(csvPath, NEGATIVE_CHARGE_CSV + '01/01/2023,SPOTIFY USA,-9.99\n');
  await utimes(csvPath, new Date(), new Date(Date.now() + 2000));
  const third = await session.load(csvPath);
  assert.notEqual(first.analyzer, third.analyzer);
  assert.ok(third.analysis.transactionCount >= first.analysis.transactionCount);
});

test('ensure without a path fails before load', async () => {
  const session = new AnalysisSession();
  await assert.rejects(() => session.ensure(), /No statement loaded/);
});
