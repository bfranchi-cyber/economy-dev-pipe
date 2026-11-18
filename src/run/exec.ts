import { execa } from 'execa';
import { createEnvProfile, type EnvProfile, type Environment } from './env-profiles.js';

export interface ExecOptions {
  cwd: string;
  timeoutMs: number;
  envProfile: EnvProfile;
  env?: Environment;
  configuredEnv?: Environment;
  scratchEnv?: Environment;
  configuredSecretKeys?: readonly string[];
  platform?: NodeJS.Platform;
}

export interface ExecResult {
  timedOut: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export async function exec(
  argv: readonly [string, ...string[]],
  options: ExecOptions,
): Promise<ExecResult> {
  const [command, ...arguments_] = argv;
  const child = execa(command, arguments_, {
    cwd: options.cwd,
    timeout: options.timeoutMs,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: createEnvProfile(options.envProfile, {
      environment: options.env ?? process.env,
      platform: options.platform,
      configured: options.configuredEnv,
      scratch: options.scratchEnv,
      configuredSecretKeys: options.configuredSecretKeys,
    }),
    extendEnv: false,
    killDescendants: true,
    reject: false,
  });
  const result = await child;

  return {
    timedOut: result.timedOut,
    exitCode: result.exitCode ?? null,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
