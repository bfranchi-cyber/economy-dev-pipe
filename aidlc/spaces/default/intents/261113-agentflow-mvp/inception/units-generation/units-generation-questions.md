# Units Generation Questions

The requirements and component design stages were skipped, so the inputs are the PRD (FR-1..FR-51, NFR-1..NFR-10), the addendum (section G build order) and the architecture spine (folders `engine`, `store`, `workspace`, `tools`, `gates`, `git`, `run`, `remote`, `bundles`, `bin`). Practices affirmed earlier: build a thin end-to-end slice first, test-first, one package.

## Proposed decomposition (for context, decided by your answers below)

| Unit | Kind | What it delivers | PRD / spine coverage |
| --- | --- | --- | --- |
| u1-skeleton | service | Repo scaffold (one package, TypeScript, Vitest, Prettier, ESLint, CI), a minimal Stage Graph (spec only), `record.yml` store with the repo lock, MCP server with `state_get` / `state_advance` and a fake Ticket, running the whole way through | NFR-3, NFR-7, AD-1, AD-2, AD-19 (thin) |
| u2-engine-core | library | Full Stage Graph table (FR-4), `decide`, counters, Wait Reasons and resume, Ask Human and Loop Checkpoint, schemas | FR-4–7, FR-45, FR-46, AD-1, AD-2, AD-13, AD-14 |
| u3-record-store | library | Record integrity: atomic `record.yml`, Memlog and Tool-Call Log, effect journal, `boot_id`, lock heartbeat, Approved Versions, config digest | FR-34, FR-48, FR-50, AD-8, AD-19, AD-20 |
| u4-gates-docs | service | Gates (elicitation, confirm fallback), Spec and Plan documents, `plan_schedule`, freeze by hash | FR-8–14, FR-28, FR-29, FR-42, FR-51, AD-7 |
| u5-intake-git | service | `start-ticket` and Jira listing, Ticket snapshot, Feature Branch, temp-index Snapshots, attribution | FR-1–3, FR-41, FR-43, AD-10, AD-21 (intake) |
| u6-runs-checks | service | Personas and generator, run lifecycle and tool authorization, bundles, red/green/refactor, runner, Vitest parser, triage, Checks, Trace | FR-15–21, FR-38–40, FR-44, FR-47, AD-6, AD-9, AD-11, AD-12 |
| u7-validation-escalation | service | Reviewers and Synthesizer, verdict, Handoff, Escalation | FR-22–25 |
| u8-delivery-learning | service | Walkthrough, push, PR, CI watch, Patch Plan and Correct-Course, done, Run Metrics, Preferences, Pitfalls, Project Context | FR-26–30, FR-35–37, AD-21 |
| u9-packaging | packaging | `agentflow init`, `gen agents`, `unlock`, install and `.vscode/mcp.json` wiring | FR-37, FR-38, CLI parts of AD-19 |

## Q1. [Architect] How should the work be split into units?
Context: the spine has natural module folders, and the addendum's build order is by feature slice. The split decides what "one unit" means in Construction.

A. By feature slice along the build order, each unit cutting through the modules it needs (Recommended; matches the table above)
B. By module, one unit per `src/` folder (`engine`, `store`, `gates`, `git`, `run`, `remote`, `bundles`)
C. By PRD feature section (4.1 to 4.13)
X. Other (please specify)

[Answer]: A

## Q2. [Architect] How big should units be?
Context: finer units give smaller reviews but more handoffs; you are the only developer.

A. About 9 medium units, as proposed (Recommended)
B. About 5 coarse units (merge the proposed units into broader groups)
C. About 15 fine units (split further, roughly one per FR group)
X. Other (please specify)

[Answer]: A

## Q3. [Delivery] May independent units be marked as buildable in parallel?
Context: units with no edge between them could be built at the same time, each in its own copy of the project. You will build one at a time, but the record can still show which ones don't depend on each other.

A. Mark independent units as parallel-capable in the dependency graph, but build one at a time (Recommended)
B. Strict order only: no parallel markers, a single line of units
X. Other (please specify)

[Answer]: A

## Q4. [Architect] What should the first unit (the thin end-to-end slice) contain?
Context: you chose to build a thin slice first. It must run the whole way through without later units.

A. As proposed: scaffold, minimal graph, record store, MCP `state_get` / `state_advance`, and a fake Ticket (Recommended; no Jira or git needed)
B. Also include real Jira intake and the Feature Branch step
C. Smaller: only the engine and a test harness, no MCP server yet
X. Other (please specify)

[Answer]: A

## Q5. [Architect] How should units agree on what they share?
Context: units hand each other types and tool contracts. The spine already fixes the engine as pure and the tool reply envelope.

A. Contracts are TypeScript types and Zod schemas in `engine/schemas`; no separate API spec documents (Recommended)
B. Add a written contract document per unit boundary as well
X. Other (please specify)

[Answer]: A

## Q6. [Operations] Is each unit deployed on its own?
Context: the product is one MCP server process plus a small CLI, installed on your machine.

A. No: one package and one deployable; units are code boundaries inside it, and only u9-packaging produces the install (Recommended)
B. Yes: publish some units as separate packages
X. Other (please specify)

[Answer]: B (superseded by Q7: one package, so A)

## Q7. [Operations] Follow-up to Q6: which units become separate packages?
Context: Q6 chose separate packages, but the architecture spine says one package, and Q5 keeps shared types in `engine/schemas`. Which units you split decides the package layout and the dependency rules between them.

A. Only the libraries (u2-engine-core, u3-record-store) as workspace packages; services stay in the main package
B. Keep one package after all (change Q6 to A)
C. The MCP server and the CLI as separate packages
X. Other (please specify)

[Answer]: B
