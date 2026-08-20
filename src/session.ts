import * as fs from 'fs/promises';
import { AmexSpendingAnalyzer } from './analyzer.js';
import { parseDate } from './dates.js';
import { resolveExistingFile } from './paths.js';
import type { AnalyzeOptions, SpendingAnalysis } from './types.js';

export interface LoadedStatement {
  path: string;
  mtimeMs: number;
  analyzer: AmexSpendingAnalyzer;
  analysis: SpendingAnalysis;
}

export class AnalysisSession {
  private loaded: LoadedStatement | null = null;

  hasLoaded(): boolean {
    return this.loaded !== null;
  }

  current(): LoadedStatement {
    if (!this.loaded) {
      throw new Error('No statement loaded. Call load_statement with csvPath first, or pass csvPath to this tool.');
    }
    return this.loaded;
  }

  async load(csvPath: string, options?: AnalyzeOptions): Promise<LoadedStatement> {
    const resolved = await resolveExistingFile(csvPath);
    const stat = await fs.stat(resolved);
    if (this.loaded && this.loaded.path === resolved && this.loaded.mtimeMs === stat.mtimeMs) {
      return this.loaded;
    }

    const analyzer = new AmexSpendingAnalyzer();
    await analyzer.parseAmexCsv(resolved);
    this.loaded = {
      path: resolved,
      mtimeMs: stat.mtimeMs,
      analyzer,
      analysis: analyzer.analyze(options),
    };
    return this.loaded;
  }

  async ensure(csvPath?: string, options?: AnalyzeOptions): Promise<LoadedStatement> {
    if (csvPath) return this.load(csvPath, options);
    return this.current();
  }

  analyzeCurrent(options?: AnalyzeOptions): SpendingAnalysis {
    return this.current().analyzer.analyze(options);
  }
}

export function parseOptionalDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = parseDate(value);
  if (!parsed) throw new Error(`Invalid date: ${value}. Use YYYY-MM-DD or MM/DD/YYYY.`);
  return parsed;
}
