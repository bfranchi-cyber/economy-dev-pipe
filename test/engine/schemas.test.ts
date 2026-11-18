import { describe, expect, it } from 'vitest';
import {
  AskHumanReasonSchema,
  CountersSchema,
  EffectSchema,
  ErrorCodeSchema,
  EventSchema,
  GateDecisionSchema,
  GateKindSchema,
  GateSchema,
  GoalPhaseSchema,
  GoalStatusSchema,
  RunSchema,
  StageSchema,
  StateSchema,
  StatusCodeSchema,
  ToolEnvelopeSchema,
  WaitReasonSchema,
  fail,
  ok,
} from '../../src/engine/schemas.js';

const run = {
  id: 'R-1',
  stage: 'implement:green',
  persona: 'implementer',
};

const counters = {
  phase: {
    G1: {
      green: { attempts: 2, same_failure_runs: 1 },
    },
  },
  goal: { G1: { validation_rounds: 1, escalations: 0 } },
  ticket: { patch_loops: 0, ask_human: 1 },
  gate: { plan: { edit_rounds: 1 } },
};

const state = {
  stage: 'implement:green',
  run,
  cursor: {
    wave: 1,
    goal: 'G1',
    phase: 'green',
    goals: { G1: 'in_progress', G2: 'pending' },
  },
  waits: ['gate_plan'],
  counters,
};

const validEvents = [
  { type: 'start' },
  { type: 'start_ticket', ticket_key: 'PROJ-123' },
  { type: 'run_report', run_id: 'R-1', status: 0, summary: 'Done.' },
  { type: 'gate_decision', gate: { kind: 'spec', decision: 'approve' } },
  { type: 'ask_human', reason: 'loop_checkpoint', evidence: 'Repeated failure.' },
  { type: 'check_result', result: 'pass' },
  { type: 'triage_result', goal: 'G1', result: 'wrong_reason', payload: 'Failure payload.' },
  { type: 'escalation_result', result: 'resolved' },
  { type: 'trace_result', gap: true, goals: ['G1'] },
  { type: 'validate_result', result: 'partial', goals: ['G1'] },
  { type: 'ci_result', result: 'timed_out' },
  { type: 'stop_ticket' },
  { type: 'skip_ticket' },
  { type: 'restart_ticket' },
  { type: 'wait_resolved', reason: 'ci_running' },
];

const validEffects = [
  { type: 'run_persona', run },
  { type: 'open_gate', kind: 'ask_human', reason: 'loop_checkpoint' },
  { type: 'run_tool', tool: 'checks' },
  { type: 'wait', reason: 'ci_running' },
  { type: 'end', stage: 'done' },
];

describe('engine schemas', () => {
  it('accepts the complete FR-4 Stage and Goal Phase sets only', () => {
    const stages = [
      'start',
      'spec',
      'plan',
      'implement:red',
      'implement:triage',
      'implement:green',
      'implement:refactor',
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
    ];
    const phases = ['red', 'triage', 'green', 'refactor'];

    expect(stages.map((stage) => StageSchema.parse(stage))).toEqual(stages);
    expect(phases.map((phase) => GoalPhaseSchema.parse(phase))).toEqual(phases);
    expect(() => StageSchema.parse('wave_synthesis')).toThrow();
    expect(() => StageSchema.parse('implement:missing')).toThrow();
    expect(() => GoalPhaseSchema.parse('checks')).toThrow();
  });

  it('accepts only FR-16 numeric Status Codes 0, 1, and 2', () => {
    expect([0, 1, 2].map((status) => StatusCodeSchema.parse(status))).toEqual([0, 1, 2]);
    for (const status of ['0', 'ok', -1, 3]) {
      expect(() => StatusCodeSchema.parse(status)).toThrow();
    }
  });

  it('accepts only the FR-6 Wait Reasons', () => {
    const waitReasons = [
      'gate_spec',
      'gate_plan',
      'gate_correct_course',
      'gate_escalation',
      'gate_push',
      'gate_confirm_action',
      'ask_human',
      'ci_running',
    ];

    expect(waitReasons.map((reason) => WaitReasonSchema.parse(reason))).toEqual(waitReasons);
    for (const reason of ['human', 'ci', 'lock', 'remote', 'run']) {
      expect(() => WaitReasonSchema.parse(reason)).toThrow();
    }
  });

  it('validates Gate kinds and kind-specific decisions', () => {
    const gates = [
      ['spec', ['approve', 'edit', 'reject']],
      ['plan', ['approve', 'edit', 'reject']],
      ['escalation', ['approve', 'edit', 'reject']],
      ['correct_course', ['approve', 'edit', 'reject']],
      ['push', ['approve', 'edit_walkthrough', 'edit_rework', 'reject']],
      ['ask_human', ['continue', 'escalate', 'edit_plan', 'stop']],
      ['confirm_action', ['approve', 'reject']],
    ] as const;

    for (const [kind, decisions] of gates) {
      expect(GateKindSchema.parse(kind)).toBe(kind);
      for (const decision of decisions) {
        expect(GateSchema.parse({ kind, decision })).toEqual({ kind, decision });
        expect(GateDecisionSchema.parse(decision)).toBe(decision);
      }
    }
    expect(() => GateSchema.parse({ kind: 'push', decision: 'edit' })).toThrow();
    expect(() => GateSchema.parse({ kind: 'confirm_action', decision: 'continue' })).toThrow();
    expect(() => GateSchema.parse({ kind: 'unknown', decision: 'approve' })).toThrow();
    expect(() => GateSchema.parse({ kind: 'spec', decision: 'approve', extra: true })).toThrow();
  });

  it('accepts persona-raised, server-raised, and config_changed Ask Human reasons only', () => {
    const reasons = [
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
    ];

    expect(reasons.map((reason) => AskHumanReasonSchema.parse(reason))).toEqual(reasons);
    expect(() => AskHumanReasonSchema.parse('unknown_reason')).toThrow();
  });

  it('accepts each ErrorCode and rejects unregistered codes', () => {
    const codes = [
      'E_NOT_AUTHORIZED',
      'E_STALE_RUN',
      'E_INVALID_TRANSITION',
      'E_RECORD_CORRUPT',
      'E_LOCK_HELD',
      'E_UNKNOWN_STAGE',
      'E_GRAPH_INVALID',
      'E_BAD_INPUT',
    ];

    expect(codes.map((code) => ErrorCodeSchema.parse(code))).toEqual(codes);
    expect(() => ErrorCodeSchema.parse('E_NOT_REAL')).toThrow();
  });

  it('validates all FR-7 counter groups and rejects unknown counters', () => {
    expect(CountersSchema.parse(counters)).toEqual(counters);
    expect(() =>
      CountersSchema.parse({ ...counters, ticket: { ...counters.ticket, retries: 1 } }),
    ).toThrow();
    expect(() =>
      CountersSchema.parse({
        ...counters,
        phase: { G1: { green: { attempts: -1, same_failure_runs: 0 } } },
      }),
    ).toThrow();
  });

  it('validates State with its Wave, Goal, Goal Phase cursor and strict nested keys', () => {
    expect(StateSchema.parse(state)).toEqual(state);
    expect(() => StateSchema.parse({ ...state, surprise: true })).toThrow();
    expect(() =>
      StateSchema.parse({
        ...state,
        cursor: { ...state.cursor, phase: 'missing' },
      }),
    ).toThrow();
    expect(
      ['pending', 'in_progress', 'checked', 'done'].map((status) => GoalStatusSchema.parse(status)),
    ).toEqual(['pending', 'in_progress', 'checked', 'done']);
    expect(() =>
      StateSchema.parse({
        ...state,
        cursor: { ...state.cursor, goals: { G1: 'blocked' } },
      }),
    ).toThrow();
    expect(() => StateSchema.parse({ ...state, waits: ['remote'] })).toThrow();
  });

  it('accepts the complete Event union and rejects unknown literals and keys', () => {
    for (const event of validEvents) {
      expect(EventSchema.parse(event)).toEqual(event);
    }
    expect(() => EventSchema.parse({ type: 'run_report', run_id: 'R-1', status: 'ok' })).toThrow();
    expect(() => EventSchema.parse({ type: 'check_result', result: 'unknown' })).toThrow();
    expect(() => EventSchema.parse({ type: 'start', extra: true })).toThrow();
    expect(() => EventSchema.parse({ type: 'unknown' })).toThrow();
  });

  it('accepts the complete Effect union and rejects unknown literals and keys', () => {
    for (const effect of validEffects) {
      expect(EffectSchema.parse(effect)).toEqual(effect);
    }
    expect(() => EffectSchema.parse({ type: 'wait', reason: 'remote' })).toThrow();
    expect(() => EffectSchema.parse({ type: 'end', stage: 'missing' })).toThrow();
    expect(() => EffectSchema.parse({ type: 'run_persona', run, extra: true })).toThrow();
    expect(() => EffectSchema.parse({ type: 'unknown' })).toThrow();
  });

  it('accepts a Run and rejects unknown Run keys', () => {
    expect(RunSchema.parse(run)).toEqual(run);
    expect(() => RunSchema.parse({ ...run, surprise: true })).toThrow();
  });

  it('builds and validates strict success and failure envelopes', () => {
    const success = ok({ stage: 'spec' });
    const failure = fail({ code: 'E_INVALID_TRANSITION', message: 'No matching row.' });

    expect(ToolEnvelopeSchema.parse(success)).toEqual(success);
    expect(ToolEnvelopeSchema.parse(failure)).toEqual(failure);
    expect(() => ToolEnvelopeSchema.parse({ ok: true, data: {}, extra: true })).toThrow();
    expect(() =>
      ToolEnvelopeSchema.parse({
        ok: false,
        error: { code: 'E_NOT_REAL', message: 'No.' },
      }),
    ).toThrow();
  });
});
