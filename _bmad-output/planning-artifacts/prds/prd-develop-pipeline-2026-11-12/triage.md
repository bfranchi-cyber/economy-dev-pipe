# Finalize triage — Agentflow MVP PRD

Disposition of every finding from the five finalize reviews, applied 2026-11-13. "fixed" = resolved in `prd.md`/`addendum.md`; "deferred" = recorded with owner and revisit condition; "ignored" = no change, with reason. Pre-revision copies: `.prd-pre-finalize.md`, `.addendum-pre-finalize.md`.

## review-codegen-readiness.md

- C-1 fixed — FR-5 server-side chaining; `state_get` returns only run_persona/open_gate/wait/end; Conductor tool set adds `gate_confirm` (FR-40).
- C-2 fixed — terminal `stopped`/`skipped` Stages, `stopped_reason`, `--restart`, `skip` (FR-46); Wait Reasons `not_started`, `gate_correct_course` (FR-6); per-Gate decision table (FR-46).
- C-3 fixed — two-phase `spec` Gate; Assumption rewrites applied before hashing (FR-12, FR-51).
- C-4 fixed — baseline Snapshot at `start-ticket`, checked before `spec`/`plan` Gates; per-Run attribution (FR-41, FR-43).
- C-5 fixed — Server Record outside workspace, HMAC on every file, key at `~/.agentflow/key`; hand-written Gate Records rejected (FR-48).
- C-6 fixed — "latest Approved Version" replaces "originally approved"; Current Plan = plan.md + approved Patch Plan deltas; Spec re-approval forces Plan re-approval and trace/validate re-run (FR-10, FR-51, FR-29).
- H-1 fixed — Goal Phase cursor and per-Goal status in State; resume at Goal Phase (FR-5, FR-6, addendum E).
- H-2 fixed — Loop Checkpoint via Ask Human, no hard caps (FR-45; user decision).
- H-3 fixed — Snapshots per Run; reset-and-stash on failed Runs; attribution defined (FR-41).
- H-4 fixed — Feature Branch `agentflow/<KEY>` from `git.base`; Ticket Workspace git-ignored, Server Record outside repo (FR-43, FR-48).
- H-5 fixed — no general terminal tool for code Personas; commands only via MCP tools; remote-head check before CI watch (FR-40, FR-27). Residual risk in §10.
- H-6 fixed — escalation outcomes routed; Run fills ask/attempts via `handoff_create`; prompt composition defined; `revised_plan_section` and `quality_review` removed; `spec_conflict` offers Correct-Course (FR-24, FR-25).
- H-7 fixed — `correct_course` Stage, Gate kind and Wait Reason; revising Persona named; tool sets unchanged on loop-back (FR-4, FR-29, FR-46).
- H-8 fixed — cancelled/timed out/no run/max wait → Ask Human `ci_no_result`; CI config keys; Daemon watch, non-blocking (FR-27).
- H-9 fixed — Checks after Wave synthesis; commit lock; Wait Reason queue; tests "scoped", not "isolated"; no automatic revert (FR-17, FR-32, FR-33, FR-6).
- H-10 fixed — Daemon process for poller, CI watch, notifications; OQ-11 to OQ-13 added (FR-1, FR-49).
- H-11 fixed — premium-request fields removed; estimated tokens and Runs by model recorded instead (FR-35; user decision to drop SM-2).
- H-12 fixed — `run_report` tool, read by `state_advance` (FR-44).
- H-13 fixed — Scenario id at start of test title; Failure Signature defined; Vitest/Jest parser in MVP (FR-15, FR-21, Glossary, addendum B).
- M-1 fixed — Memlog line grammar and types incl. claim types; server-only writer (FR-34, addendum E).
- M-2 fixed — NFR-7 allows JSON for raw external payloads and runner output; `ci_failure.yml`.
- M-3 fixed — FR-4 complete edge table; diagram redrawn; `wave_synthesis` Stage.
- M-4 fixed — per-Gate edit semantics incl. push `edit:walkthrough` / `edit:rework`; `gate.edit_rounds` (FR-46, FR-7).
- M-5 fixed — "matching" defined (Glossary: Approved Version); Gate Record ids `GR-n`.
- M-6 fixed — counter table with increment, key, reset; stable Goal ids (FR-7).
- M-7 fixed — Context Slice budgets, runtime truncation path, Project Context out of ambient (NFR-10, FR-37).
- M-8 fixed — `curator` Persona; trigger at next approval after edits and after Escalations (FR-36).
- M-9 fixed in part — key required when more than one Ticket; `skip` tombstone; Daemon single-instance lock. Remainder (re-entry of a `done` Ticket moved back to In Execution) deferred — owner: user; revisit when rework after In Tests happens in practice (§8.2).
- M-10 fixed — explicit Run sequence and anomaly routing (FR-15, FR-18, FR-19, FR-4).
- M-11 fixed — hunk truncation, Memlog slice, AC across bundles, Goal verdict schema (FR-22, FR-23).
- M-12 fixed — plan.md = Markdown + one fenced yaml block; glob overlap rule (FR-13, FR-14).
- M-13 fixed — allowlists in personas.yml (FR-40, addendum F).
- M-14 fixed — `GITHUB_TOKEN`, fast-forward only, PR base `git.base`, `pr.draft`, stale-base behaviour (FR-26).
- M-15 fixed — depth-1 linked Jira issues fetched; URLs listed only (FR-2).
- M-16 fixed — walkthrough.md/trace.yml/verdict.yml persisted; push hash = Walkthrough + HEAD; `push_branch` refuses other SHA (FR-26).
- M-17 fixed — OQ-9 to OQ-13 added; OQ-3 widened.
- L-1 fixed — committer/"small" replaced by `walkthrough` Persona, cheap.
- L-2 fixed — Wait Reasons use `gate_<kind>` consistently.
- L-3 fixed — Glossary adds Launcher, Input Bundle, Review Bundle, Feature Branch, Run and others; Conductor listed as a Persona.
- L-4 fixed — Vision reworded (three fixed Gates per pass plus triggered decisions).
- L-5 fixed — JTBD "from In Execution".
- L-6 fixed — superseded by `run_report` (FR-44).
- L-7 fixed — source tag grammar (FR-11).
- L-8 fixed — field `location` (`path:line`) (FR-20).
- L-9 fixed — freeze applies only to artifacts with an Approved Version; restore option (FR-10).

## review-rubric.md

- R-1 (high, no caps trade-off) fixed — FR-45 Loop Checkpoint; §7 non-goal; §10 risk.
- R-2 (medium, no plan B for OQ-1) fixed — FR-42 CLI fallback with one-time code.
- R-3 (low, lineage not normative) fixed — §6 marked "informative, not normative".
- R-4 (high, SM-2 no source) fixed — SM-2 removed (user decision); FR-35 estimates only.
- R-5 (medium, SM-1 undefined) fixed — eligible and hand-written defined.
- R-6 (low, SM-C3 target) fixed — re-stated against one test per Scenario.
- R-7 (high, FR-41) fixed — see C-4/H-3.
- R-8 (high, TDD run boundaries) fixed — FR-15, FR-17, FR-18, FR-19, FR-4.
- R-9 (high, Gate semantics / stopped) fixed — FR-46.
- R-10 (medium, Correct-Course Gate) fixed — see H-7.
- R-11 (medium, edges, escalation routing) fixed — FR-4, FR-25.
- R-12 (medium, test-to-Scenario link) fixed — see H-13.
- R-13 (medium, Assumption UX) fixed — FR-9, FR-12; rendering limits in OQ-9.
- R-14 (medium, learning ownership) fixed — see M-8.
- R-15 (medium, branch lifecycle) fixed — FR-43.
- R-16 (medium, CI terminal states) fixed — FR-27.
- R-17 (low, per-Ticket parallel override) fixed — FR-31 CLI.
- R-18 (low, test scope) fixed — Checks run the full suite; parallel Runs' tests scoped to the Goal (FR-19, FR-32).
- R-19 (medium, concurrent Tickets) fixed — FR-43 one active Ticket; §7.
- R-20 (low, skip contradiction) fixed — `skipped` tombstone (FR-1, FR-46).
- MN-1 (ID ordering) ignored — stable IDs are deliberate; documented in §0.
- MN-2 (tier "small") fixed — see L-1.
- MN-3 (Persona list drift) fixed — Glossary lists all ten Personas.
- MN-4 (enum naming) fixed — see L-2.
- MN-5 (`start-ticket` arity) fixed — FR-3 text, FR-6.
- MN-6 (JTBD start) fixed — see L-5.

## reconcile-v5.md

- V-1 (high, ask_human dropped) fixed — FR-45 restores it (user decision).
- V-2 (high, escalation criteria only in addendum) fixed — FR-16.
- V-3 (high, no Risks / passive alert) fixed — §10 Risks; Loop Checkpoint replaces the passive alert (user decision).
- V-4 (high, org policy risk) fixed — §10 and OQ-11.
- V-5 (medium, triage responses / frozen plan) fixed — FR-18 routing; Scenario override stored in Server Record, plan.md untouched.
- V-6 (medium, senior stance content) fixed — FR-47.
- V-7 (medium, metrics narrowed) fixed — FR-35 fields; SM-4, SM-5, SM-6.
- V-8 (medium, reviewer escalation path) fixed — Reviewers mark ambiguous ACs; Synthesizer raises Ask Human `ac_ambiguous`; `quality_review` removed (FR-22, FR-24).
- V-9 (medium, no notification on Gate open) fixed — FR-49.
- V-10 (low, default tag + tag expectations) fixed — FR-13.
- V-11 (low, one-line checks status in bundle) fixed — FR-22.
- V-12 (low, dropped out-of-scope items) fixed — §7, §8.2 (multi-repo, QA/PM Personas, hard caps).
- V-13 (low, mutation check) fixed — addendum I, §8.2.
- V-14 (low, configurable transitions) fixed — FR-30.
- V-15 (low, committer tier) fixed — see L-1.
- V-16 (low, fresh-context re-read risk) fixed — §10.
- V-17 (low, request counting source) fixed — FR-35, OQ-2.

## reconcile-questions.md

- Q-1 (high, BMAD skills not invoked) fixed — "distilled, not invoked" in §1, §6, FR-26/29/37, addendum H (user decision).
- Q-2 (high, Scenario-test link) fixed — see H-13.
- Q-3 (high, Project Context vs 150 tokens) fixed — NFR-10, FR-37.
- Q-4 (medium, model only in MUST-use) fixed — NFR-1 allowlist; Walkthrough template-first (FR-26).
- Q-5 (medium, Q17 step numbering) fixed — FR-21 restated in PRD numbering; old assumption removed.
- Q-6 (medium, escalation target choice) fixed — Gate chooses model (FR-9, FR-25).
- Q-7 (medium, model rotation) fixed — FR-16, FR-39 (user decision).
- Q-8 (medium, unparseable status) fixed — `run_report`; missing report → `missing_report` signature → checkpoint (FR-16, FR-44).
- Q-9 (medium, which status 0 triggers Checks) fixed — after `green` and after `refactor` (FR-19).
- Q-10 (medium, commit as last task in brief) fixed — FR-15 Input Bundle; Glossary note on Handoff vs Input Bundle.
- Q-11 (medium, Preferences/Pitfalls growth, failed-attempt source) fixed — FR-36 Escalation source, Persona tags, slice budget.
- Q-12 (medium, eval fields) fixed — FR-35 model id, prompt hash, tokens, status sequence; FR-50.
- Q-13 (medium, no caps re-confirmation) fixed — user confirmed human checkpoint.
- Q-14 (low, Reviewer cost question) fixed — OQ-5.
- Q-15 (low, park explanation, stopped) fixed — Glossary Wait Reason; FR-46.
- Q-16 (low, gate_request error handling, week-1 spike) fixed — FR-8; addendum G week 1.
- Q-17 (low, out-of-Goal files in sequential mode) fixed — FR-17 warning at push Gate.
- Q-18 (low, JTBD) fixed — see L-5.
- Q-19 (low, committer naming) fixed — `walkthrough` Persona.
- Q-20 (low, retrieval-friendly formats) fixed — addendum I note.

## reconcile-token-review.md

- T-1 (high, Conductor turns on deterministic Stages) fixed — FR-5 chaining; SM-3 counts turns.
- T-2 (high, 150-token cap scope) fixed — NFR-10.
- T-3 (high, code not frozen after validate) fixed — validated HEAD, push hash binds HEAD (FR-10, FR-23, FR-26).
- T-4 (medium, failure count cap) fixed — FR-20 `failures.max`.
- T-5 (medium, distilled step rules) fixed — FR-47; reconciled with SM-C3.
- T-6 (medium, slices evade budget) fixed — NFR-10 Context Slices.
- T-7 (medium, plan review not recorded) fixed — addendum C "not adopted"; §8.2.
- T-8 (medium, tool-call log, token accounting) fixed — FR-50, FR-35.
- T-9 (medium, CI wait mechanism) fixed — Daemon background watch, `ci_running` (FR-27).
- T-10 (medium, Reviewer read scope) fixed — Reviewers have no workspace read/search tools (FR-40).
- T-11 (low, Conductor contract) fixed — FR-5.
- T-12 (low, language config) fixed — addendum D `language` key.
- T-13 (low, HMAC key location) fixed — FR-48.
- T-14 (low, per-Persona prompt cap) fixed — FR-38 budget check.
- T-15 (low, runaway cost replacement for cap) fixed — FR-45.

## Totals

123 findings: 121 fixed, 1 fixed in part with its remainder deferred (M-9: re-entry of a `done` Ticket), 1 ignored (MN-1, FR ID ordering).
