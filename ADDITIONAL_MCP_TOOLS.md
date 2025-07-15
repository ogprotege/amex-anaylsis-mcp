# Additional MCP Tools That Could Be Added

## Currently Exposed (6 tools)
1. analyze_amex_spending
2. find_subscriptions
3. analyze_vendor
4. find_anomalies
5. spending_by_category
6. export_analysis

## Additional Tools That Could Be Exposed

### Vendor Unmasking Tools
1. **unmask_payment_processors**
   - Description: Reveal actual vendors behind payment processors
   - Parameters: csvPath, processorType?, confidenceThreshold?
   - Returns: List of unmasked vendors with confidence scores

2. **review_obscured_vendors**
   - Description: Get vendors that need manual review
   - Parameters: csvPath, includeHighConfidence?
   - Returns: Vendors with low confidence extractions

3. **analyze_payment_processor_usage**
   - Description: Statistics on payment processor usage
   - Parameters: csvPath
   - Returns: Breakdown by processor type, amounts, frequency

### Subscription Management Tools
4. **predict_next_charges**
   - Description: Predict when subscriptions will charge next
   - Parameters: csvPath, daysAhead?
   - Returns: Upcoming charges with dates and amounts

5. **find_unused_subscriptions**
   - Description: Find subscriptions not used recently
   - Parameters: csvPath, unusedDays?
   - Returns: Inactive subscriptions to consider canceling

6. **calculate_subscription_savings**
   - Description: Calculate potential savings from canceling subscriptions
   - Parameters: csvPath, subscriptionsToCancel[]
   - Returns: Monthly and annual savings

### Trend Analysis Tools
7. **analyze_spending_trends**
   - Description: Analyze spending patterns over time
   - Parameters: csvPath, groupBy (daily/weekly/monthly)
   - Returns: Trend data with increases/decreases

8. **compare_periods**
   - Description: Compare spending between two time periods
   - Parameters: csvPath, period1Start, period1End, period2Start, period2End
   - Returns: Comparative analysis

9. **project_future_spending**
   - Description: Project future spending based on patterns
   - Parameters: csvPath, monthsAhead
   - Returns: Projected costs by category and total

### Duplicate Detection Tools
10. **find_duplicate_charges**
    - Description: Find potential duplicate transactions
    - Parameters: csvPath, windowDays?, amountTolerance?
    - Returns: Groups of potential duplicates

11. **find_duplicate_subscriptions**
    - Description: Find multiple subscriptions for same service
    - Parameters: csvPath
    - Returns: Duplicate services across vendors

### Budget Analysis Tools
12. **analyze_against_budget**
    - Description: Compare spending against budget limits
    - Parameters: csvPath, budgetByCategory{}
    - Returns: Over/under budget analysis

13. **find_cost_reduction_opportunities**
    - Description: Identify ways to reduce spending
    - Parameters: csvPath, targetReduction?
    - Returns: Suggestions ranked by savings potential

### Tax & Business Tools
14. **categorize_for_taxes**
    - Description: Categorize transactions for tax purposes
    - Parameters: csvPath, taxCategories[]
    - Returns: Tax-ready categorization

15. **extract_business_expenses**
    - Description: Identify potential business expenses
    - Parameters: csvPath, businessKeywords[]
    - Returns: Business vs personal breakdown

### Data Quality Tools
16. **validate_transaction_data**
    - Description: Check for data quality issues
    - Parameters: csvPath
    - Returns: Missing data, format issues, anomalies

17. **find_missing_vendors**
    - Description: Find transactions with unclear vendors
    - Parameters: csvPath
    - Returns: Transactions needing vendor clarification

### Advanced Filtering Tools
18. **search_transactions**
    - Description: Advanced transaction search
    - Parameters: csvPath, query, filters{}
    - Returns: Matching transactions

19. **filter_by_location**
    - Description: Filter transactions by location
    - Parameters: csvPath, city?, state?, country?
    - Returns: Location-based spending

20. **filter_by_time**
    - Description: Analyze spending by time patterns
    - Parameters: csvPath, timeOfDay?, dayOfWeek?
    - Returns: Time-based patterns

### Vendor Relationship Tools
21. **find_related_vendors**
    - Description: Find vendors that might be related
    - Parameters: csvPath, vendorName
    - Returns: Potentially related vendors

22. **merge_vendor_variants**
    - Description: Merge similar vendor names
    - Parameters: csvPath, vendorMappings{}
    - Returns: Consolidated vendor analysis

### Alert & Monitoring Tools
23. **check_spending_alerts**
    - Description: Check for spending threshold breaches
    - Parameters: csvPath, alerts[]
    - Returns: Triggered alerts

24. **monitor_new_vendors**
    - Description: Identify first-time vendors
    - Parameters: csvPath, sinceDate?
    - Returns: New vendor activity

### Reporting Tools
25. **generate_monthly_report**
    - Description: Generate comprehensive monthly report
    - Parameters: csvPath, month, year
    - Returns: Formatted monthly summary

26. **generate_vendor_report**
    - Description: Detailed report for specific vendor
    - Parameters: csvPath, vendorName, includeCharts?
    - Returns: Vendor-specific insights

### Statistical Analysis Tools
27. **calculate_spending_statistics**
    - Description: Advanced statistical analysis
    - Parameters: csvPath, metrics[]
    - Returns: Mean, median, std dev, percentiles

28. **analyze_spending_distribution**
    - Description: Analyze spending distribution patterns
    - Parameters: csvPath, bucketSize?
    - Returns: Distribution histogram data

### Integration Tools
29. **export_for_accounting**
    - Description: Export in accounting software format
    - Parameters: csvPath, format (quickbooks/xero/wave)
    - Returns: Formatted export file

30. **export_for_budgeting**
    - Description: Export for budgeting apps
    - Parameters: csvPath, format (ynab/mint/personalcapital)
    - Returns: Budget app compatible file

## Implementation Example

To add these tools, update the `setupHandlers()` method in amex-mcp-server.ts:

```typescript
// Add to the tools array in ListToolsRequestSchema handler
{
  name: 'unmask_payment_processors',
  description: 'Reveal actual vendors behind payment processors like PayPal, Square, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      csvPath: {
        type: 'string',
        description: 'Path to Amex CSV file',
      },
      processorType: {
        type: 'string',
        enum: ['paypal', 'square', 'stripe', 'all'],
        description: 'Filter by specific processor',
        default: 'all',
      },
      confidenceThreshold: {
        type: 'number',
        description: 'Minimum confidence score (0-1)',
        default: 0.5,
      },
    },
    required: ['csvPath'],
  },
},

// Add to the switch statement in CallToolRequestSchema handler
case 'unmask_payment_processors':
  return await this.unmaskPaymentProcessors(args);

// Add the implementation method
private async unmaskPaymentProcessors(args: any) {
  const schema = z.object({
    csvPath: z.string(),
    processorType: z.enum(['paypal', 'square', 'stripe', 'all']).default('all'),
    confidenceThreshold: z.number().min(0).max(1).default(0.5),
  });
  
  const { csvPath, processorType, confidenceThreshold } = schema.parse(args);
  
  await this.analyzer.parseAmexCsv(csvPath);
  const analysis = this.analyzer.analyze();
  
  // Filter and unmask vendors
  const unmaskedVendors = analysis.vendors
    .filter(v => v.metadata.isObscured)
    .filter(v => processorType === 'all' || v.metadata.processor?.toLowerCase() === processorType)
    .filter(v => (v.metadata.unmaskingConfidence || 0) >= confidenceThreshold)
    .map(v => ({
      original: v.metadata.originalDescription,
      unmasked: v.displayName,
      processor: v.metadata.processor,
      confidence: v.metadata.unmaskingConfidence,
      totalSpent: v.totalSpent,
      transactionCount: v.transactionCount,
    }));
  
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(unmaskedVendors, null, 2),
    }],
  };
}
```

## Benefits of Additional Tools

1. **Granular Control**: Users can perform specific tasks without full analysis
2. **Performance**: Focused tools run faster than comprehensive analysis
3. **Flexibility**: Combine tools for custom workflows
4. **Discovery**: Users discover features they didn't know existed
5. **Integration**: Easier to integrate with other systems
6. **Automation**: Individual tools can be scripted/automated

## Recommendation

Start by adding the most valuable tools:
1. unmask_payment_processors (high user value)
2. predict_next_charges (practical utility)
3. find_duplicate_charges (saves money)
4. analyze_spending_trends (insights)
5. search_transactions (flexibility)

Then gradually add more based on user feedback and usage patterns.