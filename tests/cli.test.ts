import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runCli } from '../src/cli.js';

test('cli --help prints usage and does not throw', async () => {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;

  try {
    await runCli(['--help']);
  } finally {
    process.stdout.write = original;
  }

  const output = chunks.join('');
  assert.match(output, /USAGE/);
  assert.match(output, /analyze <csv>/);
  assert.match(output, /unmask <text>/);
});

test('cli unmask prints processor extraction', async () => {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;

  try {
    await runCli(['unmask', 'PAYPAL *GRUBHUB']);
  } finally {
    process.stdout.write = original;
  }

  const output = chunks.join('');
  assert.match(output, /Grubhub/);
  assert.match(output, /PayPal/);
});

test('cli analyze without a path fails clearly', async () => {
  await assert.rejects(() => runCli(['analyze']), /analyze requires a CSV path/);
});
