# AmexAnalysis-MCP Cheatsheet

> 🚀 Quick reference for all commands, options, and examples

## Table of Contents

- [Quick Start](#quick-start)
- [Claude Desktop Commands](#claude-desktop-commands)
- [Direct CLI Usage](#direct-cli-usage)
- [CSV Format Requirements](#csv-format-requirements)
- [All Tool Options](#all-tool-options)
- [Common Patterns](#common-patterns)
- [Advanced Examples](#advanced-examples)
- [Troubleshooting Commands](#troubleshooting-commands)
- [Tips & Tricks](#tips--tricks)

## Quick Start

### 1. Basic Setup
```bash
# Install and build
npm install
npm run build

# Test installation
npm test

# Run with example data
npm run dev
```

### 2. Claude Desktop Config
```json
{
  "mcpServers": {
    "amex-analysis": {
      "command": "node",
      "args": ["/absolute/path/to/dist/amex-mcp-server.js"],
      "env": {}
    }
  }
}
```

### 3. First Analysis (in Claude)
```
Analyze my Amex spending from data/amex-2024.csv
```

## Claude Desktop Commands

### Basic Analysis Commands

```bash
# Simple analysis
"Analyze my Amex spending from data/amex-2024.csv"

# With Excel export
"Analyze my Amex spending from data/amex-2024.csv and export to Excel"

# Specific date range
"Analyze my Amex spending from January to March 2024"

# Minimum amount filter
"Show me all transactions over $100 from data/amex-2024.csv"
```

### Subscription Detection

```bash
# Find all subscriptions
"Find all my subscriptions in data/amex-2024.csv"

# High confidence only
"Show me confirmed subscriptions with high confidence"

# Include manual review items
"Find subscriptions including ones that need manual review"

# Specific vendor subscription check
"Is Netflix a subscription in my data?"
```

### Vendor Analysis

```bash
# Analyze specific vendor
"Analyze all Amazon transactions in my data"

# Fuzzy match vendor names
"Show me all Starbucks transactions (include variations)"

# Payment processor analysis
"Analyze all PayPal transactions and show what I actually bought"

# Vendor spending trends
"Show me my Amazon spending trend over time"
```

### Fraud & Anomaly Detection

```bash
# All anomalies
"Find suspicious transactions in my data"

# High severity only
"Show me high-risk fraud alerts"

# Include pattern details
"Find anomalies and explain the patterns detected"

# Specific vendor check
"Is the vendor 'VERIFY ACCOUNT NOW' suspicious?"
```

### Category Analysis

```bash
# Basic breakdown
"Show my spending by category"

# Sorted by amount
"What are my top spending categories?"

# Specific category
"How much did I spend on Food & Dining?"

# Custom categories
"Categorize with custom rules: Netflix=Entertainment, Uber=Transportation"
```

### Export Commands

```bash
# Excel with all sheets
"Export full analysis to output/analysis.xlsx"

# CSV format
"Export my transactions to CSV format"

# JSON for processing
"Export analysis as JSON with metadata"

# Summary only
"Give me a summary report of my spending"
```

## Direct CLI Usage

### TypeScript/Node.js API

```typescript
// Import the analyzer
import { AmexSpendingAnalyzer } from './amex-mcp-server.js';

// Create instance
const analyzer = new AmexSpendingAnalyzer();

// Parse CSV
await analyzer.parseAmexCsv('data/amex-2024.csv');

// Run analysis
const results = analyzer.analyze();

// Export to Excel
await analyzer.exportToExcel(results, 'output/report.xlsx');
```

### Command Line Scripts

```bash
# Run analyzer
npx tsx test-analyzer.ts

# Test vendor unmasking
npx tsx test-unmasking.ts

# Run example analysis
npx tsx example-usage.ts
```

## CSV Format Requirements

### Standard Amex Format
```csv
Date,Description,Card Member,Account #,Amount
01/15/2024,NETFLIX.COM,JOHN DOE,***1234,-15.99
01/14/2024,PAYPAL *GRUBHUB,JOHN DOE,***1234,-32.45
```

### Extended Format (Better for Unmasking)
```csv
Date,Description,Extended Details,Amount,Address,City,State
01/15/2024,SQ *MERCHANT,Blue Bottle Coffee,-4.50,123 Main St,San Francisco,CA
```

### Supported Fields
- **Required**: Date, Description, Amount
- **Optional**: Extended Details, Card Member, Address, City, State, Category
- **Formats**: MM/DD/YYYY or YYYY-MM-DD dates, negative amounts for charges

## All Tool Options

### `analyze_amex_spending`

```typescript
{
  // Required
  csvPath: string;              // Path to CSV file
  
  // Optional
  outputFormat?: "excel" | "json" | "csv" | "summary";
  outputPath?: string;          // Where to save
  
  // Advanced options
  options?: {
    includeCharts?: boolean;    // Add charts to Excel
    minAmount?: number;         // Filter small transactions
    dateRange?: {
      start: string;            // "2024-01-01"
      end: string;              // "2024-12-31"
    };
    vendorFilter?: string[];    // Include only these vendors
    excludeVendors?: string[];  // Exclude these vendors
    categories?: string[];      // Filter by categories
  }
}
```

### `find_subscriptions`

```typescript
{
  csvPath: string;
  
  // Optional
  confidenceThreshold?: number; // 0-1, default 0.7
  includeManual?: boolean;      // Include low confidence
  minTransactions?: number;     // Min occurrences (default 2)
  
  // Filters
  frequencyFilter?: Array<"daily" | "weekly" | "monthly" | "quarterly" | "annual">;
  amountRange?: {
    min?: number;
    max?: number;
  };
}
```

### `analyze_vendor`

```typescript
{
  csvPath: string;
  vendorName: string;           // Exact or fuzzy match
  
  // Optional
  fuzzyMatch?: boolean;         // Allow partial matches
  includeRelated?: boolean;     // Include processor variants
  
  // Analysis options
  showTrends?: boolean;         // Time-based analysis
  compareToAverage?: boolean;   // Compare to spending avg
  predictNext?: boolean;        // Predict next charge
}
```

### `find_anomalies`

```typescript
{
  csvPath: string;
  
  // Optional
  severityThreshold?: "low" | "medium" | "high";
  includePatterns?: boolean;    // Show detection patterns
  
  // Specific checks
  checks?: {
    amounts?: boolean;          // Check suspicious amounts
    velocity?: boolean;         // Check transaction speed
    vendors?: boolean;          // Check vendor names
    duplicates?: boolean;       // Check duplicates
  };
  
  // Custom rules
  customBlacklist?: string[];   // Additional keywords
  customAmounts?: number[];     // Additional amounts to flag
}
```

### `spending_by_category`

```typescript
{
  csvPath: string;
  
  // Optional
  customCategories?: {
    [category: string]: string[]; // Keywords for category
  };
  
  sortBy?: "amount" | "count" | "name" | "percentage";
  includeUncategorized?: boolean;
  minPercentage?: number;       // Hide small categories
  
  // Grouping
  groupSubcategories?: boolean; // Group into main categories
}
```

### `export_analysis`

```typescript
{
  csvPath: string;
  format: "excel" | "csv" | "json";
  outputPath: string;
  
  // Optional
  options?: {
    includeRaw?: boolean;       // Include raw transactions
    includeMetadata?: boolean;  // Include analysis metadata
    compress?: boolean;         // ZIP output files
    
    // Excel-specific
    includeCharts?: boolean;
    colorCoding?: boolean;      // Color-code by category
    
    // CSV-specific
    delimiter?: "," | ";" | "\t";
    
    // JSON-specific
    pretty?: boolean;           // Formatted JSON
    flatten?: boolean;          // Flatten nested objects
  };
}
```

## Common Patterns

### Finding Hidden Subscriptions

```bash
# Pattern 1: Check payment processors for subscriptions
"Find all recurring PayPal and Stripe charges"

# Pattern 2: Look for small regular amounts
"Find all recurring charges between $5 and $20"

# Pattern 3: Check specific frequency
"Show me all monthly subscriptions"
```

### Vendor Unmasking Workflows

```bash
# Step 1: Identify obscured vendors
"Show me all transactions through payment processors"

# Step 2: Review low confidence extractions
"Which vendors need manual review?"

# Step 3: Analyze specific processor
"Show me all Square transactions with what I bought"
```

### Expense Report Generation

```bash
# Business expenses
"Export all transactions categorized as Business to Excel"

# Tax preparation
"Show me all deductible expenses (Business, Healthcare, Charity)"

# Monthly reports
"Generate January 2024 expense report"
```

### Budget Analysis

```bash
# Over budget detection
"Show me categories where I spent over $500"

# Comparison
"Compare this month's spending to last month"

# Projections
"Based on current spending, project my annual costs"
```

## Advanced Examples

### Complex Vendor Analysis

```javascript
// Analyze vendor with all payment processor variants
{
  "csvPath": "data/amex-2024.csv",
  "vendorName": "Grubhub",
  "fuzzyMatch": true,
  "includeRelated": true,  // Includes PAYPAL *GRUBHUB, etc.
  "showTrends": true,
  "predictNext": true
}
```

### Custom Category Rules

```javascript
// Define custom categories
{
  "csvPath": "data/amex-2024.csv",
  "customCategories": {
    "Work Expenses": ["zoom", "slack", "github", "aws"],
    "Subscriptions": ["netflix", "spotify", "hulu", "disney"],
    "Coffee": ["starbucks", "blue bottle", "peets", "coffee"]
  },
  "sortBy": "amount"
}
```

### Fraud Detection with Custom Rules

```javascript
// Enhanced fraud detection
{
  "csvPath": "data/amex-2024.csv",
  "severityThreshold": "low",
  "includePatterns": true,
  "checks": {
    "amounts": true,
    "velocity": true,
    "vendors": true,
    "duplicates": true
  },
  "customBlacklist": ["crypto", "forex", "verify"],
  "customAmounts": [99.99, 199.99, 299.99]
}
```

### Multi-Format Export

```javascript
// Export with all options
{
  "csvPath": "data/amex-2024.csv",
  "format": "excel",
  "outputPath": "output/full-analysis.xlsx",
  "options": {
    "includeRaw": true,
    "includeMetadata": true,
    "includeCharts": true,
    "colorCoding": true
  }
}
```

## Troubleshooting Commands

### Debug Mode

```bash
# Enable debug logging
export AMEX_DEBUG=true
npm run dev

# Check file permissions
ls -la data/ output/

# Verify CSV format
head -n 5 data/amex-2024.csv

# Test MCP connection
node dist/amex-mcp-server.js --test
```

### Common Fixes

```bash
# Rebuild after changes
npm run build

# Clear node modules
rm -rf node_modules package-lock.json
npm install

# Check TypeScript errors
npx tsc --noEmit

# Validate CSV encoding
file -I data/amex-2024.csv
```

### Log Locations

```bash
# Claude Desktop logs
tail -f ~/Library/Logs/Claude/mcp.log  # macOS
tail -f %APPDATA%\Claude\Logs\mcp.log  # Windows

# Node.js output
npm run dev 2>&1 | tee debug.log
```

## Tips & Tricks

### Performance Optimization

```bash
# Process large files in chunks
"Analyze January 2024 only from my data"
"Analyze Q1 2024 separately"

# Skip charts for faster export
"Export to Excel without charts"

# Filter by amount for speed
"Analyze only transactions over $50"
```

### Better Vendor Unmasking

```bash
# Use extended details CSV
# Export from Amex with "Extended Details" option

# Review patterns
"Show me payment processor statistics"

# Add context
"The SQ* transactions at 7am are probably coffee shops"
```

### Subscription Management

```bash
# Find forgotten subscriptions
"Show me subscriptions I haven't used in 3 months"

# Cost analysis
"What would I save by canceling streaming subscriptions?"

# Frequency check
"Are any of my subscriptions charging more frequently than expected?"
```

### Data Quality

```bash
# Check for issues
"Show me any duplicate transactions"
"Find transactions with missing vendor names"
"Show anomalies in date ordering"

# Validation
"Verify my total spending matches statement"
"Check for transactions on impossible dates"
```

### Advanced Filtering

```bash
# Complex queries
"Show Food & Dining over $100 excluding delivery services"
"Find all weekend transactions at retail stores"
"Show recurring charges that increased in price"

# Time-based
"Show spending by day of week"
"Find all late-night transactions"
"Show holiday shopping sprees"
```

### Export Strategies

```bash
# For accountants
"Export with full transaction details and categories"

# For budgeting apps
"Export as CSV with YNAB-compatible format"

# For analysis
"Export as JSON with all metadata for Python analysis"

# For presentations
"Create Excel with charts and insights summary"
```

## Quick Command Reference

| Task | Command |
|------|---------|
| Basic analysis | `Analyze my Amex spending from data/file.csv` |
| Find subscriptions | `Find all my subscriptions` |
| Check specific vendor | `Analyze Amazon transactions` |
| Detect fraud | `Find suspicious transactions` |
| Category breakdown | `Show spending by category` |
| Export Excel | `Export analysis to output/report.xlsx` |
| Payment processors | `Show all PayPal transactions unmasked` |
| Date filter | `Analyze January 2024 only` |
| Amount filter | `Show transactions over $100` |
| Confidence filter | `Show high-confidence subscriptions only` |

## Keyboard Shortcuts (CLI)

| Key | Action |
|-----|--------|
| `Ctrl+C` | Stop analysis |
| `Ctrl+D` | Exit CLI mode |
| `Tab` | Auto-complete file paths |
| `↑/↓` | Command history |

## File Paths

| Type | Default Location |
|------|------------------|
| Input CSVs | `./data/*.csv` |
| Excel Output | `./output/*.xlsx` |
| JSON Output | `./output/*.json` |
| CSV Output | `./output/*.csv` |
| Logs | `./logs/` |
| Config | `./amex-config.json` |

---

Remember: All processing is 100% local. Your financial data never leaves your computer!