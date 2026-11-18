import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { decide } from '../engine/decide.js';
import { DEFAULT_GRAPH } from '../engine/stage-graph.js';
import {
  EventSchema,
  RunSchema,
  type ErrorCode,
  type Run,
  type State,
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
    status: z.enum(['ok', 'blocked', 'failed']).optional(),
    summary: z.string().optional(),
    reason: z.string().optional(),
  })
  .strict();

interface TicketRecord {
  boot_id: string;
  state: State;
  next_run: number;
  last_advance?: { run_id: string; status: string; envelope: ToolEnvelope<unknown> };
}

export interface StateToolsOptions {
  home: string;
  repoId: string;
  bootId: string;
  now?: () => string;
  ids?: () => string;
}

export type Directive =
  | { type: 'run_persona'; run: Run }
  | { type: 'open_gate'; stage: string }
  | { type: 'wait'; reason: string }
  | { type: 'end'; stage: string };

function errorResult(code: ErrorCode, message: string): ToolEnvelope<never> {
  return fail({ code, message });
}

function initialRecord(bootId: string): TicketRecord {
  return { boot_id: bootId, state: { stage: 'start' }, next_run: 1 };
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
      const { state } = record;
      if (state.run) return ok({ type: 'run_persona', run: state.run });
      if (state.stage === 'done') return ok({ type: 'end', stage: state.stage });
      if (state.stage === 'ask_human') return ok({ type: 'open_gate', stage: state.stage });
      if (state.stage !== 'start') return ok({ type: 'wait', reason: 'run' });

      const decision = decide(state, { type: 'start' }, DEFAULT_GRAPH, { now: now(), ids });
      if (!decision.row_id || decision.error) {
        return errorResult(
          decision.error?.code ?? 'E_INVALID_TRANSITION',
          decision.error?.message ?? 'Cannot start Run.',
        );
      }
      const run = decision.state.run;
      if (!run) return errorResult('E_INVALID_TRANSITION', 'Stage Graph did not produce a Run.');
      const committed = await store.commit(key, { ...record, state: decision.state });
      if (!committed.ok) return errorResult(committed.error.code, committed.error.message);
      await appendMemlog(ticketPath(key, 'memlog.md'), {
        timestamp: now(),
        row_id: decision.row_id,
        message: `Started ${run.stage} Run ${run.id}.`,
      });
      return ok({ type: 'run_persona', run });
    });
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
      if (!run || !status)
        return errorResult('E_INVALID_TRANSITION', 'state_advance requires a Run and status.');
      if (!record.state.run || record.state.run.id !== run.id) {
        const replay = record.last_advance;
        if (replay?.run_id === run.id && replay.status === status) {
          return replay.envelope as ToolEnvelope<{ state: State }>;
        }
        return errorResult('E_STALE_RUN', 'The Run is not active for this Ticket.');
      }

      const event = EventSchema.parse({
        type: 'run_report',
        run_id: run.id,
        status,
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      });
      const decision = decide(record.state, event, DEFAULT_GRAPH, { now: now(), ids });
      if (!decision.row_id || decision.error) {
        return errorResult(
          decision.error?.code ?? 'E_INVALID_TRANSITION',
          decision.error?.message ?? 'Cannot advance State.',
        );
      }
      const success = ok({ state: decision.state });
      const nextRecord: TicketRecord = {
        ...record,
        state: decision.state,
        last_advance: { run_id: run.id, status, envelope: success },
      };
      const committed = await store.commit(key, nextRecord);
      if (!committed.ok) return errorResult(committed.error.code, committed.error.message);
      await appendMemlog(ticketPath(key, 'memlog.md'), {
        timestamp: now(),
        row_id: decision.row_id,
        message: `Reported ${status} for ${run.id}; State is ${decision.state.stage}.`,
      });
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
