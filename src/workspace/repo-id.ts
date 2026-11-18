import { createHash } from 'node:crypto';

export type GitCommonDirLookup = () => Promise<string>;

export interface RepoIdOptions {
  platform?: NodeJS.Platform;
}

export async function repoId(
  gitCommonDir: GitCommonDirLookup,
  options: RepoIdOptions = {},
): Promise<string> {
  const realPath = await gitCommonDir();
  const normalized = realPath.replace(/\\/g, '/');
  const canonical =
    (options.platform ?? process.platform) === 'win32' ? normalized.toLowerCase() : normalized;
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}
