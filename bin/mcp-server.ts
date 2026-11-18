import { appendFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { acquireRepoLock, type RepoLock } from '../src/store/lock.js';
import { repoId as calculateRepoId } from '../src/workspace/repo-id.js';
import { createStateTools } from '../src/tools/state.js';

const VERSION = '0.0.0';

async function findGitCommonDirectory(cwd: string): Promise<string | undefined> {
  const { exec } = await import('../src/run/exec.js');
  const result = await exec(['git', 'rev-parse', '--git-common-dir'], {
    cwd,
    timeoutMs: 5_000,
    envProfile: 'git',
  });
  if (result.exitCode !== 0 || result.timedOut) return undefined;
  const path = result.stdout.trim();
  if (!path) return undefined;
  return join(cwd, path);
}

async function writeDiagnostic(message: string): Promise<void> {
  const agentflowHome = process.env.AGENTFLOW_HOME ?? join(homedir(), '.agentflow');
  const path = join(agentflowHome, 'logs', 'mcp-server.log');
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${new Date().toISOString()} ${message}\n`, 'utf8');
}

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  const gitCommonDir = await findGitCommonDirectory(cwd);
  const repositoryId = gitCommonDir
    ? await calculateRepoId(async () => gitCommonDir)
    : await calculateRepoId(async () => cwd);
  const home = process.env.AGENTFLOW_HOME ?? homedir() + '/.agentflow';
  const storageRepoId = process.env.AGENTFLOW_HOME ? 'agentflow' : repositoryId;
  const lockPath = join(home, storageRepoId, 'lock');
  let lock: RepoLock | undefined;

  try {
    lock = await acquireRepoLock(lockPath, { startupWaitMs: 0 });
  } catch (error) {
    await writeDiagnostic(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const stateTools = createStateTools({
    home,
    repoId: storageRepoId,
    bootId: randomUUID(),
  });
  const server = new McpServer({ name: 'agentflow', version: VERSION });
  server.registerTool(
    'state_get',
    {
      description: 'Get the next directive for a Ticket.',
      inputSchema: { key: z.string(), run_id: z.string().optional() },
    },
    async (input) => textResult(await stateTools.state_get(input)),
  );
  server.registerTool(
    'state_advance',
    {
      description: 'Report a Run result and advance Ticket State.',
      inputSchema: {
        key: z.string(),
        run: z
          .object({
            id: z.string(),
            stage: z.string(),
            persona: z.string(),
            started_at: z.string().optional(),
          })
          .optional(),
        run_id: z.string().optional(),
        status: z.enum(['ok', 'blocked', 'failed']).optional(),
        summary: z.string().optional(),
        reason: z.string().optional(),
      },
    },
    async (input) => textResult(await stateTools.state_advance(input)),
  );

  const transport = new StdioServerTransport();
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await lock?.release();
    } catch (error) {
      await writeDiagnostic(`Lock release failed: ${String(error)}`);
      process.exitCode = 1;
    }
    process.exit();
  };
  transport.onclose = () => void shutdown();
  process.stdin.once('end', () => void shutdown());
  process.stdin.once('close', () => void shutdown());
  transport.onerror = (error) => {
    void writeDiagnostic(`MCP transport error: ${error.message}`);
  };
  try {
    await server.connect(transport);
    await writeDiagnostic(`MCP server started for repository ${repositoryId}.`);
  } catch (error) {
    await writeDiagnostic(
      `MCP server failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    await lock.release();
    process.exitCode = 1;
  }
}

void main().catch(async (error: unknown) => {
  await writeDiagnostic(
    `Fatal server error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  );
  process.exitCode = 1;
});
