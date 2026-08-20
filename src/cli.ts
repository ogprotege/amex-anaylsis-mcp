#!/usr/bin/env node
import { AmexSpendingAnalyzer } from './analyzer.js';
import { formatSummary } from './format.js';
import { resolveExistingFile, resolveOutputPath } from './paths.js';
import { parseMode, startServer } from './server.js';
import { VendorUnmasker } from './unmasker.js';
import { exportToCsv, exportToExcel, exportToJson, serializeAnalysis } from './exports.js';

const HELP = `amex-analysis — local American Express statement analysis

USAGE
  amex-analysis <command> [args] [flags]

COMMANDS
  analyze <csv>     Parse a statement and print a summary
  unmask <text>     Unmask one processor descriptor (no file needed)
  serve             Start the MCP server on stdio
  help              Show this help

FLAGS
  --format summary|json|excel|csv   analyze output (default: summary)
  --out <path>                      write analyze export to this path
  --mode basic|standard|enhanced    MCP tool catalog for serve (default: standard)
  --help, -h                        show help and exit 0

EXAMPLES
  amex-analysis analyze data/amex.csv
  amex-analysis analyze data/amex.csv --format json
  amex-analysis analyze data/amex.csv --format excel --out output/report.xlsx
  amex-analysis unmask "PAYPAL *GRUBHUB"
  amex-analysis serve --mode enhanced

Exit 1 on missing files, bad flags, or analysis errors. Never prompts.
`;

async function main(argv: string[]): Promise<void> {
  const { command, positionals, flags } = parseArgs(argv);

  if (!command || command === 'help' || flags.help) {
    writeOut(HELP);
    return;
  }

  switch (command) {
    case 'analyze':
      await runAnalyze(positionals[0], flags);
      return;
    case 'unmask':
      runUnmask(positionals.join(' ').trim());
      return;
    case 'serve':
      await startServer(parseMode(stringFlag(flags.mode)));
      return;
    default:
      throw new Error(`Unknown command "${command}". Try amex-analysis --help.`);
  }
}

async function runAnalyze(csvPath: string | undefined, flags: Record<string, string | boolean>): Promise<void> {
  if (!csvPath) throw new Error('analyze requires a CSV path. Example: amex-analysis analyze data/amex.csv');
  const resolved = await resolveExistingFile(csvPath);
  const analyzer = new AmexSpendingAnalyzer();
  await analyzer.parseAmexCsv(resolved);
  const analysis = analyzer.analyze();
  const format = stringFlag(flags.format) ?? 'summary';

  if (format === 'summary') {
    writeOut(formatSummary(analysis));
    return;
  }
  if (format === 'json' && !flags.out) {
    writeOut(JSON.stringify(serializeAnalysis(analysis), null, 2));
    return;
  }

  if (!['json', 'excel', 'csv'].includes(format)) {
    throw new Error(`Unknown --format ${format}. Use summary, json, excel, or csv.`);
  }

  const ext = format === 'excel' ? 'xlsx' : format;
  const outputPath = await resolveOutputPath(stringFlag(flags.out) ?? `output/${baseName(resolved)}-analysis.${ext}`, resolved);
  if (format === 'excel') await exportToExcel(analysis, outputPath);
  if (format === 'csv') await exportToCsv(analysis, outputPath);
  if (format === 'json') await exportToJson(analysis, outputPath);
  writeOut(`Wrote ${format} to ${outputPath}`);
}

function runUnmask(description: string): void {
  if (!description) throw new Error('unmask requires a descriptor. Example: amex-analysis unmask "PAYPAL *GRUBHUB"');
  const result = new VendorUnmasker().unmaskVendor(description);
  writeOut(
    [
      description,
      `Vendor: ${result.extractedVendor}`,
      `Processor: ${result.processor}`,
      `Confidence: ${Math.round(result.confidence * 100)}%`,
      result.metadata.needsManualReview ? 'Needs review: yes' : 'Needs review: no',
    ].join('\n')
  );
}

function parseArgs(argv: string[]): {
  command?: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
} {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  let command: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      flags.help = true;
      continue;
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
      continue;
    }
    if (!command) {
      command = arg;
    } else {
      positionals.push(arg);
    }
  }

  return { command, positionals, flags };
}

function stringFlag(value: string | boolean | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function baseName(filePath: string): string {
  return filePath.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '');
}

function writeOut(text: string): void {
  process.stdout.write(`${text.trimEnd()}\n`);
}

const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirect || process.argv[1]?.endsWith('cli.ts') || process.argv[1]?.endsWith('cli.js')) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exitCode = 1;
  });
}

export { main as runCli };
