import type { GateKind, GoalPhase, Stage, State, WaitReason } from './schemas.js';
import { DEFAULT_GRAPH } from './stage-graph.js';

export interface ResumeInputs {
  boot_id: string;
  fresh_run_id: string;
  run_boot_id?: string;
}

export type ResumeAction =
  | { type: 'open_gate'; kind: GateKind }
  | { type: 'check_ci' }
  | {
      type: 'run_persona';
      run_id: string;
      stage: Stage;
      persona: string;
      goal?: string;
      phase?: GoalPhase;
    }
  | { type: 'run_tool'; tool: string }
  | { type: 'continue' };

export interface ResumeResult {
  state: State;
  action: ResumeAction;
  discarded_run_id?: string;
}

const gateKinds: Partial<Record<WaitReason, GateKind>> = {
  gate_spec: 'spec',
  gate_plan: 'plan',
  gate_correct_course: 'correct_course',
  gate_escalation: 'escalation',
  gate_push: 'push',
  gate_confirm_action: 'confirm_action',
  ask_human: 'ask_human',
};

function resumeWait(state: State): ResumeResult | undefined {
  const first = state.waits[0];
  if (!first) return undefined;
  if (first === 'ci_running') return { state, action: { type: 'check_ci' } };
  const kind = gateKinds[first];
  if (!kind) throw new Error(`No resume action is defined for Wait Reason ${first}.`);
  return { state, action: { type: 'open_gate', kind } };
}

function resumeRun(state: State, inputs: ResumeInputs): ResumeResult | undefined {
  if (!state.run || inputs.run_boot_id === undefined || inputs.run_boot_id === inputs.boot_id) {
    return undefined;
  }

  const stage = state.run.stage;
  const persona = state.run.persona;
  const cursor = state.cursor;
  const run = { id: inputs.fresh_run_id, stage, persona };
  return {
    state: { ...state, run },
    action: {
      type: 'run_persona',
      run_id: inputs.fresh_run_id,
      stage,
      persona,
      ...(cursor ? { goal: cursor.goal, phase: cursor.phase } : {}),
    },
    discarded_run_id: state.run.id,
  };
}

export function resumeTicket(state: State, inputs: ResumeInputs): ResumeResult {
  const wait = resumeWait(state);
  if (wait) return wait;

  const run = resumeRun(state, inputs);
  if (run) return run;

  const cursor = state.cursor;
  if (cursor && state.stage === `implement:${cursor.phase}`) {
    const persona = DEFAULT_GRAPH.stages[state.stage]?.persona;
    if (!persona) return { state, action: { type: 'continue' } };
    const run = { id: inputs.fresh_run_id, stage: state.stage, persona };
    return {
      state: { ...state, run },
      action: {
        type: 'run_persona',
        run_id: inputs.fresh_run_id,
        stage: state.stage,
        persona,
        goal: cursor.goal,
        phase: cursor.phase,
      },
    };
  }

  return { state, action: { type: 'continue' } };
}
