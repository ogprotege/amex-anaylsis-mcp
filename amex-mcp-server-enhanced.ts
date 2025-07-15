#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { AmexSpendingAnalyzer } from './amex-mcp-server.js';
import { VendorUnmasker } from './amex-vendor-unmasker.js';

/**
 * Enhanced MCP Server with all available tools exposed
 */
class AmexMCPServerEnhanced {
  private server: Server;
  private analyzer: AmexSpendingAnalyzer;
  private unmasker: VendorUnmasker;

  constructor() {
    this.server = new Server(
      {
        name: 'amex-spending-analyzer-enhanced',
        version: '2.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.analyzer = new AmexSpendingAnalyzer();
    this.unmasker = new VendorUnmasker();
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Original 6 tools
        {
          name: 'analyze_amex_spending',
          description: 'Analyze Amex credit card spending from CSV file',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              outputFormat: { type: 'string', enum: ['json', 'excel', 'csv', 'summary'], default: 'summary' },
              outputPath: { type: 'string', description: 'Output file path (optional)' },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'find_subscriptions',
          description: 'Find all subscriptions in Amex transactions',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              confidenceThreshold: { type: 'number', description: 'Minimum confidence (0-1)', default: 0.7 },
              includeManual: { type: 'boolean', description: 'Include low confidence items', default: false },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'analyze_vendor',
          description: 'Get detailed analysis of a specific vendor',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              vendorName: { type: 'string', description: 'Name of vendor to analyze' },
              fuzzyMatch: { type: 'boolean', description: 'Allow partial matches', default: true },
              includeRelated: { type: 'boolean', description: 'Include payment processor variants', default: true },
            },
            required: ['csvPath', 'vendorName'],
          },
        },
        {
          name: 'find_anomalies',
          description: 'Find spending anomalies and potential fraud',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              severityThreshold: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
              includePatterns: { type: 'boolean', description: 'Show pattern details', default: false },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'spending_by_category',
          description: 'Analyze spending broken down by category',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              customCategories: { type: 'object', description: 'Custom category rules' },
              sortBy: { type: 'string', enum: ['amount', 'count', 'name'], default: 'amount' },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'export_analysis',
          description: 'Export comprehensive spending analysis',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              format: { type: 'string', enum: ['excel', 'csv', 'json'] },
              outputPath: { type: 'string', description: 'Output file path' },
            },
            required: ['csvPath', 'format', 'outputPath'],
          },
        },
        
        // Vendor Unmasking Tools
        {
          name: 'unmask_payment_processors',
          description: 'Reveal actual vendors behind payment processors like PayPal, Square, etc.',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              processorType: { type: 'string', enum: ['paypal', 'square', 'stripe', 'all'], default: 'all' },
              confidenceThreshold: { type: 'number', description: 'Minimum confidence (0-1)', default: 0.5 },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'review_obscured_vendors',
          description: 'Get vendors that need manual review',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              includeHighConfidence: { type: 'boolean', description: 'Include high confidence extractions', default: false },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'analyze_payment_processor_usage',
          description: 'Statistics on payment processor usage',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
            },
            required: ['csvPath'],
          },
        },
        
        // Subscription Management Tools
        {
          name: 'predict_next_charges',
          description: 'Predict when subscriptions will charge next',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              daysAhead: { type: 'number', description: 'Days to look ahead', default: 30 },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'find_unused_subscriptions',
          description: 'Find subscriptions not used recently',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              unusedDays: { type: 'number', description: 'Days considered unused', default: 90 },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'calculate_subscription_savings',
          description: 'Calculate potential savings from canceling subscriptions',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              subscriptionsToCancel: { type: 'array', items: { type: 'string' }, description: 'List of subscriptions to cancel' },
            },
            required: ['csvPath', 'subscriptionsToCancel'],
          },
        },
        
        // Trend Analysis Tools
        {
          name: 'analyze_spending_trends',
          description: 'Analyze spending patterns over time',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              groupBy: { type: 'string', enum: ['daily', 'weekly', 'monthly'], default: 'monthly' },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'compare_periods',
          description: 'Compare spending between two time periods',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              period1Start: { type: 'string', description: 'Start date of first period (YYYY-MM-DD)' },
              period1End: { type: 'string', description: 'End date of first period' },
              period2Start: { type: 'string', description: 'Start date of second period' },
              period2End: { type: 'string', description: 'End date of second period' },
            },
            required: ['csvPath', 'period1Start', 'period1End', 'period2Start', 'period2End'],
          },
        },
        {
          name: 'project_future_spending',
          description: 'Project future spending based on patterns',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              monthsAhead: { type: 'number', description: 'Months to project', default: 6 },
            },
            required: ['csvPath'],
          },
        },
        
        // Duplicate Detection Tools
        {
          name: 'find_duplicate_charges',
          description: 'Find potential duplicate transactions',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              windowDays: { type: 'number', description: 'Days to check for duplicates', default: 3 },
              amountTolerance: { type: 'number', description: 'Amount difference tolerance', default: 0.01 },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'find_duplicate_subscriptions',
          description: 'Find multiple subscriptions for same service',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
            },
            required: ['csvPath'],
          },
        },
        
        // Budget Analysis Tools
        {
          name: 'analyze_against_budget',
          description: 'Compare spending against budget limits',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              budgetByCategory: { type: 'object', description: 'Budget limits by category' },
            },
            required: ['csvPath', 'budgetByCategory'],
          },
        },
        {
          name: 'find_cost_reduction_opportunities',
          description: 'Identify ways to reduce spending',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              targetReduction: { type: 'number', description: 'Target reduction amount' },
            },
            required: ['csvPath'],
          },
        },
        
        // Tax & Business Tools
        {
          name: 'categorize_for_taxes',
          description: 'Categorize transactions for tax purposes',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              taxCategories: { type: 'array', items: { type: 'string' }, description: 'Tax categories to use' },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'extract_business_expenses',
          description: 'Identify potential business expenses',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              businessKeywords: { type: 'array', items: { type: 'string' }, description: 'Keywords for business expenses' },
            },
            required: ['csvPath'],
          },
        },
        
        // Data Quality Tools
        {
          name: 'validate_transaction_data',
          description: 'Check for data quality issues',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'find_missing_vendors',
          description: 'Find transactions with unclear vendors',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
            },
            required: ['csvPath'],
          },
        },
        
        // Advanced Filtering Tools
        {
          name: 'search_transactions',
          description: 'Advanced transaction search',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              query: { type: 'string', description: 'Search query' },
              filters: { type: 'object', description: 'Additional filters' },
            },
            required: ['csvPath', 'query'],
          },
        },
        {
          name: 'filter_by_location',
          description: 'Filter transactions by location',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              city: { type: 'string', description: 'City filter' },
              state: { type: 'string', description: 'State filter' },
              country: { type: 'string', description: 'Country filter' },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'filter_by_time',
          description: 'Analyze spending by time patterns',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              timeOfDay: { type: 'string', enum: ['morning', 'afternoon', 'evening', 'night'] },
              dayOfWeek: { type: 'array', items: { type: 'string' } },
            },
            required: ['csvPath'],
          },
        },
        
        // Vendor Relationship Tools
        {
          name: 'find_related_vendors',
          description: 'Find vendors that might be related',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              vendorName: { type: 'string', description: 'Vendor to find relations for' },
            },
            required: ['csvPath', 'vendorName'],
          },
        },
        {
          name: 'merge_vendor_variants',
          description: 'Merge similar vendor names',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              vendorMappings: { type: 'object', description: 'Mapping of variants to canonical names' },
            },
            required: ['csvPath', 'vendorMappings'],
          },
        },
        
        // Alert & Monitoring Tools
        {
          name: 'check_spending_alerts',
          description: 'Check for spending threshold breaches',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              alerts: { 
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    category: { type: 'string' },
                    threshold: { type: 'number' },
                    period: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
                  },
                },
              },
            },
            required: ['csvPath', 'alerts'],
          },
        },
        {
          name: 'monitor_new_vendors',
          description: 'Identify first-time vendors',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              sinceDate: { type: 'string', description: 'Check for new vendors since this date' },
            },
            required: ['csvPath'],
          },
        },
        
        // Reporting Tools
        {
          name: 'generate_monthly_report',
          description: 'Generate comprehensive monthly report',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              month: { type: 'number', description: 'Month (1-12)' },
              year: { type: 'number', description: 'Year' },
            },
            required: ['csvPath', 'month', 'year'],
          },
        },
        {
          name: 'generate_vendor_report',
          description: 'Detailed report for specific vendor',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              vendorName: { type: 'string', description: 'Vendor name' },
              includeCharts: { type: 'boolean', description: 'Include charts', default: true },
            },
            required: ['csvPath', 'vendorName'],
          },
        },
        
        // Statistical Analysis Tools
        {
          name: 'calculate_spending_statistics',
          description: 'Advanced statistical analysis',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              metrics: { 
                type: 'array',
                items: { type: 'string', enum: ['mean', 'median', 'stddev', 'percentiles'] },
                default: ['mean', 'median', 'stddev'],
              },
            },
            required: ['csvPath'],
          },
        },
        {
          name: 'analyze_spending_distribution',
          description: 'Analyze spending distribution patterns',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              bucketSize: { type: 'number', description: 'Size of amount buckets', default: 50 },
            },
            required: ['csvPath'],
          },
        },
        
        // Integration Tools
        {
          name: 'export_for_accounting',
          description: 'Export in accounting software format',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              format: { type: 'string', enum: ['quickbooks', 'xero', 'wave'] },
              outputPath: { type: 'string', description: 'Output file path' },
            },
            required: ['csvPath', 'format', 'outputPath'],
          },
        },
        {
          name: 'export_for_budgeting',
          description: 'Export for budgeting apps',
          inputSchema: {
            type: 'object',
            properties: {
              csvPath: { type: 'string', description: 'Path to Amex CSV file' },
              format: { type: 'string', enum: ['ynab', 'mint', 'personalcapital'] },
              outputPath: { type: 'string', description: 'Output file path' },
            },
            required: ['csvPath', 'format', 'outputPath'],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Ensure we have a fresh analyzer for each request
        this.analyzer = new AmexSpendingAnalyzer();
        
        // Route to appropriate handler
        switch (name) {
          // Original tools
          case 'analyze_amex_spending':
            return await this.analyzeSpending(args);
          case 'find_subscriptions':
            return await this.findSubscriptions(args);
          case 'analyze_vendor':
            return await this.analyzeVendor(args);
          case 'find_anomalies':
            return await this.findAnomalies(args);
          case 'spending_by_category':
            return await this.spendingByCategory(args);
          case 'export_analysis':
            return await this.exportAnalysis(args);
            
          // Vendor Unmasking Tools
          case 'unmask_payment_processors':
            return await this.unmaskPaymentProcessors(args);
          case 'review_obscured_vendors':
            return await this.reviewObscuredVendors(args);
          case 'analyze_payment_processor_usage':
            return await this.analyzePaymentProcessorUsage(args);
            
          // Subscription Management Tools
          case 'predict_next_charges':
            return await this.predictNextCharges(args);
          case 'find_unused_subscriptions':
            return await this.findUnusedSubscriptions(args);
          case 'calculate_subscription_savings':
            return await this.calculateSubscriptionSavings(args);
            
          // Trend Analysis Tools
          case 'analyze_spending_trends':
            return await this.analyzeSpendingTrends(args);
          case 'compare_periods':
            return await this.comparePeriods(args);
          case 'project_future_spending':
            return await this.projectFutureSpending(args);
            
          // Duplicate Detection Tools
          case 'find_duplicate_charges':
            return await this.findDuplicateCharges(args);
          case 'find_duplicate_subscriptions':
            return await this.findDuplicateSubscriptions(args);
            
          // Budget Analysis Tools
          case 'analyze_against_budget':
            return await this.analyzeAgainstBudget(args);
          case 'find_cost_reduction_opportunities':
            return await this.findCostReductionOpportunities(args);
            
          // Tax & Business Tools
          case 'categorize_for_taxes':
            return await this.categorizeForTaxes(args);
          case 'extract_business_expenses':
            return await this.extractBusinessExpenses(args);
            
          // Data Quality Tools
          case 'validate_transaction_data':
            return await this.validateTransactionData(args);
          case 'find_missing_vendors':
            return await this.findMissingVendors(args);
            
          // Advanced Filtering Tools
          case 'search_transactions':
            return await this.searchTransactions(args);
          case 'filter_by_location':
            return await this.filterByLocation(args);
          case 'filter_by_time':
            return await this.filterByTime(args);
            
          // Vendor Relationship Tools
          case 'find_related_vendors':
            return await this.findRelatedVendors(args);
          case 'merge_vendor_variants':
            return await this.mergeVendorVariants(args);
            
          // Alert & Monitoring Tools
          case 'check_spending_alerts':
            return await this.checkSpendingAlerts(args);
          case 'monitor_new_vendors':
            return await this.monitorNewVendors(args);
            
          // Reporting Tools
          case 'generate_monthly_report':
            return await this.generateMonthlyReport(args);
          case 'generate_vendor_report':
            return await this.generateVendorReport(args);
            
          // Statistical Analysis Tools
          case 'calculate_spending_statistics':
            return await this.calculateSpendingStatistics(args);
          case 'analyze_spending_distribution':
            return await this.analyzeSpendingDistribution(args);
            
          // Integration Tools
          case 'export_for_accounting':
            return await this.exportForAccounting(args);
          case 'export_for_budgeting':
            return await this.exportForBudgeting(args);
            
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        
        throw new McpError(
          ErrorCode.InternalError,
          `Error executing ${name}: ${(error as Error).message}`
        );
      }
    });
  }

  // Original tool implementations (delegate to base class)
  private async analyzeSpending(args: any) {
    const analyzer = new AmexSpendingAnalyzer();
    const server = new Server({ name: 'temp', version: '1.0.0' }, { capabilities: { tools: {} } });
    const baseServer = new (require('./amex-mcp-server.js').default)();
    return await baseServer.analyzeSpending(args);
  }

  private async findSubscriptions(args: any) {
    const baseServer = new (require('./amex-mcp-server.js').default)();
    return await baseServer.findSubscriptions(args);
  }

  private async analyzeVendor(args: any) {
    const baseServer = new (require('./amex-mcp-server.js').default)();
    return await baseServer.analyzeVendor(args);
  }

  private async findAnomalies(args: any) {
    const baseServer = new (require('./amex-mcp-server.js').default)();
    return await baseServer.findAnomalies(args);
  }

  private async spendingByCategory(args: any) {
    const baseServer = new (require('./amex-mcp-server.js').default)();
    return await baseServer.spendingByCategory(args);
  }

  private async exportAnalysis(args: any) {
    const baseServer = new (require('./amex-mcp-server.js').default)();
    return await baseServer.exportAnalysis(args);
  }

  // New tool implementations
  private async unmaskPaymentProcessors(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      processorType: z.enum(['paypal', 'square', 'stripe', 'all']).default('all'),
      confidenceThreshold: z.number().min(0).max(1).default(0.5),
    });
    
    const { csvPath, processorType, confidenceThreshold } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();
    
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
        needsReview: v.metadata.needsManualReview,
        possibleVendors: v.metadata.possibleVendors,
      }));
    
    return {
      content: [{
        type: 'text',
        text: `Found ${unmaskedVendors.length} unmasked vendors:\n\n` +
              unmaskedVendors.map(v => 
                `${v.processor} → ${v.unmasked}\n` +
                `  Original: ${v.original}\n` +
                `  Confidence: ${(v.confidence * 100).toFixed(0)}%\n` +
                `  Total Spent: $${v.totalSpent.toFixed(2)}\n` +
                `  Transactions: ${v.transactionCount}\n` +
                (v.needsReview ? `  ⚠️ Needs Manual Review\n` : '') +
                (v.possibleVendors?.length ? `  Suggestions: ${v.possibleVendors.join(', ')}\n` : '')
              ).join('\n')
      }],
    };
  }

  private async reviewObscuredVendors(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      includeHighConfidence: z.boolean().default(false),
    });
    
    const { csvPath, includeHighConfidence } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();
    
    const reviewVendors = analysis.vendors
      .filter(v => v.metadata.isObscured)
      .filter(v => v.metadata.needsManualReview || (includeHighConfidence && v.metadata.unmaskingConfidence >= 0.7))
      .sort((a, b) => b.totalSpent - a.totalSpent);
    
    return {
      content: [{
        type: 'text',
        text: `${reviewVendors.length} vendors need review:\n\n` +
              reviewVendors.map(v => 
                `${v.displayName}\n` +
                `  Processor: ${v.metadata.processor}\n` +
                `  Confidence: ${((v.metadata.unmaskingConfidence || 0) * 100).toFixed(0)}%\n` +
                `  Total: $${v.totalSpent.toFixed(2)} (${v.transactionCount} transactions)\n` +
                `  Suggestions: ${v.metadata.possibleVendors?.join(', ') || 'None'}\n` +
                `  Sample transactions:\n` +
                v.transactions.slice(0, 3).map(t => 
                  `    - ${t.date.toLocaleDateString()}: ${t.description} ($${Math.abs(t.amount).toFixed(2)})`
                ).join('\n')
              ).join('\n\n')
      }],
    };
  }

  private async analyzePaymentProcessorUsage(args: any) {
    const schema = z.object({
      csvPath: z.string(),
    });
    
    const { csvPath } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();
    
    const processorStats = new Map<string, {count: number, total: number, vendors: Set<string>}>();
    
    analysis.vendors
      .filter(v => v.metadata.isObscured && v.metadata.processor)
      .forEach(v => {
        const processor = v.metadata.processor!;
        if (!processorStats.has(processor)) {
          processorStats.set(processor, {count: 0, total: 0, vendors: new Set()});
        }
        const stats = processorStats.get(processor)!;
        stats.count += v.transactionCount;
        stats.total += v.totalSpent;
        stats.vendors.add(v.displayName);
      });
    
    const sortedProcessors = Array.from(processorStats.entries())
      .sort((a, b) => b[1].total - a[1].total);
    
    return {
      content: [{
        type: 'text',
        text: `Payment Processor Usage Analysis:\n\n` +
              sortedProcessors.map(([processor, stats]) => 
                `${processor}:\n` +
                `  Total Spent: $${stats.total.toFixed(2)}\n` +
                `  Transactions: ${stats.count}\n` +
                `  Unique Vendors: ${stats.vendors.size}\n` +
                `  Top Vendors: ${Array.from(stats.vendors).slice(0, 5).join(', ')}`
              ).join('\n\n') +
              `\n\nSummary:\n` +
              `Total through processors: $${sortedProcessors.reduce((sum, [_, stats]) => sum + stats.total, 0).toFixed(2)}\n` +
              `Percentage of all spending: ${(sortedProcessors.reduce((sum, [_, stats]) => sum + stats.total, 0) / analysis.totalSpent * 100).toFixed(1)}%`
      }],
    };
  }

  private async predictNextCharges(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      daysAhead: z.number().default(30),
    });
    
    const { csvPath, daysAhead } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();
    
    const today = new Date();
    const futureDate = new Date(today.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    
    const upcomingCharges = analysis.recurringCharges
      .filter(v => v.recurringPattern && v.recurringPattern.nextExpectedDate)
      .map(v => ({
        vendor: v.displayName,
        nextDate: v.recurringPattern!.nextExpectedDate!,
        expectedAmount: v.recurringPattern!.expectedAmount,
        frequency: v.recurringPattern!.frequency,
        confidence: v.recurringPattern!.confidence,
      }))
      .filter(charge => charge.nextDate >= today && charge.nextDate <= futureDate)
      .sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());
    
    const totalExpected = upcomingCharges.reduce((sum, charge) => sum + charge.expectedAmount, 0);
    
    return {
      content: [{
        type: 'text',
        text: `Predicted charges in next ${daysAhead} days:\n\n` +
              upcomingCharges.map(charge => 
                `${charge.nextDate.toLocaleDateString()} - ${charge.vendor}\n` +
                `  Amount: $${charge.expectedAmount.toFixed(2)}\n` +
                `  Frequency: ${charge.frequency}\n` +
                `  Confidence: ${(charge.confidence * 100).toFixed(0)}%`
              ).join('\n\n') +
              `\n\nTotal Expected: $${totalExpected.toFixed(2)}`
      }],
    };
  }

  private async findUnusedSubscriptions(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      unusedDays: z.number().default(90),
    });
    
    const { csvPath, unusedDays } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();
    
    const today = new Date();
    const cutoffDate = new Date(today.getTime() - unusedDays * 24 * 60 * 60 * 1000);
    
    const unusedSubscriptions = analysis.recurringCharges
      .filter(v => v.lastSeen < cutoffDate)
      .map(v => ({
        vendor: v.displayName,
        lastSeen: v.lastSeen,
        daysSinceLastCharge: Math.floor((today.getTime() - v.lastSeen.getTime()) / (24 * 60 * 60 * 1000)),
        monthlyAmount: this.getMonthlyEquivalent(v),
        totalSpent: v.totalSpent,
      }))
      .sort((a, b) => b.monthlyAmount - a.monthlyAmount);
    
    const totalMonthlySavings = unusedSubscriptions.reduce((sum, sub) => sum + sub.monthlyAmount, 0);
    
    return {
      content: [{
        type: 'text',
        text: `Found ${unusedSubscriptions.length} potentially unused subscriptions:\n\n` +
              unusedSubscriptions.map(sub => 
                `${sub.vendor}\n` +
                `  Last charged: ${sub.lastSeen.toLocaleDateString()} (${sub.daysSinceLastCharge} days ago)\n` +
                `  Monthly cost: $${sub.monthlyAmount.toFixed(2)}\n` +
                `  Total spent: $${sub.totalSpent.toFixed(2)}`
              ).join('\n\n') +
              `\n\nPotential monthly savings: $${totalMonthlySavings.toFixed(2)}\n` +
              `Potential annual savings: $${(totalMonthlySavings * 12).toFixed(2)}`
      }],
    };
  }

  private async calculateSubscriptionSavings(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      subscriptionsToCancel: z.array(z.string()),
    });
    
    const { csvPath, subscriptionsToCancel } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();
    
    const savings = subscriptionsToCancel.map(vendorName => {
      const vendor = analysis.recurringCharges.find(v => 
        v.normalizedName.includes(vendorName.toLowerCase()) ||
        v.displayName.toLowerCase().includes(vendorName.toLowerCase())
      );
      
      if (!vendor) return null;
      
      const monthlyAmount = this.getMonthlyEquivalent(vendor);
      
      return {
        vendor: vendor.displayName,
        monthlyAmount,
        annualAmount: monthlyAmount * 12,
        lastCharge: vendor.lastSeen,
      };
    }).filter(s => s !== null);
    
    const totalMonthlySavings = savings.reduce((sum, s) => sum + s!.monthlyAmount, 0);
    const totalAnnualSavings = savings.reduce((sum, s) => sum + s!.annualAmount, 0);
    
    return {
      content: [{
        type: 'text',
        text: `Subscription Cancellation Savings:\n\n` +
              savings.map(s => 
                `${s!.vendor}\n` +
                `  Monthly: $${s!.monthlyAmount.toFixed(2)}\n` +
                `  Annual: $${s!.annualAmount.toFixed(2)}\n` +
                `  Last charge: ${s!.lastCharge.toLocaleDateString()}`
              ).join('\n\n') +
              `\n\nTotal Savings:\n` +
              `Monthly: $${totalMonthlySavings.toFixed(2)}\n` +
              `Annual: $${totalAnnualSavings.toFixed(2)}`
      }],
    };
  }

  private async analyzeSpendingTrends(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      groupBy: z.enum(['daily', 'weekly', 'monthly']).default('monthly'),
    });
    
    const { csvPath, groupBy } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const transactions = this.analyzer['transactions'];
    
    const trendData = new Map<string, number>();
    
    transactions.forEach(t => {
      let key: string;
      const date = new Date(t.date);
      
      switch (groupBy) {
        case 'daily':
          key = date.toISOString().split('T')[0];
          break;
        case 'weekly':
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case 'monthly':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
      }
      
      trendData.set(key, (trendData.get(key) || 0) + Math.abs(t.amount));
    });
    
    const sortedTrends = Array.from(trendData.entries())
      .sort((a, b) => a[0].localeCompare(b[0]));
    
    // Calculate trend direction
    const values = sortedTrends.map(([_, amount]) => amount);
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    const trendDirection = secondAvg > firstAvg ? 'increasing' : 'decreasing';
    const trendPercent = ((secondAvg - firstAvg) / firstAvg * 100).toFixed(1);
    
    return {
      content: [{
        type: 'text',
        text: `Spending Trends (${groupBy}):\n\n` +
              sortedTrends.slice(-10).map(([period, amount]) => 
                `${period}: $${amount.toFixed(2)}`
              ).join('\n') +
              `\n\nTrend Analysis:\n` +
              `Direction: ${trendDirection} (${trendPercent}%)\n` +
              `Average (first half): $${firstAvg.toFixed(2)}\n` +
              `Average (second half): $${secondAvg.toFixed(2)}\n` +
              `Total periods: ${sortedTrends.length}`
      }],
    };
  }

  private async comparePeriods(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      period1Start: z.string(),
      period1End: z.string(),
      period2Start: z.string(),
      period2End: z.string(),
    });
    
    const { csvPath, period1Start, period1End, period2Start, period2End } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const transactions = this.analyzer['transactions'];
    
    const p1Start = new Date(period1Start);
    const p1End = new Date(period1End);
    const p2Start = new Date(period2Start);
    const p2End = new Date(period2End);
    
    const period1Trans = transactions.filter(t => t.date >= p1Start && t.date <= p1End);
    const period2Trans = transactions.filter(t => t.date >= p2Start && t.date <= p2End);
    
    const period1Total = period1Trans.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const period2Total = period2Trans.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    // Category comparison
    const getCategoryBreakdown = (trans: any[]) => {
      const breakdown = new Map<string, number>();
      trans.forEach(t => {
        const category = t.category || 'Uncategorized';
        breakdown.set(category, (breakdown.get(category) || 0) + Math.abs(t.amount));
      });
      return breakdown;
    };
    
    const period1Categories = getCategoryBreakdown(period1Trans);
    const period2Categories = getCategoryBreakdown(period2Trans);
    
    const allCategories = new Set([...period1Categories.keys(), ...period2Categories.keys()]);
    
    return {
      content: [{
        type: 'text',
        text: `Period Comparison:\n\n` +
              `Period 1 (${period1Start} to ${period1End}):\n` +
              `  Total: $${period1Total.toFixed(2)}\n` +
              `  Transactions: ${period1Trans.length}\n` +
              `  Daily Average: $${(period1Total / ((p1End.getTime() - p1Start.getTime()) / (24 * 60 * 60 * 1000))).toFixed(2)}\n\n` +
              `Period 2 (${period2Start} to ${period2End}):\n` +
              `  Total: $${period2Total.toFixed(2)}\n` +
              `  Transactions: ${period2Trans.length}\n` +
              `  Daily Average: $${(period2Total / ((p2End.getTime() - p2Start.getTime()) / (24 * 60 * 60 * 1000))).toFixed(2)}\n\n` +
              `Change: ${period2Total > period1Total ? '+' : ''}${((period2Total - period1Total) / period1Total * 100).toFixed(1)}%\n\n` +
              `Category Changes:\n` +
              Array.from(allCategories).map(cat => {
                const p1Amount = period1Categories.get(cat) || 0;
                const p2Amount = period2Categories.get(cat) || 0;
                const change = ((p2Amount - p1Amount) / (p1Amount || 1) * 100).toFixed(1);
                return `${cat}: $${p1Amount.toFixed(2)} → $${p2Amount.toFixed(2)} (${change}%)`;
              }).join('\n')
      }],
    };
  }

  private async projectFutureSpending(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      monthsAhead: z.number().default(6),
    });
    
    const { csvPath, monthsAhead } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();
    
    // Calculate average monthly spending over last 3 months
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const recentTransactions = this.analyzer['transactions'].filter(t => t.date >= threeMonthsAgo);
    const monthlyAverage = recentTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0) / 3;
    
    // Add recurring charges
    const monthlyRecurring = analysis.recurringCharges.reduce((sum, v) => 
      sum + this.getMonthlyEquivalent(v), 0
    );
    
    const projectedMonthly = monthlyAverage;
    const projectedTotal = projectedMonthly * monthsAhead;
    
    // Category projections
    const categoryProjections = new Map<string, number>();
    analysis.categoryBreakdown.forEach((stats, category) => {
      const monthlyCategory = stats.total / 3; // Assuming 3 months of data
      categoryProjections.set(category, monthlyCategory * monthsAhead);
    });
    
    return {
      content: [{
        type: 'text',
        text: `Spending Projection for Next ${monthsAhead} Months:\n\n` +
              `Monthly Average (last 3 months): $${monthlyAverage.toFixed(2)}\n` +
              `Monthly Recurring Charges: $${monthlyRecurring.toFixed(2)}\n` +
              `Projected Monthly Total: $${projectedMonthly.toFixed(2)}\n\n` +
              `${monthsAhead}-Month Projection: $${projectedTotal.toFixed(2)}\n\n` +
              `Category Projections:\n` +
              Array.from(categoryProjections.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([cat, amount]) => `${cat}: $${amount.toFixed(2)}`)
                .join('\n')
      }],
    };
  }

  private async findDuplicateCharges(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      windowDays: z.number().default(3),
      amountTolerance: z.number().default(0.01),
    });
    
    const { csvPath, windowDays, amountTolerance } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();
    
    const duplicates = analysis.duplicateCharges.filter(dup => {
      const daysDiff = Math.abs(dup.transactions[0].date.getTime() - dup.transactions[1].date.getTime()) / (24 * 60 * 60 * 1000);
      const amountDiff = Math.abs(dup.transactions[0].amount - dup.transactions[1].amount);
      return daysDiff <= windowDays && amountDiff <= amountTolerance;
    });
    
    return {
      content: [{
        type: 'text',
        text: `Found ${duplicates.length} potential duplicate charges:\n\n` +
              duplicates.map(dup => 
                `${dup.vendor}:\n` +
                dup.transactions.map(t => 
                  `  ${t.date.toLocaleDateString()}: ${t.description} - $${Math.abs(t.amount).toFixed(2)}`
                ).join('\n') +
                `\n  Potential duplicate amount: $${Math.abs(dup.transactions[0].amount).toFixed(2)}`
              ).join('\n\n')
      }],
    };
  }

  private async findDuplicateSubscriptions(args: any) {
    const schema = z.object({
      csvPath: z.string(),
    });
    
    const { csvPath } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();
    
    // Group subscriptions by category and look for similar names
    const subscriptionGroups = new Map<string, any[]>();
    
    analysis.recurringCharges.forEach(vendor => {
      const category = vendor.category;
      if (!subscriptionGroups.has(category)) {
        subscriptionGroups.set(category, []);
      }
      subscriptionGroups.get(category)!.push(vendor);
    });
    
    const duplicates: any[] = [];
    
    subscriptionGroups.forEach((vendors, category) => {
      if (vendors.length > 1) {
        // Check for similar vendor names within same category
        for (let i = 0; i < vendors.length; i++) {
          for (let j = i + 1; j < vendors.length; j++) {
            const similarity = this.calculateSimilarity(
              vendors[i].normalizedName,
              vendors[j].normalizedName
            );
            
            if (similarity > 0.6) {
              duplicates.push({
                category,
                vendors: [vendors[i], vendors[j]],
                similarity,
              });
            }
          }
        }
      }
    });
    
    return {
      content: [{
        type: 'text',
        text: `Potential Duplicate Subscriptions:\n\n` +
              duplicates.map(dup => 
                `Category: ${dup.category}\n` +
                `Similarity: ${(dup.similarity * 100).toFixed(0)}%\n` +
                dup.vendors.map((v: any) => 
                  `  - ${v.displayName}: $${this.getMonthlyEquivalent(v).toFixed(2)}/month`
                ).join('\n')
              ).join('\n\n') +
              (duplicates.length === 0 ? 'No duplicate subscriptions found.' : '')
      }],
    };
  }

  private async analyzeAgainstBudget(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      budgetByCategory: z.record(z.number()),
    });
    
    const { csvPath, budgetByCategory } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();
    
    const results = Array.from(analysis.categoryBreakdown.entries()).map(([category, stats]) => {
      const budget = budgetByCategory[category] || 0;
      const spent = stats.total;
      const percentage = budget > 0 ? (spent / budget * 100) : 0;
      const status = percentage > 100 ? 'OVER' : percentage > 80 ? 'WARNING' : 'OK';
      
      return {
        category,
        budget,
        spent,
        percentage,
        status,
        difference: spent - budget,
      };
    }).sort((a, b) => b.percentage - a.percentage);
    
    const totalBudget = Object.values(budgetByCategory).reduce((sum, b) => sum + b, 0);
    const totalSpent = analysis.totalSpent;
    
    return {
      content: [{
        type: 'text',
        text: `Budget Analysis:\n\n` +
              results.map(r => 
                `${r.category}: ${r.status}\n` +
                `  Budget: $${r.budget.toFixed(2)}\n` +
                `  Spent: $${r.spent.toFixed(2)} (${r.percentage.toFixed(1)}%)\n` +
                `  ${r.difference > 0 ? 'Over' : 'Under'} by: $${Math.abs(r.difference).toFixed(2)}`
              ).join('\n\n') +
              `\n\nTotal:\n` +
              `Budget: $${totalBudget.toFixed(2)}\n` +
              `Spent: $${totalSpent.toFixed(2)} (${(totalSpent / totalBudget * 100).toFixed(1)}%)`
      }],
    };
  }

  private async findCostReductionOpportunities(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      targetReduction: z.number().optional(),
    });
    
    const { csvPath, targetReduction } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();
    
    const opportunities: any[] = [];
    
    // 1. Unused subscriptions
    const today = new Date();
    const unusedSubs = analysis.recurringCharges
      .filter(v => {
        const daysSince = (today.getTime() - v.lastSeen.getTime()) / (24 * 60 * 60 * 1000);
        return daysSince > 60;
      })
      .map(v => ({
        type: 'Unused Subscription',
        description: `${v.displayName} - not used in ${Math.floor((today.getTime() - v.lastSeen.getTime()) / (24 * 60 * 60 * 1000))} days`,
        monthlySavings: this.getMonthlyEquivalent(v),
        confidence: 0.9,
      }));
    
    opportunities.push(...unusedSubs);
    
    // 2. High-frequency dining/coffee
    const diningVendors = analysis.vendors
      .filter(v => v.category === 'Food & Dining')
      .filter(v => v.transactionCount >= 10)
      .map(v => ({
        type: 'Frequent Dining',
        description: `${v.displayName} - ${v.transactionCount} visits, average $${v.averageAmount.toFixed(2)}`,
        monthlySavings: v.totalSpent / 3 * 0.5, // Assume 50% reduction possible
        confidence: 0.7,
      }));
    
    opportunities.push(...diningVendors);
    
    // 3. Multiple streaming services
    const streamingServices = analysis.recurringCharges
      .filter(v => v.category === 'Entertainment' || 
                   v.normalizedName.match(/netflix|hulu|disney|hbo|paramount|peacock|apple tv/))
      .map(v => ({
        type: 'Streaming Service',
        description: v.displayName,
        monthlySavings: this.getMonthlyEquivalent(v),
        confidence: 0.8,
      }));
    
    if (streamingServices.length > 2) {
      opportunities.push({
        type: 'Multiple Streaming Services',
        description: `Consider consolidating ${streamingServices.length} streaming services`,
        monthlySavings: streamingServices.slice(2).reduce((sum, s) => sum + s.monthlySavings, 0),
        confidence: 0.8,
      });
    }
    
    // Sort by savings potential
    opportunities.sort((a, b) => b.monthlySavings - a.monthlySavings);
    
    const totalPotentialSavings = opportunities.reduce((sum, opp) => sum + opp.monthlySavings, 0);
    
    return {
      content: [{
        type: 'text',
        text: `Cost Reduction Opportunities:\n\n` +
              opportunities.slice(0, 10).map((opp, i) => 
                `${i + 1}. ${opp.type}\n` +
                `   ${opp.description}\n` +
                `   Monthly Savings: $${opp.monthlySavings.toFixed(2)}\n` +
                `   Annual Savings: $${(opp.monthlySavings * 12).toFixed(2)}\n` +
                `   Confidence: ${(opp.confidence * 100).toFixed(0)}%`
              ).join('\n\n') +
              `\n\nTotal Potential Savings:\n` +
              `Monthly: $${totalPotentialSavings.toFixed(2)}\n` +
              `Annual: $${(totalPotentialSavings * 12).toFixed(2)}` +
              (targetReduction ? `\n\nTarget Reduction: $${targetReduction.toFixed(2)}\n` +
                                `Achievement: ${(totalPotentialSavings / targetReduction * 100).toFixed(1)}%` : '')
      }],
    };
  }

  private async categorizeForTaxes(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      taxCategories: z.array(z.string()).optional(),
    });
    
    const { csvPath, taxCategories } = schema.parse(args);
    
    const defaultTaxCategories = taxCategories || [
      'Business Meals',
      'Office Supplies',
      'Travel',
      'Professional Services',
      'Charitable Donations',
      'Medical',
      'Home Office',
    ];
    
    await this.analyzer.parseAmexCsv(csvPath);
    const transactions = this.analyzer['transactions'];
    
    const taxCategorized = new Map<string, any[]>();
    defaultTaxCategories.forEach(cat => taxCategorized.set(cat, []));
    taxCategorized.set('Not Deductible', []);
    
    // Categorize transactions
    transactions.forEach(t => {
      let categorized = false;
      
      // Business Meals
      if (t.description.match(/restaurant|lunch|dinner|breakfast|coffee/i) && 
          t.description.match(/business|meeting|client/i)) {
        taxCategorized.get('Business Meals')!.push(t);
        categorized = true;
      }
      
      // Office Supplies
      else if (t.description.match(/office|staples|supplies|amazon.*office/i)) {
        taxCategorized.get('Office Supplies')!.push(t);
        categorized = true;
      }
      
      // Travel
      else if (t.description.match(/airline|hotel|uber.*airport|lyft.*airport|rental car/i)) {
        taxCategorized.get('Travel')!.push(t);
        categorized = true;
      }
      
      // Professional Services
      else if (t.description.match(/consulting|legal|accounting|professional/i)) {
        taxCategorized.get('Professional Services')!.push(t);
        categorized = true;
      }
      
      // Medical
      else if (t.description.match(/pharmacy|medical|doctor|hospital|health/i)) {
        taxCategorized.get('Medical')!.push(t);
        categorized = true;
      }
      
      if (!categorized) {
        taxCategorized.get('Not Deductible')!.push(t);
      }
    });
    
    // Calculate totals
    const categoryTotals = new Map<string, number>();
    taxCategorized.forEach((trans, category) => {
      const total = trans.reduce((sum, t) => sum + Math.abs(t.amount), 0);
      if (total > 0) {
        categoryTotals.set(category, total);
      }
    });
    
    const totalDeductible = Array.from(categoryTotals.entries())
      .filter(([cat, _]) => cat !== 'Not Deductible')
      .reduce((sum, [_, amount]) => sum + amount, 0);
    
    return {
      content: [{
        type: 'text',
        text: `Tax Categorization Summary:\n\n` +
              Array.from(categoryTotals.entries())
                .filter(([cat, amount]) => cat !== 'Not Deductible' && amount > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([category, amount]) => 
                  `${category}: $${amount.toFixed(2)} (${taxCategorized.get(category)!.length} transactions)`
                ).join('\n') +
              `\n\nTotal Potentially Deductible: $${totalDeductible.toFixed(2)}\n` +
              `Not Deductible: $${(categoryTotals.get('Not Deductible') || 0).toFixed(2)}\n\n` +
              `Note: This is a rough categorization. Please consult with a tax professional for accurate deduction guidance.`
      }],
    };
  }

  private async extractBusinessExpenses(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      businessKeywords: z.array(z.string()).optional(),
    });
    
    const { csvPath, businessKeywords } = schema.parse(args);
    
    const keywords = businessKeywords || [
      'office', 'business', 'client', 'meeting', 'conference',
      'software', 'subscription', 'hosting', 'domain', 'aws',
      'linkedin', 'professional', 'consulting', 'travel',
    ];
    
    await this.analyzer.parseAmexCsv(csvPath);
    const transactions = this.analyzer['transactions'];
    
    const businessExpenses = transactions.filter(t => {
      const desc = t.description.toLowerCase();
      return keywords.some(keyword => desc.includes(keyword.toLowerCase()));
    });
    
    // Group by vendor
    const vendorTotals = new Map<string, {total: number, count: number, transactions: any[]}>();
    
    businessExpenses.forEach(t => {
      const vendor = this.analyzer['extractVendorName'](t);
      if (!vendorTotals.has(vendor)) {
        vendorTotals.set(vendor, {total: 0, count: 0, transactions: []});
      }
      const stats = vendorTotals.get(vendor)!;
      stats.total += Math.abs(t.amount);
      stats.count++;
      stats.transactions.push(t);
    });
    
    const sortedVendors = Array.from(vendorTotals.entries())
      .sort((a, b) => b[1].total - a[1].total);
    
    const totalBusiness = businessExpenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    return {
      content: [{
        type: 'text',
        text: `Business Expenses Extracted:\n\n` +
              `Total Business Expenses: $${totalBusiness.toFixed(2)}\n` +
              `Number of Transactions: ${businessExpenses.length}\n\n` +
              `Top Business Vendors:\n` +
              sortedVendors.slice(0, 15).map(([vendor, stats]) => 
                `${vendor}: $${stats.total.toFixed(2)} (${stats.count} transactions)`
              ).join('\n') +
              `\n\nRecent Business Transactions:\n` +
              businessExpenses.slice(0, 10).map(t => 
                `${t.date.toLocaleDateString()}: ${t.description} - $${Math.abs(t.amount).toFixed(2)}`
              ).join('\n')
      }],
    };
  }

  private async validateTransactionData(args: any) {
    const schema = z.object({
      csvPath: z.string(),
    });
    
    const { csvPath } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const transactions = this.analyzer['transactions'];
    const analysis = this.analyzer.analyze();
    
    const issues: string[] = [];
    
    // Check for missing data
    const missingDescription = transactions.filter(t => !t.description || t.description.trim() === '');
    if (missingDescription.length > 0) {
      issues.push(`${missingDescription.length} transactions with missing descriptions`);
    }
    
    // Check for zero amounts
    const zeroAmounts = transactions.filter(t => t.amount === 0);
    if (zeroAmounts.length > 0) {
      issues.push(`${zeroAmounts.length} transactions with zero amount`);
    }
    
    // Check for future dates
    const today = new Date();
    const futureDates = transactions.filter(t => t.date > today);
    if (futureDates.length > 0) {
      issues.push(`${futureDates.length} transactions with future dates`);
    }
    
    // Check for very old dates
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oldDates = transactions.filter(t => t.date < oneYearAgo);
    if (oldDates.length > 0) {
      issues.push(`${oldDates.length} transactions older than 1 year`);
    }
    
    // Check for suspiciously high amounts
    const highAmounts = transactions.filter(t => Math.abs(t.amount) > 10000);
    if (highAmounts.length > 0) {
      issues.push(`${highAmounts.length} transactions over $10,000`);
    }
    
    // Check for date ordering
    let outOfOrder = 0;
    for (let i = 1; i < transactions.length; i++) {
      if (transactions[i].date > transactions[i-1].date) {
        outOfOrder++;
      }
    }
    if (outOfOrder > transactions.length * 0.1) {
      issues.push(`Transactions appear to be out of chronological order`);
    }
    
    return {
      content: [{
        type: 'text',
        text: `Data Validation Report:\n\n` +
              `Total Transactions: ${transactions.length}\n` +
              `Date Range: ${analysis.dateRange.start.toLocaleDateString()} to ${analysis.dateRange.end.toLocaleDateString()}\n` +
              `Total Amount: $${analysis.totalSpent.toFixed(2)}\n\n` +
              (issues.length > 0 ? 
                `Issues Found:\n${issues.map(issue => `⚠️ ${issue}`).join('\n')}` :
                `✅ No data quality issues found`) +
              `\n\nSummary Statistics:\n` +
              `Average Transaction: $${(analysis.totalSpent / transactions.length).toFixed(2)}\n` +
              `Unique Vendors: ${analysis.vendorCount}\n` +
              `Transactions per Vendor: ${(transactions.length / analysis.vendorCount).toFixed(1)}`
      }],
    };
  }

  private async findMissingVendors(args: any) {
    const schema = z.object({
      csvPath: z.string(),
    });
    
    const { csvPath } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();
    
    const missingVendors = analysis.vendors.filter(v => 
      v.normalizedName === 'unknown' ||
      v.normalizedName.length < 3 ||
      v.metadata.needsManualReview ||
      (v.metadata.isObscured && v.metadata.unmaskingConfidence < 0.5)
    );
    
    return {
      content: [{
        type: 'text',
        text: `Transactions with Missing or Unclear Vendors:\n\n` +
              missingVendors.map(v => 
                `${v.displayName || 'Unknown'}\n` +
                `  Total: $${v.totalSpent.toFixed(2)} (${v.transactionCount} transactions)\n` +
                `  Issues: ${[
                  v.normalizedName === 'unknown' && 'No vendor name',
                  v.normalizedName.length < 3 && 'Very short name',
                  v.metadata.needsManualReview && 'Needs manual review',
                  v.metadata.isObscured && v.metadata.unmaskingConfidence < 0.5 && 'Low confidence extraction'
                ].filter(Boolean).join(', ')}\n` +
                `  Sample transactions:\n` +
                v.transactions.slice(0, 3).map(t => 
                  `    ${t.date.toLocaleDateString()}: ${t.description}`
                ).join('\n')
              ).join('\n\n')
      }],
    };
  }

  private async searchTransactions(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      query: z.string(),
      filters: z.object({
        minAmount: z.number().optional(),
        maxAmount: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        category: z.string().optional(),
      }).optional(),
    });
    
    const { csvPath, query, filters = {} } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const transactions = this.analyzer['transactions'];
    
    let results = transactions.filter(t => 
      t.description.toLowerCase().includes(query.toLowerCase()) ||
      (t.extendedDetails && t.extendedDetails.toLowerCase().includes(query.toLowerCase()))
    );
    
    // Apply filters
    if (filters.minAmount !== undefined) {
      results = results.filter(t => Math.abs(t.amount) >= filters.minAmount);
    }
    if (filters.maxAmount !== undefined) {
      results = results.filter(t => Math.abs(t.amount) <= filters.maxAmount);
    }
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      results = results.filter(t => t.date >= start);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      results = results.filter(t => t.date <= end);
    }
    if (filters.category) {
      results = results.filter(t => t.category === filters.category);
    }
    
    const total = results.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    return {
      content: [{
        type: 'text',
        text: `Search Results for "${query}":\n\n` +
              `Found ${results.length} transactions totaling $${total.toFixed(2)}\n\n` +
              results.slice(0, 20).map(t => 
                `${t.date.toLocaleDateString()}: ${t.description}\n` +
                `  Amount: $${Math.abs(t.amount).toFixed(2)}\n` +
                `  Category: ${t.category || 'Uncategorized'}`
              ).join('\n\n') +
              (results.length > 20 ? `\n\n... and ${results.length - 20} more transactions` : '')
      }],
    };
  }

  private async filterByLocation(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      city: z.string().optional(),
      state: z.string().optional(),
      country: z.string().optional(),
    });
    
    const { csvPath, city, state, country } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const transactions = this.analyzer['transactions'];
    
    let results = transactions;
    
    if (city) {
      results = results.filter(t => t.city?.toLowerCase().includes(city.toLowerCase()));
    }
    if (state) {
      results = results.filter(t => t.state?.toLowerCase() === state.toLowerCase());
    }
    if (country) {
      results = results.filter(t => t.country?.toLowerCase().includes(country.toLowerCase()));
    }
    
    // Group by location
    const locationGroups = new Map<string, {transactions: any[], total: number}>();
    
    results.forEach(t => {
      const location = [t.city, t.state, t.country].filter(Boolean).join(', ') || 'Unknown Location';
      if (!locationGroups.has(location)) {
        locationGroups.set(location, {transactions: [], total: 0});
      }
      const group = locationGroups.get(location)!;
      group.transactions.push(t);
      group.total += Math.abs(t.amount);
    });
    
    const sortedLocations = Array.from(locationGroups.entries())
      .sort((a, b) => b[1].total - a[1].total);
    
    return {
      content: [{
        type: 'text',
        text: `Location-Based Spending:\n\n` +
              `Filters: ${[city && `City: ${city}`, state && `State: ${state}`, country && `Country: ${country}`].filter(Boolean).join(', ') || 'None'}\n\n` +
              sortedLocations.slice(0, 10).map(([location, data]) => 
                `${location}:\n` +
                `  Total: $${data.total.toFixed(2)}\n` +
                `  Transactions: ${data.transactions.length}\n` +
                `  Average: $${(data.total / data.transactions.length).toFixed(2)}`
              ).join('\n\n')
      }],
    };
  }

  private async filterByTime(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      timeOfDay: z.enum(['morning', 'afternoon', 'evening', 'night']).optional(),
      dayOfWeek: z.array(z.string()).optional(),
    });
    
    const { csvPath, timeOfDay, dayOfWeek } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const transactions = this.analyzer['transactions'];
    
    // Note: Transaction data typically doesn't include time, so this is based on patterns
    // For demonstration, we'll analyze by day of week only
    
    let results = transactions;
    
    if (dayOfWeek && dayOfWeek.length > 0) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const dayIndices = dayOfWeek.map(d => days.indexOf(d.toLowerCase()));
      results = results.filter(t => dayIndices.includes(t.date.getDay()));
    }
    
    // Group by day of week
    const dayGroups = new Map<string, {transactions: any[], total: number}>();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    results.forEach(t => {
      const day = days[t.date.getDay()];
      if (!dayGroups.has(day)) {
        dayGroups.set(day, {transactions: [], total: 0});
      }
      const group = dayGroups.get(day)!;
      group.transactions.push(t);
      group.total += Math.abs(t.amount);
    });
    
    return {
      content: [{
        type: 'text',
        text: `Time-Based Spending Analysis:\n\n` +
              Array.from(dayGroups.entries()).map(([day, data]) => 
                `${day}:\n` +
                `  Total: $${data.total.toFixed(2)}\n` +
                `  Transactions: ${data.transactions.length}\n` +
                `  Average: $${(data.total / data.transactions.length).toFixed(2)}`
              ).join('\n\n') +
              `\n\nWeekend vs Weekday:\n` +
              `Weekend: $${Array.from(dayGroups.entries())
                .filter(([day]) => ['Saturday', 'Sunday'].includes(day))
                .reduce((sum, [_, data]) => sum + data.total, 0).toFixed(2)}\n` +
              `Weekday: $${Array.from(dayGroups.entries())
                .filter(([day]) => !['Saturday', 'Sunday'].includes(day))
                .reduce((sum, [_, data]) => sum + data.total, 0).toFixed(2)}`
      }],
    };
  }

  private async findRelatedVendors(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      vendorName: z.string(),
    });
    
    const { csvPath, vendorName } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();
    
    const targetVendor = analysis.vendors.find(v => 
      v.normalizedName.includes(vendorName.toLowerCase()) ||
      v.displayName.toLowerCase().includes(vendorName.toLowerCase())
    );
    
    if (!targetVendor) {
      return {
        content: [{
          type: 'text',
          text: `Vendor "${vendorName}" not found.`
        }],
      };
    }
    
    // Find related vendors based on various criteria
    const related: Array<{vendor: any, reason: string, score: number}> = [];
    
    analysis.vendors.forEach(v => {
      if (v.name === targetVendor.name) return;
      
      // Same category
      if (v.category === targetVendor.category) {
        related.push({vendor: v, reason: 'Same category', score: 0.5});
      }
      
      // Similar amount patterns
      const amountDiff = Math.abs(v.averageAmount - targetVendor.averageAmount) / targetVendor.averageAmount;
      if (amountDiff < 0.2) {
        related.push({vendor: v, reason: 'Similar transaction amounts', score: 0.6});
      }
      
      // Similar name
      const similarity = this.calculateSimilarity(v.normalizedName, targetVendor.normalizedName);
      if (similarity > 0.5) {
        related.push({vendor: v, reason: 'Similar name', score: similarity});
      }
      
      // Same payment processor
      if (v.metadata.processor && v.metadata.processor === targetVendor.metadata.processor) {
        related.push({vendor: v, reason: 'Same payment processor', score: 0.7});
      }
    });
    
    // Deduplicate and sort by score
    const uniqueRelated = new Map<string, {vendor: any, reasons: string[], maxScore: number}>();
    
    related.forEach(({vendor, reason, score}) => {
      const key = vendor.name;
      if (!uniqueRelated.has(key)) {
        uniqueRelated.set(key, {vendor, reasons: [], maxScore: 0});
      }
      const entry = uniqueRelated.get(key)!;
      entry.reasons.push(reason);
      entry.maxScore = Math.max(entry.maxScore, score);
    });
    
    const sortedRelated = Array.from(uniqueRelated.values())
      .sort((a, b) => b.maxScore - a.maxScore)
      .slice(0, 10);
    
    return {
      content: [{
        type: 'text',
        text: `Vendors Related to "${targetVendor.displayName}":\n\n` +
              sortedRelated.map(({vendor, reasons, maxScore}) => 
                `${vendor.displayName}\n` +
                `  Relationship: ${reasons.join(', ')}\n` +
                `  Similarity Score: ${(maxScore * 100).toFixed(0)}%\n` +
                `  Total Spent: $${vendor.totalSpent.toFixed(2)}`
              ).join('\n\n')
      }],
    };
  }

  private async mergeVendorVariants(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      vendorMappings: z.record(z.string()),
    });
    
    const { csvPath, vendorMappings } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    
    // Apply mappings to transactions
    const transactions = this.analyzer['transactions'];
    transactions.forEach(t => {
      const currentVendor = this.analyzer['extractVendorName'](t);
      Object.entries(vendorMappings).forEach(([variant, canonical]) => {
        if (currentVendor.toLowerCase().includes(variant.toLowerCase())) {
          t.description = t.description.replace(currentVendor, canonical);
        }
      });
    });
    
    // Re-analyze with merged vendors
    const analysis = this.analyzer.analyze();
    
    // Find the merged vendors
    const mergedVendors = Array.from(Object.values(vendorMappings))
      .map(canonical => analysis.vendors.find(v => v.displayName === canonical))
      .filter(v => v !== undefined);
    
    return {
      content: [{
        type: 'text',
        text: `Vendor Merge Results:\n\n` +
              mergedVendors.map(v => 
                `${v!.displayName}:\n` +
                `  Total after merge: $${v!.totalSpent.toFixed(2)}\n` +
                `  Transactions: ${v!.transactionCount}\n` +
                `  Category: ${v!.category}`
              ).join('\n\n') +
              `\n\nMerge Summary:\n` +
              `Mappings applied: ${Object.keys(vendorMappings).length}\n` +
              `Vendors consolidated: ${mergedVendors.length}`
      }],
    };
  }

  private async checkSpendingAlerts(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      alerts: z.array(z.object({
        category: z.string(),
        threshold: z.number(),
        period: z.enum(['daily', 'weekly', 'monthly']),
      })),
    });
    
    const { csvPath, alerts } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const transactions = this.analyzer['transactions'];
    
    const triggeredAlerts: any[] = [];
    
    alerts.forEach(alert => {
      // Group transactions by period
      const periodTotals = new Map<string, number>();
      
      transactions
        .filter(t => t.category === alert.category)
        .forEach(t => {
          let periodKey: string;
          
          switch (alert.period) {
            case 'daily':
              periodKey = t.date.toISOString().split('T')[0];
              break;
            case 'weekly':
              const weekStart = new Date(t.date);
              weekStart.setDate(t.date.getDate() - t.date.getDay());
              periodKey = weekStart.toISOString().split('T')[0];
              break;
            case 'monthly':
              periodKey = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`;
              break;
          }
          
          periodTotals.set(periodKey, (periodTotals.get(periodKey) || 0) + Math.abs(t.amount));
        });
      
      // Check for breaches
      periodTotals.forEach((total, period) => {
        if (total > alert.threshold) {
          triggeredAlerts.push({
            category: alert.category,
            period: period,
            periodType: alert.period,
            spent: total,
            threshold: alert.threshold,
            overBy: total - alert.threshold,
            percentOver: ((total - alert.threshold) / alert.threshold * 100),
          });
        }
      });
    });
    
    triggeredAlerts.sort((a, b) => b.percentOver - a.percentOver);
    
    return {
      content: [{
        type: 'text',
        text: `Spending Alerts Triggered:\n\n` +
              (triggeredAlerts.length === 0 ? 
                'No alerts triggered - all spending within thresholds.' :
                triggeredAlerts.map(alert => 
                  `⚠️ ${alert.category} - ${alert.period}\n` +
                  `   Spent: $${alert.spent.toFixed(2)} (Limit: $${alert.threshold.toFixed(2)})\n` +
                  `   Over by: $${alert.overBy.toFixed(2)} (${alert.percentOver.toFixed(1)}%)`
                ).join('\n\n'))
      }],
    };
  }

  private async monitorNewVendors(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      sinceDate: z.string().optional(),
    });
    
    const { csvPath, sinceDate } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();
    
    const checkDate = sinceDate ? new Date(sinceDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const newVendors = analysis.vendors
      .filter(v => v.firstSeen >= checkDate)
      .sort((a, b) => b.totalSpent - a.totalSpent);
    
    const totalNewSpending = newVendors.reduce((sum, v) => sum + v.totalSpent, 0);
    
    return {
      content: [{
        type: 'text',
        text: `New Vendors Since ${checkDate.toLocaleDateString()}:\n\n` +
              `Found ${newVendors.length} new vendors with total spending of $${totalNewSpending.toFixed(2)}\n\n` +
              newVendors.slice(0, 20).map(v => 
                `${v.displayName}\n` +
                `  First seen: ${v.firstSeen.toLocaleDateString()}\n` +
                `  Total spent: $${v.totalSpent.toFixed(2)} (${v.transactionCount} transactions)\n` +
                `  Category: ${v.category}\n` +
                `  Average: $${v.averageAmount.toFixed(2)}`
              ).join('\n\n')
      }],
    };
  }

  private async generateMonthlyReport(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      month: z.number().min(1).max(12),
      year: z.number(),
    });
    
    const { csvPath, month, year } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const transactions = this.analyzer['transactions']
      .filter(t => t.date.getFullYear() === year && t.date.getMonth() + 1 === month);
    
    if (transactions.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No transactions found for ${month}/${year}`
        }],
      };
    }
    
    // Create temporary analyzer for the month
    const monthAnalyzer = new AmexSpendingAnalyzer();
    monthAnalyzer['transactions'] = transactions;
    monthAnalyzer['processTransactions']();
    const monthAnalysis = monthAnalyzer.analyze();
    
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    return {
      content: [{
        type: 'text',
        text: `${monthNames[month - 1]} ${year} Spending Report\n` +
              `${'='.repeat(40)}\n\n` +
              `Total Spent: $${monthAnalysis.totalSpent.toFixed(2)}\n` +
              `Transactions: ${monthAnalysis.transactionCount}\n` +
              `Unique Vendors: ${monthAnalysis.vendorCount}\n` +
              `Daily Average: $${(monthAnalysis.totalSpent / 30).toFixed(2)}\n\n` +
              `Top Categories:\n` +
              Array.from(monthAnalysis.categoryBreakdown.entries())
                .sort((a, b) => b[1].total - a[1].total)
                .slice(0, 5)
                .map(([cat, stats]) => 
                  `  ${cat}: $${stats.total.toFixed(2)} (${stats.percentage.toFixed(1)}%)`
                ).join('\n') +
              `\n\nTop Vendors:\n` +
              monthAnalysis.topVendors.slice(0, 10).map(v => 
                `  ${v.displayName}: $${v.totalSpent.toFixed(2)} (${v.transactionCount} trans)`
              ).join('\n') +
              `\n\nSubscriptions: ${monthAnalysis.subscriptionCount} active ($${monthAnalysis.subscriptionTotal.toFixed(2)}/month)\n` +
              `\nAnomalies: ${monthAnalysis.anomalies.length} detected`
      }],
    };
  }

  private async generateVendorReport(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      vendorName: z.string(),
      includeCharts: z.boolean().default(true),
    });
    
    const { csvPath, vendorName, includeCharts } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const analysis = this.analyzer.analyze();
    
    const vendor = analysis.vendors.find(v => 
      v.normalizedName.includes(vendorName.toLowerCase()) ||
      v.displayName.toLowerCase().includes(vendorName.toLowerCase())
    );
    
    if (!vendor) {
      return {
        content: [{
          type: 'text',
          text: `Vendor "${vendorName}" not found.`
        }],
      };
    }
    
    // Calculate spending trend
    const monthlySpending = new Map<string, number>();
    vendor.transactions.forEach(t => {
      const monthKey = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`;
      monthlySpending.set(monthKey, (monthlySpending.get(monthKey) || 0) + Math.abs(t.amount));
    });
    
    const sortedMonths = Array.from(monthlySpending.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    
    return {
      content: [{
        type: 'text',
        text: `Vendor Report: ${vendor.displayName}\n` +
              `${'='.repeat(50)}\n\n` +
              `Overview:\n` +
              `  Total Spent: $${vendor.totalSpent.toFixed(2)}\n` +
              `  Transactions: ${vendor.transactionCount}\n` +
              `  Average: $${vendor.averageAmount.toFixed(2)}\n` +
              `  Range: $${vendor.minAmount.toFixed(2)} - $${vendor.maxAmount.toFixed(2)}\n` +
              `  First Seen: ${vendor.firstSeen.toLocaleDateString()}\n` +
              `  Last Seen: ${vendor.lastSeen.toLocaleDateString()}\n` +
              `  Category: ${vendor.category}\n\n` +
              `Attributes:\n` +
              `  Subscription: ${vendor.isRecurring ? 'Yes' : 'No'}\n` +
              (vendor.recurringPattern ? 
                `  Frequency: ${vendor.recurringPattern.frequency}\n` +
                `  Expected Amount: $${vendor.recurringPattern.expectedAmount.toFixed(2)}\n` : '') +
              `  Fraud Risk: ${vendor.metadata.anomalyScore > 50 ? 'High' : vendor.metadata.anomalyScore > 20 ? 'Medium' : 'Low'}\n` +
              (vendor.metadata.isObscured ? 
                `  Payment Processor: ${vendor.metadata.processor}\n` +
                `  Confidence: ${(vendor.metadata.unmaskingConfidence * 100).toFixed(0)}%\n` : '') +
              `\nMonthly Spending Trend:\n` +
              sortedMonths.slice(-6).map(([month, amount]) => 
                `  ${month}: $${amount.toFixed(2)}`
              ).join('\n') +
              `\n\nRecent Transactions:\n` +
              vendor.transactions.slice(0, 5).map(t => 
                `  ${t.date.toLocaleDateString()}: ${t.description} - $${Math.abs(t.amount).toFixed(2)}`
              ).join('\n')
      }],
    };
  }

  private async calculateSpendingStatistics(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      metrics: z.array(z.enum(['mean', 'median', 'stddev', 'percentiles'])).default(['mean', 'median', 'stddev']),
    });
    
    const { csvPath, metrics } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const transactions = this.analyzer['transactions'];
    const amounts = transactions.map(t => Math.abs(t.amount)).sort((a, b) => a - b);
    
    const stats: any = {};
    
    if (metrics.includes('mean')) {
      stats.mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    }
    
    if (metrics.includes('median')) {
      const mid = Math.floor(amounts.length / 2);
      stats.median = amounts.length % 2 === 0 
        ? (amounts[mid - 1] + amounts[mid]) / 2 
        : amounts[mid];
    }
    
    if (metrics.includes('stddev')) {
      const mean = stats.mean || amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
      stats.stddev = Math.sqrt(variance);
    }
    
    if (metrics.includes('percentiles')) {
      stats.percentiles = {
        '10th': amounts[Math.floor(amounts.length * 0.1)],
        '25th': amounts[Math.floor(amounts.length * 0.25)],
        '50th': amounts[Math.floor(amounts.length * 0.5)],
        '75th': amounts[Math.floor(amounts.length * 0.75)],
        '90th': amounts[Math.floor(amounts.length * 0.9)],
        '95th': amounts[Math.floor(amounts.length * 0.95)],
        '99th': amounts[Math.floor(amounts.length * 0.99)],
      };
    }
    
    return {
      content: [{
        type: 'text',
        text: `Spending Statistics:\n\n` +
              `Sample Size: ${amounts.length} transactions\n` +
              `Total: $${amounts.reduce((a, b) => a + b, 0).toFixed(2)}\n` +
              `Range: $${amounts[0].toFixed(2)} - $${amounts[amounts.length - 1].toFixed(2)}\n\n` +
              Object.entries(stats).map(([metric, value]) => {
                if (metric === 'percentiles') {
                  return `Percentiles:\n` + Object.entries(value as any).map(([p, v]) => 
                    `  ${p}: $${(v as number).toFixed(2)}`
                  ).join('\n');
                } else {
                  return `${metric.charAt(0).toUpperCase() + metric.slice(1)}: $${(value as number).toFixed(2)}`;
                }
              }).join('\n')
      }],
    };
  }

  private async analyzeSpendingDistribution(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      bucketSize: z.number().default(50),
    });
    
    const { csvPath, bucketSize } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const transactions = this.analyzer['transactions'];
    
    // Create buckets
    const buckets = new Map<string, number>();
    
    transactions.forEach(t => {
      const amount = Math.abs(t.amount);
      const bucketIndex = Math.floor(amount / bucketSize);
      const bucketKey = `$${bucketIndex * bucketSize}-$${(bucketIndex + 1) * bucketSize}`;
      buckets.set(bucketKey, (buckets.get(bucketKey) || 0) + 1);
    });
    
    // Sort buckets
    const sortedBuckets = Array.from(buckets.entries())
      .sort((a, b) => {
        const aStart = parseInt(a[0].split('-')[0].substring(1));
        const bStart = parseInt(b[0].split('-')[0].substring(1));
        return aStart - bStart;
      });
    
    // Find mode bucket
    const modeBucket = sortedBuckets.reduce((max, curr) => 
      curr[1] > max[1] ? curr : max
    );
    
    return {
      content: [{
        type: 'text',
        text: `Spending Distribution (Bucket Size: $${bucketSize}):\n\n` +
              sortedBuckets.slice(0, 20).map(([range, count]) => {
                const percentage = (count / transactions.length * 100).toFixed(1);
                const bar = '█'.repeat(Math.floor(parseInt(percentage) / 2));
                return `${range.padEnd(15)} ${count.toString().padStart(4)} (${percentage.padStart(5)}%) ${bar}`;
              }).join('\n') +
              `\n\nSummary:\n` +
              `Most common range: ${modeBucket[0]} (${modeBucket[1]} transactions)\n` +
              `Total buckets: ${sortedBuckets.length}`
      }],
    };
  }

  private async exportForAccounting(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      format: z.enum(['quickbooks', 'xero', 'wave']),
      outputPath: z.string(),
    });
    
    const { csvPath, format, outputPath } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const transactions = this.analyzer['transactions'];
    
    // Format transactions for accounting software
    let formatted: any[];
    
    switch (format) {
      case 'quickbooks':
        formatted = transactions.map(t => ({
          Date: t.date.toLocaleDateString('en-US'),
          Description: t.description,
          Amount: -t.amount, // Quickbooks expects negative for expenses
          Category: t.category || 'Uncategorized',
          'Tax Line': '', // To be filled by user
          Memo: t.extendedDetails || '',
        }));
        break;
        
      case 'xero':
        formatted = transactions.map(t => ({
          '*Date': t.date.toLocaleDateString('en-US'),
          '*Amount': Math.abs(t.amount),
          Description: t.description,
          '*AccountCode': '400', // Default expense account
          'TaxType': 'NONE',
          Reference: t.reference || '',
        }));
        break;
        
      case 'wave':
        formatted = transactions.map(t => ({
          'Transaction Date': t.date.toLocaleDateString('en-US'),
          Description: t.description,
          Amount: -Math.abs(t.amount), // Wave expects negative for expenses
          'Category': t.category || 'Other Expense',
          'Account': 'Credit Card',
          Notes: t.extendedDetails || '',
        }));
        break;
        
      default:
        formatted = [];
    }
    
    // Export to CSV
    const csvWriter = require('csv-writer').createObjectCsvWriter({
      path: outputPath,
      header: Object.keys(formatted[0]).map(key => ({id: key, title: key})),
    });
    
    await csvWriter.writeRecords(formatted);
    
    return {
      content: [{
        type: 'text',
        text: `Exported ${formatted.length} transactions to ${format} format\n` +
              `File saved: ${outputPath}\n\n` +
              `Import Instructions:\n` +
              format === 'quickbooks' ? 
                '1. Open QuickBooks\n2. Go to File > Import > Transactions\n3. Select the CSV file\n4. Map fields and import' :
              format === 'xero' ?
                '1. Open Xero\n2. Go to Accounting > Bank Statements\n3. Click Import a Statement\n4. Select the CSV file' :
              format === 'wave' ?
                '1. Open Wave\n2. Go to Accounting > Transactions\n3. Click Upload a Bank Statement\n4. Select the CSV file' : ''
      }],
    };
  }

  private async exportForBudgeting(args: any) {
    const schema = z.object({
      csvPath: z.string(),
      format: z.enum(['ynab', 'mint', 'personalcapital']),
      outputPath: z.string(),
    });
    
    const { csvPath, format, outputPath } = schema.parse(args);
    
    await this.analyzer.parseAmexCsv(csvPath);
    const transactions = this.analyzer['transactions'];
    
    // Format transactions for budgeting software
    let formatted: any[];
    
    switch (format) {
      case 'ynab':
        formatted = transactions.map(t => ({
          Date: t.date.toLocaleDateString('en-US'),
          Payee: this.analyzer['extractVendorName'](t),
          Category: t.category || '',
          Memo: t.extendedDetails || t.description,
          Outflow: Math.abs(t.amount),
          Inflow: 0,
        }));
        break;
        
      case 'mint':
        formatted = transactions.map(t => ({
          Date: t.date.toLocaleDateString('en-US'),
          Description: t.description,
          'Original Description': t.description,
          Amount: -Math.abs(t.amount),
          'Transaction Type': 'debit',
          Category: t.category || 'Uncategorized',
          'Account Name': 'American Express',
          Labels: '',
          Notes: t.extendedDetails || '',
        }));
        break;
        
      case 'personalcapital':
        formatted = transactions.map(t => ({
          Date: t.date.toLocaleDateString('en-US'),
          Description: t.description,
          Amount: -Math.abs(t.amount),
          Category: t.category || 'Other',
          Account: 'Amex',
          Tags: vendor.isRecurring ? 'Subscription' : '',
          Notes: t.extendedDetails || '',
        }));
        break;
        
      default:
        formatted = [];
    }
    
    // Export to CSV
    const csvWriter = require('csv-writer').createObjectCsvWriter({
      path: outputPath,
      header: Object.keys(formatted[0]).map(key => ({id: key, title: key})),
    });
    
    await csvWriter.writeRecords(formatted);
    
    return {
      content: [{
        type: 'text',
        text: `Exported ${formatted.length} transactions to ${format} format\n` +
              `File saved: ${outputPath}\n\n` +
              `Import Instructions:\n` +
              format === 'ynab' ? 
                '1. Open YNAB\n2. Click on the account\n3. Click Import\n4. Select the CSV file' :
              format === 'mint' ?
                '1. Open Mint\n2. Go to Transactions\n3. Click Import Transactions\n4. Select the CSV file' :
              format === 'personalcapital' ?
                '1. Open Personal Capital\n2. Go to Transactions\n3. Click Import\n4. Select the CSV file' : ''
      }],
    };
  }

  // Helper methods
  private getMonthlyEquivalent(vendor: any): number {
    if (!vendor.recurringPattern) return 0;
    
    const { frequency, expectedAmount } = vendor.recurringPattern;
    switch (frequency) {
      case 'daily': return expectedAmount * 30;
      case 'weekly': return expectedAmount * 4.33;
      case 'biweekly': return expectedAmount * 2.17;
      case 'monthly': return expectedAmount;
      case 'quarterly': return expectedAmount / 3;
      case 'annual': return expectedAmount / 12;
      default: return expectedAmount;
    }
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.getEditDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private getEditDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  private formatSummary(analysis: any): string {
    // Reuse formatting from base implementation
    return `
📊 AMEX SPENDING ANALYSIS SUMMARY
================================

📅 Period: ${analysis.dateRange.start.toLocaleDateString()} - ${analysis.dateRange.end.toLocaleDateString()}

💰 OVERVIEW
-----------
Total Spent: $${analysis.totalSpent.toLocaleString()}
Transactions: ${analysis.transactionCount}
Unique Vendors: ${analysis.vendorCount}
Avg Transaction: $${(analysis.totalSpent / analysis.transactionCount).toFixed(2)}

🔄 SUBSCRIPTIONS (${analysis.subscriptionCount} found)
-----------------
Monthly Total: $${analysis.subscriptionTotal.toFixed(2)}
Annual Projection: $${(analysis.subscriptionTotal * 12).toFixed(2)}

🏪 TOP 10 VENDORS
-----------------
${analysis.topVendors.slice(0, 10).map((v: any, i: number) => 
  `${i + 1}. ${v.displayName}: $${v.totalSpent.toFixed(2)} (${v.transactionCount} trans)`
).join('\n')}

📊 SPENDING BY CATEGORY
----------------------
${Array.from(analysis.categoryBreakdown.entries())
  .sort((a, b) => b[1].total - a[1].total)
  .map(([category, stats]) => 
    `${category}: $${stats.total.toFixed(2)} (${stats.percentage.toFixed(1)}%)`
  ).join('\n')}

⚠️ ALERTS
---------
${analysis.insights.slice(0, 5).map((insight: any) => `• ${insight}`).join('\n')}

🚨 ANOMALIES DETECTED: ${analysis.anomalies.length}
${analysis.anomalies.slice(0, 3).map((a: any) => 
  `• ${a.vendor}: ${a.reason}`
).join('\n')}

📝 For detailed analysis, export to Excel or JSON format.
    `;
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Enhanced Amex MCP server running with all 36 tools...');
  }
}

// Only start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new AmexMCPServerEnhanced();
  server.run().catch(console.error);
}

export default AmexMCPServerEnhanced;