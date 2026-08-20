# Changelog

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-08-20

### Added
- Session cache: `load_statement` plus optional `csvPath` on every other tool
- MCP resources (`amex://statement/summary`, subscriptions, categories, anomalies, unmasked) and prompts
- CLI: `analyze`, `unmask`, `serve` with `--help` and no prompts
- Public analysis API: charges vs credits vs payments, `vendors` on the result object
- Real `node:test` suite for parser, unmasker, analyzer, session, CLI, and tool catalog
- MIT LICENSE file

### Changed
- One analysis engine shared by the basic, standard, and enhanced MCP entry points
- MCP TypeScript SDK upgraded from 0.5.0 to 1.x (`McpServer`, resources, prompts)
- Subscription "unused" checks use the statement end date, not the wall clock
- Vendor unmasking maps only specific merchants (no more `COFFEE` → "Local Coffee Shop")
- `PP*` descriptors such as `PP*SPOTIFY` unmask correctly
- Docs rewritten to match the implementation

### Fixed
- Enhanced server no longer `require()`s a non-existent default export
- Enhanced tools no longer read a missing `analysis.vendors` field
- Payments and refunds are no longer counted as spend via `Math.abs`
- Dates parse as `M/D/YYYY` / `YYYY-MM-DD` in UTC instead of locale `new Date(string)`
- Re-parsing a file resets vendor state
- Fraud-like flags no longer remove vendors from totals
- `npm run build:enhanced` compiles the same project as `npm run build`

## [2.0.1] - 2025-01-15

### Fixed
- Repository URL references
- MCP server only starts when the file is executed directly
- Stripe `STR*` / `STRIPE` patterns

### Added
- `test-unmasking.ts` demo script

## [2.0.0] - 2024-01-15

### Added
- Vendor unmasking engine
- TypeScript implementation
- Excel sheets for obscured vendors

## [1.5.0] - 2023-12-01

### Added
- First MCP integration for Claude Desktop

## [1.0.0] - 2023-10-15

### Added
- Initial CSV parsing, vendor totals, and Excel export
