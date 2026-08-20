# Tool catalog

The extra tools that used to live only as a wish list are implemented against the public analysis API.

- **Standard mode** (`npm run dev`): `load_statement`, the original six tools, plus unmask / search / trends / duplicates / compare periods.
- **Enhanced mode** (`npm run dev:enhanced`): the full list in [ENHANCED_SERVER_GUIDE.md](ENHANCED_SERVER_GUIDE.md).

Handlers live in `src/tools.ts`. They share `AnalysisSession` so a CSV is parsed once per path+mtime.

If you add a tool:

1. Append a `ToolDef` in `src/tools.ts` with `modes` set to the catalogs that should see it.
2. Keep `csvPath` optional and call `ctx.session.ensure(args.csvPath)`.
3. Return short text plus `structuredContent`.
4. Add a catalog assertion in `tests/tools.test.ts` if the tool is part of a documented mode.
