import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VendorUnmasker } from '../src/unmasker.js';

const unmasker = new VendorUnmasker();

test('unmasks common processors', () => {
  const cases: Array<[string, string, string]> = [
    ['PAYPAL *GRUBHUB', 'PayPal', 'Grubhub'],
    ['PAYPAL *DOORDASH INC', 'PayPal', 'DoorDash'],
    ['PP*SPOTIFY', 'PayPal', 'Spotify'],
    ['SQ *BLUE BOTTLE COFFEE', 'Square', 'Blue Bottle Coffee'],
    ['SQUARE *SWEETGREEN', 'Square', 'Sweetgreen'],
    ['STRIPE:OPENAI', 'Stripe', 'OpenAI'],
    ['STR*SUBSTACK', 'Stripe', 'Substack'],
    ['TST* CHIPOTLE MEXICAN', 'Toast', 'Chipotle Mexican'],
  ];

  for (const [input, processor, vendor] of cases) {
    const result = unmasker.unmaskVendor(input);
    assert.equal(result.metadata.isObscured, true, input);
    assert.equal(result.processor, processor, input);
    assert.equal(result.extractedVendor, vendor, `${input} -> ${result.extractedVendor}`);
  }
});

test('leaves direct merchants alone and does not invent generic shops', () => {
  const starbucks = unmasker.unmaskVendor('STARBUCKS COFFEE');
  assert.equal(starbucks.metadata.isObscured, false);
  assert.equal(starbucks.extractedVendor, 'STARBUCKS COFFEE');

  const coffee = unmasker.unmaskVendor('SQ *BLUE BOTTLE');
  assert.ok(!coffee.extractedVendor.toLowerCase().includes('local coffee shop'));
});
