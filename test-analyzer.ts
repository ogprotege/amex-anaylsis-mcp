#!/usr/bin/env node
import { AmexSpendingAnalyzer } from './amex-mcp-server.js';
import * as path from 'path';
import { promises as fs } from 'fs';

async function testAnalyzer() {
  console.log('🧪 Testing Amex Spending Analyzer\n');
  
  const analyzer = new AmexSpendingAnalyzer();
  
  // Create test CSV data
  const testData = `Date,Description,Card Member,Account #,Amount
01/20/2024,NETFLIX.COM,JOHN DOE,***1234,-15.99
01/19/2024,STARBUCKS STORE #123,JOHN DOE,***1234,-4.50
01/18/2024,AMAZON MARKETPLACE,JOHN DOE,***1234,-32.45
01/17/2024,PAYPAL *GRUBHUB,JOHN DOE,***1234,-28.90
01/16/2024,SQ *BLUE BOTTLE,JOHN DOE,***1234,-4.75
01/15/2024,STRIPE: SUBSTACK INC,JOHN DOE,***1234,-5.00
01/14/2024,SPOTIFY USA,JOHN DOE,***1234,-9.99
01/13/2024,TST* CORNER CAFE,JOHN DOE,***1234,-12.75
01/12/2024,UBER TRIP,JOHN DOE,***1234,-18.50
01/11/2024,WHOLE FOODS MARKET,JOHN DOE,***1234,-67.89
01/10/2024,SHELL GAS STATION,JOHN DOE,***1234,-45.00
01/09/2024,GOOGLE *STORAGE,JOHN DOE,***1234,-9.99
01/08/2024,ADOBE CREATIVE CLOUD,JOHN DOE,***1234,-52.99
12/20/2023,NETFLIX.COM,JOHN DOE,***1234,-15.99
12/18/2023,STRIPE: SUBSTACK INC,JOHN DOE,***1234,-5.00
12/14/2023,SPOTIFY USA,JOHN DOE,***1234,-9.99
12/08/2023,ADOBE CREATIVE CLOUD,JOHN DOE,***1234,-52.99
11/20/2023,NETFLIX.COM,JOHN DOE,***1234,-15.99
11/14/2023,SPOTIFY USA,JOHN DOE,***1234,-9.99
11/08/2023,ADOBE CREATIVE CLOUD,JOHN DOE,***1234,-52.99`;

  // Ensure data directory exists
  await fs.mkdir('data', { recursive: true });
  
  // Write test data
  const testCsvPath = path.join(process.cwd(), 'data', 'test-amex.csv');
  await fs.writeFile(testCsvPath, testData);
  console.log(`✓ Created test CSV at: ${testCsvPath}\n`);
  
  try {
    // Parse the CSV
    console.log('📊 Parsing CSV...');
    await analyzer.parseAmexCsv(testCsvPath);
    console.log('✓ CSV parsed successfully\n');
    
    // Run analysis
    console.log('🔍 Running analysis...');
    const analysis = analyzer.analyze();
    console.log('✓ Analysis complete\n');
    
    // Display results
    console.log('📈 Analysis Results:');
    console.log(`Total Spent: $${analysis.totalSpent.toFixed(2)}`);
    console.log(`Vendors: ${analysis.vendorCount}`);
    console.log(`Transactions: ${analysis.transactionCount}`);
    console.log(`Subscriptions Found: ${analysis.subscriptionCount}`);
    console.log(`Monthly Subscription Cost: $${analysis.subscriptionTotal.toFixed(2)}\n`);
    
    // Show top vendors
    console.log('🏪 Top 5 Vendors:');
    analysis.topVendors.slice(0, 5).forEach((vendor: any, i: number) => {
      console.log(`${i + 1}. ${vendor.displayName}: $${vendor.totalSpent.toFixed(2)} (${vendor.transactionCount} transactions)`);
      if (vendor.metadata.isObscured) {
        console.log(`   🔓 Unmasked from: "${vendor.metadata.originalDescription}"`);
      }
    });
    console.log('');
    
    // Show subscriptions
    if (analysis.recurringCharges.length > 0) {
      console.log('💳 Detected Subscriptions:');
      analysis.recurringCharges.forEach((sub: any) => {
        console.log(`- ${sub.displayName}: $${sub.averageAmount.toFixed(2)}/${sub.recurringPattern?.frequency || 'unknown'}`);
      });
      console.log('');
    }
    
    // Show vendor unmasking summary
    if (analysis.unmaskingReport) {
      console.log('🔍 Vendor Unmasking Summary:');
      console.log(`Obscured transactions: ${analysis.unmaskingReport.totalObscured}`);
      console.log(`Needing manual review: ${analysis.unmaskingReport.needingReview.length}`);
      console.log('Payment processors found:');
      for (const [processor, count] of Object.entries(analysis.unmaskingReport.byProcessor)) {
        console.log(`  - ${processor}: ${count} transactions`);
      }
      console.log('');
    }
    
    // Test Excel export
    console.log('📤 Testing Excel export...');
    await fs.mkdir('output', { recursive: true });
    const outputPath = path.join(process.cwd(), 'output', 'test-analysis.xlsx');
    await analyzer.exportToExcel(analysis, outputPath);
    console.log(`✓ Excel exported to: ${outputPath}\n`);
    
    console.log('✅ All tests passed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testAnalyzer().catch(console.error);