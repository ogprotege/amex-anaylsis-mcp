# AGENTS.md

## Cursor Cloud specific instructions

This repo is a **TypeScript / Node.js MCP server** for Amex spending analysis with
vendor unmasking. There is no HTTP server and no database — it speaks the Model
Context Protocol over **stdio** and reads CSV files.

Dependencies (`npm install`) are installed automatically by the startup update
script, so you normally don't need to install anything to start working.

### Running / testing (commands live in `package.json` scripts)
- Self-contained tests (no external data needed): `npm test` (analyzer) and
  `npm run test-unmasking`. Both generate their own sample CSV.
- Type-check / compile: `npm run build` (uses `amex-mcp-tsconfig.json`, emits `dist/`).
- Dev server: `npm run dev` (runs `amex-mcp-server.ts` via `tsx`; `dev:enhanced` for
  the enhanced server). Use the `:enhanced` variants for the extra toolset.

### Non-obvious notes
- The server communicates over **stdio**, so "running" it just blocks waiting for
  JSON-RPC on stdin. To smoke-test it without an MCP client, pipe a newline-delimited
  `initialize` + `notifications/initialized` + `tools/list` JSON-RPC sequence into
  `npx tsx amex-mcp-server.ts` and read the responses from stdout.
- Generated `data/` (input CSVs) and `output/` (xlsx exports) are gitignored; the test
  scripts create them on demand.
- `npm audit` reports some advisories from transitive deps; they do not affect dev/test.
