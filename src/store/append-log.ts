import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { stringify } from 'yaml';

export interface MemlogEntry {
  timestamp: string;
  row_id: string;
  message: string;
}

export interface ToolCallEntry {
  timestamp: string;
  tool: string;
  key: string;
  ok: boolean;
  error_code?: string;
}

async function appendYamlDocument(path: string, entry: object): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `---\n${stringify(entry)}`, 'utf8');
}

export function appendMemlog(path: string, entry: MemlogEntry): Promise<void> {
  return appendYamlDocument(path, entry);
}

export function appendToolCall(path: string, entry: ToolCallEntry): Promise<void> {
  return appendYamlDocument(path, entry);
}
