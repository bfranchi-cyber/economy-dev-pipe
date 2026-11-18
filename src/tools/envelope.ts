import { fail, ok, type ToolEnvelope } from '../engine/schemas.js';
import type { ErrorCode } from '../engine/schemas.js';

export { fail, ok };
export type { ToolEnvelope };

export function toolError(code: ErrorCode, message: string): ToolEnvelope<never> {
  return fail({ code, message });
}
