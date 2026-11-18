import { describe, expect, it } from 'vitest';
import { decide } from '../../src/engine/decide.js';
import { DEFAULT_GRAPH } from '../../src/engine/stage-graph.js';
import type { Event, State } from '../../src/engine/schemas.js';

const initialState: State = { stage: 'start' };
const now = '2026-11-17T12:00:00.000Z';
const ids = () => 'R-1';

function decision(state: State, event: Event) {
  return decide(state, event, DEFAULT_GRAPH, { now, ids });
}

describe('decide', () => {
  it('starts spec, returns its graph row, and schedules its persona', () => {
    const result = decision(initialState, { type: 'start' });

    expect(result).toEqual({
      state: {
        stage: 'spec',
        run: { id: 'R-1', stage: 'spec', persona: 'spec', started_at: now },
      },
      effects: [
        {
          type: 'run_persona',
          run: { id: 'R-1', stage: 'spec', persona: 'spec', started_at: now },
        },
      ],
      row_id: 'G-3',
    });
  });

  it('is deterministic for the same state, event, graph, and inputs', () => {
    expect(decision(initialState, { type: 'start' })).toEqual(
      decision(initialState, { type: 'start' }),
    );
  });

  it('G-1 completes a spec run and records its row for the Memlog', () => {
    const activeState: State = {
      stage: 'spec',
      run: { id: 'R-1', stage: 'spec', persona: 'spec', started_at: now },
    };

    expect(
      decision(activeState, { type: 'run_report', run_id: 'R-1', status: 'ok' }),
    ).toMatchObject({ state: { stage: 'done' }, effects: [], row_id: 'G-1' });
  });

  it('G-2 moves a blocked spec run to ask_human', () => {
    const activeState: State = {
      stage: 'spec',
      run: { id: 'R-1', stage: 'spec', persona: 'spec', started_at: now },
    };

    expect(
      decision(activeState, { type: 'run_report', run_id: 'R-1', status: 'blocked' }),
    ).toMatchObject({ state: { stage: 'ask_human' }, effects: [], row_id: 'G-2' });
  });

  it('returns E_INVALID_TRANSITION and leaves State unchanged when no row matches', () => {
    const result = decision(initialState, {
      type: 'run_report',
      run_id: 'R-1',
      status: 'ok',
    });

    expect(result).toMatchObject({
      state: initialState,
      effects: [],
      error: { code: 'E_INVALID_TRANSITION' },
    });
  });

  it('rejects a report from a different Run without changing State', () => {
    const activeState: State = {
      stage: 'spec',
      run: { id: 'R-1', stage: 'spec', persona: 'spec', started_at: now },
    };
    const result = decision(activeState, {
      type: 'run_report',
      run_id: 'R-2',
      status: 'ok',
    });

    expect(result).toMatchObject({
      state: activeState,
      effects: [],
      error: { code: 'E_INVALID_TRANSITION' },
    });
  });

  it('replays an already applied run_report without another transition', () => {
    const activeState: State = {
      stage: 'spec',
      run: { id: 'R-1', stage: 'spec', persona: 'spec', started_at: now },
    };
    const report: Event = { type: 'run_report', run_id: 'R-1', status: 'ok' };
    const first = decision(activeState, report);
    const replay = decision(first.state, report);

    expect(replay).toEqual(first);
  });
});
