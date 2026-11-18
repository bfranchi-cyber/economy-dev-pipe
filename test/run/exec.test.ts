import { describe, expect, it } from 'vitest';
import { exec } from '../../src/run/exec.js';
import { createEnvProfile } from '../../src/run/env-profiles.js';

describe('run.exec', () => {
  it('runs a Node child without a shell and captures its output', async () => {
    const result = await exec([process.execPath, '-e', 'process.stdout.write("safe")'], {
      cwd: process.cwd(),
      timeoutMs: 5_000,
      envProfile: 'repo-code',
    });

    expect(result).toEqual({
      timedOut: false,
      exitCode: 0,
      stdout: 'safe',
      stderr: '',
    });
  });

  it('keeps argv boundaries instead of shell-interpreting metacharacters', async () => {
    const value = 'one & two';
    const result = await exec(
      [process.execPath, '-e', 'process.stdout.write(process.argv[1])', value],
      { cwd: process.cwd(), timeoutMs: 5_000, envProfile: 'repo-code' },
    );

    expect(result).toMatchObject({ timedOut: false, exitCode: 0, stdout: value });
  });

  it('returns a timeout result after terminating the child process tree', async () => {
    const result = await exec(
      [process.execPath, '-e', 'setTimeout(() => process.exit(0), 30_000)'],
      { cwd: process.cwd(), timeoutMs: 100, envProfile: 'repo-code' },
    );

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  it('filters secrets from repo-code and git environment profiles', () => {
    const processEnvironment = {
      PATH: 'path-value',
      JIRA_API_TOKEN: 'jira-secret',
      GITHUB_TOKEN: 'github-secret',
      SAFE_VALUE: 'visible',
    };
    const repoEnv = createEnvProfile('repo-code', {
      environment: processEnvironment,
      platform: 'win32',
    });
    const gitEnv = createEnvProfile('git', { environment: processEnvironment, platform: 'win32' });

    expect(repoEnv).toEqual({ PATH: 'path-value' });
    expect(gitEnv).toEqual({ PATH: 'path-value', SAFE_VALUE: 'visible' });
  });

  it('preserves non-secret environment values in the git profile', () => {
    const environment = { PATH: 'path-value', USERNAME: 'developer', GITHUB_TOKEN: 'secret' };

    expect(createEnvProfile('git', { environment, platform: 'linux' })).toEqual({
      PATH: 'path-value',
      USERNAME: 'developer',
    });
  });

  it('removes config-listed secrets from the git environment profile', () => {
    const environment = {
      PATH: 'path-value',
      CUSTOM_SECRET: 'configured-secret',
      JIRA_API_TOKEN: 'jira-secret',
    };

    expect(
      createEnvProfile('git', {
        environment,
        platform: 'linux',
        configuredSecretKeys: ['CUSTOM_SECRET'],
      }),
    ).toEqual({ PATH: 'path-value' });
  });

  it('limits repo-code variables to the platform allowlist and configured values', () => {
    const environment = {
      PATH: 'path-value',
      PATHEXT: '.EXE',
      SystemRoot: 'C:\\Windows',
      ComSpec: 'C:\\Windows\\system32\\cmd.exe',
      TEMP: 'C:\\Temp',
      TMP: 'C:\\Temp',
      USERPROFILE: 'real-user-profile',
      APPDATA: 'real-app-data',
      LOCALAPPDATA: 'real-local-data',
      SAFE_VALUE: 'not-allowed',
    };

    expect(
      createEnvProfile('repo-code', {
        environment,
        platform: 'win32',
        configured: { FEATURE_FLAG: 'enabled', GITHUB_TOKEN: 'must-not-pass' },
        scratch: {
          USERPROFILE: 'scratch-profile',
          APPDATA: 'scratch-appdata',
          LOCALAPPDATA: 'scratch-localdata',
        },
      }),
    ).toEqual({
      PATH: 'path-value',
      PATHEXT: '.EXE',
      SystemRoot: 'C:\\Windows',
      ComSpec: 'C:\\Windows\\system32\\cmd.exe',
      TEMP: 'C:\\Temp',
      TMP: 'C:\\Temp',
      USERPROFILE: 'scratch-profile',
      APPDATA: 'scratch-appdata',
      LOCALAPPDATA: 'scratch-localdata',
      FEATURE_FLAG: 'enabled',
    });
  });
});
