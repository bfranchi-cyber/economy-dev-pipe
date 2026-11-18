import { z } from 'zod';

export const StageSchema = z.enum(['start', 'spec', 'ask_human', 'done']);
export type Stage = z.infer<typeof StageSchema>;

export const WaitReasonSchema = z.enum(['human', 'ci', 'lock', 'remote', 'run']);
export type WaitReason = z.infer<typeof WaitReasonSchema>;

export const StatusCodeSchema = z.enum(['ok', 'blocked', 'failed']);
export type StatusCode = z.infer<typeof StatusCodeSchema>;

export const ErrorCodeSchema = z.enum([
  'E_NOT_AUTHORIZED',
  'E_STALE_RUN',
  'E_INVALID_TRANSITION',
  'E_RECORD_CORRUPT',
  'E_LOCK_HELD',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const RunSchema = z
  .object({
    id: z.string().min(1),
    stage: StageSchema,
    persona: z.string().min(1),
    started_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type Run = z.infer<typeof RunSchema>;

const RunReportSchema = z
  .object({
    type: z.literal('run_report'),
    run_id: z.string().min(1),
    status: StatusCodeSchema,
    summary: z.string().optional(),
    reason: z.string().optional(),
  })
  .strict();

export const EventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }).strict(),
  RunReportSchema,
]);
export type Event = z.infer<typeof EventSchema>;

export const StateSchema = z
  .object({
    stage: StageSchema,
    run: RunSchema.optional(),
    wait_reason: WaitReasonSchema.optional(),
    last_report: z
      .object({
        run_id: z.string().min(1),
        status: StatusCodeSchema,
        row_id: z.string().min(1),
        effects: z.array(z.unknown()),
      })
      .strict()
      .optional(),
  })
  .strict();
export type State = z.infer<typeof StateSchema>;

export const EffectSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('run_persona'),
      run: RunSchema,
    })
    .strict(),
]);
export type Effect = z.infer<typeof EffectSchema>;

export const ToolErrorSchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string().min(1),
    details: z.array(z.unknown()).optional(),
  })
  .strict();

export const ToolEnvelopeSchema = z.union([
  z.object({ ok: z.literal(true), data: z.unknown() }).strict(),
  z.object({ ok: z.literal(false), error: ToolErrorSchema }).strict(),
]);
export type ToolEnvelope<T = unknown> =
  { ok: true; data: T } | { ok: false; error: z.infer<typeof ToolErrorSchema> };

export function ok<T>(data: T): ToolEnvelope<T> {
  return { ok: true, data };
}

export function fail(error: z.input<typeof ToolErrorSchema>): ToolEnvelope<never> {
  return { ok: false, error: ToolErrorSchema.parse(error) };
}
