import { describe, expect, it } from 'vitest';
import { decide } from '../../src/engine/decide.js';
import { StateSchema, type Event, type State } from '../../src/engine/schemas.js';
import { DEFAULT_GRAPH } from '../../src/engine/stage-graph.js';
import { decideRow, makeState } from './graph-row-fixtures.js';

const now = '2026-11-17T12:00:00.000Z';
const ids = () => 'R-next';

function decision(state: State, event: Event) {
  return decide(state, event, DEFAULT_GRAPH, { now, ids });
}

describe('decide', () => {
  it('returns E_INVALID_TRANSITION and leaves State unchanged when no row matches', () => {
    const state = StateSchema.parse({ stage: 'done' });
    const result = decision(state, { type: 'stop_ticket' });

    expect(result).toMatchObject({ state, effects: [], error: { code: 'E_INVALID_TRANSITION' } });
  });

  it('is deterministic for identical State, event, graph, and inputs', () => {
    const state = StateSchema.parse({ stage: 'start' });
    const event: Event = { type: 'start_ticket', ticket_key: 'T-1' };
    expect(decision(state, event)).toEqual(decision(state, event));
  });

  it('replays a repeated run_report from its stored result', () => {
    const row = DEFAULT_GRAPH.rows.find((candidate) => candidate.id === 'G-20');
    if (!row) throw new Error('Missing G-20 row from the default graph.');
    const state = makeState(row);
    const event: Event = { type: 'run_report', run_id: 'R-active', status: 1 };
    const first = decision(state, event);
    expect(decision(first.state, event)).toEqual(first);
  });

  it('refuses a run_report from a Run that is not active without changing State', () => {
    const state = StateSchema.parse({
      stage: 'implement:green',
      cursor: { wave: 1, goal: 'G1', phase: 'green', goals: { G1: 'in_progress' } },
      run: { id: 'R-active', stage: 'implement:green', persona: 'developer' },
    });
    const result = decision(state, { type: 'run_report', run_id: 'R-other', status: 0 });

    expect(result).toMatchObject({ state, effects: [], error: { code: 'E_INVALID_TRANSITION' } });
  });

  it('returns effects that dispatch a Persona, open a Gate, run a Tool, or end at a terminal Stage', () => {
    const start = decision(StateSchema.parse({ stage: 'start' }), {
      type: 'start_ticket',
      ticket_key: 'T-1',
    });
    expect(start.effects[0]).toMatchObject({ type: 'run_persona', run: { stage: 'spec' } });

    const approved = decision(StateSchema.parse({ stage: 'spec' }), {
      type: 'gate_decision',
      gate: { kind: 'spec', decision: 'approve' },
    });
    expect(approved.effects[0]).toMatchObject({ type: 'run_persona', run: { stage: 'plan' } });

    const askHuman = DEFAULT_GRAPH.rows.find((row) => row.id === 'G-12');
    if (!askHuman) throw new Error('Missing G-12 row from the default graph.');
    expect(decideRow(askHuman).effects[0]).toMatchObject({ type: 'open_gate', kind: 'ask_human' });

    const toolRun = decision(StateSchema.parse({ stage: 'trace' }), {
      type: 'trace_result',
      gap: false,
      goals: [],
    });
    expect(toolRun.effects).toEqual([{ type: 'run_tool', tool: 'validate' }]);

    const ended = decision(StateSchema.parse({ stage: 'ci' }), {
      type: 'ci_result',
      result: 'success',
    });
    expect(ended.effects).toEqual([{ type: 'end', stage: 'done' }]);
  });
});
