#!/usr/bin/env node
import { VendorUnmasker } from './amex-vendor-unmasker.js';

const unmasker = new VendorUnmasker();
const samples = [
  'PAYPAL *GRUBHUB',
  'PP*SPOTIFY',
  'SQ *BLUE BOTTLE COFFEE',
  'STR*SUBSTACK',
  'TST* CHIPOTLE MEXICAN',
  'STARBUCKS COFFEE',
];

for (const description of samples) {
  const result = unmasker.unmaskVendor(description);
  console.log(`${description} → ${result.extractedVendor} (${result.processor}, ${Math.round(result.confidence * 100)}%)`);
}
