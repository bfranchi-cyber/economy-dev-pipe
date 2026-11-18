import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const engineDirectory = resolve(process.cwd(), 'src/engine');
const sourceDirectory = resolve(process.cwd(), 'src');

function findForbiddenImports(file: string, contents: string): string[] {
  const forbiddenImports =
    /(?:from\s*|import\s*\()\s*['"](?:[^'"]*\/src\/(?!engine\/)[^'"]*|node:)?(?:fs(?:\/promises)?|child_process|net)(?:['"]|\/)/;
  const relativeImports = [...contents.matchAll(/(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)];
  return relativeImports
    .map((match) => match[1])
    .filter((specifier): specifier is string => specifier !== undefined)
    .filter((specifier) => {
      if (forbiddenImports.test(`from '${specifier}'`)) return true;
      if (!specifier.startsWith('.')) return false;
      const importerPath = relative(sourceDirectory, file).replaceAll('\\', '/');
      const resolvedPath = resolve(file, '..', specifier).replaceAll('\\', '/');
      const enginePath = `${engineDirectory.replaceAll('\\', '/')}/`;
      const sourcePath = `${sourceDirectory.replaceAll('\\', '/')}/`;
      return (
        importerPath.startsWith('engine/') &&
        resolvedPath.startsWith(sourcePath) &&
        !resolvedPath.startsWith(enginePath)
      );
    });
}

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
  it('detects relative imports from another src folder while allowing engine and crypto imports', () => {
    const file = resolve(engineDirectory, 'decide.ts');
    const imports = `import { value } from '../tools/state.js';\nimport { StateSchema } from './schemas.js';\nimport { createHash } from 'node:crypto';`;

    expect(findForbiddenImports(file, imports)).toEqual(['../tools/state.js']);
  });

  it('imports only within engine and allows crypto but avoids I/O, clocks, and randomness', async () => {
    const files = await sourceFiles(engineDirectory);
    const violations: string[] = [];

    for (const file of files) {
      const contents = await readFile(file, 'utf8');
      const relativePath = relative(sourceDirectory, file);
      if (findForbiddenImports(file, contents).length > 0) {
        violations.push(`${relativePath}: forbidden import`);
      }
      if (/\bDate\b|\bMath\.random\s*\(/.test(contents)) {
        violations.push(`${relativePath}: forbidden clock or randomness`);
      }
    }

    expect(violations).toEqual([]);
  });
});
