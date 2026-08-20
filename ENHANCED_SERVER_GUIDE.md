# Enhanced MCP server

`amex-mcp-server-enhanced.ts` starts the same engine as the default server with the **full tool catalog**.

```bash
npm run build
# Claude args: /absolute/path/to/dist/amex-mcp-server-enhanced.js

npm run dev:enhanced
# or
npx tsx src/cli.ts serve --mode enhanced
```

You can keep both hosts in Claude Desktop config: `amex-analysis` (standard) and `amex-analysis-enhanced` (full).

## Tools

### Always on in enhanced (and most in standard)

1. `load_statement` — read CSV once
2. `analyze_amex_spending` — summary / json / excel / csv; optional date and min-amount filters
3. `find_subscriptions`
4. `analyze_vendor`
5. `find_anomalies`
6. `spending_by_category`
7. `export_analysis`

### Standard + enhanced

8. `unmask_payment_processors`
9. `search_transactions`
10. `analyze_spending_trends`
11. `find_duplicate_charges`
12. `compare_periods`

### Enhanced only

13. `review_obscured_vendors`
14. `analyze_payment_processor_usage`
15. `predict_next_charges` — relative to **statement end**, not today
16. `find_unused_subscriptions`
17. `calculate_subscription_savings`
18. `project_future_spending`
19. `find_duplicate_subscriptions`
20. `analyze_against_budget`
21. `find_cost_reduction_opportunities`
22. `categorize_for_taxes` — coarse buckets, not tax advice
23. `extract_business_expenses`
24. `validate_transaction_data`
25. `find_missing_vendors`
26. `filter_by_location`
27. `filter_by_time` — weekday totals; Amex CSVs usually have no clock time
28. `find_related_vendors`
29. `merge_vendor_variants` — preview only; does not mutate the session
30. `check_spending_alerts`
31. `monitor_new_vendors`
32. `generate_monthly_report`
33. `generate_vendor_report`
34. `calculate_spending_statistics`
35. `analyze_spending_distribution`
36. `export_for_accounting`
37. `export_for_budgeting`

`csvPath` is optional on every tool except `load_statement` once a file is loaded.

## Resources and prompts

After a load: `amex://statement/summary`, `subscriptions`, `categories`, `anomalies`, `unmasked`.

Prompts: `review_subscriptions`, `find_waste`, `unmask_processors`, `monthly_review`.
