import { z } from 'zod';
import { formatDate } from './dates.js';
import { exportToCsv, exportToExcel, exportToJson } from './exports.js';
import {
  formatAnomalies,
  formatCategories,
  formatSubscriptions,
  formatSummary,
  formatVendor,
  money,
} from './format.js';
import { monthlyEquivalent } from './insights.js';
import { defaultOutputPath, resolveOutputPath } from './paths.js';
import { AnalysisSession, parseOptionalDate } from './session.js';
import type { ServerMode, SpendingAnalysis, VendorProfile } from './types.js';

export const csvPathSchema = z
  .string()
  .optional()
  .describe('Path to an Amex CSV. Omit to reuse the statement already loaded in this session.');

export interface ToolContext {
  session: AnalysisSession;
}

export interface ToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  modes: ServerMode[];
  inputSchema: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

function textResult(text: string, structured?: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: 'text', text }],
    structuredContent: structured,
  };
}

function errorResult(message: string): ToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

async function withAnalysis(
  args: { csvPath?: string; minAmount?: number; start?: string; end?: string },
  ctx: ToolContext
): Promise<SpendingAnalysis> {
  const loaded = await ctx.session.ensure(args.csvPath, {
    minAmount: args.minAmount,
    dateRange: {
      start: parseOptionalDate(args.start),
      end: parseOptionalDate(args.end),
    },
  });
  if (args.minAmount || args.start || args.end) {
    return loaded.analyzer.analyze({
      minAmount: args.minAmount,
      dateRange: {
        start: parseOptionalDate(args.start),
        end: parseOptionalDate(args.end),
      },
    });
  }
  return loaded.analysis;
}

export const tools: ToolDef[] = [
  {
    name: 'load_statement',
    title: 'Load statement',
    description:
      'Load an American Express activity CSV into the session. Call this once, then omit csvPath on later tools.',
    modes: ['basic', 'standard', 'enhanced'],
    inputSchema: {
      csvPath: z.string().describe('Path to the Amex CSV file'),
    },
    handler: async (args, ctx) => {
      const csvPath = String(args.csvPath);
      const loaded = await ctx.session.load(csvPath);
      const { analysis } = loaded;
      return textResult(
        `Loaded ${loaded.path}\n${analysis.transactionCount} transactions, ${analysis.vendorCount} vendors, ${formatDate(analysis.dateRange.start)} to ${formatDate(analysis.dateRange.end)}.\nCharges $${money(analysis.totalSpent)} / credits $${money(analysis.creditsTotal)} / payments $${money(analysis.paymentsTotal)}.\nUse analyze_amex_spending, find_subscriptions, or the amex://statement/* resources next.`,
        {
          path: loaded.path,
          transactionCount: analysis.transactionCount,
          vendorCount: analysis.vendorCount,
          totalSpent: analysis.totalSpent,
          dateRange: { start: formatDate(analysis.dateRange.start), end: formatDate(analysis.dateRange.end) },
        }
      );
    },
  },
  {
    name: 'analyze_amex_spending',
    title: 'Analyze spending',
    description: 'Summarize charges, credits, subscriptions, top vendors, and categories for a loaded or given CSV.',
    modes: ['basic', 'standard', 'enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      outputFormat: z.enum(['summary', 'json', 'excel', 'csv']).optional().describe('summary (default), json, excel, or csv'),
      outputPath: z.string().optional().describe('Where to write excel/csv/json output'),
      minAmount: z.number().optional(),
      start: z.string().optional().describe('Inclusive start date YYYY-MM-DD'),
      end: z.string().optional().describe('Inclusive end date YYYY-MM-DD'),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const format = String(args.outputFormat ?? 'summary');
      if (format === 'summary' || format === 'json') {
        return textResult(format === 'json' ? JSON.stringify(compactAnalysis(analysis), null, 2) : formatSummary(analysis), compactAnalysis(analysis));
      }
      const source = analysis.sourcePath ?? 'statement.csv';
      const outputPath = await resolveOutputPath(
        String(args.outputPath ?? defaultOutputPath(source, format === 'excel' ? 'xlsx' : format)),
        analysis.sourcePath
      );
      if (format === 'excel') await exportToExcel(analysis, outputPath);
      if (format === 'csv') await exportToCsv(analysis, outputPath);
      return textResult(`Wrote ${format} analysis to ${outputPath}`, { outputPath, format });
    },
  },
  {
    name: 'find_subscriptions',
    title: 'Find subscriptions',
    description: 'List recurring services with monthly and annual cost equivalents.',
    modes: ['basic', 'standard', 'enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      confidenceThreshold: z.number().min(0).max(1).optional(),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const threshold = Number(args.confidenceThreshold ?? 0);
      const filtered = {
        ...analysis,
        vendors: analysis.vendors.filter(
          (vendor) =>
            vendor.metadata.isSubscription &&
            (vendor.recurringPattern?.confidence ?? 1) >= threshold
        ),
      };
      return textResult(formatSubscriptions(filtered), {
        count: filtered.vendors.length,
        monthly: analysis.monthlySubscriptionCost,
        annual: analysis.monthlySubscriptionCost * 12,
      });
    },
  },
  {
    name: 'analyze_vendor',
    title: 'Analyze vendor',
    description: 'Deep-dive a merchant, including processor-masked variants.',
    modes: ['basic', 'standard', 'enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      vendorName: z.string().describe('Merchant name or fragment'),
      fuzzyMatch: z.boolean().optional(),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const query = String(args.vendorName).toLowerCase();
      const vendor = analysis.vendors.find(
        (item) =>
          item.displayName.toLowerCase().includes(query) ||
          item.name.toLowerCase().includes(query) ||
          item.normalizedName.includes(query) ||
          item.metadata.originalDescription?.toLowerCase().includes(query)
      );
      if (!vendor) return errorResult(`No vendor matched "${args.vendorName}".`);
      return textResult(formatVendor(vendor), {
        displayName: vendor.displayName,
        totalSpent: vendor.totalSpent,
        transactionCount: vendor.transactionCount,
        category: vendor.category,
      });
    },
  },
  {
    name: 'find_anomalies',
    title: 'Find anomalies',
    description: 'Flag scam-like wording, amount spikes, and same-day duplicate charges. Does not hide spend from totals.',
    modes: ['basic', 'standard', 'enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      severityThreshold: z.enum(['low', 'medium', 'high']).optional(),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const threshold = (args.severityThreshold as 'low' | 'medium' | 'high') ?? 'medium';
      return textResult(formatAnomalies(analysis, threshold), {
        anomalies: analysis.anomalies,
        duplicates: analysis.duplicateCharges,
      });
    },
  },
  {
    name: 'spending_by_category',
    title: 'Spending by category',
    description: 'Break charges down by inferred or CSV-provided category.',
    modes: ['basic', 'standard', 'enhanced'],
    inputSchema: { csvPath: csvPathSchema },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      return textResult(formatCategories(analysis), { categories: analysis.categoryBreakdown });
    },
  },
  {
    name: 'export_analysis',
    title: 'Export analysis',
    description: 'Write the current analysis to Excel, CSV, or JSON.',
    modes: ['basic', 'standard', 'enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      format: z.enum(['excel', 'csv', 'json']),
      outputPath: z.string().optional(),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const format = String(args.format);
      const ext = format === 'excel' ? 'xlsx' : format;
      const outputPath = await resolveOutputPath(
        String(args.outputPath ?? defaultOutputPath(analysis.sourcePath ?? 'statement.csv', ext)),
        analysis.sourcePath
      );
      if (format === 'excel') await exportToExcel(analysis, outputPath);
      else if (format === 'csv') await exportToCsv(analysis, outputPath);
      else await exportToJson(analysis, outputPath);
      return textResult(`Exported ${format} to ${outputPath}`, { outputPath, format });
    },
  },
  {
    name: 'unmask_payment_processors',
    title: 'Unmask processors',
    description: 'Show the real merchants behind PayPal, Square, Stripe, Toast, and similar processors.',
    modes: ['standard', 'enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      processorType: z.enum(['paypal', 'square', 'stripe', 'toast', 'all']).optional(),
      confidenceThreshold: z.number().min(0).max(1).optional(),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const processorType = String(args.processorType ?? 'all');
      const threshold = Number(args.confidenceThreshold ?? 0.5);
      const rows = analysis.vendors
        .filter((vendor) => vendor.metadata.isObscured)
        .filter((vendor) => processorType === 'all' || vendor.metadata.processor?.toLowerCase() === processorType)
        .filter((vendor) => (vendor.metadata.unmaskingConfidence ?? 0) >= threshold);
      if (rows.length === 0) return textResult('No masked processor transactions matched.');
      const text = rows
        .map(
          (vendor) =>
            `${vendor.metadata.processor} → ${vendor.displayName}\n  Original: ${vendor.metadata.originalDescription}\n  Confidence: ${Math.round((vendor.metadata.unmaskingConfidence ?? 0) * 100)}%\n  Charges: $${money(vendor.totalSpent)} (${vendor.transactionCount} tx)`
        )
        .join('\n\n');
      return textResult(`Unmasked ${rows.length} merchants\n\n${text}`, { count: rows.length });
    },
  },
  {
    name: 'review_obscured_vendors',
    title: 'Review obscured vendors',
    description: 'List processor transactions that still need a human to identify the merchant.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      includeHighConfidence: z.boolean().optional(),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const includeHigh = Boolean(args.includeHighConfidence);
      const rows = analysis.vendors.filter(
        (vendor) =>
          vendor.metadata.isObscured &&
          (vendor.metadata.needsManualReview || (includeHigh && (vendor.metadata.unmaskingConfidence ?? 0) >= 0.7))
      );
      return textResult(
        rows.length
          ? rows.map((vendor) => `${vendor.displayName} via ${vendor.metadata.processor} ($${money(vendor.totalSpent)})`).join('\n')
          : 'Nothing needs review.',
        { count: rows.length }
      );
    },
  },
  {
    name: 'analyze_payment_processor_usage',
    title: 'Processor usage',
    description: 'Totals and merchant counts by payment processor.',
    modes: ['enhanced'],
    inputSchema: { csvPath: csvPathSchema },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const stats = new Map<string, { count: number; total: number; vendors: Set<string> }>();
      for (const vendor of analysis.vendors.filter((item) => item.metadata.processor)) {
        const current = stats.get(vendor.metadata.processor!) ?? { count: 0, total: 0, vendors: new Set<string>() };
        current.count += vendor.transactionCount;
        current.total += vendor.totalSpent;
        current.vendors.add(vendor.displayName);
        stats.set(vendor.metadata.processor!, current);
      }
      const lines = [...stats.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .map(([name, value]) => `${name}: $${money(value.total)} / ${value.count} tx / ${value.vendors.size} merchants`);
      return textResult(lines.join('\n') || 'No processor-masked spend.', { processors: Object.fromEntries(stats) });
    },
  },
  {
    name: 'predict_next_charges',
    title: 'Predict next charges',
    description: 'Upcoming recurring charges relative to the statement end date, not today.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      daysAhead: z.number().optional(),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const daysAhead = Number(args.daysAhead ?? 30);
      const horizon = analysis.dateRange.end.getTime() + daysAhead * 86400000;
      const upcoming = analysis.recurringCharges
        .filter((vendor) => vendor.recurringPattern?.nextExpectedDate)
        .filter((vendor) => vendor.recurringPattern!.nextExpectedDate!.getTime() <= horizon)
        .sort((a, b) => a.recurringPattern!.nextExpectedDate!.getTime() - b.recurringPattern!.nextExpectedDate!.getTime());
      const text = upcoming
        .map((vendor) => `${formatDate(vendor.recurringPattern!.nextExpectedDate!)}  ${vendor.displayName}  $${money(vendor.recurringPattern!.expectedAmount)}`)
        .join('\n');
      return textResult(text || 'No recurring charges expected in that window.', { count: upcoming.length });
    },
  },
  {
    name: 'find_unused_subscriptions',
    title: 'Unused subscriptions',
    description: 'Subscriptions with no charge in the last N days of the statement period.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      unusedDays: z.number().optional(),
    },
    handler: async (args, ctx) => {
      const unusedDays = Number(args.unusedDays ?? 90);
      const analysis = await ctx.session.ensure((args as { csvPath?: string }).csvPath).then((loaded) =>
        loaded.analyzer.analyze({ unusedSubscriptionDays: unusedDays })
      );
      const unused = analysis.vendors.filter((vendor) => {
        if (!vendor.metadata.isSubscription) return false;
        const elapsed = Math.round((analysis.dateRange.end.getTime() - vendor.lastSeen.getTime()) / 86400000);
        return elapsed > unusedDays;
      });
      return textResult(
        unused.map((vendor) => `${vendor.displayName}: last ${formatDate(vendor.lastSeen)} ($${money(monthlyEquivalent(vendor))}/mo)`).join('\n') ||
          'No unused subscriptions in this window.',
        { count: unused.length }
      );
    },
  },
  {
    name: 'calculate_subscription_savings',
    title: 'Subscription savings',
    description: 'Estimate monthly and annual savings if named subscriptions are cancelled.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      subscriptionsToCancel: z.array(z.string()),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const names = ((args.subscriptionsToCancel as string[]) ?? []).map((name) => name.toLowerCase());
      const matched = analysis.vendors.filter(
        (vendor) =>
          vendor.metadata.isSubscription &&
          names.some((name) => vendor.displayName.toLowerCase().includes(name) || vendor.normalizedName.includes(name))
      );
      if (matched.length === 0) return errorResult('None of those names matched a detected subscription.');
      const monthly = matched.reduce((sum, vendor) => sum + monthlyEquivalent(vendor), 0);
      return textResult(
        `Cancel ${matched.map((vendor) => vendor.displayName).join(', ')}\nMonthly: $${money(monthly)}\nAnnual: $${money(monthly * 12)}`,
        { monthly, annual: monthly * 12, matched: matched.map((vendor) => vendor.displayName) }
      );
    },
  },
  {
    name: 'analyze_spending_trends',
    title: 'Spending trends',
    description: 'Charge totals grouped by day, week, or month.',
    modes: ['standard', 'enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      groupBy: z.enum(['daily', 'weekly', 'monthly']).optional(),
    },
    handler: async (args, ctx) => {
      const loaded = await ctx.session.ensure((args as { csvPath?: string }).csvPath);
      const groupBy = String(args.groupBy ?? 'monthly');
      const buckets = new Map<string, number>();
      for (const tx of loaded.analyzer.getTransactions().filter((item) => item.kind === 'charge')) {
        const key = bucketKey(tx.date, groupBy);
        buckets.set(key, (buckets.get(key) ?? 0) + tx.amount);
      }
      const lines = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, total]) => `${key}: $${money(total)}`);
      return textResult(lines.join('\n'), { buckets: Object.fromEntries(buckets) });
    },
  },
  {
    name: 'compare_periods',
    title: 'Compare periods',
    description: 'Compare charge totals between two date ranges in the same statement.',
    modes: ['standard', 'enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      period1Start: z.string(),
      period1End: z.string(),
      period2Start: z.string(),
      period2End: z.string(),
    },
    handler: async (args, ctx) => {
      const loaded = await ctx.session.ensure((args as { csvPath?: string }).csvPath);
      const p1 = loaded.analyzer.analyze({
        dateRange: { start: parseOptionalDate(String(args.period1Start)), end: parseOptionalDate(String(args.period1End)) },
      });
      const p2 = loaded.analyzer.analyze({
        dateRange: { start: parseOptionalDate(String(args.period2Start)), end: parseOptionalDate(String(args.period2End)) },
      });
      const delta = p2.totalSpent - p1.totalSpent;
      const text = [
        `Period 1 ${formatDate(p1.dateRange.start)}–${formatDate(p1.dateRange.end)}: $${money(p1.totalSpent)}`,
        `Period 2 ${formatDate(p2.dateRange.start)}–${formatDate(p2.dateRange.end)}: $${money(p2.totalSpent)}`,
        `Change: ${delta >= 0 ? '+' : ''}$${money(delta)}`,
      ].join('\n');
      return textResult(text, { period1: p1.totalSpent, period2: p2.totalSpent, delta });
    },
  },
  {
    name: 'project_future_spending',
    title: 'Project spending',
    description: 'Naive projection from average monthly charges plus recurring services.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      monthsAhead: z.number().optional(),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const monthsAhead = Number(args.monthsAhead ?? 3);
      const spanDays = Math.max(1, Math.round((analysis.dateRange.end.getTime() - analysis.dateRange.start.getTime()) / 86400000));
      const monthlyRunRate = analysis.totalSpent * (30 / spanDays);
      const projected = monthlyRunRate * monthsAhead;
      return textResult(
        `Statement span ${spanDays} days.\nRun-rate: $${money(monthlyRunRate)}/month\nProjected ${monthsAhead} months: $${money(projected)}\nOf which subscriptions: $${money(analysis.monthlySubscriptionCost * monthsAhead)}`,
        { monthlyRunRate, projected, monthsAhead }
      );
    },
  },
  {
    name: 'find_duplicate_charges',
    title: 'Find duplicate charges',
    description: 'Same merchant, amount, and day — possible double-posts.',
    modes: ['standard', 'enhanced'],
    inputSchema: { csvPath: csvPathSchema },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      if (analysis.duplicateCharges.length === 0) return textResult('No same-day duplicate charges found.');
      return textResult(
        analysis.duplicateCharges
          .map((item) => `${item.vendor}: ${item.count} × $${money(item.amount)} on ${formatDate(item.date)}`)
          .join('\n'),
        { duplicates: analysis.duplicateCharges }
      );
    },
  },
  {
    name: 'find_duplicate_subscriptions',
    title: 'Duplicate subscriptions',
    description: 'Recurring services that look like overlapping products (streaming, cloud storage, etc.).',
    modes: ['enhanced'],
    inputSchema: { csvPath: csvPathSchema },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const groups: Record<string, string[]> = {
        streaming: ['netflix', 'hulu', 'disney', 'hbo', 'max', 'paramount', 'peacock', 'apple tv'],
        music: ['spotify', 'apple music', 'youtube music', 'amazon music'],
        storage: ['dropbox', 'icloud', 'google one', 'google storage', 'onedrive'],
      };
      const lines: string[] = [];
      for (const [group, needles] of Object.entries(groups)) {
        const hits = analysis.vendors.filter(
          (vendor) =>
            vendor.metadata.isSubscription &&
            needles.some((needle) => vendor.normalizedName.includes(needle) || vendor.displayName.toLowerCase().includes(needle))
        );
        if (hits.length > 1) {
          lines.push(`${group}: ${hits.map((vendor) => `${vendor.displayName} ($${money(monthlyEquivalent(vendor))}/mo)`).join(', ')}`);
        }
      }
      return textResult(lines.join('\n') || 'No overlapping subscription groups found.', { groups: lines });
    },
  },
  {
    name: 'analyze_against_budget',
    title: 'Budget check',
    description: 'Compare category spend to a {category: limit} map.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      budgetByCategory: z.record(z.number()),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const budget = (args.budgetByCategory ?? {}) as Record<string, number>;
      const lines = Object.entries(budget).map(([category, limit]) => {
        const spent = findCategoryTotal(analysis, category);
        const delta = limit - spent;
        return `${category}: $${money(spent)} / $${money(limit)} (${delta >= 0 ? 'under' : 'OVER'} $${money(Math.abs(delta))})`;
      });
      return textResult(lines.join('\n') || 'No budget categories provided.', { budget });
    },
  },
  {
    name: 'find_cost_reduction_opportunities',
    title: 'Cost reductions',
    description: 'Rank subscriptions and high-frequency vendors as savings candidates.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      targetReduction: z.number().optional(),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const target = Number(args.targetReduction ?? analysis.monthlySubscriptionCost * 0.2);
      const candidates = analysis.vendors
        .filter((vendor) => vendor.metadata.isSubscription || vendor.transactionCount >= 4)
        .map((vendor) => ({ name: vendor.displayName, monthly: monthlyEquivalent(vendor) || vendor.totalSpent / 3, reason: vendor.metadata.isSubscription ? 'subscription' : 'frequent vendor' }))
        .sort((a, b) => b.monthly - a.monthly)
        .slice(0, 8);
      return textResult(
        `Target ~$${money(target)}/month\n` +
          candidates.map((item) => `${item.name}: $${money(item.monthly)}/mo (${item.reason})`).join('\n'),
        { target, candidates }
      );
    },
  },
  {
    name: 'categorize_for_taxes',
    title: 'Tax categories',
    description: 'Map spend into coarse tax-oriented buckets. Not tax advice.',
    modes: ['enhanced'],
    inputSchema: { csvPath: csvPathSchema },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const map: Record<string, string> = {
        'Software & Services': 'Business / software',
        'Health & Wellness': 'Medical',
        'Travel & Lodging': 'Travel',
        'Gas & Fuel': 'Transportation',
        Transportation: 'Transportation',
        'Financial Services': 'Financial',
      };
      const buckets = new Map<string, number>();
      for (const [category, stats] of Object.entries(analysis.categoryBreakdown)) {
        const bucket = map[category] ?? 'Personal / other';
        buckets.set(bucket, (buckets.get(bucket) ?? 0) + stats.total);
      }
      return textResult(
        [...buckets.entries()].map(([name, total]) => `${name}: $${money(total)}`).join('\n'),
        { buckets: Object.fromEntries(buckets) }
      );
    },
  },
  {
    name: 'extract_business_expenses',
    title: 'Business expenses',
    description: 'Find charges whose description matches business keywords.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      businessKeywords: z.array(z.string()).optional(),
    },
    handler: async (args, ctx) => {
      const loaded = await ctx.session.ensure((args as { csvPath?: string }).csvPath);
      const keywords = ((args.businessKeywords as string[]) ?? ['office', 'client', 'software', 'aws', 'adobe', 'github', 'zoom', 'slack']).map((word) => word.toLowerCase());
      const hits = loaded.analyzer
        .getTransactions()
        .filter((tx) => tx.kind === 'charge' && keywords.some((word) => tx.description.toLowerCase().includes(word)));
      const total = hits.reduce((sum, tx) => sum + tx.amount, 0);
      return textResult(
        `${hits.length} possible business charges, $${money(total)}\n` +
          hits.slice(0, 20).map((tx) => `${formatDate(tx.date)}  $${money(tx.amount)}  ${tx.description}`).join('\n'),
        { count: hits.length, total }
      );
    },
  },
  {
    name: 'validate_transaction_data',
    title: 'Validate data',
    description: 'Report parse warnings, skipped rows, and missing fields.',
    modes: ['enhanced'],
    inputSchema: { csvPath: csvPathSchema },
    handler: async (args, ctx) => {
      const loaded = await ctx.session.ensure((args as { csvPath?: string }).csvPath);
      const parse = loaded.analyzer.getLastParse();
      const missingCity = loaded.analyzer.getTransactions().filter((tx) => !tx.city).length;
      const text = [
        `Convention: ${parse?.signConvention}`,
        `Skipped rows: ${parse?.skippedRows ?? 0}`,
        `Transactions missing city: ${missingCity}`,
        '',
        ...(parse?.warnings.slice(0, 15).map((warning) => `row ${warning.rowNumber}: ${warning.message}`) ?? []),
      ].join('\n');
      return textResult(text, { skippedRows: parse?.skippedRows, warnings: parse?.warnings.length });
    },
  },
  {
    name: 'find_missing_vendors',
    title: 'Unclear vendors',
    description: 'Charges with unknown or generic merchant names.',
    modes: ['enhanced'],
    inputSchema: { csvPath: csvPathSchema },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const unclear = analysis.vendors.filter(
        (vendor) => vendor.displayName.toLowerCase().includes('unknown') || vendor.metadata.needsManualReview
      );
      return textResult(
        unclear.map((vendor) => `${vendor.displayName}: ${vendor.metadata.originalDescription ?? vendor.name}`).join('\n') ||
          'No unclear merchants.',
        { count: unclear.length }
      );
    },
  },
  {
    name: 'search_transactions',
    title: 'Search transactions',
    description: 'Filter charges by text, amount, and optional dates.',
    modes: ['standard', 'enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      query: z.string().describe('Case-insensitive substring to match against description'),
      minAmount: z.number().optional(),
      maxAmount: z.number().optional(),
      start: z.string().optional(),
      end: z.string().optional(),
    },
    handler: async (args, ctx) => {
      const loaded = await ctx.session.ensure((args as { csvPath?: string }).csvPath);
      const query = String(args.query ?? '').toLowerCase();
      const minAmount = args.minAmount as number | undefined;
      const maxAmount = args.maxAmount as number | undefined;
      const start = parseOptionalDate(args.start as string | undefined);
      const end = parseOptionalDate(args.end as string | undefined);
      const hits = loaded.analyzer.getTransactions().filter((tx) => {
        if (query && !tx.description.toLowerCase().includes(query) && !(tx.extendedDetails ?? '').toLowerCase().includes(query)) {
          return false;
        }
        if (minAmount !== undefined && tx.amount < minAmount) return false;
        if (maxAmount !== undefined && tx.amount > maxAmount) return false;
        if (start && tx.date < start) return false;
        if (end && tx.date > end) return false;
        return true;
      });
      const total = hits.filter((tx) => tx.kind === 'charge').reduce((sum, tx) => sum + tx.amount, 0);
      return textResult(
        `${hits.length} matches, charges $${money(total)}\n` +
          hits.slice(0, 30).map((tx) => `${formatDate(tx.date)}  $${money(tx.amount)}  ${tx.kind}  ${tx.description}`).join('\n'),
        { count: hits.length, total }
      );
    },
  },
  {
    name: 'filter_by_location',
    title: 'Filter by location',
    description: 'Charges matching city and/or state when the CSV includes address fields.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      city: z.string().optional(),
      state: z.string().optional(),
    },
    handler: async (args, ctx) => {
      const loaded = await ctx.session.ensure((args as { csvPath?: string }).csvPath);
      const city = String(args.city ?? '').toLowerCase();
      const state = String(args.state ?? '').toLowerCase();
      const hits = loaded.analyzer.getTransactions().filter((tx) => {
        if (city && !(tx.city ?? '').toLowerCase().includes(city)) return false;
        if (state && !(tx.state ?? '').toLowerCase().includes(state)) return false;
        return Boolean(city || state);
      });
      const total = hits.filter((tx) => tx.kind === 'charge').reduce((sum, tx) => sum + tx.amount, 0);
      return textResult(`${hits.length} transactions, $${money(total)}`, { count: hits.length, total });
    },
  },
  {
    name: 'filter_by_time',
    title: 'Filter by weekday',
    description: 'Charge totals by day of week (UTC date). Amex CSVs usually have no time of day.',
    modes: ['enhanced'],
    inputSchema: { csvPath: csvPathSchema },
    handler: async (args, ctx) => {
      const loaded = await ctx.session.ensure((args as { csvPath?: string }).csvPath);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const totals = Array(7).fill(0) as number[];
      for (const tx of loaded.analyzer.getTransactions().filter((item) => item.kind === 'charge')) {
        const day = tx.date.getUTCDay();
        totals[day] = (totals[day] ?? 0) + tx.amount;
      }
      return textResult(days.map((name, index) => `${name}: $${money(totals[index]!)}`).join('\n'), { totals });
    },
  },
  {
    name: 'find_related_vendors',
    title: 'Related vendors',
    description: 'Find similarly named merchants (likely the same business with different descriptors).',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      vendorName: z.string(),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const query = String(args.vendorName).toLowerCase();
      const related = analysis.vendors
        .map((vendor) => ({ vendor, distance: levenshtein(query, vendor.normalizedName) }))
        .filter((item) => item.distance <= 4 || item.vendor.normalizedName.includes(query) || query.includes(item.vendor.normalizedName))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 8);
      return textResult(
        related.map((item) => `${item.vendor.displayName} (distance ${item.distance}, $${money(item.vendor.totalSpent)})`).join('\n') ||
          'No related vendors.',
        { count: related.length }
      );
    },
  },
  {
    name: 'merge_vendor_variants',
    title: 'Suggest vendor merges',
    description: 'Preview a consolidated total if similar names are treated as one merchant. Does not mutate the session.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      vendorMappings: z.record(z.string()).describe('Map from existing vendor name to canonical name'),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const mappings = (args.vendorMappings ?? {}) as Record<string, string>;
      const totals = new Map<string, number>();
      for (const vendor of analysis.vendors) {
        const canonical = mappings[vendor.displayName] ?? mappings[vendor.normalizedName] ?? vendor.displayName;
        totals.set(canonical, (totals.get(canonical) ?? 0) + vendor.totalSpent);
      }
      return textResult(
        [...totals.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([name, total]) => `${name}: $${money(total)}`)
          .join('\n'),
        { totals: Object.fromEntries(totals) }
      );
    },
  },
  {
    name: 'check_spending_alerts',
    title: 'Spending alerts',
    description: 'Fire alerts when category or total charges exceed a threshold.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      alerts: z.array(
        z.object({
          name: z.string(),
          category: z.string().optional(),
          threshold: z.number(),
        })
      ),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const alerts = (args.alerts ?? []) as Array<{ name: string; category?: string; threshold: number }>;
      const fired = alerts.filter((alert) => {
        const spent = alert.category ? findCategoryTotal(analysis, alert.category) : analysis.totalSpent;
        return spent > alert.threshold;
      });
      return textResult(
        fired.length
          ? fired.map((alert) => `ALERT ${alert.name}: over $${money(alert.threshold)}`).join('\n')
          : 'No alerts fired.',
        { fired: fired.map((alert) => alert.name) }
      );
    },
  },
  {
    name: 'monitor_new_vendors',
    title: 'New vendors',
    description: 'Merchants whose first charge is on or after a date (default: last 30 days of the statement).',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      sinceDate: z.string().optional(),
    },
    handler: async (args, ctx) => {
      const analysis = await withAnalysis(args as never, ctx);
      const since =
        parseOptionalDate(args.sinceDate as string | undefined) ??
        new Date(analysis.dateRange.end.getTime() - 30 * 86400000);
      const fresh = analysis.vendors.filter((vendor) => vendor.firstSeen >= since);
      return textResult(
        fresh.map((vendor) => `${formatDate(vendor.firstSeen)}  ${vendor.displayName}  $${money(vendor.totalSpent)}`).join('\n') ||
          'No new vendors in that window.',
        { count: fresh.length }
      );
    },
  },
  {
    name: 'generate_monthly_report',
    title: 'Monthly report',
    description: 'Compact report for one calendar month in the statement.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      month: z.number().min(1).max(12),
      year: z.number(),
    },
    handler: async (args, ctx) => {
      const loaded = await ctx.session.ensure((args as { csvPath?: string }).csvPath);
      const year = Number(args.year);
      const month = Number(args.month);
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 0));
      const analysis = loaded.analyzer.analyze({ dateRange: { start, end } });
      return textResult(formatSummary(analysis), compactAnalysis(analysis));
    },
  },
  {
    name: 'generate_vendor_report',
    title: 'Vendor report',
    description: 'Formatted vendor deep-dive, same data as analyze_vendor.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      vendorName: z.string(),
    },
    handler: async (args, ctx) => {
      const analyze = tools.find((tool) => tool.name === 'analyze_vendor')!;
      return analyze.handler(args, ctx);
    },
  },
  {
    name: 'calculate_spending_statistics',
    title: 'Spending statistics',
    description: 'Mean, median, and percentile charge amounts.',
    modes: ['enhanced'],
    inputSchema: { csvPath: csvPathSchema },
    handler: async (args, ctx) => {
      const loaded = await ctx.session.ensure((args as { csvPath?: string }).csvPath);
      const amounts = loaded.analyzer
        .getTransactions()
        .filter((tx) => tx.kind === 'charge')
        .map((tx) => tx.amount)
        .sort((a, b) => a - b);
      if (amounts.length === 0) return textResult('No charges.');
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const median = percentile(amounts, 0.5);
      return textResult(
        `Count: ${amounts.length}\nMean: $${money(mean)}\nMedian: $${money(median)}\np90: $${money(percentile(amounts, 0.9))}\nMin/Max: $${money(amounts[0]!)} / $${money(amounts[amounts.length - 1]!)}`,
        { count: amounts.length, mean, median }
      );
    },
  },
  {
    name: 'analyze_spending_distribution',
    title: 'Spending distribution',
    description: 'Histogram of charge amounts.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      bucketSize: z.number().optional(),
    },
    handler: async (args, ctx) => {
      const loaded = await ctx.session.ensure((args as { csvPath?: string }).csvPath);
      const bucketSize = Number(args.bucketSize ?? 25);
      const buckets = new Map<string, number>();
      for (const tx of loaded.analyzer.getTransactions().filter((item) => item.kind === 'charge')) {
        const start = Math.floor(tx.amount / bucketSize) * bucketSize;
        const label = `$${start}-$${start + bucketSize}`;
        buckets.set(label, (buckets.get(label) ?? 0) + 1);
      }
      return textResult(
        [...buckets.entries()].map(([label, count]) => `${label}: ${count}`).join('\n'),
        { buckets: Object.fromEntries(buckets) }
      );
    },
  },
  {
    name: 'export_for_accounting',
    title: 'Accounting export',
    description: 'Write a simple Date,Description,Amount CSV for QuickBooks/Xero/Wave import.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      format: z.enum(['quickbooks', 'xero', 'wave']).optional(),
      outputPath: z.string().optional(),
    },
    handler: async (args, ctx) => {
      const loaded = await ctx.session.ensure((args as { csvPath?: string }).csvPath);
      const outputPath = await resolveOutputPath(
        String(args.outputPath ?? defaultOutputPath(loaded.path, 'accounting.csv')),
        loaded.path
      );
      const lines = ['Date,Description,Amount,Category'];
      for (const tx of loaded.analyzer.getTransactions()) {
        const signed = tx.kind === 'charge' ? tx.amount : -tx.amount;
        lines.push(`${formatDate(tx.date)},"${tx.description.replace(/"/g, '""')}",${signed.toFixed(2)},"${(tx.category ?? '').replace(/"/g, '""')}"`);
      }
      const fs = await import('fs/promises');
      await fs.writeFile(outputPath, lines.join('\n'));
      return textResult(`Wrote accounting CSV to ${outputPath}`, { outputPath });
    },
  },
  {
    name: 'export_for_budgeting',
    title: 'Budgeting export',
    description: 'Write a Date,Payee,Category,Outflow,Inflow CSV usable in YNAB-style tools.',
    modes: ['enhanced'],
    inputSchema: {
      csvPath: csvPathSchema,
      format: z.enum(['ynab', 'mint', 'personalcapital']).optional(),
      outputPath: z.string().optional(),
    },
    handler: async (args, ctx) => {
      const loaded = await ctx.session.ensure((args as { csvPath?: string }).csvPath);
      const outputPath = await resolveOutputPath(
        String(args.outputPath ?? defaultOutputPath(loaded.path, 'budget.csv')),
        loaded.path
      );
      const lines = ['Date,Payee,Category,Outflow,Inflow,Memo'];
      for (const tx of loaded.analyzer.getTransactions()) {
        const outflow = tx.kind === 'charge' ? tx.amount.toFixed(2) : '';
        const inflow = tx.kind === 'charge' ? '' : tx.amount.toFixed(2);
        lines.push(`${formatDate(tx.date)},"${tx.description.replace(/"/g, '""')}","${(tx.category ?? '').replace(/"/g, '""')}",${outflow},${inflow},`);
      }
      const fs = await import('fs/promises');
      await fs.writeFile(outputPath, lines.join('\n'));
      return textResult(`Wrote budgeting CSV to ${outputPath}`, { outputPath });
    },
  },
];

export function toolsForMode(mode: ServerMode): ToolDef[] {
  return tools.filter((tool) => tool.modes.includes(mode));
}

export function compactAnalysis(analysis: SpendingAnalysis) {
  return {
    dateRange: { start: formatDate(analysis.dateRange.start), end: formatDate(analysis.dateRange.end) },
    totalSpent: analysis.totalSpent,
    creditsTotal: analysis.creditsTotal,
    paymentsTotal: analysis.paymentsTotal,
    netSpent: analysis.netSpent,
    vendorCount: analysis.vendorCount,
    transactionCount: analysis.transactionCount,
    subscriptionCount: analysis.subscriptionCount,
    monthlySubscriptionCost: analysis.monthlySubscriptionCost,
    topVendors: analysis.topVendors.slice(0, 10).map((vendor) => ({
      name: vendor.displayName,
      totalSpent: vendor.totalSpent,
      transactions: vendor.transactionCount,
    })),
    insights: analysis.insights.map((insight) => insight.message),
  };
}

function findCategoryTotal(analysis: SpendingAnalysis, category: string): number {
  const exact = analysis.categoryBreakdown[category];
  if (exact) return exact.total;
  const match = Object.entries(analysis.categoryBreakdown).find(([name]) => name.toLowerCase().includes(category.toLowerCase()));
  return match?.[1].total ?? 0;
}

function bucketKey(date: Date, groupBy: string): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  if (groupBy === 'daily') return `${year}-${month}-${day}`;
  if (groupBy === 'weekly') {
    const week = Math.ceil(date.getUTCDate() / 7);
    return `${year}-${month}-W${week}`;
  }
  return `${year}-${month}`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: b.length + 1 }, () => Array(a.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[0]![i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j]![0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j]![i] = Math.min(matrix[j - 1]![i - 1]! + cost, matrix[j]![i - 1]! + 1, matrix[j - 1]![i]! + 1);
    }
  }
  return matrix[b.length]![a.length]!;
}

export function findVendor(analysis: SpendingAnalysis, vendorName: string): VendorProfile | undefined {
  const query = vendorName.toLowerCase();
  return analysis.vendors.find(
    (vendor) =>
      vendor.displayName.toLowerCase().includes(query) ||
      vendor.name.toLowerCase().includes(query) ||
      vendor.normalizedName.includes(query)
  );
}
