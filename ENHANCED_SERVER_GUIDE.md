# Enhanced MCP Server Guide

## Overview

The enhanced MCP server (`amex-mcp-server-enhanced.ts`) exposes **36 tools** instead of the basic 6, providing granular access to all the powerful functionality in the AmexAnalysis-MCP system.

## Quick Start

### 1. Build the Enhanced Server

```bash
npm run build:enhanced
```

### 2. Update Claude Desktop Config

Replace your existing configuration with:

```json
{
  "mcpServers": {
    "amex-analysis-enhanced": {
      "command": "node",
      "args": ["/absolute/path/to/dist/amex-mcp-server-enhanced.js"],
      "env": {}
    }
  }
}
```

### 3. Restart Claude Desktop

The enhanced server with all 36 tools will now be available.

## Available Tools

### Original Tools (6)
1. `analyze_amex_spending` - Comprehensive spending analysis
2. `find_subscriptions` - Find recurring charges
3. `analyze_vendor` - Deep dive on specific vendor
4. `find_anomalies` - Fraud detection
5. `spending_by_category` - Category breakdown
6. `export_analysis` - Export to Excel/CSV/JSON

### Vendor Unmasking Tools (3)
7. `unmask_payment_processors` - Reveal real vendors behind PayPal, Square, etc.
8. `review_obscured_vendors` - Get vendors needing manual review
9. `analyze_payment_processor_usage` - Statistics on processor usage

### Subscription Management (3)
10. `predict_next_charges` - Forecast upcoming subscription charges
11. `find_unused_subscriptions` - Identify inactive subscriptions
12. `calculate_subscription_savings` - Calculate cancellation savings

### Trend Analysis (3)
13. `analyze_spending_trends` - Time-based pattern analysis
14. `compare_periods` - Compare two time periods
15. `project_future_spending` - Forecast future costs

### Duplicate Detection (2)
16. `find_duplicate_charges` - Find potential duplicates
17. `find_duplicate_subscriptions` - Find redundant services

### Budget Analysis (2)
18. `analyze_against_budget` - Compare to budget limits
19. `find_cost_reduction_opportunities` - Identify savings

### Tax & Business (2)
20. `categorize_for_taxes` - Tax-ready categorization
21. `extract_business_expenses` - Separate business costs

### Data Quality (2)
22. `validate_transaction_data` - Check data integrity
23. `find_missing_vendors` - Find unclear transactions

### Advanced Filtering (3)
24. `search_transactions` - Powerful search with filters
25. `filter_by_location` - Location-based analysis
26. `filter_by_time` - Time pattern analysis

### Vendor Relationships (2)
27. `find_related_vendors` - Discover vendor connections
28. `merge_vendor_variants` - Consolidate similar names

### Alerts & Monitoring (2)
29. `check_spending_alerts` - Threshold monitoring
30. `monitor_new_vendors` - Track new vendors

### Reporting (2)
31. `generate_monthly_report` - Monthly summaries
32. `generate_vendor_report` - Vendor deep dives

### Statistical Analysis (2)
33. `calculate_spending_statistics` - Advanced stats
34. `analyze_spending_distribution` - Distribution analysis

### Integration (2)
35. `export_for_accounting` - QuickBooks/Xero/Wave format
36. `export_for_budgeting` - YNAB/Mint format

## Example Usage in Claude

### Vendor Unmasking
```
"Show me all the real vendors behind my PayPal transactions"
"Which payment processor transactions need manual review?"
"What percentage of my spending goes through payment processors?"
```

### Subscription Management
```
"What subscriptions will charge in the next 30 days?"
"Find subscriptions I haven't used in 3 months"
"How much would I save by canceling Netflix and Hulu?"
```

### Trend Analysis
```
"Show my spending trends by month"
"Compare this month's spending to last month"
"Project my spending for the next 6 months"
```

### Duplicate Detection
```
"Find any duplicate charges in the last week"
"Do I have multiple subscriptions for the same type of service?"
```

### Budget Analysis
```
"Check my spending against these budgets: Food $500, Entertainment $200"
"Find ways to reduce my spending by $500/month"
```

### Tax Preparation
```
"Categorize my transactions for tax purposes"
"Extract all my business expenses with keywords: office, client, software"
```

### Advanced Search
```
"Search for all Uber transactions over $50"
"Show all transactions in New York"
"Find weekend transactions at restaurants"
```

### Reporting
```
"Generate a report for January 2024"
"Create a detailed report for Amazon including trends"
```

### Data Export
```
"Export my data in QuickBooks format"
"Create a YNAB-compatible export"
```

## Benefits of Enhanced Server

1. **Granular Control**: Access specific functionality without running full analysis
2. **Better Performance**: Focused tools run faster
3. **Flexible Workflows**: Combine tools for custom analysis
4. **Advanced Features**: Access capabilities not available in basic mode
5. **Integration Ready**: Export formats for popular financial software

## Switching Between Servers

You can maintain both configurations:

```json
{
  "mcpServers": {
    "amex-analysis": {
      "command": "node",
      "args": ["/path/to/dist/amex-mcp-server.js"]
    },
    "amex-analysis-enhanced": {
      "command": "node",
      "args": ["/path/to/dist/amex-mcp-server-enhanced.js"]
    }
  }
}
```

This allows you to choose which server to use based on your needs.

## Troubleshooting

### Tools Not Showing Up
1. Ensure you built the enhanced server: `npm run build:enhanced`
2. Check the path in your Claude config is correct
3. Restart Claude Desktop completely

### Performance Issues
- The enhanced server loads more tools but each tool is optimized
- If you experience slowness, consider using the basic server for simple tasks

### Errors with New Tools
- Check the CSV file path is correct
- Ensure the CSV has the required fields for advanced analysis
- Some tools require specific data (e.g., location filters need city/state data)

## Development

To modify or add more tools:

1. Edit `amex-mcp-server-enhanced.ts`
2. Add tool definition in `setupHandlers()`
3. Add handler case in the switch statement
4. Implement the handler method
5. Rebuild: `npm run build:enhanced`

## Future Enhancements

Potential tools that could be added:
- Receipt matching
- Multi-currency support
- Spending goals tracking
- Vendor ratings
- Cash flow analysis
- Investment tracking integration
- Bill reminders
- Spending challenges/gamification

The modular architecture makes it easy to add new tools as needed!