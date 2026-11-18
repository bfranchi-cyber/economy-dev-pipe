import { mkdir, open, readFile, stat, unlink, utimes } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface LockClock {
  now(): number;
  setInterval(
    callback: () => void | Promise<void>,
    milliseconds: number,
  ): ReturnType<typeof setInterval>;
  clearInterval(timer: ReturnType<typeof setInterval>): void;
  sleep(milliseconds: number): Promise<void>;
}

export interface LockOptions {
  clock?: LockClock;
  retryIntervalMs?: number;
  startupWaitMs?: number;
  staleAfterMs?: number;
}

export interface RepoLock {
  release(): Promise<void>;
}

export class LockHeldError extends Error {
  readonly code = 'E_LOCK_HELD';

  constructor(
    readonly holderPid: number | undefined,
    lockPath: string,
  ) {
    const holder = holderPid === undefined ? 'unknown process' : `process ${holderPid}`;
    super(`Repository lock at ${lockPath} is held by ${holder}.`);
    this.name = 'LockHeldError';
  }
}

const systemClock: LockClock = {
  now: () => Date.now(),
  setInterval: (callback, milliseconds) => setInterval(() => void callback(), milliseconds),
  clearInterval: (timer) => clearInterval(timer),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

const WAIT_INTERVAL_MS = 100;
const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_LOCK_AFTER_MS = 90_000;
const STARTUP_WAIT_MS = 10_000;

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function isMissingFile(error: unknown): boolean {
  return hasErrorCode(error, 'ENOENT');
}

function isLockAlreadyExists(error: unknown): boolean {
  return hasErrorCode(error, 'EEXIST');
}

async function holderPid(lockPath: string): Promise<number | undefined> {
  try {
    const contents = await readFile(lockPath, 'utf8');
    const match = /^pid:\s*(\d+)\s*$/m.exec(contents);
    return match ? Number(match[1]) : undefined;
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
}

async function removeIfStale(
  lockPath: string,
  staleAfterMs: number,
  now: number,
): Promise<boolean> {
  try {
    const details = await stat(lockPath);
    if (now - details.mtimeMs <= staleAfterMs) return false;
    await unlink(lockPath);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return true;
    throw error;
  }
}

async function createLock(lockPath: string): Promise<boolean> {
  await mkdir(dirname(lockPath), { recursive: true });
  try {
    const handle = await open(lockPath, 'wx');
    try {
      await handle.writeFile(`pid: ${process.pid}\n`, 'utf8');
    } finally {
      await handle.close();
    }
    return true;
  } catch (error) {
    if (isLockAlreadyExists(error)) return false;
    throw error;
  }
}

export async function acquireRepoLock(
  lockPath: string,
  options: LockOptions = {},
): Promise<RepoLock> {
  const clock = options.clock ?? systemClock;
  const retryIntervalMs = options.retryIntervalMs ?? WAIT_INTERVAL_MS;
  const startupWaitMs = options.startupWaitMs ?? STARTUP_WAIT_MS;
  const staleAfterMs = options.staleAfterMs ?? STALE_LOCK_AFTER_MS;
  const deadline = clock.now() + startupWaitMs;

  for (;;) {
    if (await createLock(lockPath)) break;
    if (await removeIfStale(lockPath, staleAfterMs, clock.now())) continue;
    if (clock.now() >= deadline) throw new LockHeldError(await holderPid(lockPath), lockPath);
    await clock.sleep(Math.min(retryIntervalMs, deadline - clock.now()));
  }

  const heartbeat = clock.setInterval(async () => {
    const now = new Date(clock.now());
    try {
      await utimes(lockPath, now, now);
    } catch (error) {
      if (isMissingFile(error)) return;
      throw error;
    }
  }, HEARTBEAT_INTERVAL_MS);
  let released = false;
  return {
    async release(): Promise<void> {
      if (released) return;
      released = true;
      clock.clearInterval(heartbeat);
      await unlink(lockPath);
    },
  };
}
