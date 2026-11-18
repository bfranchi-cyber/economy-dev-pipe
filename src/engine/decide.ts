import { failureSignature } from './signature.js';
import { updateCounters } from './counters.js';
import { continueAfterAskHuman, checkpointReason, raiseAskHuman } from './ask-human.js';
import {
  EffectSchema,
  type Effect,
  type ErrorCode,
  type Event,
  type GateDecision,
  type GateKind,
  type GoalPhase,
  type Stage,
  type State,
} from './schemas.js';
import type { GraphEvent, GraphRow, StageGraph, StageRef } from './stage-graph.js';

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
  return { state, effects: [], error: { code: 'E_INVALID_TRANSITION', message } };
}

type GateEvent = { type: 'gate_decision'; gate: { kind: GateKind; decision: GateDecision } };

function gateEvent(event: Event): GateEvent | undefined {
  if (event.type !== 'gate_decision') return undefined;
  const gate = event.gate;
  if (!gate || typeof gate !== 'object') return undefined;
  const candidate = gate as { kind?: unknown; decision?: unknown };
  if (typeof candidate.kind !== 'string' || typeof candidate.decision !== 'string')
    return undefined;
  return {
    type: 'gate_decision',
    gate: { kind: candidate.kind as GateKind, decision: candidate.decision as GateDecision },
  };
}

function eventDecision(event: Event): GateDecision | undefined {
  return gateEvent(event)?.gate.decision;
}

function matchesSource(row: GraphRow, state: State, event: Event, graph: StageGraph): boolean {
  if (row.from === 'non_terminal_stages')
    return !['done', 'skipped', 'stopped'].includes(state.stage);
  if (row.from === 'no_intent_record') return state.stage === graph.initial;
  return Array.isArray(row.from) ? row.from.includes(state.stage) : row.from === state.stage;
}

function hasUnfinishedOtherGoal(state: State): boolean {
  const goals = Object.entries(state.cursor?.goals ?? {});
  return goals.some(
    ([goal, status]) => goal !== state.cursor?.goal && status !== 'done' && status !== 'checked',
  );
}

function allOtherGoalsFinished(state: State): boolean {
  return Object.entries(state.cursor?.goals ?? {}).every(
    ([goal, status]) => goal === state.cursor?.goal || status === 'done' || status === 'checked',
  );
}

function matchesRunReport(condition: string, state: State, event: Event): boolean {
  if (event.type !== 'run_report') return false;
  if (condition === 'status_0_more_red_goals')
    return event.status === 0 && hasUnfinishedOtherGoal(state);
  if (condition === 'status_0_all_red_goals_finished')
    return event.status === 0 && allOtherGoalsFinished(state);
  if (condition === 'status_0') return event.status === 0;
  if (condition === 'status_1_or_missing_next_cheap_model')
    return event.status === 1 || (event.status === 0 && event.reason === 'missing_report');
  return condition === 'status_2' && event.status === 2;
}

function matchesCheck(condition: string, state: State, event: Event): boolean {
  if (event.type !== 'check_result') return false;
  const afterGreen = state.last_report?.row_id === 'G-13';
  const afterRefactor = state.last_report?.row_id === 'G-16';
  if (condition === 'after_green_pass') return event.result === 'pass' && afterGreen;
  if (condition === 'after_green_fail') return event.result === 'fail' && afterGreen;
  if (condition === 'after_refactor_fail') return event.result === 'fail' && afterRefactor;
  if (condition === 'after_refactor_pass_more_goals')
    return event.result === 'pass' && afterRefactor && hasUnfinishedOtherGoal(state);
  return (
    condition === 'after_refactor_pass_last_goal' &&
    event.result === 'pass' &&
    afterRefactor &&
    allOtherGoalsFinished(state)
  );
}

function matchesGateCondition(condition: string, state: State, event: GateEvent): boolean {
  const decision = event.gate.decision;
  if (condition.startsWith('approve_'))
    return decision === 'approve' && state.pending_action === condition.slice(8);
  return decision === condition;
}

function conditionMatches(row: GraphRow, state: State, event: Event): boolean {
  const { condition } = row;
  if (condition.startsWith('status_')) return matchesRunReport(condition, state, event);
  if (condition.startsWith('after_')) return matchesCheck(condition, state, event);
  if (
    [
      'approve',
      'edit',
      'reject',
      'edit_walkthrough',
      'edit_rework',
      'continue',
      'escalate',
      'edit_plan',
      'stop',
    ].includes(condition) ||
    condition.startsWith('approve_')
  ) {
    const gate = gateEvent(event);
    return gate !== undefined && matchesGateCondition(condition, state, gate);
  }

  switch (condition) {
    case 'new_ticket':
      return event.type === 'start_ticket' && !event.restart;
    case 'restart':
      return event.type === 'start_ticket' && event.restart === true && state.stage === 'stopped';
    case 'ticket_key':
      return row.from === 'no_intent_record'
        ? event.type === 'skip_ticket'
        : event.type === 'stop_ticket';
    case 'no_anomaly':
      return event.type === 'triage_result' && event.result === 'none';
    case 'wrong_reason_failure':
      return event.type === 'triage_result' && event.result === 'wrong_reason';
    case 'other_anomaly':
      return event.type === 'triage_result' && event.result === 'other_anomaly';
    case 'resolved':
    case 'partial':
    case 'cannot':
      return event.type === 'escalation_result' && event.result === condition;
    case 'no_gap':
      return event.type === 'trace_result' && !event.gap;
    case 'gap':
      return event.type === 'trace_result' && event.gap;
    case 'all_met':
      return event.type === 'validate_result' && event.result === 'met';
    case 'partial_or_missing':
      return (
        event.type === 'validate_result' &&
        (event.result === 'partial' || event.result === 'missing')
      );
    case 'validated_head_differs':
      return event.type === 'head_check' && event.head !== event.validated_head;
    case 'success':
    case 'failure':
      return event.type === 'ci_result' && event.result === condition;
    case 'ci_incomplete':
      return (
        event.type === 'ci_result' &&
        ['cancelled', 'timed_out', 'no_run', 'max_wait'].includes(event.result)
      );
    case 'patch_plan_written':
    case 'correct_course_proposal':
      return (
        event.type === 'planner_output' &&
        event.result === (condition === 'patch_plan_written' ? 'patch_plan' : 'correct_course')
      );
    default:
      return false;
  }
}

function rowFor(state: State, event: Event, graph: StageGraph): GraphRow | undefined {
  const eventName = event.type as GraphEvent;
  const decision = eventDecision(event);
  return graph.rows.find((row) => {
    if (row.event !== eventName || !matchesSource(row, state, event, graph)) return false;
    if (row.decision !== undefined && row.decision !== decision) return false;
    if (row.status !== undefined && (event.type !== 'run_report' || row.status !== event.status))
      return false;
    const gate = gateEvent(event);
    if (gate && matchingGate(state, graph) !== gate.gate.kind) return false;
    return conditionMatches(row, state, event);
  });
}

function targetStage(target: StageRef, state: State): Stage | undefined {
  if (target === 'same_phase') return state.stage;
  if (target === 'resume_stage') return state.previous_stage ?? state.stage;
  if (target === 'previous_stage') return state.previous_stage;
  if (target === 'revision_run') return state.spec_or_plan ?? 'spec';
  return target;
}

function matchingGate(state: State, graph: StageGraph): GateKind | undefined {
  return (Object.entries(graph.gates) as [GateKind, { stage: Stage }][]).find(
    ([, gate]) => gate.stage === state.stage,
  )?.[0];
}

function makeRun(
  state: State,
  stage: Stage,
  graph: StageGraph,
  inputs: DecideInputs,
): Effect | undefined {
  const definition = graph.stages[stage];
  if (definition?.owner !== 'persona' || !definition.persona) return undefined;
  const run = {
    id: inputs.ids(),
    stage,
    persona: definition.persona,
    started_at: inputs.now,
  };
  return EffectSchema.parse({ type: 'run_persona', run });
}

function effectsFor(
  target: Stage,
  graph: StageGraph,
  state: State,
  inputs: DecideInputs,
): Effect[] {
  const owner = graph.stages[target]?.owner;
  if (owner === 'persona') {
    const run = makeRun(state, target, graph, inputs);
    return run ? [run] : [];
  }
  if (owner === 'gate') {
    const kind = matchingGate({ ...state, stage: target }, graph);
    return kind ? [{ type: 'open_gate', kind }] : [];
  }
  if (graph.stages[target]?.terminal || target === 'stopped' || target === 'skipped') {
    return [{ type: 'end', stage: target }];
  }
  return [{ type: 'run_tool', tool: target }];
}

function phaseForStage(stage: Stage, graph: StageGraph): GoalPhase | undefined {
  return (Object.entries(graph.goal_phases) as [GoalPhase, Stage][]).find(
    ([, phaseStage]) => phaseStage === stage,
  )?.[0];
}

function reportFor(event: Event, row: GraphRow): State['last_report'] | undefined {
  if (event.type !== 'run_report') return undefined;
  return {
    run_id: event.run_id,
    status: event.status,
    ...(event.summary === undefined ? {} : { summary: event.summary }),
    ...(event.reason === undefined ? {} : { reason: event.reason }),
    ...(event.failure === undefined ? {} : { failure: event.failure }),
    row_id: row.id,
    effects: [],
  };
}

function nextGoalFor(row: GraphRow, state: State): string | undefined {
  const cursor = state.cursor;
  if (!cursor) return undefined;
  if (row.id !== 'G-8' && row.id !== 'G-17') return cursor.goal;
  return Object.entries(cursor.goals).find(
    ([goal, status]) => goal !== cursor.goal && status !== 'done' && status !== 'checked',
  )?.[0];
}

function updateCursor(
  state: State,
  target: Stage,
  row: GraphRow,
  event: Event,
  graph: StageGraph,
): State {
  const cursor = state.cursor;
  const phase = phaseForStage(target, graph);
  if (!cursor || !phase) return state;
  const goal = nextGoalFor(row, state) ?? cursor.goal;
  const goals = { ...cursor.goals };
  if (cursor.phase === 'red' && event.type === 'run_report' && event.status === 0)
    goals[cursor.goal] = 'checked';
  if ((phase === 'green' && ['G-10', 'G-29', 'G-31'].includes(row.id)) || phase === 'red')
    goals[goal] = 'in_progress';
  return { ...state, cursor: { ...cursor, goal, phase, goals } };
}

function withPendingAction(state: State, target: Stage, event: Event): State {
  if (target !== 'confirm_action') return state;
  if (event.type === 'stop_ticket')
    return {
      ...state,
      previous_stage: state.stage,
      pending_action: 'stop',
      ticket_key: state.ticket_key,
    };
  if (event.type === 'skip_ticket')
    return {
      ...state,
      previous_stage: state.stage,
      pending_action: 'skip',
      ticket_key: state.ticket_key,
    };
  if (event.type === 'start_ticket' && event.restart)
    return { ...state, previous_stage: state.stage, pending_action: 'restart' };
  return state;
}

function updateGateCounter(state: State, event: GateEvent): State {
  const edited = ['edit', 'edit_walkthrough', 'edit_rework'].includes(event.gate.decision);
  return updateCounters(
    state,
    edited
      ? { type: 'gate_edited', gate: event.gate.kind }
      : { type: 'gate_approved', gate: event.gate.kind },
  );
}

function updateRunCounter(state: State, event: Event): State {
  if (event.type !== 'run_report' || !state.cursor) return state;
  if (event.status === 1) {
    const signature = failureSignature({
      id: event.failure?.id,
      file_path: event.failure?.file_path,
      message: event.failure?.message,
      run_report: event.failure ?? event.reason,
    });
    const counted = updateCounters(state, {
      type: 'failure_observed',
      goal: state.cursor.goal,
      phase: state.cursor.phase,
      signature,
      previous_signature: state.last_failure_signature,
    });
    return { ...counted, last_failure_signature: signature };
  }
  if (event.status === 0)
    return updateCounters(state, {
      type: 'phase_completed',
      goal: state.cursor.goal,
      phase: state.cursor.phase,
    });
  return state;
}

function updateReturnedGoals(state: State, row: GraphRow, event: Event): State {
  if (
    (row.condition !== 'gap' && row.condition !== 'partial_or_missing') ||
    (event.type !== 'trace_result' && event.type !== 'validate_result')
  )
    return state;
  return event.goals.reduce(
    (next, goal) => updateCounters(next, { type: 'goal_sent_back', goal }),
    state,
  );
}

function stateForTarget(
  state: State,
  target: Stage,
  row: GraphRow,
  event: Event,
  graph: StageGraph,
): State {
  let next: State = {
    ...state,
    stage: target,
    run: undefined,
    last_report: reportFor(event, row) ?? state.last_report,
  };
  next = updateCursor(next, target, row, event, graph);
  next = withPendingAction(next, target, event);
  if (row.to === 'resume_stage') next = { ...next, previous_stage: undefined };
  if (row.event === 'planner_output') next = updateCounters(next, { type: 'patch_plan_drafted' });
  if (row.to === 'escalation') next = updateCounters(next, { type: 'escalation_gate_opened' });
  const gate = gateEvent(event);
  if (gate) next = updateGateCounter(next, gate);
  if (row.to === 'ask_human') {
    const waits: State['waits'] = next.waits.includes('ask_human')
      ? next.waits
      : [...next.waits, 'ask_human'];
    return updateCounters({ ...next, waits }, { type: 'ask_human_gate_opened' });
  }
  next = updateRunCounter(next, event);
  return updateReturnedGoals(next, row, event);
}

function completedDecision(
  state: State,
  row: GraphRow,
  event: Event,
  graph: StageGraph,
  inputs: DecideInputs,
): Decision {
  const target = targetStage(row.to, state);
  if (!target)
    return invalidTransition(state, `Graph row ${row.id} requires missing transition context.`);
  let next = stateForTarget(state, target, row, event, graph);
  const checkpoint = checkpointReason(next);
  const resumesGoalPhase = Object.values(graph.goal_phases).includes(target);
  if (checkpoint && resumesGoalPhase && target !== 'ask_human') {
    const asked = raiseAskHuman(next, checkpoint, graph);
    next = asked.state;
    return { state: next, effects: asked.effects, row_id: row.id };
  }
  const gate = gateEvent(event);
  if (gate && gate.gate.kind === 'ask_human' && gate.gate.decision === 'continue') {
    next = continueAfterAskHuman(state, graph);
  }
  const effects = effectsFor(target, graph, next, inputs);
  if (row.event === 'run_report' && event.type === 'run_report') {
    next = {
      ...next,
      last_report: {
        run_id: event.run_id,
        status: event.status,
        ...(event.summary === undefined ? {} : { summary: event.summary }),
        ...(event.reason === undefined ? {} : { reason: event.reason }),
        ...(event.failure === undefined ? {} : { failure: event.failure }),
        row_id: row.id,
        effects,
      },
    };
  }
  return { state: next, effects, row_id: row.id };
}

export function decide(
  state: State,
  event: Event,
  graph: StageGraph,
  inputs: DecideInputs,
): Decision {
  if (event.type === 'run_report' && state.last_report?.run_id === event.run_id) {
    if (state.last_report.status === event.status) {
      return {
        state,
        effects: state.last_report.effects as Effect[],
        row_id: state.last_report.row_id,
      };
    }
    return invalidTransition(state, 'A repeated Run report changed its content.');
  }

  if (event.type === 'ask_human') {
    const raised = raiseAskHuman(state, event.reason, graph);
    return { state: raised.state, effects: raised.effects };
  }

  const gate = gateEvent(event);
  if (gate && gate.gate.kind !== matchingGate(state, graph)) {
    return invalidTransition(state, 'The Gate decision does not match the current Stage.');
  }
  const row = rowFor(state, event, graph);
  if (!row) return invalidTransition(state, 'No Stage Graph row matches the current event.');

  if (
    event.type === 'run_report' &&
    (!state.run || state.run.id !== event.run_id || state.run.stage !== state.stage)
  ) {
    return invalidTransition(state, 'The report does not match the active Run.');
  }
  if (row.condition === 'approve_restart' && event.type === 'gate_decision') {
    const startRow = graph.rows.find((candidate) => candidate.id === 'G-1');
    if (!startRow) return invalidTransition(state, 'The Stage Graph is missing the initial row.');
  }
  if (gate && gate.gate.kind === 'ask_human' && gate.gate.decision === 'continue') {
    const nextState = continueAfterAskHuman(state, graph);
    const effect = effectsFor(nextState.stage, graph, nextState, inputs);
    return { state: nextState, effects: effect, row_id: row.id };
  }
  return completedDecision(state, row, event, graph, inputs);
}
