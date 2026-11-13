# Bolt Plan: Agentflow MVP

A **Bolt** is one build pass over a piece of the work, ending in something that runs. A **walking skeleton** is a minimal version that runs the whole way through, built first to prove the pieces connect.

## Sources

- [desc] Initial description: build Agentflow MVP from the existing PRD, addendum and architecture spine, planning construction with AI-DLC units.
- [scope] Workflow-selected scope: express (custom plan `agentflow-mvp-build`).
- Units: `unit-of-work.md`, `unit-of-work-dependency.md`, `unit-of-work-story-map.md` (Units Generation). Requirements: the PRD stands in for `requirements` (FR1..FR51). Components: the architecture spine stands in for `components`.
- Practices: `team-practices.md` (thin slice first, test-first, one package).
- [Q1] Order u1..u9, runner inside u1, packaging last. [Q2] One unit per Bolt. [Q3] Platform assumptions are the biggest worry. [Q4] Verification command decided when the first unit exists.

## Bolt sequence

| Bolt | Unit | Skeleton | Walks into |
| --- | --- | --- | --- |
| B1 | u1-skeleton | yes | everything after it |
| B2 | u2-engine-core | no | B4 onward |
| B3 | u3-record-store | no | B4, B5 |
| B4 | u4-gates-docs | no | B6, B8 |
| B5 | u5-intake-git | no | B6, B8 |
| B6 | u6-runs-checks | no | B7 |
| B7 | u7-validation-escalation | no | B8 |
| B8 | u8-delivery-learning | no | B9 |
| B9 | u9-packaging | no | install |

The order is a valid topological order of the dependency graph in `unit-of-work-dependency.md`, and it only adds ordering the graph allows.

## B1: u1-skeleton (walking skeleton)

- **Definition of Done:** repo scaffold (one package, TypeScript, Vitest, Prettier, ESLint, type-check, CI workflow); minimal Stage Graph (`spec` Stage only); `record.yml` store with the repo lock; MCP server serving `state_get` and `state_advance`; a fake Ticket; the no-shell command runner and its two environment profiles (built here so u5 can use it); every test written first.
- **Confidence hypothesis:** the pure engine, the record store and the MCP server fit together, and a Run can be issued and reported end to end on Windows.
- **Expected demo:** start the MCP server, call `state_get` for the fake Ticket, get a Run, report it, and see the State advance and the record file update.
- **Proves out:** AD-1, AD-2, AD-9 (runner), AD-19 (thin), NFR3 and NFR7.

## B2: u2-engine-core

- **Definition of Done:** full Stage Graph table with load-time validation, `decide`, counters, Wait Reasons and resume, Ask Human and Loop Checkpoint, schemas, `ErrorCode` set; one test per graph row named by its row id.
- **Confidence hypothesis:** every transition in FR4's table is reachable and refused when not in the table.
- **Expected demo:** a table-driven test run that walks every graph row.

## B3: u3-record-store

- **Definition of Done:** atomic `record.yml`, Memlog and Tool-Call Log, ordered effect journal, `boot_id`, lock heartbeat and stale-lock handling, Approved Version blobs, config digest.
- **Confidence hypothesis:** a crash at any point leaves a resumable record on Windows.
- **Expected demo:** a crash-injection test that kills a write mid-way and resumes cleanly.

## B4: u4-gates-docs

- **Definition of Done:** Gates (elicitation, confirm fallback), Gate Records and decisions, Spec and Plan documents through the validating tools, `plan_schedule`, artifact freeze by hash.
- **Confidence hypothesis:** VS Code Copilot shows a human-only approval prompt that an agent cannot answer (the riskiest platform assumption, tackled early).
- **Expected demo:** an approval prompt appears in Copilot, a human answer creates a Gate Record, and an edited Spec is caught by the hash check.

## B5: u5-intake-git

- **Definition of Done:** `start-ticket` with the JQL listing, Ticket snapshot, Feature Branch, temp-index Snapshots, attribution, `commit_prepare`.
- **Confidence hypothesis:** Snapshots never disturb the real git index and git uses the developer's own identity and credentials on Windows.
- **Expected demo:** list In Execution Tickets, start one, make a Run's change and see it committed alone.

## B6: u6-runs-checks

- **Definition of Done:** Persona loader and tool authorization, Run lifecycle, bundles and budgets, red/green/refactor orchestration, Vitest parser, triage, Checks, Trace Matrix.
- **Confidence hypothesis:** tool allowlists are enforced for subagents, or the attribution fallback catches out-of-policy edits.
- **Expected demo:** one Goal runs red, triage, green, refactor and Checks, with the Trace Matrix clean.
- **Note:** the largest unit; the likely split is runner-side (parser, triage, Checks, Trace) versus Persona-side (loader, bundles, orchestration) if it needs two passes.

## B7: u7-validation-escalation

- **Definition of Done:** Review Bundles, parallel Reviewers, Synthesizer verdict, Handoff, Escalation Gate and Run.
- **Confidence hypothesis:** cheap parallel Reviewers plus one Synthesizer give a usable verdict within the bundle budget.
- **Expected demo:** a validated change gets a per-AC verdict, and a stuck Run produces a Handoff and an approved Escalation.

## B8: u8-delivery-learning

- **Definition of Done:** Walkthrough, push and PR, CI watch timer and notifications, Patch Plan loop, Done transition, Run Metrics, curator proposals, Preferences, Pitfalls, Project Context.
- **Confidence hypothesis:** a Ticket goes from In Execution to In Tests with a green CI run and a PR, with CI failure routed to a Patch Plan.
- **Expected demo:** the full journey UJ-1 against a test repository.

## B9: u9-packaging

- **Definition of Done:** `agentflow init`, `gen agents`, `config models`, `context`, `unlock`, install and `.vscode/mcp.json` wiring, generated Copilot agent files.
- **Confidence hypothesis:** a fresh machine can install and run the tool from the package alone.
- **Expected demo:** install into a clean repository and run `start-ticket` end to end.

## Construction settings

- Walk order: one unit at a time through its applicable stages, serial, with a completion checkpoint per unit (the default for this plan).
- Verification command: not set yet (decided when the first unit exists, Q4); the first checkpoint asks before verifying.
