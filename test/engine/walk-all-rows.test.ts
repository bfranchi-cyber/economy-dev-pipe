import { describe, expect, it } from 'vitest';
import { decide } from '../../src/engine/decide.js';
import { StateSchema, type Event, type Stage } from '../../src/engine/schemas.js';
import { DEFAULT_GRAPH } from '../../src/engine/stage-graph.js';
import { decideRow, makeEvent } from './graph-row-fixtures.js';

describe('Expected demo: table-driven walk of the Stage Graph', () => {
  it('visits every graph row G-1 through G-55 exactly once', () => {
    const visited = DEFAULT_GRAPH.rows.map((row) => {
      const result = decideRow(row);
      expect(result.error).toBeUndefined();
      expect(result.row_id).toBe(row.id);
      return result.row_id;
    });

    expect(visited).toHaveLength(55);
    expect(new Set(visited).size).toBe(55);
    expect(visited).toEqual(Array.from({ length: 55 }, (_, index) => `G-${index + 1}`));
  });

  it('refuses every other Stage and event-type pair without changing State', () => {
    const matchingPairs = new Set(
      DEFAULT_GRAPH.rows.flatMap((row) => {
        const event = makeEvent(row);
        if (row.from === 'no_intent_record') return [`start:${event.type}`];
        if (row.from === 'non_terminal_stages') {
          const stages = Object.entries(DEFAULT_GRAPH.stages)
            .filter(([stage, definition]) => !definition.terminal && stage !== 'stopped')
            .map(([stage]) => stage);
          return stages.map((stage) => `${stage}:${event.type}`);
        }
        const stages = Array.isArray(row.from) ? row.from : [row.from];
        return stages.map((stage) => `${stage}:${event.type}`);
      }),
    );
    const eventSamples = new Map<Event['type'], Event>();
    for (const row of DEFAULT_GRAPH.rows) {
      const event = makeEvent(row);
      eventSamples.set(event.type, event);
    }
    const refused: string[] = [];

    for (const stage of Object.keys(DEFAULT_GRAPH.stages) as Stage[]) {
      for (const [eventType, sample] of eventSamples) {
        const pair = `${stage}:${eventType}`;
        if (matchingPairs.has(pair)) continue;
        const state = StateSchema.parse({ stage });
        const event: Event =
          sample.type === 'gate_decision'
            ? { type: 'gate_decision', gate: { kind: 'spec', decision: 'approve' } }
            : sample;
        const result = decide(state, event, DEFAULT_GRAPH, {
          now: '2026-11-17T12:00:00.000Z',
          ids: () => 'R-next',
        });
        expect(result.error?.code, `${pair} should be refused`).toBe('E_INVALID_TRANSITION');
        expect(result.state).toEqual(state);
        refused.push(pair);
      }
    }

    expect(refused.length).toBeGreaterThan(0);
  });
});
