import type { Counters, GateKind, GoalPhase, State } from './schemas.js';

export type CounterEvent =
  | { type: 'run_started'; goal: string; phase: GoalPhase }
  | {
      type: 'failure_observed';
      goal: string;
      phase: GoalPhase;
      signature: string;
      previous_signature?: string;
    }
  | { type: 'phase_completed'; goal: string; phase: GoalPhase }
  | { type: 'goal_sent_back'; goal: string }
  | { type: 'escalation_gate_opened' }
  | { type: 'patch_plan_drafted' }
  | { type: 'gate_edited'; gate: GateKind }
  | { type: 'gate_approved'; gate: GateKind }
  | { type: 'ask_human_gate_opened' };

const emptyCounters = (): Counters => ({
  phase: {},
  goal: {},
  ticket: { patch_loops: 0, ask_human: 0 },
  gate: {},
});

export function updateCounters(state: State, event: CounterEvent): State {
  const counters = state.counters ?? emptyCounters();
  const updated = {
    ...counters,
    phase: { ...counters.phase },
    goal: { ...counters.goal },
    gate: { ...counters.gate },
    ticket: { ...counters.ticket },
  };

  switch (event.type) {
    case 'run_started': {
      const goalPhases = { ...updated.phase[event.goal] };
      const phase = goalPhases[event.phase] ?? { attempts: 0, same_failure_runs: 0 };
      goalPhases[event.phase] = { ...phase, attempts: phase.attempts + 1 };
      updated.phase[event.goal] = goalPhases;
      break;
    }
    case 'failure_observed': {
      const goalPhases = { ...updated.phase[event.goal] };
      const phase = goalPhases[event.phase] ?? { attempts: 0, same_failure_runs: 0 };
      goalPhases[event.phase] = {
        ...phase,
        same_failure_runs:
          event.previous_signature === event.signature ? phase.same_failure_runs + 1 : 0,
      };
      updated.phase[event.goal] = goalPhases;
      break;
    }
    case 'phase_completed': {
      const goalPhases = { ...updated.phase[event.goal] };
      const phase = goalPhases[event.phase] ?? { attempts: 0, same_failure_runs: 0 };
      goalPhases[event.phase] = { ...phase, attempts: 0, same_failure_runs: 0 };
      updated.phase[event.goal] = goalPhases;
      break;
    }
    case 'goal_sent_back': {
      const goal = updated.goal[event.goal] ?? { validation_rounds: 0, escalations: 0 };
      updated.goal[event.goal] = { ...goal, validation_rounds: goal.validation_rounds + 1 };
      break;
    }
    case 'escalation_gate_opened': {
      const goalId = state.cursor?.goal;
      if (goalId !== undefined) {
        const goal = updated.goal[goalId] ?? { validation_rounds: 0, escalations: 0 };
        updated.goal[goalId] = { ...goal, escalations: goal.escalations + 1 };
      }
      break;
    }
    case 'patch_plan_drafted':
      updated.ticket.patch_loops += 1;
      break;
    case 'gate_edited': {
      const gate = updated.gate[event.gate] ?? { edit_rounds: 0 };
      updated.gate[event.gate] = { edit_rounds: gate.edit_rounds + 1 };
      break;
    }
    case 'gate_approved':
      updated.gate[event.gate] = { edit_rounds: 0 };
      break;
    case 'ask_human_gate_opened':
      updated.ticket.ask_human += 1;
      break;
  }

  return { ...state, counters: updated };
}
