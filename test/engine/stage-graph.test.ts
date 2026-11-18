import { describe, expect, it } from 'vitest';
import { DEFAULT_GRAPH, validateGraph, type StageGraph } from '../../src/engine/stage-graph.js';

const row = (id: string) => {
  const match = DEFAULT_GRAPH.rows.find((candidate) => candidate.id === id);
  if (!match) throw new Error(`Missing graph row ${id}`);
  return match;
};

describe('stage graph', () => {
  it('G-1 sends an ok spec report to done', () => {
    expect(row('G-1')).toMatchObject({
      from: 'spec',
      event: 'run_report',
      status: 'ok',
      to: 'done',
      owner: 'persona',
    });
  });

  it('G-2 sends a blocked spec report to ask_human', () => {
    expect(row('G-2')).toMatchObject({
      from: 'spec',
      event: 'run_report',
      status: 'blocked',
      to: 'ask_human',
      owner: 'persona',
    });
  });

  it('G-3 starts the persona-owned spec stage', () => {
    expect(row('G-3')).toMatchObject({
      from: 'start',
      event: 'start',
      to: 'spec',
      owner: 'tool',
    });
    expect(DEFAULT_GRAPH.stages.spec).toMatchObject({ owner: 'persona', persona: 'spec' });
  });

  it('validates the default graph at load time', () => {
    expect(() => validateGraph(DEFAULT_GRAPH)).not.toThrow();
  });

  it('rejects an unknown Stage target', () => {
    const invalidGraph: StageGraph = {
      ...DEFAULT_GRAPH,
      rows: DEFAULT_GRAPH.rows.map((candidate) =>
        candidate.id === 'G-1'
          ? ({ ...candidate, to: 'missing' } as unknown as StageGraph['rows'][number])
          : candidate,
      ),
    };

    expect(() => validateGraph(invalidGraph)).toThrow(/unknown stage/i);
  });

  it('rejects a row without an owner', () => {
    const invalidGraph: StageGraph = {
      ...DEFAULT_GRAPH,
      rows: DEFAULT_GRAPH.rows.map((candidate) => ({ ...candidate, owner: undefined }) as never),
    };

    expect(() => validateGraph(invalidGraph)).toThrow(/owner/i);
  });

  it('rejects an unreachable Stage', () => {
    const invalidGraph: StageGraph = {
      ...DEFAULT_GRAPH,
      stages: {
        ...DEFAULT_GRAPH.stages,
        orphan: { owner: 'tool' as const },
      },
    };

    expect(() => validateGraph(invalidGraph)).toThrow(/unreachable/i);
  });
});
