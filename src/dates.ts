const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function parseDate(input: unknown): Date | null {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return utcDate(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate());
  }
  if (typeof input === 'number' && Number.isFinite(input)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    if (input > 20000 && input < 80000) {
      return new Date(excelEpoch.getTime() + input * MS_PER_DAY);
    }
  }

  const raw = String(input ?? '').trim();
  if (!raw) return null;

  const mdy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (mdy) {
    return utcDate(Number(mdy[3]), Number(mdy[1]), Number(mdy[2]));
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) {
    return utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return utcDate(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
}

export function utcDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function formatDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDateLong(date: Date): string {
  return formatDate(date);
}

export function daysBetween(a: Date | undefined, b: Date | undefined): number {
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function startOfDay(date: Date): Date {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())!;
}
