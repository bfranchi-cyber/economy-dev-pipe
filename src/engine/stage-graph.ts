import {
  GateDecisionSchema,
  GateKindSchema,
  GoalPhaseSchema,
  StageSchema,
  type GateDecision,
  type GateKind,
  type GoalPhase,
  type Stage,
  type StatusCode,
} from './schemas.js';

export type StageOwner = 'persona' | 'gate' | 'tool';
export type GraphEvent =
  | 'start_ticket'
  | 'run_report'
  | 'gate_decision'
  | 'triage_result'
  | 'check_result'
  | 'escalation_result'
  | 'trace_result'
  | 'validate_result'
  | 'head_check'
  | 'ci_result'
  | 'planner_output'
  | 'stop_ticket'
  | 'skip_ticket';
export type DynamicStageRef = 'same_phase' | 'revision_run' | 'resume_stage' | 'previous_stage';
export type StageRef = Stage | DynamicStageRef;
export type StageSource = Stage | 'non_terminal_stages' | 'no_intent_record' | readonly Stage[];

export interface StageDefinition {
  owner: StageOwner;
  persona?: string;
  phase?: GoalPhase;
  terminal?: boolean;
}

export interface GateDefinition {
  stage: Stage;
  decisions: readonly GateDecision[];
}

export interface GraphRow {
  id: string;
  from: StageSource;
  event: GraphEvent;
  condition: string;
  decision?: GateDecision;
  status?: StatusCode;
  to: StageRef;
  owner: StageOwner;
}

export interface StageGraph {
  initial: Stage;
  terminal: Stage;
  stages: Record<Stage, StageDefinition>;
  goal_phases: Record<GoalPhase, Stage>;
  gates: Partial<Record<GateKind, GateDefinition>>;
  rows: GraphRow[];
}

const goalPhaseEntries = GoalPhaseSchema.options.map(
  (phase) => [phase, `implement:${phase}`] as const,
);
const goalPhases = Object.fromEntries(goalPhaseEntries) as Record<GoalPhase, Stage>;

const stageDefinitions: Record<Stage, StageDefinition> = {
  start: { owner: 'tool' },
  spec: { owner: 'persona', persona: 'spec' },
  plan: { owner: 'persona', persona: 'planner' },
  'implement:red': { owner: 'persona', persona: 'developer', phase: 'red' },
  'implement:triage': { owner: 'tool', phase: 'triage' },
  'implement:green': { owner: 'persona', persona: 'developer', phase: 'green' },
  'implement:refactor': { owner: 'persona', persona: 'developer', phase: 'refactor' },
  checks: { owner: 'tool' },
  escalation: { owner: 'gate' },
  trace: { owner: 'tool' },
  validate: { owner: 'tool' },
  push: { owner: 'gate' },
  ci: { owner: 'tool' },
  patch_plan: { owner: 'persona', persona: 'planner' },
  correct_course: { owner: 'gate' },
  ask_human: { owner: 'gate' },
  confirm_action: { owner: 'gate' },
  stopped: { owner: 'tool' },
  skipped: { owner: 'tool', terminal: true },
  done: { owner: 'tool', terminal: true },
};

const gateDefinitions: Partial<Record<GateKind, GateDefinition>> = {
  spec: { stage: 'spec', decisions: ['approve', 'edit', 'reject'] },
  plan: { stage: 'plan', decisions: ['approve', 'edit', 'reject'] },
  escalation: { stage: 'escalation', decisions: ['approve', 'edit', 'reject'] },
  push: { stage: 'push', decisions: ['approve', 'edit_walkthrough', 'edit_rework', 'reject'] },
  correct_course: { stage: 'correct_course', decisions: ['approve', 'edit', 'reject'] },
  ask_human: { stage: 'ask_human', decisions: ['continue', 'escalate', 'edit_plan', 'stop'] },
  confirm_action: { stage: 'confirm_action', decisions: ['approve', 'reject'] },
};

type RowDefinition = readonly [
  id: string,
  from: StageSource,
  event: GraphEvent,
  condition: string,
  to: StageRef,
  owner: StageOwner,
  decision?: GateDecision,
  status?: StatusCode,
];

const goalPhaseStages = GoalPhaseSchema.options.map((phase) => goalPhases[phase]);
const nonTerminalStages = StageSchema.options.filter(
  (stage) => stage !== 'done' && stage !== 'skipped' && stage !== 'stopped',
);

const rowDefinitions: readonly RowDefinition[] = [
  ['G-1', 'start', 'start_ticket', 'new_ticket', 'spec', 'tool'],
  ['G-2', 'spec', 'gate_decision', 'approve', 'plan', 'gate', 'approve'],
  ['G-3', 'spec', 'gate_decision', 'edit', 'spec', 'gate', 'edit'],
  ['G-4', 'spec', 'gate_decision', 'reject', 'stopped', 'gate', 'reject'],
  ['G-5', 'plan', 'gate_decision', 'approve', 'implement:red', 'gate', 'approve'],
  ['G-6', 'plan', 'gate_decision', 'edit', 'plan', 'gate', 'edit'],
  ['G-7', 'plan', 'gate_decision', 'reject', 'stopped', 'gate', 'reject'],
  [
    'G-8',
    'implement:red',
    'run_report',
    'status_0_more_red_goals',
    'implement:red',
    'persona',
    undefined,
    0,
  ],
  [
    'G-9',
    'implement:red',
    'run_report',
    'status_0_all_red_goals_finished',
    'implement:triage',
    'persona',
    undefined,
    0,
  ],
  ['G-10', 'implement:triage', 'triage_result', 'no_anomaly', 'implement:green', 'tool'],
  ['G-11', 'implement:triage', 'triage_result', 'wrong_reason_failure', 'implement:red', 'tool'],
  ['G-12', 'implement:triage', 'triage_result', 'other_anomaly', 'ask_human', 'tool'],
  ['G-13', 'implement:green', 'run_report', 'status_0', 'checks', 'persona', undefined, 0],
  ['G-14', 'checks', 'check_result', 'after_green_pass', 'implement:refactor', 'tool'],
  ['G-15', 'checks', 'check_result', 'after_green_fail', 'implement:green', 'tool'],
  ['G-16', 'implement:refactor', 'run_report', 'status_0', 'checks', 'persona', undefined, 0],
  ['G-17', 'checks', 'check_result', 'after_refactor_pass_more_goals', 'implement:red', 'tool'],
  ['G-18', 'checks', 'check_result', 'after_refactor_pass_last_goal', 'trace', 'tool'],
  ['G-19', 'checks', 'check_result', 'after_refactor_fail', 'implement:refactor', 'tool'],
  [
    'G-20',
    goalPhaseStages,
    'run_report',
    'status_1_or_missing_next_cheap_model',
    'same_phase',
    'persona',
    undefined,
    1,
  ],
  ['G-21', goalPhaseStages, 'run_report', 'status_2', 'escalation', 'persona', undefined, 2],
  ['G-22', 'escalation', 'gate_decision', 'approve', 'escalation', 'gate', 'approve'],
  ['G-23', 'escalation', 'gate_decision', 'edit', 'same_phase', 'gate', 'edit'],
  ['G-24', 'escalation', 'gate_decision', 'reject', 'stopped', 'gate', 'reject'],
  ['G-25', 'escalation', 'escalation_result', 'resolved', 'checks', 'tool'],
  ['G-26', 'escalation', 'escalation_result', 'partial', 'ask_human', 'tool'],
  ['G-27', 'escalation', 'escalation_result', 'cannot', 'ask_human', 'tool'],
  ['G-28', 'trace', 'trace_result', 'no_gap', 'validate', 'tool'],
  ['G-29', 'trace', 'trace_result', 'gap', 'implement:green', 'tool'],
  ['G-30', 'validate', 'validate_result', 'all_met', 'push', 'tool'],
  ['G-31', 'validate', 'validate_result', 'partial_or_missing', 'implement:green', 'tool'],
  ['G-32', 'push', 'gate_decision', 'approve', 'ci', 'gate', 'approve'],
  ['G-33', 'push', 'gate_decision', 'edit_walkthrough', 'push', 'gate', 'edit_walkthrough'],
  ['G-34', 'push', 'gate_decision', 'edit_rework', 'patch_plan', 'gate', 'edit_rework'],
  ['G-35', 'push', 'gate_decision', 'reject', 'stopped', 'gate', 'reject'],
  ['G-36', ['push', 'ci'], 'head_check', 'validated_head_differs', 'trace', 'tool'],
  ['G-37', 'ci', 'ci_result', 'success', 'done', 'tool'],
  ['G-38', 'ci', 'ci_result', 'failure', 'patch_plan', 'tool'],
  ['G-39', 'ci', 'ci_result', 'ci_incomplete', 'ask_human', 'tool'],
  ['G-40', 'patch_plan', 'planner_output', 'patch_plan_written', 'plan', 'persona'],
  ['G-41', 'patch_plan', 'planner_output', 'correct_course_proposal', 'correct_course', 'persona'],
  ['G-42', 'correct_course', 'gate_decision', 'approve', 'revision_run', 'gate', 'approve'],
  ['G-43', 'correct_course', 'gate_decision', 'edit', 'correct_course', 'gate', 'edit'],
  ['G-44', 'correct_course', 'gate_decision', 'reject', 'patch_plan', 'gate', 'reject'],
  ['G-45', 'ask_human', 'gate_decision', 'continue', 'resume_stage', 'gate', 'continue'],
  ['G-46', 'ask_human', 'gate_decision', 'escalate', 'escalation', 'gate', 'escalate'],
  ['G-47', 'ask_human', 'gate_decision', 'edit_plan', 'patch_plan', 'gate', 'edit_plan'],
  ['G-48', 'ask_human', 'gate_decision', 'stop', 'stopped', 'gate', 'stop'],
  ['G-49', 'non_terminal_stages', 'stop_ticket', 'ticket_key', 'confirm_action', 'tool'],
  ['G-50', 'no_intent_record', 'skip_ticket', 'ticket_key', 'confirm_action', 'tool'],
  ['G-51', 'stopped', 'start_ticket', 'restart', 'confirm_action', 'tool'],
  ['G-52', 'confirm_action', 'gate_decision', 'approve_stop', 'stopped', 'gate', 'approve'],
  ['G-53', 'confirm_action', 'gate_decision', 'approve_skip', 'skipped', 'gate', 'approve'],
  ['G-54', 'confirm_action', 'gate_decision', 'approve_restart', 'spec', 'gate', 'approve'],
  ['G-55', 'confirm_action', 'gate_decision', 'reject', 'previous_stage', 'gate', 'reject'],
];

const rows: GraphRow[] = rowDefinitions.map(
  ([id, from, event, condition, to, owner, decision, status]) => ({
    id,
    from,
    event,
    condition,
    ...(decision === undefined ? {} : { decision }),
    ...(status === undefined ? {} : { status }),
    to,
    owner,
  }),
);

export const DEFAULT_GRAPH: StageGraph = {
  initial: 'start',
  terminal: 'done',
  stages: stageDefinitions,
  goal_phases: goalPhases,
  gates: gateDefinitions,
  rows,
};

function isStage(value: string): value is Stage {
  return StageSchema.safeParse(value).success;
}

function rowSources(source: StageSource, graph: StageGraph): readonly Stage[] {
  if (source === 'non_terminal_stages') return nonTerminalStages;
  if (source === 'no_intent_record') return [graph.initial];
  return Array.isArray(source) ? source : [source as Stage];
}

function rowTargets(target: StageRef, source: Stage): readonly Stage[] {
  if (target === 'same_phase' || target === 'resume_stage' || target === 'previous_stage')
    return [source];
  if (target === 'revision_run') return ['spec', 'plan'];
  return [target];
}

function reachableStages(graph: StageGraph): Set<Stage> {
  const reached = new Set<Stage>([graph.initial]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const row of graph.rows) {
      for (const source of rowSources(row.from, graph)) {
        if (!reached.has(source)) continue;
        for (const target of rowTargets(row.to, source)) {
          if (graph.stages[target] && !reached.has(target)) {
            reached.add(target);
            changed = true;
          }
        }
      }
    }
  }
  return reached;
}

function validateStages(graph: StageGraph): void {
  for (const stage of StageSchema.options) {
    const definition = graph.stages[stage];
    if (!definition || !['persona', 'gate', 'tool'].includes(definition.owner)) {
      throw new Error(`Stage ${stage} is missing or has an invalid owner.`);
    }
    if (definition.owner === 'persona' && !definition.persona) {
      throw new Error(`Persona-owned Stage ${stage} is missing its persona.`);
    }
  }
}

function validateRows(graph: StageGraph): void {
  const conditions = new Set<string>();
  for (const row of graph.rows) {
    if (!['persona', 'gate', 'tool'].includes(row.owner)) {
      throw new Error(`Graph row ${row.id} is missing or has an invalid owner.`);
    }
    if (!row.condition || !row.event)
      throw new Error(`Graph row ${row.id} is missing its condition or event.`);
    if (row.decision && !GateDecisionSchema.safeParse(row.decision).success) {
      throw new Error(`Graph row ${row.id} has an unknown Gate decision.`);
    }
    if (row.from !== 'non_terminal_stages' && row.from !== 'no_intent_record') {
      const sources = rowSources(row.from, graph);
      if (sources.some((source) => !isStage(source) || !graph.stages[source])) {
        throw new Error(`Graph row ${row.id} references an undefined Stage source.`);
      }
    }
    if (
      !['same_phase', 'revision_run', 'resume_stage', 'previous_stage'].includes(row.to) &&
      (!isStage(row.to) || !graph.stages[row.to])
    ) {
      throw new Error(`Graph row ${row.id} targets an undefined Stage.`);
    }
    for (const source of rowSources(row.from, graph)) {
      const key = `${source}|${row.event}|${row.condition}`;
      if (conditions.has(key)) throw new Error(`Graph rows have the same condition for ${source}.`);
      conditions.add(key);
    }
    if (
      row.from === 'done' ||
      row.from === 'skipped' ||
      (Array.isArray(row.from) &&
        row.from.some((source) => source === 'done' || source === 'skipped'))
    ) {
      throw new Error(`Terminal Stage ${row.from} cannot have outgoing edges.`);
    }
    if (
      row.from === 'stopped' &&
      !(row.event === 'start_ticket' && row.condition === 'restart' && row.to === 'confirm_action')
    ) {
      throw new Error('The stopped Stage permits only the restart edge.');
    }
  }
}

function validateGateDecisions(graph: StageGraph): void {
  for (const [kind, gate] of Object.entries(graph.gates) as [GateKind, GateDefinition][]) {
    if (!GateKindSchema.safeParse(kind).success || !graph.stages[gate.stage]) {
      throw new Error(`Gate ${kind} references an undefined Stage.`);
    }
    for (const decision of gate.decisions) {
      const hasEdge = graph.rows.some(
        (row) =>
          row.from === gate.stage && row.event === 'gate_decision' && row.decision === decision,
      );
      if (!hasEdge) throw new Error(`Gate ${kind} has no outgoing edge for decision ${decision}.`);
    }
  }
}

export function validateGraph(graph: StageGraph): void {
  if (!isStage(graph.initial) || !isStage(graph.terminal)) {
    throw new Error('Graph initial and terminal must be known stages.');
  }
  if (!graph.stages[graph.terminal]?.terminal) {
    throw new Error('The terminal stage must be marked terminal.');
  }

  validateStages(graph);
  validateRows(graph);
  validateGateDecisions(graph);

  const reached = reachableStages(graph);
  const unreachable = StageSchema.options.filter(
    (stage) => graph.stages[stage] && !reached.has(stage),
  );
  if (unreachable.length > 0) {
    throw new Error(`Graph contains unreachable Stage(s): ${unreachable.join(', ')}.`);
  }
}

validateGraph(DEFAULT_GRAPH);
