# Delivery Planning Questions

A Bolt is one build pass over a piece of the work, ending in something that runs. The nine units from Units Generation are the pieces; these questions only decide their order and size. All Bolts are built by the developer agent (solo project, no team formation).

## Q1. [Delivery] In what order should the units be built?
Context: the first unit is the thin end-to-end slice (a walking skeleton: a minimal version that runs the whole way through). Two review findings also matter here: the git module needs the command runner (finding R-01), and packaging needs several later units (R-02). Both are solved by order alone if the runner is built inside the first unit and packaging goes last.

A. u1, u2, u3, u4, u5, u6, u7, u8, u9: skeleton first (with the command runner built inside it), then gates early to test the riskiest platform assumption (human approval prompts) soon, packaging last (Recommended)
B. u1, u2, u3, u5, u4, u6, u7, u8, u9: same, but git and ticket intake before gates
X. Other (please specify)

[Answer]: A

## Q2. [Delivery] How big should one Bolt be?
Context: this decides how often you get a runnable result and a checkpoint.

A. One unit per Bolt: 9 Bolts (Recommended)
B. Bundle related units: u2+u3, u4+u5, u7+u8, giving 6 Bolts
X. Other (please specify)

[Answer]: A

## Q3. [Delivery] What worries you most about this build, so it is tackled early?
Context: the PRD lists week-one proofs that decide whether parts of the design hold: elicitation prompts, tool allowlists, pinned models, tool-call time limits.

A. Whether the Copilot platform supports the approval and tool-limit assumptions (Recommended: prove them with the first Bolts that touch them)
B. Windows git and process handling
C. Crash recovery and the record store
X. Other (please specify)

[Answer]: A

## Q4. [Operations] Which command should verify each finished unit?
Context: the project has no code yet, so there is nothing real to run. The first checkpoint asks again if you defer.

A. Decide when the first unit exists (Recommended; nothing to check yet)
B. Set `npx tsc --noEmit && npx vitest run` now
X. Other (please specify)

[Answer]: A
