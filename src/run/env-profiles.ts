export type EnvProfile = 'repo-code' | 'git';
export type Environment = Record<string, string | undefined>;

const SECRET_KEYS = new Set(['GITHUB_TOKEN']);
const WINDOWS_SCRATCH_KEYS = ['USERPROFILE', 'APPDATA', 'LOCALAPPDATA'] as const;
const POSIX_SCRATCH_KEYS = ['HOME', 'TMPDIR'] as const;
const WINDOWS_REPO_CODE_KEYS = ['PATH', 'PATHEXT', 'SystemRoot', 'ComSpec', 'TEMP', 'TMP'] as const;
const POSIX_REPO_CODE_KEYS = ['PATH'] as const;

const REPO_CODE_ALLOWLIST: Record<NodeJS.Platform, readonly string[]> = {
  aix: POSIX_REPO_CODE_KEYS,
  android: POSIX_REPO_CODE_KEYS,
  darwin: POSIX_REPO_CODE_KEYS,
  freebsd: POSIX_REPO_CODE_KEYS,
  haiku: POSIX_REPO_CODE_KEYS,
  linux: POSIX_REPO_CODE_KEYS,
  openbsd: POSIX_REPO_CODE_KEYS,
  sunos: POSIX_REPO_CODE_KEYS,
  win32: WINDOWS_REPO_CODE_KEYS,
  cygwin: POSIX_REPO_CODE_KEYS,
  netbsd: POSIX_REPO_CODE_KEYS,
};

function isSecretKey(key: string): boolean {
  return key.startsWith('JIRA_') || SECRET_KEYS.has(key);
}

function presentValues(keys: Iterable<string>, environment: Environment): Environment {
  const result: Environment = {};
  for (const key of keys) {
    const value = environment[key];
    if (value !== undefined && !isSecretKey(key)) result[key] = value;
  }
  return result;
}

export interface EnvProfileOptions {
  environment?: Environment;
  platform?: NodeJS.Platform;
  configured?: Environment;
  scratch?: Environment;
  configuredSecretKeys?: readonly string[];
}

export function createEnvProfile(
  profile: EnvProfile,
  options: EnvProfileOptions = {},
): Environment {
  const environment = options.environment ?? process.env;
  const platform = options.platform ?? process.platform;
  const configured = options.configured ?? {};
  const scratch = options.scratch ?? {};
  const configuredSecretKeys = options.configuredSecretKeys ?? [];
  if (profile === 'git') {
    const secrets = new Set([...SECRET_KEYS, ...configuredSecretKeys]);
    return presentValues(
      Object.keys(environment).filter((key) => !key.startsWith('JIRA_') && !secrets.has(key)),
      environment,
    );
  }

  const platformKeys = REPO_CODE_ALLOWLIST[platform] ?? [];
  const scratchKeys = platform === 'win32' ? WINDOWS_SCRATCH_KEYS : POSIX_SCRATCH_KEYS;
  const allowedValues = {
    ...presentValues(platformKeys, environment),
    ...presentValues(scratchKeys, scratch),
    ...presentValues(Object.keys(configured), configured),
  };
  return allowedValues;
}
