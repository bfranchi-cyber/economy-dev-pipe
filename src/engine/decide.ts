import {
  EffectSchema,
  type Effect,
  type ErrorCode,
  type Event,
  type Stage,
  type State,
} from './schemas.js';
import type { StageGraph } from './stage-graph.js';

export interface DecideInputs {
  now: string;
  ids: () => string;
}

export interface Decision {
  state: State;
  effects: Effect[];
  row_id?: string;
  error?: { code: ErrorCode; message: string };
}

function invalidTransition(state: State, message: string): Decision {
  return {
    state,
    effects: [],
    error: { code: 'E_INVALID_TRANSITION', message },
  };
}

function replayReport(state: State, event: Event): Decision | undefined {
  if (event.type !== 'run_report' || state.last_report?.run_id !== event.run_id) {
    return undefined;
  }
  if (state.last_report.status !== event.status) return undefined;

  return {
    state,
    effects: state.last_report.effects as Effect[],
    row_id: state.last_report.row_id,
  };
}

function startRun(
  state: State,
  graph: StageGraph,
  rowId: string,
  targetStage: Stage,
  now: string,
  ids: () => string,
): Decision {
  const persona = graph.stages[targetStage]?.persona;
  if (!persona) {
    return invalidTransition(state, `Stage for graph row ${rowId} has no persona.`);
  }

  const run = { id: ids(), stage: targetStage, persona, started_at: now };
  const effect = EffectSchema.parse({ type: 'run_persona', run });
  return {
    state: { stage: targetStage, run: effect.run },
    effects: [effect],
    row_id: rowId,
  };
}

export function decide(
  state: State,
  event: Event,
  graph: StageGraph,
  inputs: DecideInputs,
): Decision {
  const replay = replayReport(state, event);
  if (replay) return replay;

  const status = event.type === 'run_report' ? event.status : undefined;
  const row = graph.rows.find(
    (candidate) =>
      candidate.from === state.stage &&
      candidate.event === event.type &&
      (candidate.status === undefined || candidate.status === status),
  );
  if (!row) return invalidTransition(state, 'No Stage Graph row matches the current event.');

  if (event.type === 'start') {
    return startRun(state, graph, row.id, row.to, inputs.now, inputs.ids);
  }
  if (!state.run || state.run.id !== event.run_id || state.run.stage !== state.stage) {
    return invalidTransition(state, 'The report does not match the active Run.');
  }

  const nextState: State = {
    stage: row.to,
    last_report: {
      run_id: event.run_id,
      status: event.status,
      row_id: row.id,
      effects: [],
    },
  };
  return { state: nextState, effects: [], row_id: row.id };
}
