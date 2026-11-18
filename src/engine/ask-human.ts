import { updateCounters } from './counters.js';
import { type AskHumanReason, type Effect, type Stage, type State } from './schemas.js';
import type { StageGraph } from './stage-graph.js';

export interface AskHumanTransition {
  state: State;
  effects: Effect[];
}

function checkpointLimit(state: State): number {
  return state.config?.checkpoint.n ?? state.checkpoint_n ?? 3;
}

export function checkpointReason(state: State): AskHumanReason | undefined {
  const limit = checkpointLimit(state);
  const phase = state.cursor?.phase;
  const goal = state.cursor?.goal;
  const repeatedFailures =
    phase && goal ? (state.counters?.phase[goal]?.[phase]?.same_failure_runs ?? 0) >= limit : false;
  return repeatedFailures || (state.counters?.ticket.patch_loops ?? 0) >= limit
    ? 'loop_checkpoint'
    : undefined;
}

function waitForReason(): State['waits'][number] {
  return 'ask_human';
}

export function raiseAskHuman(
  state: State,
  reason: AskHumanReason,
  graph: StageGraph,
): AskHumanTransition {
  const askHumanStage = graph.gates.ask_human?.stage;
  if (!askHumanStage) throw new Error('Stage Graph has no Ask Human Gate.');
  const waiting = waitForReason();
  const queued = state.waits.includes(waiting) ? state.waits : [...state.waits, waiting];
  const transitioned: State = {
    ...state,
    stage: askHumanStage,
    run: undefined,
    previous_stage: state.stage,
    waits: queued,
  };
  const counted = updateCounters(transitioned, { type: 'ask_human_gate_opened' });
  return {
    state: counted,
    effects: [{ type: 'open_gate', kind: 'ask_human', reason }],
  };
}

export function continueAfterAskHuman(state: State, graph: StageGraph): State {
  const target: Stage | undefined =
    state.previous_stage ?? (state.cursor ? graph.goal_phases[state.cursor.phase] : undefined);
  if (!target)
    throw new Error('Ask Human cannot continue without a saved Stage or Goal Phase cursor.');
  const goal = state.cursor?.goal;
  const phase = state.cursor?.phase;
  let counters = state.counters;
  if (counters && goal && phase) {
    const goalPhases = { ...counters.phase[goal] };
    const phaseCounters = goalPhases[phase];
    if (phaseCounters) goalPhases[phase] = { ...phaseCounters, same_failure_runs: 0 };
    counters = { ...counters, phase: { ...counters.phase, [goal]: goalPhases } };
  }
  const waits = state.waits.filter((reason) => reason !== 'ask_human');
  return {
    ...state,
    stage: target,
    run: undefined,
    previous_stage: undefined,
    waits,
    ...(counters ? { counters } : {}),
  };
}
