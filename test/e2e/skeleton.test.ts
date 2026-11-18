import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const directories: string[] = [];

async function makeHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'agentflow-e2e-'));
  directories.push(home);
  return home;
}

function makeTransport(home: string): StdioClientTransport {
  return new StdioClientTransport({
    command: process.execPath,
    args: ['node_modules/tsx/dist/cli.mjs', 'bin/mcp-server.ts'],
    cwd: projectRoot,
    env: { ...process.env, AGENTFLOW_HOME: home },
    stderr: 'pipe',
  });
}

function parseToolResult(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  if (!('content' in result) || !Array.isArray(result.content)) {
    throw new Error('MCP tool response had no content payload.');
  }
  const content = result.content as Array<{ type: string; text?: string }>;
  const text = content.find((block) => block.type === 'text')?.text;
  if (!text) throw new Error('MCP tool response had no text payload.');
  return JSON.parse(text) as unknown;
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('MCP skeleton', () => {
  it('issues and reports a Run over stdio and persists State', async () => {
    const home = await makeHome();
    const client = new Client({ name: 'skeleton-test', version: '1.0.0' });
    await client.connect(makeTransport(home));
    try {
      const issued = parseToolResult(
        await client.callTool({ name: 'state_get', arguments: { key: 'FAKE-1' } }),
      ) as {
        ok: boolean;
        data: { type: string; run: { id: string; stage: string; persona: string } };
      };
      expect(issued).toMatchObject({
        ok: true,
        data: { type: 'run_persona', run: { stage: 'spec' } },
      });
      const advanced = parseToolResult(
        await client.callTool({
          name: 'state_advance',
          arguments: { key: 'FAKE-1', run: issued.data.run, status: 0 },
        }),
      );
      expect(advanced).toMatchObject({ ok: true, data: { state: { stage: 'spec' } } });
      const next = parseToolResult(
        await client.callTool({ name: 'state_get', arguments: { key: 'FAKE-1' } }),
      );
      expect(next).toMatchObject({ ok: true, data: { type: 'open_gate', kind: 'spec' } });
      const record = await readFile(join(home, 'agentflow', 'FAKE-1', 'record.yml'), 'utf8');
      expect(record).toContain('stage: spec');
      expect(record).toContain('status: 0');
    } finally {
      await client.close();
    }
  }, 20_000);

  it('refuses a second server for the same repo and emits no diagnostic stdout', async () => {
    const home = await makeHome();
    const firstClient = new Client({ name: 'lock-holder-test', version: '1.0.0' });
    const firstTransport = makeTransport(home);
    await firstClient.connect(firstTransport);
    const contender = spawn(
      process.execPath,
      ['node_modules/tsx/dist/cli.mjs', 'bin/mcp-server.ts'],
      {
        cwd: projectRoot,
        env: { ...process.env, AGENTFLOW_HOME: home },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    try {
      const stdout: Buffer[] = [];
      contender.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
      const stderr: Buffer[] = [];
      contender.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
      await once(contender, 'close');
      expect(contender.exitCode).toBe(1);
      expect(Buffer.concat(stdout).toString('utf8')).toBe('');
      expect(Buffer.concat(stderr).toString('utf8')).toBe('');
      const log = await readFile(join(home, 'logs', 'mcp-server.log'), 'utf8');
      expect(log).toContain('MCP server started');
      expect(log).toContain('Repository lock');
      const result = parseToolResult(
        await firstClient.callTool({ name: 'state_get', arguments: { key: 'FAKE-1' } }),
      );
      expect(result).toMatchObject({ ok: true, data: { type: 'run_persona' } });
    } finally {
      contender.kill();
      await firstClient.close();
    }
  }, 20_000);

  it('exits and releases the repo lock when the client closes stdin', async () => {
    const home = await makeHome();
    const server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'bin/mcp-server.ts'], {
      cwd: projectRoot,
      env: { ...process.env, AGENTFLOW_HOME: home },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    try {
      await waitForLog(home, 'MCP server started');
      server.stdin.end();
      await once(server, 'close');
      expect(server.exitCode).toBe(0);
      await expect(stat(join(home, 'agentflow', 'lock'))).rejects.toThrow();
    } finally {
      server.kill();
    }
  }, 20_000);
});

async function waitForLog(home: string, text: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const log = await readFile(join(home, 'logs', 'mcp-server.log'), 'utf8').catch(() => '');
    if (log.includes(text)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Server log never contained "${text}".`);
}
