import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireRepoLock, type LockClock } from '../../src/store/lock.js';

class FakeClock implements LockClock {
  private currentTime = Date.now();
  private readonly timers = new Set<() => void | Promise<void>>();

  now(): number {
    return this.currentTime;
  }

  setInterval(
    callback: () => void | Promise<void>,
    milliseconds: number,
  ): ReturnType<typeof setInterval> {
    expect(milliseconds).toBe(30_000);
    this.timers.add(callback);
    return callback as unknown as ReturnType<typeof setInterval>;
  }

  clearInterval(timer: ReturnType<typeof setInterval>): void {
    this.timers.delete(timer as unknown as () => void | Promise<void>);
  }

  async sleep(milliseconds: number): Promise<void> {
    this.currentTime += milliseconds;
    await Promise.all([...this.timers].map((callback) => callback()));
  }

  async advance(milliseconds: number): Promise<void> {
    this.currentTime += milliseconds;
    await Promise.all([...this.timers].map((callback) => callback()));
  }
}

const directories: string[] = [];

async function createDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'agentflow-lock-test-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('repo lock', () => {
  it('creates a lock exclusively and reports the fresh holder', async () => {
    const directory = await createDirectory();
    const lockPath = join(directory, 'lock');
    const clock = new FakeClock();
    const lock = await acquireRepoLock(lockPath, { clock });

    try {
      const content = await readFile(lockPath, 'utf8');
      expect(content).toContain(`pid: ${process.pid}`);
      await expect(acquireRepoLock(lockPath, { clock })).rejects.toMatchObject({
        code: 'E_LOCK_HELD',
        holderPid: process.pid,
      });
    } finally {
      await lock.release();
    }
  });

  it('replaces a lock older than 90 seconds', async () => {
    const directory = await createDirectory();
    const lockPath = join(directory, 'lock');
    const oldTime = new Date(Date.now() - 91_000);
    await writeFile(lockPath, 'pid: 12345\n', 'utf8');
    const { utimes } = await import('node:fs/promises');
    await utimes(lockPath, oldTime, oldTime);

    const lock = await acquireRepoLock(lockPath, { clock: new FakeClock() });

    try {
      expect(await readFile(lockPath, 'utf8')).toContain(`pid: ${process.pid}`);
    } finally {
      await lock.release();
    }
  });

  it('touches the lock every 30 seconds using the injected clock', async () => {
    const directory = await createDirectory();
    const lockPath = join(directory, 'lock');
    const clock = new FakeClock();
    const lock = await acquireRepoLock(lockPath, { clock });
    const before = (await stat(lockPath)).mtimeMs;

    await clock.advance(30_000);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const after = (await stat(lockPath)).mtimeMs;

    expect(after).toBeGreaterThan(before);
    await lock.release();
  });

  it('retries a fresh lock for at most ten seconds at startup', async () => {
    const directory = await createDirectory();
    const lockPath = join(directory, 'lock');
    const clock = new FakeClock();
    const startTime = clock.now();
    await writeFile(lockPath, 'pid: 12345\n', 'utf8');

    await expect(
      acquireRepoLock(lockPath, { clock, retryIntervalMs: 2_000 }),
    ).rejects.toMatchObject({
      code: 'E_LOCK_HELD',
    });
    expect(clock.now()).toBeGreaterThanOrEqual(startTime + 10_000);
  });
});
