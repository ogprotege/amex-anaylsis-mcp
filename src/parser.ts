import * as fs from 'fs/promises';
import Papa from 'papaparse';
import { parseDate } from './dates.js';
import type {
  AmexTransaction,
  ParseResult,
  ParseWarning,
  SignConvention,
  TransactionKind,
} from './types.js';

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['date', 'transaction date', 'posted date', 'trans date'],
  description: ['description', 'merchant name', 'merchant', 'name'],
  amount: ['amount', 'charge amount', 'transaction amount'],
  extendedDetails: ['extended details', 'additional info', 'extended details'],
  appearsOnStatementAs: ['appears on your statement as', 'statement description', 'appears on statement as'],
  address: ['address'],
  city: ['city/town', 'city'],
  state: ['state/province', 'state'],
  cityState: ['city/state', 'city / state'],
  zipCode: ['zip code', 'postal code', 'zip'],
  country: ['country'],
  reference: ['reference', 'transaction id', 'ref #'],
  category: ['category'],
  cardMember: ['card member', 'account name', 'cardmember'],
};

const PAYMENT_PATTERN =
  /\b(online payment|payment thank you|payment received|mobile payment|autopay|auto pay|ach payment|payment - thank you)\b/i;
const CREDIT_PATTERN =
  /\b(credit|refund|reversal|return|adjustment|cashback|cash back|statement credit)\b/i;

export async function parseAmexCsvFile(filePath: string): Promise<ParseResult> {
  const fileContent = await fs.readFile(filePath, 'utf-8');
  return parseAmexCsvContent(fileContent, filePath);
}

export function parseAmexCsvContent(fileContent: string, sourceName = 'csv'): ParseResult {
  const text = stripBom(fileContent);
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
    beforeFirstChunk: (chunk) => dropPreamble(chunk),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    const first = parsed.errors[0];
    throw new Error(`Could not parse CSV: ${first?.message ?? 'unknown parse error'}`);
  }

  const warnings: ParseWarning[] = [];
  const rawRows = parsed.data.filter((row) => row && typeof row === 'object');
  const fieldMap = mapFields(parsed.meta.fields ?? Object.keys(rawRows[0] ?? {}));

  if (!fieldMap.date || !fieldMap.description || !fieldMap.amount) {
    throw new Error(
      'CSV is missing required columns. Need Date, Description, and Amount (Amex activity export).'
    );
  }

  const signedSamples: number[] = [];
  for (const row of rawRows) {
    const description = readField(row, fieldMap.description);
    const amount = parseAmount(readField(row, fieldMap.amount));
    if (amount === null || isPaymentDescription(description)) continue;
    signedSamples.push(amount);
  }

  const signConvention = detectSignConvention(signedSamples);
  const transactions: AmexTransaction[] = [];
  let skippedRows = 0;

  rawRows.forEach((row, index) => {
    const rowNumber = index + 2;
    const parsedRow = parseRow(row, fieldMap, signConvention, rowNumber);
    if ('warning' in parsedRow) {
      skippedRows += 1;
      warnings.push({ rowNumber, message: parsedRow.warning });
      return;
    }
    transactions.push(parsedRow);
  });

  if (transactions.length === 0) {
    throw new Error(`No valid transactions found in ${sourceName}.`);
  }

  warnings.unshift({
    rowNumber: 0,
    message: `Detected ${signConvention} (${signedSamples.length} signed non-payment samples).`,
  });

  return {
    transactions,
    skippedRows,
    warnings,
    signConvention,
    sourceName,
  };
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function dropPreamble(chunk: string): string {
  const lines = chunk.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => {
    const lower = line.toLowerCase();
    return (
      (lower.includes('date') || lower.includes('transaction date')) &&
      lower.includes('description') &&
      lower.includes('amount')
    );
  });
  if (headerIndex <= 0) return chunk;
  return lines.slice(headerIndex).join('\n');
}

function mapFields(headers: string[]): Record<string, string | undefined> {
  const mapped: Record<string, string | undefined> = {};
  const normalized = headers.map((header) => ({
    original: header,
    key: header.toLowerCase().replace(/[_]+/g, ' ').trim(),
  }));

  for (const [logical, aliases] of Object.entries(HEADER_ALIASES)) {
    const match = normalized.find((header) => aliases.includes(header.key));
    mapped[logical] = match?.original;
  }

  return mapped;
}

function readField(row: Record<string, unknown>, header?: string): string {
  if (!header) return '';
  const value = row[header];
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, '').replace(/^\((.+)\)$/, '-$1');
  if (!cleaned || cleaned === '-') return null;
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? amount : null;
}

function isPaymentDescription(description: string): boolean {
  return PAYMENT_PATTERN.test(description);
}

function detectSignConvention(samples: number[]): SignConvention {
  const negatives = samples.filter((value) => value < 0).length;
  const positives = samples.filter((value) => value > 0).length;
  return negatives > positives ? 'negative-charges' : 'positive-charges';
}

function parseRow(
  row: Record<string, unknown>,
  fieldMap: Record<string, string | undefined>,
  signConvention: SignConvention,
  rowNumber: number
): AmexTransaction | { warning: string } {
  const date = parseDate(readField(row, fieldMap.date));
  if (!date) return { warning: `Unparseable date: ${readField(row, fieldMap.date) || '(empty)'}` };

  const description = readField(row, fieldMap.description);
  if (!description) return { warning: 'Missing description' };

  const rawAmount = parseAmount(readField(row, fieldMap.amount));
  if (rawAmount === null) return { warning: `Unparseable amount: ${readField(row, fieldMap.amount) || '(empty)'}` };
  if (rawAmount === 0) return { warning: 'Zero-amount row skipped' };

  const { kind, direction } = classifyAmount(description, rawAmount, signConvention);
  const cityState = readField(row, fieldMap.cityState);
  const [splitCity, splitState] = splitCityState(cityState);

  return {
    date,
    description,
    amount: Math.abs(rawAmount),
    direction,
    kind,
    rawAmount,
    extendedDetails: emptyToUndef(readField(row, fieldMap.extendedDetails)),
    appearsOnStatementAs: emptyToUndef(readField(row, fieldMap.appearsOnStatementAs)),
    address: emptyToUndef(readField(row, fieldMap.address)),
    city: emptyToUndef(readField(row, fieldMap.city)) ?? splitCity,
    state: emptyToUndef(readField(row, fieldMap.state)) ?? splitState,
    zipCode: emptyToUndef(readField(row, fieldMap.zipCode)),
    country: emptyToUndef(readField(row, fieldMap.country)),
    reference: emptyToUndef(readField(row, fieldMap.reference)),
    category: emptyToUndef(readField(row, fieldMap.category)),
    cardMember: emptyToUndef(readField(row, fieldMap.cardMember)),
    rowNumber,
  };
}

function classifyAmount(
  description: string,
  rawAmount: number,
  signConvention: SignConvention
): { kind: TransactionKind; direction: 'debit' | 'credit' } {
  const chargeIsNegative = signConvention === 'negative-charges';
  const looksLikeCharge = chargeIsNegative ? rawAmount < 0 : rawAmount > 0;

  if (isPaymentDescription(description)) {
    return { kind: 'payment', direction: 'credit' };
  }
  if (!looksLikeCharge || CREDIT_PATTERN.test(description)) {
    return { kind: 'credit', direction: 'credit' };
  }
  return { kind: 'charge', direction: 'debit' };
}

function splitCityState(value: string): [string | undefined, string | undefined] {
  if (!value) return [undefined, undefined];
  const match = value.match(/^(.*?)[,\s]+([A-Z]{2})$/);
  if (match) return [match[1]!.trim() || undefined, match[2]];
  return [value, undefined];
}

function emptyToUndef(value: string): string | undefined {
  return value ? value : undefined;
}
