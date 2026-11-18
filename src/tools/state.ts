import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { decide } from '../engine/decide.js';
import { DEFAULT_GRAPH } from '../engine/stage-graph.js';
import {
  EffectSchema,
  EventSchema,
  RunSchema,
  StateSchema,
  StatusCodeSchema,
  type Effect,
  type ErrorCode,
  type Run,
  type State,
  type StatusCode,
  type ToolEnvelope,
} from '../engine/schemas.js';
import { appendMemlog, appendToolCall } from '../store/append-log.js';
import { withTicketMutex } from '../store/mutex.js';
import { createRecordStore } from '../store/record.js';
import { FAKE_TICKET_KEY, isFakeTicket } from './fake-ticket.js';
import { fail, ok } from './envelope.js';

const GetInputSchema = z.object({ key: z.string().min(1), run_id: z.string().optional() }).strict();
const AdvanceInputSchema = z
  .object({
    key: z.string().min(1),
    run: RunSchema.optional(),
    run_id: z.string().optional(),
    status: StatusCodeSchema,
    summary: z.string().optional(),
    reason: z.string().optional(),
  })
  .strict();

interface TicketRecord {
  boot_id: string;
  state: State;
  last_advance?: { run_id: string; status: StatusCode; envelope: ToolEnvelope<unknown> };
}

export interface StateToolsOptions {
  home: string;
  repoId: string;
  bootId: string;
  now?: () => string;
  ids?: () => string;
}

export type Directive = Effect;

function errorResult(code: ErrorCode, message: string): ToolEnvelope<never> {
  return fail({ code, message });
}

function initialRecord(bootId: string): TicketRecord {
  return { boot_id: bootId, state: StateSchema.parse({ stage: 'start' }) };
}

function gateForStage(state: State): string | undefined {
  return Object.entries(DEFAULT_GRAPH.gates).find(([, gate]) => gate?.stage === state.stage)?.[0];
}

function completedGateRun(state: State, run: Run, status: StatusCode): State | undefined {
  if (!state.run || state.run.id !== run.id || state.run.stage !== state.stage) return undefined;
  const gateKind = gateForStage(state);
  if (status !== 0 || !gateKind) return undefined;
  return { ...state, run: undefined };
}

export function createStateTools(options: StateToolsOptions) {
  const store = createRecordStore({ home: options.home, repoId: options.repoId });
  const now = options.now ?? (() => new Date().toISOString());
  const ids = options.ids ?? (() => `R-${randomUUID()}`);
  const ticketPath = (key: string, file: string) => join(options.home, options.repoId, key, file);

  async function loadTicket(key: string): Promise<TicketRecord | undefined> {
    const stored = await store.load<TicketRecord>(key);
    if (stored.ok) return stored.data;
    if (!stored.error.message.startsWith('Record does not exist')) return undefined;
    const created = await store.commit(key, initialRecord(options.bootId));
    return created.ok ? created.data : undefined;
  }

  async function logToolCall(
    key: string,
    tool: string,
    envelope: ToolEnvelope<unknown>,
  ): Promise<void> {
    await appendToolCall(ticketPath(key, 'tool-calls.yml'), {
      timestamp: now(),
      tool,
      key,
      ok: envelope.ok,
      ...(!envelope.ok ? { error_code: envelope.error.code } : {}),
    });
  }

  async function getDirective(key: string): Promise<ToolEnvelope<Directive>> {
    return withTicketMutex(`${options.repoId}/${key}`, async () => {
      const record = await loadTicket(key);
      if (!record) return errorResult('E_RECORD_CORRUPT', 'Ticket record is unavailable.');
      const state = StateSchema.parse(record.state);
      if (state.run) return ok(EffectSchema.parse({ type: 'run_persona', run: state.run }));
      const decision = decide(
        state,
        EventSchema.parse({ type: 'start_ticket', ticket_key: key }),
        DEFAULT_GRAPH,
        { now: now(), ids },
      );
      if (!decision.error && decision.row_id) {
        const effect = decision.effects[0];
        if (!effect) return errorResult('E_INVALID_TRANSITION', 'Stage Graph produced no effect.');
        const nextState =
          effect.type === 'run_persona' ? { ...decision.state, run: effect.run } : decision.state;
        const committed = await store.commit(key, { ...record, state: nextState });
        if (!committed.ok) return errorResult(committed.error.code, committed.error.message);
        if (effect.type === 'run_persona') {
          await appendMemlog(ticketPath(key, 'memlog.md'), {
            timestamp: now(),
            row_id: decision.row_id,
            message: `Started ${effect.run.stage} Run ${effect.run.id}.`,
          });
        }
        return ok(effect);
      }
      const effect = nextEffect(state);
      return effect ? ok(effect) : errorResult('E_INVALID_TRANSITION', 'No effect is available.');
    });
  }

  function nextEffect(state: State): Effect | undefined {
    if (state.run) return EffectSchema.parse({ type: 'run_persona', run: state.run });
    const reason = state.waits[0];
    if (reason === 'ci_running') return EffectSchema.parse({ type: 'wait', reason });
    if (reason) {
      const kind = reason === 'ask_human' ? 'ask_human' : reason.slice(5);
      return EffectSchema.parse({ type: 'open_gate', kind });
    }
    const kind = gateForStage(state);
    if (kind) return EffectSchema.parse({ type: 'open_gate', kind });
    const owner = DEFAULT_GRAPH.stages[state.stage]?.owner;
    if (owner === 'tool' && !DEFAULT_GRAPH.stages[state.stage]?.terminal) {
      return EffectSchema.parse({ type: 'run_tool', tool: state.stage });
    }
    if (DEFAULT_GRAPH.stages[state.stage]?.terminal || state.stage === 'stopped') {
      return EffectSchema.parse({ type: 'end', stage: state.stage });
    }
    return undefined;
  }

  async function advanceState(
    key: string,
    input: z.infer<typeof AdvanceInputSchema>,
  ): Promise<ToolEnvelope<{ state: State }>> {
    return withTicketMutex(`${options.repoId}/${key}`, async () => {
      const record = await loadTicket(key);
      if (!record) return errorResult('E_RECORD_CORRUPT', 'Ticket record is unavailable.');
      if (record.boot_id !== options.bootId) {
        return errorResult('E_STALE_RUN', 'The Ticket record belongs to another server boot.');
      }
      const { run, status } = input;
      if (!run || status === undefined)
        return errorResult('E_INVALID_TRANSITION', 'state_advance requires a Run and status.');
      if (!record.state.run || record.state.run.id !== run.id) {
        const replay = record.last_advance;
        if (replay?.run_id === run.id && replay.status === status) {
          return replay.envelope as ToolEnvelope<{ state: State }>;
        }
        return errorResult('E_STALE_RUN', 'The Run is not active for this Ticket.');
      }

      const reportState = StateSchema.parse(record.state);
      const event = EventSchema.parse({
        type: 'run_report',
        run_id: run.id,
        status,
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      });
      const decision = decide(reportState, event, DEFAULT_GRAPH, {
        now: now(),
        ids,
      });
      const completedGate = decision.error ? completedGateRun(reportState, run, status) : undefined;
      if ((!decision.row_id || decision.error) && !completedGate) {
        return errorResult(
          decision.error?.code ?? 'E_INVALID_TRANSITION',
          decision.error?.message ?? 'Cannot advance State.',
        );
      }
      const nextState = completedGate ?? decision.state;
      const success = ok({ state: nextState });
      const nextRecord: TicketRecord = {
        ...record,
        state: nextState,
        last_advance: { run_id: run.id, status, envelope: success },
      };
      const committed = await store.commit(key, nextRecord);
      if (!committed.ok) return errorResult(committed.error.code, committed.error.message);
      if (decision.row_id) {
        await appendMemlog(ticketPath(key, 'memlog.md'), {
          timestamp: now(),
          row_id: decision.row_id,
          message: `Reported ${status} for ${run.id}; State is ${nextState.stage}.`,
        });
      }
      return success;
    });
  }

  async function state_get(input: unknown): Promise<ToolEnvelope<Directive>> {
    const parsed = GetInputSchema.safeParse(input);
    const key = parsed.success ? parsed.data.key : FAKE_TICKET_KEY;
    let envelope: ToolEnvelope<Directive>;
    try {
      if (!parsed.success)
        envelope = errorResult('E_INVALID_TRANSITION', 'Invalid state_get input.');
      else if (parsed.data.run_id)
        envelope = errorResult('E_NOT_AUTHORIZED', 'state_get is Conductor-only.');
      else if (!isFakeTicket(key))
        envelope = errorResult('E_INVALID_TRANSITION', `Unknown Ticket ${key}.`);
      else envelope = await getDirective(key);
    } catch (error) {
      envelope = errorResult(
        'E_RECORD_CORRUPT',
        error instanceof Error ? error.message : String(error),
      );
    }
    await logToolCall(key, 'state_get', envelope);
    return envelope;
  }

  async function state_advance(input: unknown): Promise<ToolEnvelope<{ state: State }>> {
    const parsed = AdvanceInputSchema.safeParse(input);
    const key = parsed.success ? parsed.data.key : FAKE_TICKET_KEY;
    let envelope: ToolEnvelope<{ state: State }>;
    try {
      if (!parsed.success)
        envelope = errorResult('E_INVALID_TRANSITION', 'Invalid state_advance input.');
      else if (parsed.data.run_id)
        envelope = errorResult('E_NOT_AUTHORIZED', 'state_advance is Conductor-only.');
      else if (!isFakeTicket(key))
        envelope = errorResult('E_INVALID_TRANSITION', `Unknown Ticket ${key}.`);
      else envelope = await advanceState(key, parsed.data);
    } catch (error) {
      envelope = errorResult(
        'E_RECORD_CORRUPT',
        error instanceof Error ? error.message : String(error),
      );
    }
    await logToolCall(key, 'state_advance', envelope);
    return envelope;
  }

  return { state_get, state_advance };
}
