import { describe, expect, it } from 'vitest';
import { resumeTicket, type ResumeInputs } from '../../src/engine/waits.js';
import { StateSchema, type State } from '../../src/engine/schemas.js';

function buildState(overrides: Partial<State> = {}): State {
  return StateSchema.parse({
    stage: 'implement:green',
    cursor: {
      wave: 1,
      goal: 'G1',
      phase: 'green',
      goals: { G1: 'in_progress' },
    },
    ...overrides,
  });
}

const currentBoot: ResumeInputs = { boot_id: 'boot-new', fresh_run_id: 'R-fresh' };

describe('waits and resume', () => {
  it('opens pending Wait Reasons one at a time in queue order', () => {
    const state = buildState({ waits: ['gate_plan', 'ask_human', 'ci_running'] });

    expect(resumeTicket(state, currentBoot)).toEqual({
      state,
      action: { type: 'open_gate', kind: 'plan' },
    });
    const nextState = { ...state, waits: ['ask_human', 'ci_running'] as State['waits'] };
    const next = resumeTicket(nextState, currentBoot);
    expect(next.action).toEqual({ type: 'open_gate', kind: 'ask_human' });
    expect(next.state.waits).toEqual(['ask_human', 'ci_running']);
  });

  it('reopens the first pending Gate when starting a waiting Ticket', () => {
    const state = buildState({ waits: ['gate_spec', 'gate_plan'] });

    expect(resumeTicket(state, currentBoot).action).toEqual({ type: 'open_gate', kind: 'spec' });
  });

  it('checks CI once when ci_running is the first pending wait', () => {
    const state = buildState({ stage: 'ci', waits: ['ci_running'] });

    expect(resumeTicket(state, currentBoot)).toEqual({
      state,
      action: { type: 'check_ci' },
    });
  });

  it('discards a Run from an older boot and starts a fresh Run in the same Goal Phase', () => {
    const state = buildState({
      run: { id: 'R-old', stage: 'implement:green', persona: 'implementer' },
      cursor: { wave: 2, goal: 'G7', phase: 'green', goals: { G7: 'in_progress' } },
    });

    expect(resumeTicket(state, { ...currentBoot, run_boot_id: 'boot-old' })).toEqual({
      state: {
        ...state,
        run: { id: 'R-fresh', stage: 'implement:green', persona: 'implementer' },
      },
      action: {
        type: 'run_persona',
        run_id: 'R-fresh',
        stage: 'implement:green',
        persona: 'implementer',
        goal: 'G7',
        phase: 'green',
      },
      discarded_run_id: 'R-old',
    });
  });

  it('resumes from the stored Goal Phase cursor rather than the Stage start', () => {
    const state = buildState({
      stage: 'implement:refactor',
      cursor: { wave: 3, goal: 'G9', phase: 'refactor', goals: { G9: 'checked' } },
    });

    const resumed = resumeTicket(state, currentBoot);

    expect(resumed.action).toMatchObject({
      type: 'run_persona',
      run_id: 'R-fresh',
      stage: 'implement:refactor',
      goal: 'G9',
      phase: 'refactor',
    });
    expect(resumed.state.run).toEqual({
      id: 'R-fresh',
      stage: 'implement:refactor',
      persona: 'developer',
    });
  });
});
