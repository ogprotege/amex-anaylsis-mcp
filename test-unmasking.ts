import { VendorUnmasker } from './amex-vendor-unmasker.js';

console.log('🔍 Testing Vendor Unmasking...\n');

const unmasker = new VendorUnmasker();

const testCases = [
  // PayPal transactions
  'PAYPAL *GRUBHUB',
  'PAYPAL *DOORDASH INC',
  'PP*SPOTIFY',
  
  // Square transactions
  'SQ *BLUE BOTTLE COFFEE',
  'SQUARE *SWEETGREEN',
  
  // Stripe transactions
  'STRIPE:OPENAI',
  'STR*SUBSTACK',
  
  // Toast transactions
  'TST* CHIPOTLE MEXICAN',
  
  // Other processors
  'VENMO PAYMENT TO JOHN',
  'CASH APP *JANE DOE',
  'CLV*LOCAL RESTAURANT',
  
  // Regular transactions (no unmasking needed)
  'STARBUCKS COFFEE',
  'AMAZON.COM',
  'WHOLE FOODS MARKET'
];

console.log('Test Results:\n');

testCases.forEach(description => {
  const result = unmasker.unmaskVendor(description);
  
  if (result.metadata.isObscured) {
    console.log(`✓ ${description}`);
    console.log(`  → Vendor: ${result.extractedVendor}`);
    console.log(`  → Processor: ${result.processor}`);
    console.log(`  → Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    if (result.metadata.needsManualReview) {
      console.log(`  ⚠️  Needs manual review`);
    }
  } else {
    console.log(`- ${description} (no unmasking needed)`);
  }
  console.log('');
});

console.log('✅ Vendor unmasking tests completed!');