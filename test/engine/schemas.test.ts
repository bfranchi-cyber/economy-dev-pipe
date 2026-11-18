import { describe, expect, it } from 'vitest';
import {
  EffectSchema,
  ErrorCodeSchema,
  EventSchema,
  RunSchema,
  StageSchema,
  StateSchema,
  StatusCodeSchema,
  ToolEnvelopeSchema,
  WaitReasonSchema,
  fail,
  ok,
} from '../../src/engine/schemas.js';

const run = {
  id: 'R-1',
  stage: 'spec',
  persona: 'spec',
};

const state = {
  stage: 'spec',
  run,
};

describe('engine schemas', () => {
  it('accepts the minimal stage and status literals', () => {
    expect(StageSchema.parse('spec')).toBe('spec');
    expect(WaitReasonSchema.parse('human')).toBe('human');
    expect(StatusCodeSchema.parse('ok')).toBe('ok');
    expect(() => StageSchema.parse('missing')).toThrow();
    expect(() => WaitReasonSchema.parse('missing')).toThrow();
    expect(() => StatusCodeSchema.parse('missing')).toThrow();
  });

  it('accepts a State and rejects unknown State keys', () => {
    expect(StateSchema.parse(state)).toEqual(state);
    expect(() => StateSchema.parse({ ...state, surprise: true })).toThrow();
  });

  it('accepts a Run and rejects unknown Run keys', () => {
    expect(RunSchema.parse(run)).toEqual(run);
    expect(() => RunSchema.parse({ ...run, surprise: true })).toThrow();
  });

  it('accepts Events and Effects and rejects unknown keys and literals', () => {
    const startEvent = { type: 'start' };
    const reportEvent = { type: 'run_report', run_id: 'R-1', status: 'ok' };
    const effect = { type: 'run_persona', run };

    expect(EventSchema.parse(startEvent)).toEqual(startEvent);
    expect(EventSchema.parse(reportEvent)).toEqual(reportEvent);
    expect(EffectSchema.parse(effect)).toEqual(effect);
    expect(() => EventSchema.parse({ type: 'start', extra: true })).toThrow();
    expect(() => EventSchema.parse({ type: 'unknown' })).toThrow();
    expect(() => EffectSchema.parse({ type: 'unknown' })).toThrow();
  });

  it('accepts only the enumerated error codes', () => {
    for (const code of [
      'E_NOT_AUTHORIZED',
      'E_STALE_RUN',
      'E_INVALID_TRANSITION',
      'E_RECORD_CORRUPT',
      'E_LOCK_HELD',
    ]) {
      expect(ErrorCodeSchema.parse(code)).toBe(code);
    }
    expect(() => ErrorCodeSchema.parse('E_NOT_REAL')).toThrow();
  });

  it('builds and validates strict success and failure envelopes', () => {
    const success = ok({ stage: 'spec' });
    const failure = fail({ code: 'E_INVALID_TRANSITION', message: 'No matching row.' });

    expect(ToolEnvelopeSchema.parse(success)).toEqual(success);
    expect(ToolEnvelopeSchema.parse(failure)).toEqual(failure);
    expect(() => ToolEnvelopeSchema.parse({ ok: true, data: {}, extra: true })).toThrow();
    expect(() =>
      ToolEnvelopeSchema.parse({
        ok: false,
        error: { code: 'E_NOT_REAL', message: 'No.' },
      }),
    ).toThrow();
  });
});
