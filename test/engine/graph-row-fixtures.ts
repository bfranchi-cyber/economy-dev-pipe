import { decide } from '../../src/engine/decide.js';
import { StateSchema, type Event, type State } from '../../src/engine/schemas.js';
import { DEFAULT_GRAPH, type GraphRow } from '../../src/engine/stage-graph.js';

const now = '2026-11-17T12:00:00.000Z';
const ids = () => 'R-next';

export function sourceStage(row: GraphRow): State['stage'] {
  if (Array.isArray(row.from)) return row.from[0] as State['stage'];
  if (row.from === 'non_terminal_stages' || row.from === 'no_intent_record') return 'start';
  return row.from as State['stage'];
}

export function makeState(row: GraphRow): State {
  const stage = sourceStage(row);
  const goalPhase = stage.startsWith('implement:')
    ? (stage.split(':')[1] as 'red' | 'triage' | 'green' | 'refactor')
    : 'green';
  const goals =
    row.id === 'G-8' || row.id === 'G-17'
      ? { G1: row.id === 'G-17' ? 'checked' : 'in_progress', G2: 'pending' }
      : row.id === 'G-18'
        ? { G1: 'checked' }
        : { G1: 'in_progress' };
  const lastReportRow = row.id === 'G-14' || row.id === 'G-15' ? 'G-13' : 'G-16';
  return StateSchema.parse({
    stage,
    ...(row.event === 'run_report'
      ? {
          run: {
            id: 'R-active',
            stage,
            persona: DEFAULT_GRAPH.stages[stage].persona ?? 'developer',
          },
        }
      : {}),
    ...(stage.startsWith('implement:') ||
    row.condition.startsWith('status_0_') ||
    row.event === 'check_result'
      ? { cursor: { wave: 1, goal: 'G1', phase: goalPhase, goals } }
      : {}),
    ...(row.event === 'check_result'
      ? {
          last_report: {
            run_id: 'R-prior',
            status: 0,
            row_id: row.condition.startsWith('after_green') ? 'G-13' : lastReportRow,
            effects: [],
          },
        }
      : {}),
    ...(row.id === 'G-52' || row.id === 'G-53' || row.id === 'G-54'
      ? { pending_action: row.id === 'G-52' ? 'stop' : row.id === 'G-53' ? 'skip' : 'restart' }
      : {}),
    ...(row.id === 'G-55' ? { previous_stage: 'spec', pending_action: 'stop' } : {}),
    ...(row.id === 'G-45' ? { previous_stage: 'implement:green' } : {}),
    ...(row.id === 'G-42' ? { spec_or_plan: 'spec' } : {}),
    ...(row.id === 'G-36' ? { head: 'new-head', validated_head: 'old-head' } : {}),
    ...(row.id === 'G-51' ? { pending_action: 'restart', previous_stage: 'stopped' } : {}),
  });
}

export function makeEvent(row: GraphRow): Event {
  switch (row.event) {
    case 'start_ticket':
      return {
        type: 'start_ticket',
        ticket_key: 'T-1',
        ...(row.condition === 'restart' ? { restart: true } : {}),
      };
    case 'run_report':
      return { type: 'run_report', run_id: 'R-active', status: row.status ?? 0 };
    case 'gate_decision': {
      const stage = sourceStage(row);
      const kind = Object.entries(DEFAULT_GRAPH.gates).find(
        ([, gate]) => gate?.stage === stage,
      )?.[0];
      if (!kind || !row.decision) throw new Error(`Missing gate mapping for ${row.id}`);
      return { type: 'gate_decision', gate: { kind, decision: row.decision } } as Event;
    }
    case 'triage_result':
      return {
        type: 'triage_result',
        goal: 'G1',
        result:
          row.condition === 'no_anomaly'
            ? 'none'
            : row.condition === 'wrong_reason_failure'
              ? 'wrong_reason'
              : 'other_anomaly',
      };
    case 'check_result':
      return { type: 'check_result', result: row.condition.includes('fail') ? 'fail' : 'pass' };
    case 'escalation_result':
      return { type: 'escalation_result', result: row.condition } as Event;
    case 'trace_result':
      return {
        type: 'trace_result',
        gap: row.condition === 'gap',
        goals: row.condition === 'gap' ? ['G1'] : [],
      };
    case 'validate_result':
      return {
        type: 'validate_result',
        result:
          row.condition === 'all_met'
            ? 'met'
            : row.condition === 'partial_or_missing'
              ? 'partial'
              : 'missing',
        goals: ['G1'],
      };
    case 'head_check':
      return { type: 'head_check', head: 'new-head', validated_head: 'old-head' } as Event;
    case 'ci_result':
      return {
        type: 'ci_result',
        result: row.condition === 'ci_incomplete' ? 'cancelled' : row.condition,
      } as Event;
    case 'planner_output':
      return {
        type: 'planner_output',
        result: row.condition === 'patch_plan_written' ? 'patch_plan' : 'correct_course',
      };
    case 'stop_ticket':
      return { type: 'stop_ticket' };
    case 'skip_ticket':
      return { type: 'skip_ticket' };
  }
}

export function decideRow(row: GraphRow) {
  return decide(makeState(row), makeEvent(row), DEFAULT_GRAPH, { now, ids });
}
