# Session-Based Amex Analysis Engine

Date: 2026-08-20  
Status: Approved for implementation (cloud-agent run: overall enhancement plan)

## Problem

The repo advertises a sophisticated MCP spending analyzer. The working product is much thinner, and several advertised paths do not work.

What is actually true today:

- Two MCP entry points (`amex-mcp-server.ts` and `amex-mcp-server-enhanced.ts`) with duplicated, inconsistent behavior.
- The enhanced server’s original six tools call `require('./amex-mcp-server.js').default`, but this is an ESM package and `AmexMcpServer` is not exported. Those tools cannot work.
- Enhanced tools read `analysis.vendors`, which is not on `SpendingAnalysis`. They silently fail or return empty results.
- Every tool re-parses the CSV from scratch. There is no session.
- `Math.abs(amount)` treats payments and refunds as spending.
- Unused-subscription logic uses `Date.now()`, so any historical statement looks abandoned.
- Fraud scoring treats ordinary prices (`99.99`, `199`) as suspicious and then **drops those vendors from totals**.
- Vendor normalization keeps only the first one or two words. Generic unmasker maps (`COFFEE` → “Local Coffee Shop”, `OF` → OnlyFans) invent merchants.
- Tests print to the console and always exit 0. They cannot catch regressions.
- README / cheatsheet document `amex-config.json`, env vars, date-range filters, charts, streaming, and CLI flags that do not exist.
- MCP SDK is `0.5.0` (tools only). No resources, no prompts, no structured results.

Adding more tools on top of this would make the product worse.

## Goal

Make this a local, agent-native **statement workspace**:

1. Load a CSV once.
2. Query it many times without re-parsing.
3. Return correct numbers (charges vs credits vs payments).
4. Expose a public analysis API that tools, CLI, and tests share.
5. Tell the truth in docs.

Privacy constraint stays: 100% local, stdio MCP, no network, no database.

## Approaches considered

### A. Keep bolting tools onto the two servers

Already failed. The 36-tool server is mostly unreachable from a working analysis object. Rejected.

### B. Session engine + correctness + one catalog (recommended)

Extract a real library. One MCP server, three tool modes (`basic` / `standard` / `enhanced`). Session cache keyed by resolved path + mtime. Fix parser/analysis bugs. Real tests. Honest docs. Stay on MCP TypeScript SDK **v1** (`@modelcontextprotocol/sdk` 1.x) so Claude Desktop and other current hosts keep working.

### C. Rewrite as a remote Cloudflare MCP with OAuth

Wrong for card statements. Breaks the local-only privacy promise. Rejected.

**Chosen:** Approach B.

Out of scope for this change: multi-issuer parsers (Chase/Citi), ML vendor ID, receipts, remote HTTP MCP, MCP SDK v2 (2026-07-28 spec; too new for typical desktop hosts).

## Architecture

```
CSV file
   │
   ▼
parser.ts ──► transactions (typed, signed, warnings)
   │
   ▼
unmasker.ts ──► merchant name + processor + confidence
   │
   ▼
analyzer.ts ──► vendors, recurring, subscriptions, anomalies
   │
   ├── session.ts  (load once, reuse by path+mtime)
   ├── exports.ts  (xlsx / csv / json)
   ├── format.ts   (agent-readable text)
   ├── cli.ts      (analyze / unmask / serve)
   └── server.ts   (MCP tools + resources + prompts)
```

Units and boundaries:

| Unit | Does | Depends on |
|------|------|------------|
| `parser` | Find header, parse dates/amounts, classify charge/credit/payment | `dates` |
| `unmasker` | Processor patterns + specific merchant maps only | none |
| `analyzer` | Group vendors, recurring, subscriptions, anomalies, insights | parser, unmasker |
| `session` | Cache one loaded statement; `ensure(csvPath?)` | analyzer |
| `tools` | Pure handlers that return text + structured data | session, format, exports |
| `server` | Register tools/resources/prompts for a mode | tools, session |
| `cli` | Non-interactive analyze / unmask / serve | analyzer, unmasker, server |

Root files become thin wrappers so existing Claude Desktop paths (`dist/amex-mcp-server.js`, `dist/amex-mcp-server-enhanced.js`) keep working.

## Analysis rules (explicit)

**Amounts.** Detect sign convention from non-payment rows (Amex exports both “charges negative” and “charges positive”). Normalize to:

- `direction: 'debit' | 'credit'`
- `kind: 'charge' | 'credit' | 'payment'`
- `amount`: always a positive magnitude

Payments never enter vendor spend. Credits reduce net spend and attach to the merchant when identifiable. `totalSpent` is charges only. Analysis includes every vendor; anomaly flags do not hide spend.

**Dates.** Parse `M/D/YYYY` and `YYYY-MM-DD` explicitly in UTC. Do not use locale `new Date("01/20/2024")`.

**Subscriptions.** Known service names, or (recurring interval + consistent amount). Generic words like `google` / `apple` are not enough. Unused = no charge within N days of **statement end**, not wall-clock now.

**Fraud / anomalies.** Keyword / scam-phrase and velocity signals only. Typical `.99` prices are not fraud. Do not exclude flagged vendors from totals.

**Unmasking.** Keep processor extractors. Map only specific merchant tokens (`GRUBHUB`, `DOORDASH`, `SUBSTACK`). Delete generic maps (`COFFEE`, `OF`). Add `PP*` (not only `PP*<digits>`).

**Normalization.** Strip legal suffixes and store numbers. Match company aliases by longest token. Do not truncate to the first two words.

**Parse hygiene.** Reset state on each load. Skip invalid rows. Record warnings (bad dates, skipped rows, detected convention). Ignore account-number columns.

## MCP surface

### Session

- `load_statement` (required `csvPath`) loads and caches.
- Every other tool accepts optional `csvPath`. If omitted, the last loaded statement is used. If none is loaded, return a clear error telling the model to call `load_statement`.

### Modes

- `basic`: `load_statement` + original 6 tools.
- `standard` (default): basic + unmask / search / trends / duplicates / compare periods. This is the agent-usable set.
- `enhanced`: documented 36-tool catalog, all wired to the public analysis API.

### Resources (after load)

- `amex://statement/summary`
- `amex://statement/subscriptions`
- `amex://statement/categories`
- `amex://statement/anomalies`
- `amex://statement/unmasked`

### Prompts

- `review_subscriptions`
- `find_waste`
- `unmask_processors`
- `monthly_review`

### Output

Tools return concise text the model can read, plus `structuredContent` for the same facts. No raw vendor-object dumps.

## CLI

Non-interactive, stdin-friendly, layered `--help`:

```
amex-analysis analyze <csv> [--format summary|json] [--out path]
amex-analysis unmask <description>
amex-analysis serve [--mode basic|standard|enhanced]
```

Missing file → exit 1 with the path tried. No prompts.

## Testing

Replace “print and exit 0” with `node:test` assertions:

- Parser: both sign conventions, payments excluded, preamble/header detection, bad dates skipped.
- Unmasker: PayPal/Square/Stripe/Toast/`PP*SPOTIFY`; no generic COFFEE map; direct merchants unchanged.
- Analyzer: Netflix-style recurring; unused relative to statement end; totals include flagged vendors; reset on re-parse.
- Session: second `ensure(same path)` does not re-read when mtime unchanged.

Keep `test-analyzer.ts` as a demo, not as the test suite.

## Compatibility

- Export `AmexSpendingAnalyzer` and `VendorUnmasker` from the root entry files.
- `npm run dev` → standard server.
- `npm run dev:enhanced` / `start:enhanced` → full catalog.
- Claude config paths unchanged after `npm run build`.

## Error handling

- Missing CSV: actionable path error.
- No session: tell the caller to `load_statement`.
- Tool failure: MCP `isError: true` with the message, not an uncaught throw that dies on stdio.
- Export: create parent directories; do not overwrite the source CSV.

## Docs

Rewrite README to match the implementation. Remove fictional config, streaming, and performance tables. Update cheatsheet, enhanced guide, changelog (3.0.0), and AGENTS.md test commands. Add the MIT LICENSE the README already claims.
