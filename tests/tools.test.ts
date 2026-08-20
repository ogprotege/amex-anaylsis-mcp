import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tools, toolsForMode } from '../src/tools.js';

test('standard catalog is the agent-usable subset', () => {
  const names = toolsForMode('standard').map((tool) => tool.name);
  assert.ok(names.includes('load_statement'));
  assert.ok(names.includes('analyze_amex_spending'));
  assert.ok(names.includes('unmask_payment_processors'));
  assert.ok(names.includes('search_transactions'));
  assert.equal(names.includes('export_for_accounting'), false);
});

test('enhanced catalog includes the documented specialty tools', () => {
  const names = toolsForMode('enhanced').map((tool) => tool.name);
  assert.ok(names.includes('load_statement'));
  assert.ok(names.includes('export_for_budgeting'));
  assert.ok(names.includes('compare_periods'));
  assert.ok(names.length >= 30);
});

test('every tool name is unique', () => {
  const names = tools.map((tool) => tool.name);
  assert.equal(names.length, new Set(names).size);
});
