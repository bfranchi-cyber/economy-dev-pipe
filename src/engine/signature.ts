import { createHash } from 'node:crypto';

export interface FailureSignatureInput {
  id?: string;
  file_path?: string;
  message?: string;
  run_report?: unknown;
}

function normalizeFirstLine(message: string): string {
  const firstLine = message.split(/\r?\n/, 1)[0] ?? '';
  return firstLine
    .replace(/\bline\s+\d+(?:\s*,\s*column\s+\d+)?\b/gi, 'line')
    .replace(/:\d+(?::\d+)?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function failureSignature(input: FailureSignatureInput): string {
  if (input.run_report === undefined && input.message === undefined) return 'missing_report';

  const id = input.id ?? '';
  const filePath = input.file_path ?? '';
  const message = normalizeFirstLine(input.message ?? '');
  return createHash('sha256').update(`${id}\n${filePath}\n${message}`).digest('hex');
}
