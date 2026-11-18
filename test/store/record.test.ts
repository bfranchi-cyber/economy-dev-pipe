import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { commitRecord, loadRecord, recordDirectory } from '../../src/store/record.js';
import { nodeFileLayer, type FileLayer } from '../../src/store/file-layer.js';
import { withTicketMutex } from '../../src/store/mutex.js';

interface SampleRecord {
  state: { stage: string; revision: number };
  boot_id: string;
}

const homeDirectories: string[] = [];

async function createHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'agentflow-record-test-'));
  homeDirectories.push(home);
  return home;
}

describe('record store', () => {
  afterEach(async () => {
    await Promise.all(
      homeDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });
  it('atomically commits record.yml and reloads the committed value', async () => {
    const home = await createHome();
    const record: SampleRecord = {
      state: { stage: 'spec', revision: 1 },
      boot_id: 'boot-1',
    };

    const committed = await commitRecord(home, 'repo-a', 'FAKE-1', record);
    const loaded = await loadRecord<SampleRecord>(home, 'repo-a', 'FAKE-1');

    expect(recordDirectory(home, 'repo-a', 'FAKE-1')).toBe(join(home, 'repo-a', 'FAKE-1'));
    expect(committed).toEqual({ ok: true, data: record });
    expect(loaded).toEqual({ ok: true, data: record });
  });

  it('retries a transient EPERM rename failure before committing', async () => {
    const home = await createHome();
    let renameAttempts = 0;
    const fileLayer: FileLayer = {
      ...nodeFileLayer,
      rename: async (source, destination) => {
        renameAttempts += 1;
        if (renameAttempts === 1) {
          const error = Object.assign(new Error('file is temporarily busy'), { code: 'EPERM' });
          throw error;
        }
        return nodeFileLayer.rename(source, destination);
      },
    };
    const record: SampleRecord = { state: { stage: 'done', revision: 2 }, boot_id: 'boot-2' };

    const result = await commitRecord(home, 'repo-a', 'FAKE-1', record, { fileLayer });

    expect(renameAttempts).toBe(2);
    expect(result).toEqual({ ok: true, data: record });
  });

  it('returns E_RECORD_CORRUPT for an unparsable record.yml', async () => {
    const home = await createHome();
    const directory = recordDirectory(home, 'repo-a', 'FAKE-1');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'record.yml'), 'state: [\n', 'utf8');

    const result = await loadRecord<SampleRecord>(home, 'repo-a', 'FAKE-1');

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'E_RECORD_CORRUPT' },
    });
  });

  it('serializes concurrent read-modify-write operations for one Ticket', async () => {
    const home = await createHome();
    const initial: SampleRecord = { state: { stage: 'spec', revision: 0 }, boot_id: 'boot-1' };
    await commitRecord(home, 'repo-a', 'FAKE-1', initial);
    let releaseFirst: (() => void) | undefined;
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstEntered = false;
    let secondEntered = false;

    const update = (isFirst: boolean) =>
      withTicketMutex('repo-a/FAKE-1', async () => {
        if (isFirst) firstEntered = true;
        else secondEntered = true;
        const loaded = await loadRecord<SampleRecord>(home, 'repo-a', 'FAKE-1');
        if (!loaded.ok) throw new Error(loaded.error.message);
        if (isFirst) await firstMayFinish;
        const next = {
          ...loaded.data,
          state: { ...loaded.data.state, revision: loaded.data.state.revision + 1 },
        };
        await commitRecord(home, 'repo-a', 'FAKE-1', next);
      });

    const first = update(true);
    while (!firstEntered) await Promise.resolve();
    const second = update(false);
    await Promise.resolve();
    expect(secondEntered).toBe(false);
    releaseFirst?.();
    await Promise.all([first, second]);

    const finalRecord = await loadRecord<SampleRecord>(home, 'repo-a', 'FAKE-1');
    expect(secondEntered).toBe(true);
    expect(finalRecord).toMatchObject({ ok: true, data: { state: { revision: 2 } } });
  });
});
