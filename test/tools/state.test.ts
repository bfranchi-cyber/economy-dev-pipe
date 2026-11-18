import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createStateTools } from '../../src/tools/state.js';
import { FAKE_TICKET_KEY } from '../../src/tools/fake-ticket.js';

const directories: string[] = [];

async function createHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'agentflow-tools-test-'));
  directories.push(home);
  return home;
}

describe('state tools', () => {
  afterEach(async () => {
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('state_get returns one directive kind and repeats the same outstanding Run', async () => {
    const tools = createStateTools({
      home: await createHome(),
      repoId: 'repo-a',
      bootId: 'boot-a',
      ids: () => 'R-1',
    });

    const first = await tools.state_get({ key: FAKE_TICKET_KEY });
    const second = await tools.state_get({ key: FAKE_TICKET_KEY });

    expect(first.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('Expected state_get to succeed');
    expect(['run_persona', 'open_gate', 'wait', 'end']).toContain(first.data.type);
    expect(first.data.type).toBe('run_persona');
    if (first.data.type !== 'run_persona') throw new Error('Expected a Run directive');
    expect(first.data.run.id).toBe('R-1');
    expect(second.data).toEqual(first.data);
  });

  it('state_advance applies the report through decide and commits record.yml', async () => {
    const home = await createHome();
    const tools = createStateTools({ home, repoId: 'repo-a', bootId: 'boot-a' });
    const directive = await tools.state_get({ key: FAKE_TICKET_KEY });
    if (!directive.ok || directive.data.type !== 'run_persona') throw new Error('Expected a Run');

    const result = await tools.state_advance({
      key: FAKE_TICKET_KEY,
      run: directive.data.run,
      status: 'ok',
    });
    const record = await readFile(join(home, 'repo-a', FAKE_TICKET_KEY, 'record.yml'), 'utf8');

    expect(result).toMatchObject({ ok: true, data: { state: { stage: 'done' } } });
    expect(record).toContain('stage: done');
    expect(record).toContain('G-1');
  });

  it('refuses Conductor-only calls carrying a run_id and logs the refusal', async () => {
    const home = await createHome();
    const tools = createStateTools({ home, repoId: 'repo-a', bootId: 'boot-a' });

    const result = await tools.state_get({ key: FAKE_TICKET_KEY, run_id: 'R-agent' });
    const log = await readFile(join(home, 'repo-a', FAKE_TICKET_KEY, 'tool-calls.yml'), 'utf8');

    expect(result).toMatchObject({ ok: false, error: { code: 'E_NOT_AUTHORIZED' } });
    expect(log).toContain('state_get');
    expect(log).toContain('E_NOT_AUTHORIZED');
  });

  it('refuses a Run issued under another boot_id', async () => {
    const home = await createHome();
    const oldTools = createStateTools({ home, repoId: 'repo-a', bootId: 'boot-old' });
    const directive = await oldTools.state_get({ key: FAKE_TICKET_KEY });
    if (!directive.ok || directive.data.type !== 'run_persona') throw new Error('Expected a Run');
    const newTools = createStateTools({ home, repoId: 'repo-a', bootId: 'boot-new' });

    const result = await newTools.state_advance({
      key: FAKE_TICKET_KEY,
      run: directive.data.run,
      status: 'ok',
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'E_STALE_RUN' } });
  });

  it('appends a Tool-Call Log entry for successful as well as refused calls', async () => {
    const home = await createHome();
    const tools = createStateTools({ home, repoId: 'repo-a', bootId: 'boot-a' });
    await tools.state_get({ key: FAKE_TICKET_KEY });
    await tools.state_advance({ key: FAKE_TICKET_KEY, run_id: 'R-forbidden', status: 'ok' });
    const log = await readFile(join(home, 'repo-a', FAKE_TICKET_KEY, 'tool-calls.yml'), 'utf8');

    expect(log.match(/tool: state_get/g)).toHaveLength(1);
    expect(log.match(/tool: state_advance/g)).toHaveLength(1);
    expect(log).toContain('E_NOT_AUTHORIZED');
  });

  it('records the graph row id in the append-only Memlog', async () => {
    const home = await createHome();
    const tools = createStateTools({ home, repoId: 'repo-a', bootId: 'boot-a' });
    await tools.state_get({ key: FAKE_TICKET_KEY });
    const memlog = await readFile(join(home, 'repo-a', FAKE_TICKET_KEY, 'memlog.md'), 'utf8');

    expect(memlog).toContain('G-3');
  });

  it('applies each report only once when a report is retried', async () => {
    const home = await createHome();
    const tools = createStateTools({ home, repoId: 'repo-a', bootId: 'boot-a' });
    const directive = await tools.state_get({ key: FAKE_TICKET_KEY });
    if (!directive.ok || directive.data.type !== 'run_persona') throw new Error('Expected a Run');
    const input = { key: FAKE_TICKET_KEY, run: directive.data.run, status: 'ok' as const };

    const first = await tools.state_advance(input);
    const replay = await tools.state_advance(input);

    expect(replay).toEqual(first);
  });
});
