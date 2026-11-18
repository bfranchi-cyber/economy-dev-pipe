import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { failureSignature } from '../../src/engine/signature.js';

describe('Failure Signature', () => {
  it('hashes the id, file path, and normalized first message line', () => {
    const expected = createHash('sha256')
      .update('test-id\nsrc/file.ts\nExpected true but received false')
      .digest('hex');

    expect(
      failureSignature({
        id: 'test-id',
        file_path: 'src/file.ts',
        message: 'Expected true but received false\n at src/file.ts:12:4',
      }),
    ).toBe(expected);
  });

  it('ignores line and column numbers so a moved failure repeats', () => {
    const first = failureSignature({
      id: 'test-id',
      file_path: 'src/file.ts',
      message: 'Assertion failed at src/file.ts:12:4',
    });
    const moved = failureSignature({
      id: 'test-id',
      file_path: 'src/file.ts',
      message: 'Assertion failed at src/file.ts:88:19',
    });

    expect(moved).toBe(first);
  });

  it('normalizes whitespace in the first message line', () => {
    expect(
      failureSignature({
        id: 'T-1',
        file_path: 'src/a.ts',
        message: '  Expected   one\tthing  \nmore',
      }),
    ).toBe(failureSignature({ id: 'T-1', file_path: 'src/a.ts', message: 'Expected one thing' }));
  });

  it('returns the missing_report signature when a Run has no report', () => {
    expect(failureSignature({ run_report: undefined })).toBe('missing_report');
  });
});
