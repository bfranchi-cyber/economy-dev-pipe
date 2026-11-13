# Unit Story Map: Agentflow MVP

## Sources

- [desc] Initial description: build Agentflow MVP from the existing PRD, addendum and architecture spine.
- [scope] Workflow-selected scope: express (custom plan `agentflow-mvp-build`).
- No `stories.md` was produced (user stories are skipped by plan), so rows are keyed by the PRD's functional requirement IDs, plus the NFRs a unit carries. An ID is the PRD's number written without the hyphen (the PRD's FR-1 is FR1 here, NFR-10 is NFR10).
- Unit definitions: `unit-of-work.md`; dependencies: `unit-of-work-dependency.md`.

## Requirement to unit map

| ID | Unit | Directory |
| --- | --- | --- |
| FR1 | U5 | u5-intake-git |
| FR2 | U5 | u5-intake-git |
| FR3 | U5 | u5-intake-git |
| FR4 | U2 | u2-engine-core |
| FR5 | U2 | u2-engine-core |
| FR6 | U2 | u2-engine-core |
| FR7 | U2 | u2-engine-core |
| FR8 | U4 | u4-gates-docs |
| FR9 | U4 | u4-gates-docs |
| FR10 | U4 | u4-gates-docs |
| FR11 | U4 | u4-gates-docs |
| FR12 | U4 | u4-gates-docs |
| FR13 | U4 | u4-gates-docs |
| FR14 | U4 | u4-gates-docs |
| FR15 | U6 | u6-runs-checks |
| FR16 | U6 | u6-runs-checks |
| FR17 | U5 | u5-intake-git |
| FR18 | U6 | u6-runs-checks |
| FR19 | U6 | u6-runs-checks |
| FR20 | U6 | u6-runs-checks |
| FR21 | U6 | u6-runs-checks |
| FR22 | U7 | u7-validation-escalation |
| FR23 | U7 | u7-validation-escalation |
| FR24 | U7 | u7-validation-escalation |
| FR25 | U7 | u7-validation-escalation |
| FR26 | U8 | u8-delivery-learning |
| FR27 | U8 | u8-delivery-learning |
| FR28 | U8 | u8-delivery-learning |
| FR29 | U8 | u8-delivery-learning |
| FR30 | U8 | u8-delivery-learning |
| FR31 | none (post-MVP) | none |
| FR32 | none (post-MVP) | none |
| FR33 | none (post-MVP) | none |
| FR34 | U3 | u3-record-store |
| FR35 | U8 | u8-delivery-learning |
| FR36 | U8 | u8-delivery-learning |
| FR37 | U9 | u9-packaging |
| FR38 | U9 | u9-packaging |
| FR39 | U9 | u9-packaging |
| FR40 | U6 | u6-runs-checks |
| FR41 | U5 | u5-intake-git |
| FR42 | U4 | u4-gates-docs |
| FR43 | U5 | u5-intake-git |
| FR44 | U6 | u6-runs-checks |
| FR45 | U2 | u2-engine-core |
| FR46 | U2 | u2-engine-core |
| FR47 | U6 | u6-runs-checks |
| FR48 | U3 | u3-record-store |
| FR49 | U8 | u8-delivery-learning |
| FR50 | U3 | u3-record-store |
| FR51 | U4 | u4-gates-docs |
| NFR1 | U6; U2 | u6-runs-checks; u2-engine-core |
| NFR3 | U1 | u1-skeleton |
| NFR7 | U1 | u1-skeleton |
| NFR10 | U6; U9 | u6-runs-checks; u9-packaging |

## Cross-cutting rows

- NFR-1 (token economy): the chaining of tool-owned Stages is U2; Bundles and output trimming are U6.
- NFR-10 (context budget): Bundles enforce it at runtime (U6); the generator enforces it for Persona prompts (U9).
- u1-skeleton owns the scaffold and the host and format constraints (NFR-3, NFR-7) that every unit inherits.

## Implementation order within each unit

Each unit follows the affirmed test-first practice: write the failing test for a graph row, tool or document, make it pass, then refactor, in small ordered commits.

## Coverage verification

- Every FR-1 to FR-51 is assigned: 48 to a unit, FR-31 to FR-33 explicitly post-MVP.
- Every unit has rows: U1 (NFR-3, NFR-7), U2, U3, U4, U5, U6, U7, U8, U9.
