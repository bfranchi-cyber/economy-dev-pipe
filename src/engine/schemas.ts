import { z } from 'zod';

export const GoalPhaseSchema = z.enum(['red', 'triage', 'green', 'refactor']);
const goalPhaseStage = (phase: (typeof GoalPhaseSchema.options)[number]) =>
  `implement:${phase}` as const;

export const StageSchema = z.enum([
  'start',
  'spec',
  'plan',
  ...GoalPhaseSchema.options.map(goalPhaseStage),
  'checks',
  'escalation',
  'trace',
  'validate',
  'push',
  'ci',
  'patch_plan',
  'correct_course',
  'ask_human',
  'confirm_action',
  'stopped',
  'skipped',
  'done',
]);
export type Stage = z.infer<typeof StageSchema>;

export type GoalPhase = z.infer<typeof GoalPhaseSchema>;

export const GoalStatusSchema = z.enum(['pending', 'in_progress', 'checked', 'done']);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

export const WaitReasonSchema = z.enum([
  'gate_spec',
  'gate_plan',
  'gate_correct_course',
  'gate_escalation',
  'gate_push',
  'gate_confirm_action',
  'ask_human',
  'ci_running',
]);
export type WaitReason = z.infer<typeof WaitReasonSchema>;

export const StatusCodeSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export type StatusCode = z.infer<typeof StatusCodeSchema>;

export const GateKindSchema = z.enum([
  'spec',
  'plan',
  'correct_course',
  'escalation',
  'push',
  'ask_human',
  'confirm_action',
]);
export type GateKind = z.infer<typeof GateKindSchema>;

const decisionsByGate = {
  spec: ['approve', 'edit', 'reject'],
  plan: ['approve', 'edit', 'reject'],
  correct_course: ['approve', 'edit', 'reject'],
  escalation: ['approve', 'edit', 'reject'],
  push: ['approve', 'edit_walkthrough', 'edit_rework', 'reject'],
  ask_human: ['continue', 'escalate', 'edit_plan', 'stop'],
  confirm_action: ['approve', 'reject'],
} as const satisfies Record<GateKind, readonly string[]>;

export const GateDecisionSchema = z.enum([...new Set(Object.values(decisionsByGate).flat())]);
export type GateDecision = z.infer<typeof GateDecisionSchema>;

export const GateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('spec'), decision: z.enum(decisionsByGate.spec) }).strict(),
  z.object({ kind: z.literal('plan'), decision: z.enum(decisionsByGate.plan) }).strict(),
  z
    .object({ kind: z.literal('correct_course'), decision: z.enum(decisionsByGate.correct_course) })
    .strict(),
  z
    .object({ kind: z.literal('escalation'), decision: z.enum(decisionsByGate.escalation) })
    .strict(),
  z.object({ kind: z.literal('push'), decision: z.enum(decisionsByGate.push) }).strict(),
  z.object({ kind: z.literal('ask_human'), decision: z.enum(decisionsByGate.ask_human) }).strict(),
  z
    .object({ kind: z.literal('confirm_action'), decision: z.enum(decisionsByGate.confirm_action) })
    .strict(),
]);
export type Gate = z.infer<typeof GateSchema>;

export const AskHumanReasonSchema = z.enum([
  'ticket_ambiguous',
  'spec_conflict',
  'plan_wrong',
  'ac_ambiguous',
  'escalation_cannot',
  'loop_checkpoint',
  'triage_anomaly',
  'unattributed_change',
  'artifact_changed',
  'record_invalid',
  'config_changed',
  'ci_no_result',
  'remote_diverged',
]);
export type AskHumanReason = z.infer<typeof AskHumanReasonSchema>;

export const ErrorCodeSchema = z.enum([
  'E_NOT_AUTHORIZED',
  'E_STALE_RUN',
  'E_INVALID_TRANSITION',
  'E_RECORD_CORRUPT',
  'E_LOCK_HELD',
  'E_UNKNOWN_STAGE',
  'E_GRAPH_INVALID',
  'E_BAD_INPUT',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

const NonNegativeCountSchema = z.number().int().nonnegative();
const PhaseCounterSchema = z
  .object({ attempts: NonNegativeCountSchema, same_failure_runs: NonNegativeCountSchema })
  .strict();
const GoalCounterSchema = z
  .object({ validation_rounds: NonNegativeCountSchema, escalations: NonNegativeCountSchema })
  .strict();
const TicketCounterSchema = z
  .object({ patch_loops: NonNegativeCountSchema, ask_human: NonNegativeCountSchema })
  .strict();
const GateCounterSchema = z.object({ edit_rounds: NonNegativeCountSchema }).strict();

export const CountersSchema = z
  .object({
    phase: z.record(z.string().min(1), z.partialRecord(GoalPhaseSchema, PhaseCounterSchema)),
    goal: z.record(z.string().min(1), GoalCounterSchema),
    ticket: TicketCounterSchema,
    gate: z.partialRecord(GateKindSchema, GateCounterSchema),
  })
  .strict();
export type Counters = z.infer<typeof CountersSchema>;

export const RunSchema = z
  .object({
    id: z.string().min(1),
    stage: StageSchema,
    persona: z.string().min(1),
    started_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type Run = z.infer<typeof RunSchema>;

const RunReportEventSchema = z
  .object({
    type: z.literal('run_report'),
    run_id: z.string().min(1),
    status: StatusCodeSchema,
    summary: z.string().optional(),
    reason: z.string().optional(),
    failure: z
      .object({
        id: z.string().optional(),
        file_path: z.string().optional(),
        message: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const EventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }).strict(),
  z
    .object({
      type: z.literal('start_ticket'),
      ticket_key: z.string().min(1),
      restart: z.boolean().optional(),
    })
    .strict(),
  RunReportEventSchema,
  z.object({ type: z.literal('gate_decision'), gate: GateSchema }).strict(),
  z
    .object({ type: z.literal('ask_human'), reason: AskHumanReasonSchema, evidence: z.string() })
    .strict(),
  z.object({ type: z.literal('check_result'), result: z.enum(['pass', 'fail']) }).strict(),
  z
    .object({
      type: z.literal('triage_result'),
      goal: z.string().min(1),
      result: z.enum(['none', 'wrong_reason', 'other_anomaly']),
      payload: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('escalation_result'),
      result: z.enum(['resolved', 'partial', 'cannot']),
    })
    .strict(),
  z
    .object({
      type: z.literal('trace_result'),
      gap: z.boolean(),
      goals: z.array(z.string().min(1)),
    })
    .strict(),
  z
    .object({
      type: z.literal('validate_result'),
      result: z.enum(['met', 'partial', 'missing']),
      goals: z.array(z.string().min(1)),
    })
    .strict(),
  z
    .object({
      type: z.literal('ci_result'),
      result: z.enum(['success', 'failure', 'cancelled', 'timed_out', 'no_run', 'max_wait']),
    })
    .strict(),
  z.object({ type: z.literal('stop_ticket') }).strict(),
  z.object({ type: z.literal('skip_ticket') }).strict(),
  z.object({ type: z.literal('restart_ticket') }).strict(),
  z
    .object({
      type: z.literal('head_check'),
      head: z.string().optional(),
      validated_head: z.string().optional(),
    })
    .strict(),
  z
    .object({ type: z.literal('planner_output'), result: z.enum(['patch_plan', 'correct_course']) })
    .strict(),
  z.object({ type: z.literal('wait_resolved'), reason: WaitReasonSchema }).strict(),
]);
export type Event = z.infer<typeof EventSchema>;

const GoalCursorSchema = z
  .object({
    wave: z.number().int().positive(),
    goal: z.string().min(1),
    phase: GoalPhaseSchema,
    goals: z.record(z.string().min(1), GoalStatusSchema),
  })
  .strict();

const LastReportSchema = z
  .object({
    run_id: z.string().min(1),
    status: StatusCodeSchema,
    summary: z.string().optional(),
    reason: z.string().optional(),
    failure: z.record(z.string(), z.unknown()).optional(),
    row_id: z.string().min(1),
    effects: z.array(z.unknown()),
  })
  .strict();

export const StateSchema = z
  .object({
    stage: StageSchema,
    run: RunSchema.optional(),
    cursor: GoalCursorSchema.optional(),
    waits: z.array(WaitReasonSchema).default([]),
    counters: CountersSchema.optional(),
    last_report: LastReportSchema.optional(),
    last_failure_signature: z.string().optional(),
    previous_stage: StageSchema.optional(),
    pending_action: z.enum(['stop', 'skip', 'restart']).optional(),
    validated_head: z.string().optional(),
    head: z.string().optional(),
    ticket_key: z.string().optional(),
    checkpoint_n: z.number().int().positive().optional(),
    config: z
      .object({ checkpoint: z.object({ n: z.number().int().positive() }).strict() })
      .strict()
      .optional(),
    spec_or_plan: z.enum(['spec', 'plan']).optional(),
  })
  .strict();
export type State = z.infer<typeof StateSchema>;

export const EffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('run_persona'), run: RunSchema }).strict(),
  z
    .object({
      type: z.literal('open_gate'),
      kind: GateKindSchema,
      reason: AskHumanReasonSchema.optional(),
    })
    .strict(),
  z.object({ type: z.literal('run_tool'), tool: z.string().min(1) }).strict(),
  z.object({ type: z.literal('wait'), reason: WaitReasonSchema }).strict(),
  z.object({ type: z.literal('end'), stage: StageSchema }).strict(),
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
