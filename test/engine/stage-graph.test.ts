import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRAPH,
  validateGraph,
  type GraphRow,
  type StageGraph,
} from '../../src/engine/stage-graph.js';

const catalog: ReadonlyArray<{
  id: string;
  from: string | readonly string[];
  event: string;
  condition: string;
  to: string;
  owner: string;
}> = [
  {
    id: 'G-1',
    from: 'start',
    event: 'start_ticket',
    condition: 'new_ticket',
    to: 'spec',
    owner: 'tool',
  },
  {
    id: 'G-2',
    from: 'spec',
    event: 'gate_decision',
    condition: 'approve',
    to: 'plan',
    owner: 'gate',
  },
  { id: 'G-3', from: 'spec', event: 'gate_decision', condition: 'edit', to: 'spec', owner: 'gate' },
  {
    id: 'G-4',
    from: 'spec',
    event: 'gate_decision',
    condition: 'reject',
    to: 'stopped',
    owner: 'gate',
  },
  {
    id: 'G-5',
    from: 'plan',
    event: 'gate_decision',
    condition: 'approve',
    to: 'implement:red',
    owner: 'gate',
  },
  { id: 'G-6', from: 'plan', event: 'gate_decision', condition: 'edit', to: 'plan', owner: 'gate' },
  {
    id: 'G-7',
    from: 'plan',
    event: 'gate_decision',
    condition: 'reject',
    to: 'stopped',
    owner: 'gate',
  },
  {
    id: 'G-8',
    from: 'implement:red',
    event: 'run_report',
    condition: 'status_0_more_red_goals',
    to: 'implement:red',
    owner: 'persona',
  },
  {
    id: 'G-9',
    from: 'implement:red',
    event: 'run_report',
    condition: 'status_0_all_red_goals_finished',
    to: 'implement:triage',
    owner: 'persona',
  },
  {
    id: 'G-10',
    from: 'implement:triage',
    event: 'triage_result',
    condition: 'no_anomaly',
    to: 'implement:green',
    owner: 'tool',
  },
  {
    id: 'G-11',
    from: 'implement:triage',
    event: 'triage_result',
    condition: 'wrong_reason_failure',
    to: 'implement:red',
    owner: 'tool',
  },
  {
    id: 'G-12',
    from: 'implement:triage',
    event: 'triage_result',
    condition: 'other_anomaly',
    to: 'ask_human',
    owner: 'tool',
  },
  {
    id: 'G-13',
    from: 'implement:green',
    event: 'run_report',
    condition: 'status_0',
    to: 'checks',
    owner: 'persona',
  },
  {
    id: 'G-14',
    from: 'checks',
    event: 'check_result',
    condition: 'after_green_pass',
    to: 'implement:refactor',
    owner: 'tool',
  },
  {
    id: 'G-15',
    from: 'checks',
    event: 'check_result',
    condition: 'after_green_fail',
    to: 'implement:green',
    owner: 'tool',
  },
  {
    id: 'G-16',
    from: 'implement:refactor',
    event: 'run_report',
    condition: 'status_0',
    to: 'checks',
    owner: 'persona',
  },
  {
    id: 'G-17',
    from: 'checks',
    event: 'check_result',
    condition: 'after_refactor_pass_more_goals',
    to: 'implement:red',
    owner: 'tool',
  },
  {
    id: 'G-18',
    from: 'checks',
    event: 'check_result',
    condition: 'after_refactor_pass_last_goal',
    to: 'trace',
    owner: 'tool',
  },
  {
    id: 'G-19',
    from: 'checks',
    event: 'check_result',
    condition: 'after_refactor_fail',
    to: 'implement:refactor',
    owner: 'tool',
  },
  {
    id: 'G-20',
    from: ['implement:red', 'implement:triage', 'implement:green', 'implement:refactor'],
    event: 'run_report',
    condition: 'status_1_or_missing_next_cheap_model',
    to: 'same_phase',
    owner: 'persona',
  },
  {
    id: 'G-21',
    from: ['implement:red', 'implement:triage', 'implement:green', 'implement:refactor'],
    event: 'run_report',
    condition: 'status_2',
    to: 'escalation',
    owner: 'persona',
  },
  {
    id: 'G-22',
    from: 'escalation',
    event: 'gate_decision',
    condition: 'approve',
    to: 'escalation',
    owner: 'gate',
  },
  {
    id: 'G-23',
    from: 'escalation',
    event: 'gate_decision',
    condition: 'edit',
    to: 'same_phase',
    owner: 'gate',
  },
  {
    id: 'G-24',
    from: 'escalation',
    event: 'gate_decision',
    condition: 'reject',
    to: 'stopped',
    owner: 'gate',
  },
  {
    id: 'G-25',
    from: 'escalation',
    event: 'escalation_result',
    condition: 'resolved',
    to: 'checks',
    owner: 'tool',
  },
  {
    id: 'G-26',
    from: 'escalation',
    event: 'escalation_result',
    condition: 'partial',
    to: 'ask_human',
    owner: 'tool',
  },
  {
    id: 'G-27',
    from: 'escalation',
    event: 'escalation_result',
    condition: 'cannot',
    to: 'ask_human',
    owner: 'tool',
  },
  {
    id: 'G-28',
    from: 'trace',
    event: 'trace_result',
    condition: 'no_gap',
    to: 'validate',
    owner: 'tool',
  },
  {
    id: 'G-29',
    from: 'trace',
    event: 'trace_result',
    condition: 'gap',
    to: 'implement:green',
    owner: 'tool',
  },
  {
    id: 'G-30',
    from: 'validate',
    event: 'validate_result',
    condition: 'all_met',
    to: 'push',
    owner: 'tool',
  },
  {
    id: 'G-31',
    from: 'validate',
    event: 'validate_result',
    condition: 'partial_or_missing',
    to: 'implement:green',
    owner: 'tool',
  },
  {
    id: 'G-32',
    from: 'push',
    event: 'gate_decision',
    condition: 'approve',
    to: 'ci',
    owner: 'gate',
  },
  {
    id: 'G-33',
    from: 'push',
    event: 'gate_decision',
    condition: 'edit_walkthrough',
    to: 'push',
    owner: 'gate',
  },
  {
    id: 'G-34',
    from: 'push',
    event: 'gate_decision',
    condition: 'edit_rework',
    to: 'patch_plan',
    owner: 'gate',
  },
  {
    id: 'G-35',
    from: 'push',
    event: 'gate_decision',
    condition: 'reject',
    to: 'stopped',
    owner: 'gate',
  },
  {
    id: 'G-36',
    from: ['push', 'ci'],
    event: 'head_check',
    condition: 'validated_head_differs',
    to: 'trace',
    owner: 'tool',
  },
  { id: 'G-37', from: 'ci', event: 'ci_result', condition: 'success', to: 'done', owner: 'tool' },
  {
    id: 'G-38',
    from: 'ci',
    event: 'ci_result',
    condition: 'failure',
    to: 'patch_plan',
    owner: 'tool',
  },
  {
    id: 'G-39',
    from: 'ci',
    event: 'ci_result',
    condition: 'ci_incomplete',
    to: 'ask_human',
    owner: 'tool',
  },
  {
    id: 'G-40',
    from: 'patch_plan',
    event: 'planner_output',
    condition: 'patch_plan_written',
    to: 'plan',
    owner: 'persona',
  },
  {
    id: 'G-41',
    from: 'patch_plan',
    event: 'planner_output',
    condition: 'correct_course_proposal',
    to: 'correct_course',
    owner: 'persona',
  },
  {
    id: 'G-42',
    from: 'correct_course',
    event: 'gate_decision',
    condition: 'approve',
    to: 'revision_run',
    owner: 'gate',
  },
  {
    id: 'G-43',
    from: 'correct_course',
    event: 'gate_decision',
    condition: 'edit',
    to: 'correct_course',
    owner: 'gate',
  },
  {
    id: 'G-44',
    from: 'correct_course',
    event: 'gate_decision',
    condition: 'reject',
    to: 'patch_plan',
    owner: 'gate',
  },
  {
    id: 'G-45',
    from: 'ask_human',
    event: 'gate_decision',
    condition: 'continue',
    to: 'resume_stage',
    owner: 'gate',
  },
  {
    id: 'G-46',
    from: 'ask_human',
    event: 'gate_decision',
    condition: 'escalate',
    to: 'escalation',
    owner: 'gate',
  },
  {
    id: 'G-47',
    from: 'ask_human',
    event: 'gate_decision',
    condition: 'edit_plan',
    to: 'patch_plan',
    owner: 'gate',
  },
  {
    id: 'G-48',
    from: 'ask_human',
    event: 'gate_decision',
    condition: 'stop',
    to: 'stopped',
    owner: 'gate',
  },
  {
    id: 'G-49',
    from: 'non_terminal_stages',
    event: 'stop_ticket',
    condition: 'ticket_key',
    to: 'confirm_action',
    owner: 'tool',
  },
  {
    id: 'G-50',
    from: 'no_intent_record',
    event: 'skip_ticket',
    condition: 'ticket_key',
    to: 'confirm_action',
    owner: 'tool',
  },
  {
    id: 'G-51',
    from: 'stopped',
    event: 'start_ticket',
    condition: 'restart',
    to: 'confirm_action',
    owner: 'tool',
  },
  {
    id: 'G-52',
    from: 'confirm_action',
    event: 'gate_decision',
    condition: 'approve_stop',
    to: 'stopped',
    owner: 'gate',
  },
  {
    id: 'G-53',
    from: 'confirm_action',
    event: 'gate_decision',
    condition: 'approve_skip',
    to: 'skipped',
    owner: 'gate',
  },
  {
    id: 'G-54',
    from: 'confirm_action',
    event: 'gate_decision',
    condition: 'approve_restart',
    to: 'spec',
    owner: 'gate',
  },
  {
    id: 'G-55',
    from: 'confirm_action',
    event: 'gate_decision',
    condition: 'reject',
    to: 'previous_stage',
    owner: 'gate',
  },
];

const row = (id: string) => {
  const match = DEFAULT_GRAPH.rows.find((candidate) => candidate.id === id);
  if (!match) throw new Error(`Missing graph row ${id}`);
  return match;
};

function withRows(rows: GraphRow[]): StageGraph {
  return { ...DEFAULT_GRAPH, rows };
}

describe('stage graph', () => {
  it.each(catalog)('$id matches its FR-4 row', ({ id, from, event, condition, to, owner }) => {
    expect(row(id)).toMatchObject({ from, event, condition, to, owner });
  });

  it('validates the default graph at load time', () => {
    expect(() => validateGraph(DEFAULT_GRAPH)).not.toThrow();
  });

  it('rejects an unreachable Stage', () => {
    const invalidGraph: StageGraph = { ...DEFAULT_GRAPH, initial: 'plan' };
    expect(() => validateGraph(invalidGraph)).toThrow(/unreachable/i);
  });

  it('rejects an edge to an undefined Stage', () => {
    const invalidGraph = withRows(
      DEFAULT_GRAPH.rows.map((candidate) =>
        candidate.id === 'G-1'
          ? ({ ...candidate, to: 'missing' } as unknown as GraphRow)
          : candidate,
      ),
    );
    expect(() => validateGraph(invalidGraph)).toThrow(/undefined Stage/i);
  });

  it('rejects a Gate kind missing an outgoing decision edge', () => {
    const invalidGraph = withRows(DEFAULT_GRAPH.rows.filter((candidate) => candidate.id !== 'G-4'));
    expect(() => validateGraph(invalidGraph)).toThrow(/decision/i);
  });

  it('rejects a Stage with no owner', () => {
    const invalidGraph = {
      ...DEFAULT_GRAPH,
      stages: { ...DEFAULT_GRAPH.stages, plan: { owner: undefined } },
    } as unknown as StageGraph;
    expect(() => validateGraph(invalidGraph)).toThrow(/owner/i);
  });

  it('rejects two rows matching the same condition', () => {
    const duplicate = { ...row('G-1'), id: 'G-DUPLICATE' } as GraphRow;
    const invalidGraph = withRows([...DEFAULT_GRAPH.rows, duplicate]);
    expect(() => validateGraph(invalidGraph)).toThrow(/same condition|ambiguous|match/i);
  });

  it.each(['done', 'skipped'] as const)('rejects an outgoing edge from %s', (stage) => {
    const invalidGraph = withRows([
      ...DEFAULT_GRAPH.rows,
      {
        id: `G-OUT-${stage}`,
        from: stage,
        event: 'unexpected',
        condition: 'unexpected',
        to: 'spec',
        owner: 'tool',
      } as unknown as GraphRow,
    ]);
    expect(() => validateGraph(invalidGraph)).toThrow(/terminal|outgoing/i);
  });

  it('rejects an edge from stopped other than the restart edge', () => {
    const invalidGraph = withRows([
      ...DEFAULT_GRAPH.rows,
      {
        id: 'G-STOP-INVALID',
        from: 'stopped',
        event: 'stop_ticket',
        condition: 'ticket_key',
        to: 'confirm_action',
        owner: 'tool',
      } as unknown as GraphRow,
    ]);
    expect(() => validateGraph(invalidGraph)).toThrow(/stopped|restart/i);
  });
});
