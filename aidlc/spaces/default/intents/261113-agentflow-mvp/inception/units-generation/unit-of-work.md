# Units of Work: Agentflow MVP

## Sources

- [desc] Initial description: build Agentflow MVP from the existing PRD, addendum and architecture spine, planning construction with AI-DLC units.
- [scope] Workflow-selected scope: express (custom plan `agentflow-mvp-build`).
- PRD: `_bmad-output/planning-artifacts/prds/prd-develop-pipeline-2026-11-12/prd.md` (FR-1..FR-51, NFR-1..NFR-10); addendum section G (build order).
- Architecture spine: `_bmad-output/planning-artifacts/architecture/architecture-develop-pipeline-2026-11-13/ARCHITECTURE-SPINE.md` (AD-1..AD-21, folders `engine`, `store`, `workspace`, `tools`, `gates`, `git`, `run`, `remote`, `bundles`, `bin`).
- Practices: `aidlc/spaces/default/memory/team.md` (thin slice first, test-first, one package).
- [Q1] Split by feature slice along the build order. [Q2] About 9 medium units. [Q4] First unit is the thin slice with a fake Ticket. [Q5] Contracts are TypeScript types and Zod schemas in `engine/schemas`. [Q6] One package and one deployable, confirmed in Q7.

Requirements Analysis and Domain Design were skipped by plan, so the PRD requirement IDs and the spine decisions stand in for `requirements` and `components`.

## Units

| Unit ID | Directory | Kind | Size |
| --- | --- | --- | --- |
| U1 | u1-skeleton | service | L |
| U2 | u2-engine-core | library | L |
| U3 | u3-record-store | library | M |
| U4 | u4-gates-docs | service | L |
| U5 | u5-intake-git | service | L |
| U6 | u6-runs-checks | service | XL |
| U7 | u7-validation-escalation | service | M |
| U8 | u8-delivery-learning | service | L |
| U9 | u9-packaging | packaging | M |

All units are code boundaries inside one package and one deployable (MCP server process plus CLI). Only U9 produces the install; the deployment model for every unit is `embedded`.

## U1 u1-skeleton (service, L)

- **Delivers:** the thin end-to-end slice. Repo scaffold (one package, TypeScript, Vitest, Prettier, ESLint, type-check, GitHub Actions workflow), a minimal Stage Graph (the `spec` Stage only), `record.yml` with the repo lock, an MCP server exposing `state_get` and `state_advance`, and a fake Ticket, so a Run can be issued and reported end to end.
- **Owns:** `bin/mcp-server`, minimal `engine/`, minimal `store/`, project scaffold. Later units extend these folders and never replace the skeleton's public shapes.
- **Constraints:** no Jira, no git, no real Personas. Runs under test-first with the quality gates from the practices.

## U2 u2-engine-core (library, L)

- **Delivers:** the full Stage Graph table and its load-time validation (FR-4), `decide` (pure, `now` and ids injected), counters and Failure Signature, Wait Reasons and resume, Ask Human and Loop Checkpoint, terminal Stages, Zod schemas, `ErrorCode` set and tool envelope.
- **Owns:** `engine/`. Imports nothing outside `engine/` and the standard library.
- **Constraints:** one test per graph row, named by its row id (practices).

## U3 u3-record-store (library, M)

- **Delivers:** `record.yml` atomic commit, Memlog and Tool-Call Log, ordered effect journal, `boot_id`, lock heartbeat and `agentflow unlock` support, content-addressed Approved Version blobs, config digest, `metrics.yml` location.
- **Owns:** `store/` and `workspace/`.
- **Constraints:** Windows-first paths and `repoId()`; per-Ticket async mutex.

## U4 u4-gates-docs (service, L)

- **Delivers:** Gates (elicitation, `confirm_action`, always-confirm fallback), Gate Records and decisions, Spec and Plan documents through `doc_scaffold` and `doc_section`, `plan_schedule`, artifact freeze by hash, Correct-Course and Patch Plan document handling.
- **Owns:** `gates/` and the document tools under `tools/`.
- **Constraints:** a Gate decision only from a channel response; agent documents enter only through validators.

## U5 u5-intake-git (service, L)

- **Delivers:** `start-ticket` with the one JQL listing, Ticket snapshot, Feature Branch creation, temp-index Snapshots, attribution, `commit_prepare`, fast-forward push primitive.
- **Owns:** `git/` and the Jira part of `remote/`.
- **Constraints:** git runs with the `git` environment profile; no force option exists.

## U6 u6-runs-checks (service, XL)

- **Delivers:** Personas loader (`personas.yml`) and tool authorization, Run lifecycle and `run_report`, `bundle_get`, Input Bundles and token budgets, red/green/refactor orchestration, no-shell command runner with env profiles, Vitest/Jest parser, test triage, Checks, Trace Matrix, rotation across cheap models.
- **Owns:** `run/`, `bundles/`, Run tools under `tools/`.
- **Constraints:** the largest unit; if it proves too big in Delivery Planning it may be cut into two Bolts without changing the Units.

## U7 u7-validation-escalation (service, M)

- **Delivers:** Review Bundles, parallel Reviewers, Synthesizer verdict, Handoff, Escalation Gate and Run, Ask Human reasons tied to validation.
- **Owns:** validation and escalation tools and recipes.

## U8 u8-delivery-learning (service, L)

- **Delivers:** Walkthrough, push and PR, CI watch timer and notifications, Patch Plan loop, Done transition and Jira comment, Run Metrics, curator proposals, Preferences and Pitfalls, Project Context slices.
- **Owns:** `remote/github`, `remote/jira` write side, learning modules.

## U9 u9-packaging (packaging, M)

- **Delivers:** `agentflow init`, `gen agents` (deterministic generator with budget check), `config models`, `context init/refresh`, `unlock`, install and `.vscode/mcp.json` wiring, generated Copilot agent files.
- **Owns:** `bin/agentflow`, templates and prompts shipped with the package.

## Implementation notes

- Contracts between units are TypeScript types and Zod schemas in `engine/schemas` (Q5); no separate contract documents.
- Parallel Goal execution (FR-31–33, PRD section 4.11) is post-MVP and belongs to no unit.
