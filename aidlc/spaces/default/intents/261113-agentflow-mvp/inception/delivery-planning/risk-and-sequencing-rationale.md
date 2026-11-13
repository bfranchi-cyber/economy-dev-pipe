# Risk and Sequencing Rationale: Agentflow MVP

A **Bolt** is one build pass over a piece of the work, ending in something that runs. A **walking skeleton** (Cockburn) is a minimal version that runs the whole way through, built first to prove the pieces connect.

## Sources

- [desc] Initial description: build Agentflow MVP from the existing PRD, addendum and architecture spine.
- [scope] Workflow-selected scope: express (custom plan `agentflow-mvp-build`).
- Units: `unit-of-work.md`, `unit-of-work-dependency.md` (topology), `unit-of-work-story-map.md`. Practices: `team-practices.md`. Requirements: the PRD (risks section and open questions OQ-1 to OQ-13) stands in for `requirements`. Components: the architecture spine stands in for `components`.
- Review findings R-01 to R-05 from Units Generation (accepted as risk at that gate).
- [Q1] Order u1..u9. [Q2] One unit per Bolt. [Q3] Platform assumptions are the biggest worry.

## Heuristic

Walking skeleton first, then risk-first for the remainder (Boehm), because there is one developer, no market to test, and a design that rests on unproven Copilot capabilities. No scoring model (WSJF) was used: with one developer and nine units the extra arithmetic would not change the order.

## Why this order

1. **B1 u1-skeleton first.** The practices call for a thin slice first, and nothing else can be demonstrated until a Run can be issued and reported.
2. **B2 and B3 next.** They only need B1, and everything later reads the engine's schemas and writes the record.
3. **B4 u4-gates-docs before B5.** Human-only approval prompts are the riskiest platform assumption (OQ-1, OQ-9, OQ-10). Doing gates before git means the answer arrives early, while a fallback is still cheap.
4. **B5 to B8 follow the dependency graph.** B6 needs B4 and B5; B7 needs B6; B8 needs B4, B5 and B7. The tool-allowlist assumption (OQ-8) is tested in B6, and the tool-call time limit (OQ-13) is watched from B4 on.
5. **B9 u9-packaging last.** It needs `personas.yml` (B6), the lock heartbeat (B3) and Project Context (B8), which settles review finding R-02 by order.

## Deviation from the dependency graph

The sequence is a valid topological order, so there is no deviation in ordering. There is one deliberate ownership change: the no-shell command runner and its environment profiles are built inside B1, although `unit-of-work.md` places them in u6. This settles finding R-01: u5's git module uses the runner, and u5 comes before u6. u6 then extends it with parsers and Checks. The unit documents stay as approved; Code Generation for u1 and u6 should reflect this.

## Risk register

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Copilot does not support human-only approval prompts (OQ-1, OQ-10) | Medium | High | B4 tackles it early; the always-confirm tool fallback; the CLI code channel only if both fail |
| Copilot does not enforce subagent tool allowlists (OQ-8) | Medium | High | Attribution and the server-side tool check in B5 and B6 catch out-of-policy edits |
| u6-runs-checks is too large for one pass | Medium | Medium | Split into runner-side and Persona-side at the seam named in `bolt-plan.md` |
| Quality-gate tools (crapper, dryer, mutator) do not support TypeScript | Medium | Medium | Check at B1; if unsupported, record a gap and keep the gates that do run |
| typescript-eslint does not support TypeScript 7 | Low | Low | Verify at B1 scaffold; pin a working combination |
| Windows process and path handling breaks the runner or locks | Medium | Medium | Windows-specific tests in B1, B3 and B5 |
| Tool-call time limit is shorter than a test run (OQ-13) | Medium | Medium | Add the pending/poll envelope variant if B4 or B6 shows timeouts |
