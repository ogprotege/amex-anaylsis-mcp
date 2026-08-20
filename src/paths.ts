import * as fs from 'fs/promises';
import * as path from 'path';

export async function resolveExistingFile(input: string): Promise<string> {
  if (!input || !input.trim()) {
    throw new Error('A file path is required.');
  }

  const resolved = path.resolve(process.cwd(), input.trim());
  let stat;
  try {
    stat = await fs.stat(resolved);
  } catch {
    throw new Error(`File not found: ${input} (resolved ${resolved})`);
  }

  if (!stat.isFile()) {
    throw new Error(`Not a file: ${resolved}`);
  }

  return resolved;
}

export async function resolveOutputPath(input: string, sourcePath?: string): Promise<string> {
  if (!input || !input.trim()) {
    throw new Error('An output path is required.');
  }

  const resolved = path.resolve(process.cwd(), input.trim());
  if (sourcePath && path.resolve(sourcePath) === resolved) {
    throw new Error(`Refusing to overwrite the source CSV: ${resolved}`);
  }

  await fs.mkdir(path.dirname(resolved), { recursive: true });
  return resolved;
}

export function defaultOutputPath(sourcePath: string, extension: string): string {
  const base = path.basename(sourcePath, path.extname(sourcePath));
  return path.resolve(process.cwd(), 'output', `${base}-analysis.${extension}`);
}
