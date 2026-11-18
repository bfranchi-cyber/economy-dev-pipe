import { StageSchema, type Stage, type StatusCode } from './schemas.js';

export type StageOwner = 'persona' | 'gate' | 'tool';

export interface StageDefinition {
  owner: StageOwner;
  persona?: string;
  terminal?: boolean;
}

export interface GraphRow {
  id: string;
  from: Stage;
  event: 'start' | 'run_report';
  status?: StatusCode;
  to: Stage;
  owner: StageOwner;
}

export interface StageGraph {
  initial: Stage;
  terminal: Stage;
  stages: Record<string, StageDefinition>;
  rows: GraphRow[];
}

export const DEFAULT_GRAPH: StageGraph = {
  initial: 'start',
  terminal: 'done',
  stages: {
    start: { owner: 'tool' },
    spec: { owner: 'persona', persona: 'spec' },
    ask_human: { owner: 'gate' },
    done: { owner: 'tool', terminal: true },
  },
  rows: [
    { id: 'G-1', from: 'spec', event: 'run_report', status: 'ok', to: 'done', owner: 'persona' },
    {
      id: 'G-2',
      from: 'spec',
      event: 'run_report',
      status: 'blocked',
      to: 'ask_human',
      owner: 'persona',
    },
    { id: 'G-3', from: 'start', event: 'start', to: 'spec', owner: 'tool' },
  ],
};

function isStage(value: string): value is Stage {
  return StageSchema.safeParse(value).success;
}

function reachableStages(graph: StageGraph): Set<Stage> {
  const reached = new Set<Stage>([graph.initial]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const row of graph.rows) {
      if (reached.has(row.from) && !reached.has(row.to)) {
        reached.add(row.to);
        changed = true;
      }
    }
  }
  return reached;
}

export function validateGraph(graph: StageGraph): void {
  if (!isStage(graph.initial) || !isStage(graph.terminal)) {
    throw new Error('Graph initial and terminal must be known stages.');
  }
  if (!graph.stages[graph.terminal]?.terminal) {
    throw new Error('The terminal stage must be marked terminal.');
  }

  for (const row of graph.rows) {
    if (!row.owner || !['persona', 'gate', 'tool'].includes(row.owner)) {
      throw new Error(`Graph row ${row.id} is missing or has an invalid owner.`);
    }
    if (!isStage(row.from) || !isStage(row.to)) {
      throw new Error(`Graph row ${row.id} has an unknown Stage target or source.`);
    }
    if (!graph.stages[row.to]) {
      throw new Error(`Graph row ${row.id} targets an undefined Stage.`);
    }
    if (!graph.stages[row.from]) {
      throw new Error(`Graph row ${row.id} references an undefined Stage.`);
    }
    if (row.event === 'run_report' && !row.status) {
      throw new Error(`Graph row ${row.id} is missing its report status.`);
    }
  }

  const reached = reachableStages(graph);
  const unreachable = Object.keys(graph.stages).filter((stage) => !reached.has(stage as Stage));
  if (unreachable.length > 0) {
    throw new Error(`Graph contains unreachable Stage(s): ${unreachable.join(', ')}.`);
  }
}

validateGraph(DEFAULT_GRAPH);
