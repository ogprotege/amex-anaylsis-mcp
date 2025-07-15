#!/bin/bash

# Enhanced Amex Spending MCP Setup - Fixed for actual project structure
# This script sets up the complete system with the correct file names

set -e

echo "🏦 Enhanced Amex Spending MCP Setup"
echo "==================================="
echo "Now with Vendor Unmasking Technology"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ required. Current version: $(node -v)"
    exit 1
fi

echo "✓ Node.js $(node -v) detected"

# Use current directory
PROJECT_DIR="$(pwd)"
echo "📁 Using project directory: $PROJECT_DIR"

# Check if core files exist
if [ ! -f "amex-vendor-unmasker.ts" ]; then
    echo "❌ Missing amex-vendor-unmasker.ts file"
    exit 1
fi
echo "✓ Vendor unmasker module found"

if [ ! -f "amex-mcp-server.ts" ]; then
    echo "❌ Missing amex-mcp-server.ts file"  
    exit 1
fi
echo "✓ MCP server file found"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Create required directories
echo "📁 Creating required directories..."
mkdir -p data output

# Create test script for vendor unmasking
echo "🧪 Creating vendor unmasking test..."
cat > test-unmasking.ts << 'EOF'
#!/usr/bin/env node
import { VendorUnmasker } from './amex-vendor-unmasker.js';

console.log('🔍 Testing Vendor Unmasking System\n');

const unmasker = new VendorUnmasker();

// Test cases that demonstrate different payment processors
const testTransactions = [
  { desc: 'PAYPAL *GRUBHUB', expected: 'Grubhub Food Delivery' },
  { desc: 'SQ *BLUE BOTTLE', expected: 'Blue Bottle' },
  { desc: 'STRIPE: NETFLIX.COM', expected: 'Netflix.com' },
  { desc: 'TST* JOES PIZZA', expected: 'Joes Pizza' },
  { desc: 'VENMO PAYMENT TO JOHN', expected: 'Payment To John' },
  { desc: 'PP*1234 SPOTIFY', expected: 'Spotify' },
  { desc: 'SQ *8472639', expected: 'Unknown (needs context)' },
  { desc: 'STARBUCKS STORE #123', expected: 'Direct transaction' }
];

console.log('Running unmasking tests:\n');

for (const test of testTransactions) {
  const result = unmasker.unmaskVendor(test.desc);
  const status = result.metadata.isObscured ? '🔓' : '✓';
  
  console.log(`${status} ${test.desc}`);
  console.log(`   → ${result.extractedVendor}`);
  console.log(`   Processor: ${result.processor}, Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  
  if (result.metadata.needsManualReview) {
    console.log(`   ⚠️  Needs manual review`);
    if (result.metadata.possibleVendors?.length > 0) {
      console.log(`   Possibilities: ${result.metadata.possibleVendors.join(', ')}`);
    }
  }
  console.log('');
}

console.log('✅ Vendor unmasking tests complete!');
EOF

chmod +x test-unmasking.ts

# Generate example usage script
echo "📚 Creating usage examples..."
cat > example-usage.ts << 'EOF'
#!/usr/bin/env node
import { AmexSpendingAnalyzer } from './amex-mcp-server.js';
import * as path from 'path';
import { promises as fs } from 'fs';

async function demonstrateVendorUnmasking() {
  console.log('🔍 Demonstrating Vendor Unmasking\n');
  
  const analyzer = new AmexSpendingAnalyzer();
  const csvPath = path.join(process.cwd(), 'data', 'example-amex.csv');
  
  // Parse the CSV with obscured vendors
  await analyzer.parseAmexCsv(csvPath);
  const analysis = analyzer.analyze();
  
  // Show unmasking results
  console.log('📊 Unmasking Summary:');
  if (analysis.unmaskingReport) {
    console.log(`Total obscured transactions: ${analysis.unmaskingReport.totalObscured}`);
    console.log(`Transactions needing review: ${analysis.unmaskingReport.needingReview.length}\n`);
    
    console.log('Payment Processor Breakdown:');
    for (const [processor, count] of Object.entries(analysis.unmaskingReport.byProcessor)) {
      console.log(`  ${processor}: ${count} transactions`);
    }
    
    console.log('\n🔓 Successfully Unmasked Vendors:');
    const unmaskedVendors = analysis.topVendors.filter((v: any) => v.metadata.isObscured);
    for (const vendor of unmaskedVendors.slice(0, 5)) {
      console.log(`  "${vendor.metadata.originalDescription}" → "${vendor.displayName}"`);
      console.log(`    Processor: ${vendor.metadata.processor}, Confidence: ${(vendor.metadata.unmaskingConfidence * 100).toFixed(0)}%`);
    }
  }
  
  // Export to Excel with unmasking data
  const outputPath = path.join(process.cwd(), 'output', 'unmasking-demo.xlsx');
  await analyzer.exportToExcel(analysis, outputPath);
  console.log(`\n✅ Full analysis exported to: ${outputPath}`);
}

demonstrateVendorUnmasking().catch(console.error);
EOF

chmod +x example-usage.ts

# Get Claude Desktop config path
if [ "$(uname)" == "Darwin" ]; then
    CONFIG_DIR="$HOME/Library/Application Support/Claude"
elif [ "$(expr substr $(uname -s) 1 5)" == "Linux" ]; then
    CONFIG_DIR="$HOME/.config/Claude"
else
    CONFIG_DIR="$HOME/AppData/Roaming/Claude"
fi

# Build the project
echo "🔨 Building TypeScript project..."
npm run build

# Run tests if build succeeds
if [ $? -eq 0 ]; then
    echo "🧪 Running tests..."
    npm run test
else
    echo "❌ Build failed. Please check the TypeScript errors above."
    exit 1
fi

echo ""
echo "✅ Enhanced Setup Complete!"
echo ""
echo "🎉 New Features Available:"
echo "   • Automatic vendor unmasking for payment processors"
echo "   • Detection of hidden merchants behind PayPal, Square, Stripe, etc."
echo "   • Confidence scoring for vendor identification"
echo "   • Manual review flagging for uncertain vendors"
echo "   • Enhanced Excel exports with obscured vendor analysis"
echo ""
echo "📝 Try These Commands:"
echo "1. Test vendor unmasking: npm run test-unmasking"
echo "2. Run example analysis: npm run dev"
echo "3. Analyze your own data with obscured vendors"
echo ""
echo "💡 Claude Desktop Configuration:"
echo "Add this to your config at: $CONFIG_DIR/claude_desktop_config.json"
echo ""
echo '{'
echo '  "mcpServers": {'
echo '    "amex-analysis": {'
echo '      "command": "node",'
echo "      \"args\": [\"$PROJECT_DIR/dist/amex-mcp-server.js\"],"
echo '      "env": {}'
echo '    }'
echo '  }'
echo '}'
echo ""
echo "📁 Project location: $PROJECT_DIR"