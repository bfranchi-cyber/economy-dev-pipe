import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const engineDirectory = resolve(process.cwd(), 'src/engine');
const sourceDirectory = resolve(process.cwd(), 'src');

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.ts') ? [entryPath] : [];
    }),
  );
  return nestedFiles.flat();
}

describe('engine purity', () => {
  it('imports only within engine and avoids I/O, clocks, and randomness', async () => {
    const files = await sourceFiles(engineDirectory);
    const violations: string[] = [];
    const forbiddenImports =
      /(?:from\s*|import\s*\()\s*['"](?:[^'"]*\/src\/(?!engine\/)[^'"]*|node:)?(?:fs(?:\/promises)?|child_process|net)(?:['"]|\/)/;

    for (const file of files) {
      const contents = await readFile(file, 'utf8');
      const relativePath = relative(sourceDirectory, file);
      if (forbiddenImports.test(contents)) violations.push(`${relativePath}: forbidden import`);
      if (/\bDate\b|\bMath\.random\s*\(/.test(contents)) {
        violations.push(`${relativePath}: forbidden clock or randomness`);
      }
    }

    expect(violations).toEqual([]);
  });
});
