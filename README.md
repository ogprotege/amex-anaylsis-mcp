# Amex Analysis MCP

Local American Express statement analysis for Claude Desktop (or any MCP host) and the terminal. It reads an Amex activity CSV, unmasks PayPal/Square/Stripe-style descriptors, and answers questions about spend, subscriptions, and anomalies.

Everything stays on your machine. There is no HTTP server and no database.

## What it actually does

- Parses official Amex activity CSVs, including a title row before the header
- Separates **charges**, **credits/refunds**, and **payments** (payments are not spend)
- Loads a statement **once per session**, then answers follow-up tools without re-reading the file
- Unmasks processor descriptors (`PAYPAL *GRUBHUB` → Grubhub)
- Detects subscriptions from known services or recurring amount/interval
- Exports Excel / CSV / JSON
- Exposes MCP tools, resources, and prompts

What it does **not** do: talk to American Express, fetch receipts, support Chase/Citi files, or train a model on your data.

## Requirements

- Node.js 18.18+
- An Amex activity CSV (`Date`, `Description`, `Amount`)

## Install

```bash
git clone https://github.com/ogprotege/amex-anaylsis-mcp.git
cd amex-anaylsis-mcp
npm install
npm test
npm run build
```

## CLI

```bash
npx tsx src/cli.ts --help
npx tsx src/cli.ts analyze data/amex.csv
npx tsx src/cli.ts analyze data/amex.csv --format excel --out output/report.xlsx
npx tsx src/cli.ts unmask "PAYPAL *GRUBHUB"
```

After `npm run build`, the same commands are `node dist/src/cli.js ...` or `npx amex-analysis ...` if linked.

## MCP (Claude Desktop)

```json
{
  "mcpServers": {
    "amex-analysis": {
      "command": "node",
      "args": ["/absolute/path/to/dist/amex-mcp-server.js"]
    }
  }
}
```

Full tool catalog:

```json
{
  "mcpServers": {
    "amex-analysis-enhanced": {
      "command": "node",
      "args": ["/absolute/path/to/dist/amex-mcp-server-enhanced.js"]
    }
  }
}
```

Dev without building: `npm run dev` (standard) or `npm run dev:enhanced`.

### Typical conversation

1. `load_statement` with your CSV path
2. Ask for subscriptions, categories, or unmasked PayPal/Square charges
3. Later tools omit `csvPath` and reuse the loaded file
4. Optional: read `amex://statement/summary` or the `review_subscriptions` prompt

Standard mode (default) exposes the original six tools plus `load_statement`, unmasking, search, trends, duplicates, and period compare. Enhanced mode adds the rest of the catalog (tax buckets, accounting export, budget alerts, …). See [ENHANCED_SERVER_GUIDE.md](ENHANCED_SERVER_GUIDE.md).

## CSV notes

Amex exports charges as **negative** in some downloads and **positive** in others. The parser samples non-payment rows and detects the convention.

Payments (`ONLINE PAYMENT THANK YOU`, autopay, and similar) are tracked separately and never added to vendor spend.

Extended-detail columns improve unmasking but are optional.

## Library

```typescript
import { AmexSpendingAnalyzer } from './amex-mcp-server.js';

const analyzer = new AmexSpendingAnalyzer();
await analyzer.parseAmexCsv('data/amex.csv');
const results = analyzer.analyze();
```

## Tests and build

```bash
npm test              # node:test assertions, no personal CSVs required
npm run test-unmasking
npm run build
npm run demo          # writes a sample CSV and an Excel file
```

## Privacy

Statements are read from disk you point at. Nothing is uploaded. Account-number columns are ignored.

## License

MIT. See [LICENSE](LICENSE).
