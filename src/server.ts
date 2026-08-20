import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { formatAnomalies, formatCategories, formatSubscriptions, formatSummary } from './format.js';
import { AnalysisSession } from './session.js';
import { toolsForMode, type ToolResult } from './tools.js';
import type { ServerMode } from './types.js';

export function createAmexServer(mode: ServerMode = 'standard'): McpServer {
  const session = new AnalysisSession();
  const server = new McpServer({
    name: mode === 'enhanced' ? 'amex-spending-analyzer-enhanced' : 'amex-spending-analyzer',
    version: '3.0.0',
  });

  for (const tool of toolsForMode(mode)) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args) => {
        try {
          return await tool.handler(args as Record<string, unknown>, { session });
        } catch (error) {
          const result: ToolResult = {
            content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
            isError: true,
          };
          return result;
        }
      }
    );
  }

  const resource = (
    name: string,
    uri: string,
    title: string,
    description: string,
    render: () => string
  ) => {
    server.registerResource(name, uri, { title, description, mimeType: 'text/plain' }, async (resourceUri) => {
      if (!session.hasLoaded()) {
        return {
          contents: [
            {
              uri: resourceUri.href,
              mimeType: 'text/plain',
              text: 'No statement loaded. Call load_statement first.',
            },
          ],
        };
      }
      return {
        contents: [{ uri: resourceUri.href, mimeType: 'text/plain', text: render() }],
      };
    });
  };

  resource('summary', 'amex://statement/summary', 'Statement summary', 'Totals, top vendors, insights', () =>
    formatSummary(session.current().analysis)
  );
  resource('subscriptions', 'amex://statement/subscriptions', 'Subscriptions', 'Detected recurring services', () =>
    formatSubscriptions(session.current().analysis)
  );
  resource('categories', 'amex://statement/categories', 'Categories', 'Spend by category', () =>
    formatCategories(session.current().analysis)
  );
  resource('anomalies', 'amex://statement/anomalies', 'Anomalies', 'Anomalies and duplicate charges', () =>
    formatAnomalies(session.current().analysis, 'low')
  );
  resource('unmasked', 'amex://statement/unmasked', 'Unmasked merchants', 'Processor-masked vendors', () => {
    const analysis = session.current().analysis;
    const rows = analysis.vendors.filter((vendor) => vendor.metadata.isObscured);
    return rows
      .map((vendor) => `${vendor.metadata.processor} → ${vendor.displayName} ($${vendor.totalSpent.toFixed(2)})`)
      .join('\n') || 'No processor-masked merchants.';
  });

  server.registerResource(
    'vendor',
    new ResourceTemplate('amex://statement/vendor/{name}', { list: undefined }),
    { title: 'Vendor', description: 'One vendor from the loaded statement', mimeType: 'text/plain' },
    async (uri, { name }) => {
      if (!session.hasLoaded()) {
        return { contents: [{ uri: uri.href, text: 'No statement loaded.', mimeType: 'text/plain' }] };
      }
      const query = String(name ?? '').toLowerCase();
      const vendor = session.current().analysis.vendors.find((item) => item.normalizedName.includes(query) || item.displayName.toLowerCase().includes(query));
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/plain',
            text: vendor ? `${vendor.displayName}: $${vendor.totalSpent.toFixed(2)} / ${vendor.transactionCount} tx` : `No vendor matching ${name}`,
          },
        ],
      };
    }
  );

  server.registerPrompt(
    'review_subscriptions',
    {
      title: 'Review subscriptions',
      description: 'Walk through recurring charges and recommend what to keep or cancel.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Load or reuse my Amex statement, list subscriptions with monthly and annual cost, flag unused ones relative to the statement period, and recommend cancellations with dollar savings. Do not invent merchants.',
          },
        },
      ],
    })
  );

  server.registerPrompt(
    'find_waste',
    {
      title: 'Find waste',
      description: 'Find duplicates, overlapping subscriptions, and high-frequency spend.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Using the loaded Amex statement, find same-day duplicate charges, overlapping subscription groups, and the highest-frequency vendors. Quantify savings. Stay inside the CSV.',
          },
        },
      ],
    })
  );

  server.registerPrompt(
    'unmask_processors',
    {
      title: 'Unmask processors',
      description: 'Reveal merchants behind PayPal, Square, Stripe, and similar.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Unmask payment-processor transactions in the loaded statement. Group by processor, call out low-confidence rows, and do not guess generic names like "local coffee shop".',
          },
        },
      ],
    })
  );

  server.registerPrompt(
    'monthly_review',
    {
      title: 'Monthly review',
      description: 'Produce a month-end spending review from the loaded statement.',
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Give me a monthly review of the loaded Amex statement: net spend, categories, new vendors, subscriptions, and anomalies. Use statement dates, not today.',
          },
        },
      ],
    })
  );

  return server;
}

export async function startServer(mode: ServerMode = 'standard'): Promise<void> {
  const server = createAmexServer(mode);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Amex MCP server (${mode}) running on stdio`);
}

export function parseMode(value?: string): ServerMode {
  if (value === 'basic' || value === 'standard' || value === 'enhanced') return value;
  const fromEnv = process.env.AMEX_MCP_MODE;
  if (fromEnv === 'basic' || fromEnv === 'standard' || fromEnv === 'enhanced') return fromEnv;
  return 'standard';
}
