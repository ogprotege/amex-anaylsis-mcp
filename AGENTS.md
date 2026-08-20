# AGENTS.md

## Cursor Cloud specific instructions

This repo is a **TypeScript / Node.js MCP server** for Amex spending analysis with
vendor unmasking. There is no HTTP server and no database — it speaks the Model
Context Protocol over **stdio** and reads CSV files.

Dependencies (`npm install`) are installed automatically by the startup update
script, so you normally don't need to install anything to start working.

### Running / testing (commands live in `package.json` scripts)
- Tests (no personal data needed): `npm test`. Unmasking only: `npm run test-unmasking`.
- Demo that writes `data/test-amex.csv` and `output/test-analysis.xlsx`: `npm run demo`.
- Type-check / compile: `npm run build` (uses `amex-mcp-tsconfig.json`, emits `dist/`).
- Dev server: `npm run dev` (standard toolset via `tsx`). `npm run dev:enhanced` for the full catalog. `npm run dev:basic` for the original six tools plus `load_statement`.
- CLI: `npx tsx src/cli.ts --help`.

### Non-obvious notes
- The server communicates over **stdio**, so "running" it just blocks waiting for
  JSON-RPC on stdin. To smoke-test it without an MCP client, pipe a newline-delimited
  `initialize` + `notifications/initialized` + `tools/list` JSON-RPC sequence into
  `npx tsx amex-mcp-server.ts` and read the responses from stdout.
- Analysis code lives in `src/`. Root `amex-mcp-server.ts` / `amex-mcp-server-enhanced.ts` are entry wrappers.
- Generated `data/*.csv` and `output/` exports are gitignored; tests use in-memory fixtures.
- `npm audit` reports some advisories from transitive deps; they do not affect dev/test.
