# Amex Analysis cheatsheet

## Install and check

```bash
npm install
npm test
npm run build
npx tsx src/cli.ts --help
```

## CLI

```bash
npx tsx src/cli.ts analyze data/amex-2024.csv
npx tsx src/cli.ts analyze data/amex-2024.csv --format excel --out output/report.xlsx
npx tsx src/cli.ts analyze data/amex-2024.csv --format json
npx tsx src/cli.ts unmask "PAYPAL *GRUBHUB"
npx tsx src/cli.ts serve --mode standard
```

## Claude Desktop

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

Then:

```
Load data/amex-2024.csv
What are my subscriptions and monthly cost?
Unmask the PayPal and Square charges
Search for Uber over $20
```

After `load_statement`, later tools can omit `csvPath`.

## CSV

Required columns: `Date`, `Description`, `Amount`.

Charges may be negative or positive depending on the Amex download. Payments such as `ONLINE PAYMENT THANK YOU` are not spend.

## Modes

| Mode | Start | Tools |
|------|--------|------|
| basic | `AMEX_MCP_MODE=basic npm run dev` | load + original 6 |
| standard | `npm run dev` | load + 6 + unmask/search/trends/duplicates/compare |
| enhanced | `npm run dev:enhanced` | full catalog |

Resources after load: `amex://statement/summary`, `.../subscriptions`, `.../categories`, `.../anomalies`, `.../unmasked`.

Prompts: `review_subscriptions`, `find_waste`, `unmask_processors`, `monthly_review`.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| File not found | Path is relative to the server's cwd, not Claude's UI |
| No statement loaded | Call `load_statement` or pass `csvPath` |
| Payments in "spend" | Update to 3.0+; older versions used `Math.abs` |
| Tools missing | Confirm you launched standard vs enhanced |
