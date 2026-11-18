import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import type { ErrorCode } from '../engine/schemas.js';
import { nodeFileLayer, type FileLayer } from './file-layer.js';

export type StoreResult<T> =
  { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };

export interface CommitRecordOptions {
  fileLayer?: FileLayer;
  retryDelayMs?: number;
  retryLimit?: number;
}

export interface RecordStoreOptions extends CommitRecordOptions {
  home: string;
  repoId: string;
}

const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EBUSY']);
const DEFAULT_RENAME_RETRIES = 5;
const DEFAULT_RENAME_RETRY_DELAY_MS = 10;

export function recordDirectory(home: string, repoId: string, ticketKey: string): string {
  return join(home, repoId, ticketKey);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function storeError<T>(code: ErrorCode, message: string): StoreResult<T> {
  return { ok: false, error: { code, message } };
}

export async function loadRecord<T>(
  home: string,
  repoId: string,
  ticketKey: string,
  fileLayer: FileLayer = nodeFileLayer,
): Promise<StoreResult<T>> {
  const path = join(recordDirectory(home, repoId, ticketKey), 'record.yml');
  let contents: string;
  try {
    contents = await fileLayer.readFile(path, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return storeError('E_RECORD_CORRUPT', `Record does not exist at ${path}.`);
    }
    throw error;
  }

  try {
    const record: unknown = parse(contents);
    if (record === null || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('Record root must be a mapping.');
    }
    return { ok: true, data: record as T };
  } catch (error) {
    return storeError('E_RECORD_CORRUPT', `Cannot parse record at ${path}: ${errorMessage(error)}`);
  }
}

async function renameWithRetry(
  fileLayer: FileLayer,
  source: string,
  destination: string,
  retryDelayMs: number,
  retryLimit: number,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fileLayer.rename(source, destination);
      return;
    } catch (error) {
      if (!RETRYABLE_RENAME_CODES.has(errorCode(error) ?? '') || attempt >= retryLimit) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

export async function commitRecord<T extends object>(
  home: string,
  repoId: string,
  ticketKey: string,
  record: T,
  options: CommitRecordOptions = {},
): Promise<StoreResult<T>> {
  const fileLayer = options.fileLayer ?? nodeFileLayer;
  const directory = recordDirectory(home, repoId, ticketKey);
  const destination = join(directory, 'record.yml');
  const temporary = join(directory, `.record-${randomUUID()}.tmp`);

  await fileLayer.mkdir(directory, { recursive: true });
  await fileLayer.writeFile(temporary, stringify(record), 'utf8');
  try {
    await renameWithRetry(
      fileLayer,
      temporary,
      destination,
      options.retryDelayMs ?? DEFAULT_RENAME_RETRY_DELAY_MS,
      options.retryLimit ?? DEFAULT_RENAME_RETRIES,
    );
  } catch (error) {
    await fileLayer.rm(temporary, { force: true });
    throw error;
  }
  return loadRecord<T>(home, repoId, ticketKey, fileLayer);
}

export function createRecordStore(options: RecordStoreOptions) {
  const fileLayer = options.fileLayer ?? nodeFileLayer;
  const commitOptions: CommitRecordOptions = {
    fileLayer,
    retryDelayMs: options.retryDelayMs,
    retryLimit: options.retryLimit,
  };
  return {
    load<T>(ticketKey: string): Promise<StoreResult<T>> {
      return loadRecord<T>(options.home, options.repoId, ticketKey, fileLayer);
    },
    commit<T extends object>(ticketKey: string, record: T): Promise<StoreResult<T>> {
      return commitRecord(options.home, options.repoId, ticketKey, record, commitOptions);
    },
  };
}
