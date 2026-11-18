import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { repoId } from '../../src/workspace/repo-id.js';

describe('repoId', () => {
  it('hashes the normalized git common directory realpath', async () => {
    const result = await repoId(async () => 'C:\\Work\\Repo\\.git', { platform: 'win32' });
    const normalizedPath = 'c:/work/repo/.git';
    const expected = createHash('sha256').update(normalizedPath).digest('hex').slice(0, 16);

    expect(result).toBe(expected);
  });

  it('normalizes separators without changing case on POSIX', async () => {
    const result = await repoId(async () => '/work/repo/.git', { platform: 'linux' });
    const expected = createHash('sha256').update('/work/repo/.git').digest('hex').slice(0, 16);

    expect(result).toBe(expected);
  });

  it('uses the resolved realpath from the injected git-common-dir lookup', async () => {
    let called = false;
    const result = await repoId(
      async () => {
        called = true;
        return '/physical/repo/.git';
      },
      { platform: 'linux' },
    );

    expect(called).toBe(true);
    expect(result).toMatch(/^[a-f0-9]{16}$/);
  });
});
