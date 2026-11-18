import { describe, expect, it } from 'vitest';
import { updateCounters, type CounterEvent } from '../../src/engine/counters.js';
import { StateSchema, type State } from '../../src/engine/schemas.js';

function buildState(overrides: Partial<State> = {}): State {
  return StateSchema.parse({
    stage: 'implement:green',
    cursor: {
      wave: 1,
      goal: 'G1',
      phase: 'green',
      goals: { G1: 'in_progress', G2: 'pending' },
    },
    ...overrides,
  });
}

function apply(event: CounterEvent, state = buildState()): State {
  return updateCounters(state, event);
}

describe('effort counters', () => {
  it('increments attempts when a Goal Phase Run starts', () => {
    const state = buildState({
      counters: {
        phase: { G1: { green: { attempts: 2, same_failure_runs: 1 } } },
        goal: {},
        ticket: { patch_loops: 0, ask_human: 0 },
        gate: {},
      },
    });

    expect(
      apply({ type: 'run_started', goal: 'G1', phase: 'green' }, state).counters?.phase,
    ).toEqual({
      G1: { green: { attempts: 3, same_failure_runs: 1 } },
    });
  });

  it('increments repeated-failure runs only when the signature matches', () => {
    const state = buildState({
      counters: {
        phase: { G1: { green: { attempts: 3, same_failure_runs: 2 } } },
        goal: {},
        ticket: { patch_loops: 0, ask_human: 0 },
        gate: {},
      },
    });

    expect(
      apply(
        {
          type: 'failure_observed',
          goal: 'G1',
          phase: 'green',
          signature: 'sig-a',
          previous_signature: 'sig-a',
        },
        state,
      ).counters?.phase.G1?.green?.same_failure_runs,
    ).toBe(3);
    expect(
      apply(
        {
          type: 'failure_observed',
          goal: 'G1',
          phase: 'green',
          signature: 'sig-b',
          previous_signature: 'sig-a',
        },
        state,
      ).counters?.phase.G1?.green?.same_failure_runs,
    ).toBe(0);
  });

  it('resets both phase counters when the Goal Phase completes', () => {
    const state = buildState({
      counters: {
        phase: { G1: { green: { attempts: 4, same_failure_runs: 3 } } },
        goal: {},
        ticket: { patch_loops: 0, ask_human: 0 },
        gate: {},
      },
    });

    expect(
      apply({ type: 'phase_completed', goal: 'G1', phase: 'green' }, state).counters?.phase.G1,
    ).toEqual({ green: { attempts: 0, same_failure_runs: 0 } });
  });

  it('increments validation rounds when trace or validation sends a Goal back', () => {
    const state = buildState({
      counters: {
        phase: {},
        goal: { G1: { validation_rounds: 1, escalations: 0 } },
        ticket: { patch_loops: 0, ask_human: 0 },
        gate: {},
      },
    });

    expect(apply({ type: 'goal_sent_back', goal: 'G1' }, state).counters?.goal.G1).toEqual({
      validation_rounds: 2,
      escalations: 0,
    });
  });

  it('increments the current Goal escalation counter when its Gate opens', () => {
    expect(apply({ type: 'escalation_gate_opened' }).counters?.goal.G1).toEqual({
      validation_rounds: 0,
      escalations: 1,
    });
  });

  it('increments ticket patch loops without changing stable Goal ids', () => {
    const state = buildState({
      counters: {
        phase: {},
        goal: {
          G1: { validation_rounds: 2, escalations: 1 },
          G2: { validation_rounds: 0, escalations: 0 },
        },
        ticket: { patch_loops: 4, ask_human: 0 },
        gate: {},
      },
    });

    const updated = apply({ type: 'patch_plan_drafted' }, state);
    expect(updated.counters?.ticket.patch_loops).toBe(5);
    expect(updated.counters?.goal).toEqual(state.counters?.goal);
    expect(Object.keys(updated.counters?.goal ?? {})).toEqual(['G1', 'G2']);
  });

  it('increments Gate edit rounds on edit and resets them on approval', () => {
    const state = buildState({
      counters: {
        phase: {},
        goal: {},
        ticket: { patch_loops: 0, ask_human: 0 },
        gate: { plan: { edit_rounds: 2 } },
      },
    });

    const edited = apply({ type: 'gate_edited', gate: 'plan' }, state);
    expect(edited.counters?.gate.plan?.edit_rounds).toBe(3);
    expect(
      apply({ type: 'gate_approved', gate: 'plan' }, edited).counters?.gate.plan?.edit_rounds,
    ).toBe(0);
  });

  it('increments the ticket Ask Human count when its Gate opens', () => {
    expect(apply({ type: 'ask_human_gate_opened' }).counters?.ticket.ask_human).toBe(1);
  });

  it('never blocks progress because a counter is high', () => {
    const state = buildState({
      counters: {
        phase: { G1: { green: { attempts: 1_000_000, same_failure_runs: 1_000_000 } } },
        goal: { G1: { validation_rounds: 1_000_000, escalations: 1_000_000 } },
        ticket: { patch_loops: 1_000_000, ask_human: 1_000_000 },
        gate: { plan: { edit_rounds: 1_000_000 } },
      },
    });

    expect(apply({ type: 'run_started', goal: 'G1', phase: 'green' }, state).stage).toBe(
      'implement:green',
    );
    expect(
      apply({ type: 'run_started', goal: 'G1', phase: 'green' }, state).counters?.phase.G1?.green
        ?.attempts,
    ).toBe(1_000_001);
  });
});
