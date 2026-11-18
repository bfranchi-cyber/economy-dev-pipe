import { describe, expect, it } from 'vitest';
import { decide } from '../../src/engine/decide.js';
import { failureSignature } from '../../src/engine/signature.js';
import {
  StateSchema,
  type AskHumanReason,
  type Event,
  type GoalPhase,
  type State,
} from '../../src/engine/schemas.js';
import { DEFAULT_GRAPH } from '../../src/engine/stage-graph.js';

const now = '2026-11-17T12:00:00.000Z';
const ids = () => 'R-next';
const signature = failureSignature({
  id: 'test-a',
  file_path: 'src/a.ts',
  message: 'failed at line 2',
});

function stateFor(phase: GoalPhase, sameFailureRuns = 0, checkpointN: number | null = 3): State {
  const stage = DEFAULT_GRAPH.goal_phases[phase];
  return StateSchema.parse({
    stage,
    cursor: { wave: 1, goal: 'G1', phase, goals: { G1: 'in_progress' } },
    run: { id: 'R-active', stage, persona: 'developer' },
    counters: {
      phase: { G1: { [phase]: { attempts: 1, same_failure_runs: sameFailureRuns } } },
      goal: {},
      ticket: { patch_loops: 0, ask_human: 0 },
      gate: {},
    },
    last_failure_signature: signature,
    ...(checkpointN === null ? {} : { config: { checkpoint: { n: checkpointN } } }),
  });
}

function decideEvent(state: State, event: Parameters<typeof decide>[1]) {
  return decide(state, event, DEFAULT_GRAPH, { now, ids });
}

describe('Ask Human and Loop Checkpoint', () => {
  it.each(['red', 'green', 'refactor'] as const)(
    'raises loop_checkpoint before the next Run when repeated failure count reaches three in %s',
    (phase) => {
      const state = stateFor(phase, 2, 3);
      const result = decideEvent(state, {
        type: 'run_report',
        run_id: 'R-active',
        status: 1,
        failure: { id: 'test-a', file_path: 'src/a.ts', message: 'failed at line 9' },
      });

      expect(result.state.stage).toBe('ask_human');
      expect(result.effects).toContainEqual({
        type: 'open_gate',
        kind: 'ask_human',
        reason: 'loop_checkpoint',
      });
      expect(result.state.counters?.phase.G1?.[phase]?.same_failure_runs).toBe(3);
    },
  );

  it.each(['checks', 'trace', 'validate'] as const)(
    'checks the same-failure checkpoint before the next Run from %s',
    (stage) => {
      const events: Record<typeof stage, Event> = {
        checks: { type: 'check_result', result: 'fail' },
        trace: { type: 'trace_result', gap: true, goals: ['G1'] },
        validate: { type: 'validate_result', result: 'partial', goals: ['G1'] },
      };
      const state = StateSchema.parse({
        ...stateFor('green', 3),
        stage,
        run: undefined,
        last_report: {
          run_id: 'R-prior',
          status: 0,
          row_id: stage === 'checks' ? 'G-13' : 'G-16',
          effects: [],
        },
      });
      const result = decideEvent(state, events[stage]);

      expect(result.state.stage).toBe('ask_human');
      expect(result.effects).toContainEqual({
        type: 'open_gate',
        kind: 'ask_human',
        reason: 'loop_checkpoint',
      });
    },
  );

  it('uses the default checkpoint threshold of three when configuration is absent', () => {
    const state = stateFor('green', 2, null);
    const result = decideEvent(state, {
      type: 'run_report',
      run_id: 'R-active',
      status: 1,
      failure: { id: 'test-a', file_path: 'src/a.ts', message: 'failed at line 9' },
    });

    expect(result.state.stage).toBe('ask_human');
    expect(result.effects).toContainEqual({
      type: 'open_gate',
      kind: 'ask_human',
      reason: 'loop_checkpoint',
    });
  });

  it('checks the triage Goal Phase loop before continuing its repeated work', () => {
    const state = StateSchema.parse({
      ...stateFor('triage', 3, null),
      run: { id: 'R-active', stage: 'implement:triage', persona: 'developer' },
    });
    const result = decideEvent(state, {
      type: 'run_report',
      run_id: 'R-active',
      status: 1,
      failure: { id: 'test-a', file_path: 'src/a.ts', message: 'failed at line 9' },
    });

    expect(result.state.stage).toBe('ask_human');
    expect(result.effects).toContainEqual({
      type: 'open_gate',
      kind: 'ask_human',
      reason: 'loop_checkpoint',
    });
  });

  it('checks the patch-loop threshold before starting implementation', () => {
    const state = StateSchema.parse({
      stage: 'plan',
      ticket_key: 'T-1',
      counters: {
        phase: {},
        goal: {},
        ticket: { patch_loops: 3, ask_human: 0 },
        gate: {},
      },
      config: { checkpoint: { n: 3 } },
    });
    const result = decideEvent(state, {
      type: 'gate_decision',
      gate: { kind: 'plan', decision: 'approve' },
    });

    expect(result.state.stage).toBe('ask_human');
    expect(result.effects).toContainEqual({
      type: 'open_gate',
      kind: 'ask_human',
      reason: 'loop_checkpoint',
    });
  });

  it('continue resets the loop count and resumes at the saved Goal Phase', () => {
    const state = StateSchema.parse({
      ...stateFor('refactor', 3),
      stage: 'ask_human',
      run: undefined,
      previous_stage: 'implement:refactor',
      waits: ['ask_human'],
    });
    const result = decideEvent(state, {
      type: 'gate_decision',
      gate: { kind: 'ask_human', decision: 'continue' },
    });

    expect(result.state.stage).toBe('implement:refactor');
    expect(result.state.counters?.phase.G1?.refactor?.same_failure_runs).toBe(0);
    expect(result.effects[0]).toMatchObject({
      type: 'run_persona',
      run: { stage: 'implement:refactor' },
    });
  });

  it('allows another three same-failure loops after continuing a checkpoint', () => {
    const failure = {
      id: 'test-a',
      file_path: 'src/a.ts',
      message: 'failed at line 9',
    };
    const checkpoint = decideEvent(stateFor('green', 2), {
      type: 'run_report',
      run_id: 'R-active',
      status: 1,
      failure,
    });
    const continued = decideEvent(checkpoint.state, {
      type: 'gate_decision',
      gate: { kind: 'ask_human', decision: 'continue' },
    });
    expect(continued.state.counters?.phase.G1?.green?.same_failure_runs).toBe(0);

    let state = continued.state;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const runId = `R-next-${attempt}`;
      state = StateSchema.parse({
        ...state,
        run: { id: runId, stage: 'implement:green', persona: 'developer' },
      });
      const result = decideEvent(state, {
        type: 'run_report',
        run_id: runId,
        status: 1,
        failure,
      });
      expect(result.state.stage).toBe(attempt === 3 ? 'ask_human' : 'implement:green');
      state = result.state;
    }
  });

  it.each([
    ['escalate', 'G-46', 'escalation'],
    ['edit_plan', 'G-47', 'patch_plan'],
    ['stop', 'G-48', 'stopped'],
  ] as const)('%s follows its graph row %s', (decision, rowId, stage) => {
    const state = StateSchema.parse({
      stage: 'ask_human',
      waits: ['ask_human'],
      previous_stage: 'implement:green',
      pending_action: 'skip',
    });
    const result = decideEvent(state, {
      type: 'gate_decision',
      gate: { kind: 'ask_human', decision },
    });

    expect(result.row_id).toBe(rowId);
    expect(result.state.stage).toBe(stage);
  });

  it.each([
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
  ] satisfies AskHumanReason[])('opens an Ask Human Gate for reason %s', (reason) => {
    const state = StateSchema.parse({ stage: 'implement:green' });
    const result = decideEvent(state, { type: 'ask_human', reason, evidence: 'decision needed' });

    expect(result.state.stage).toBe('ask_human');
    expect(result.effects).toContainEqual({ type: 'open_gate', kind: 'ask_human', reason });
  });
});
