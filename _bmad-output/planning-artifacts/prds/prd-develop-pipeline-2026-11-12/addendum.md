# Addendum: Agentflow MVP — technical detail for architecture

Companion to `prd.md`. Holds the "how" the PRD deliberately leaves out: tools, files, schemas, build order and design rationale. Carried over from v5 `agentic-workflow-mvp.md`, then updated with the decisions in `.memlog.md` and the finalize reviews (see `triage.md`). Revision 2026-11-13: synced with architecture spine rev 2 (one MCP server process, no Daemon, no HMAC, parallel post-MVP), then refined to the later spine decisions (heartbeat Repo Lock, Effect Journal, Discard Refs, `run_report` replay, `confirm_action` Gates, `bundle_get`, `metrics.yml`, two command environments); the spine is authoritative for architecture.

## A. Pipeline (updated from v5)

Step numbers match PRD §4.0; this table adds the tool names. FR-4 holds the normative edge list.

| # | Stage | Owner | Tier | Gate |
|---|---|---|---|---|
| 0 | Bfranchi moves the Ticket to In Execution in Jira (the trigger; no custom label) | Human | none | |
| 1 | `start-ticket` queries Jira (`assignee = currentUser() AND status = "In Execution"`) and lists Tickets without an Intent Record; `start-ticket <KEY>` creates the Intent Record, Ticket snapshot, Feature Branch and baseline Snapshot | MCP server (`ticket_list`, `start_ticket`) | none | |
| 2 | Spec | `intake` + `doc_scaffold` | cheap | `spec` (two phases) |
| 3 | Plan + Waves | `planner` + `plan_schedule` | medium | `plan` |
| 4 | Per Wave: every Goal's `red` Run, then one batched `test_triage` for the Wave; then per Goal: `green` Run → Checks → `refactor` Run → Checks; each Run ends with `commit_prepare` (on status 0) and `run_report` | `implementer`, `refactorer` + server | cheap (rotating) | `escalation` on status 2 |
| 5 | Checks | `run_checks` (server) | none | |
| 5b | Wave synthesis (post-MVP parallel mode only) | `synthesizer` | medium | |
| 6 | Trace Matrix (blocking) | `trace_matrix` (server) | none | |
| 7 | Reviewers → Synthesizer; validated HEAD recorded | `review_bundle`, `reviewer` ×N, `synthesizer` | cheap, medium | |
| 8 | Walkthrough template + judgment parts, push, PR | server + `walkthrough` | cheap | `push` |
| 9 | CI watch on an in-process timer; one check on resume | MCP server (`ci_watch`, `ci_failure`) | none | `ask_human` on cancelled, timed out, no run, or max wait |
| 10a | Patch Plan or Correct-Course Proposal | `planner` | medium | `plan` or `correct_course` |
| 10b | Done transition, Jira PR comment, Run Metrics | server | none | |

**Differences from v5:**
- Patch Plans are gated.
- Commits are granular; the `push` Gate gates only the push.
- The trigger is a manual move to In Execution (no label, no intake transition).
- Escalation is human-gated, with a model choice.
- Status-1 retries rotate cheap models.
- Loops stop at a human checkpoint (`ask_human`) instead of a cap or nothing.
- Validation is parallel cheap Reviewers plus a medium Synthesizer.
- Checks run after `green` and `refactor` Runs.
- Deterministic Stages are chained inside the server.
- One long-lived process (the MCP server): Jira is queried on demand by `start-ticket` (no poller), and the CI watch is an in-process timer (no Daemon).
- Parallel Goal execution is post-MVP.

## B. Tools

| Tool | Caller | Purpose |
|---|---|---|
| `state_get`, `state_advance` | Conductor | Stage Graph execution with server-side chaining of Tool-owned Stages; Goal Phase cursor; counters; Memlog appends; atomic `record.yml` commit; Snapshots and attribution |
| `gate_request`, `gate_confirm` | Conductor | Open an elicitation (or the always-confirm fallback); only paths that create Gate Records |
| `agentflow approve` (CLI, conditional) | Human, outside Copilot | Built only if the week-1 proof shows elicitation and confirmation both fail (FR-42) |
| `doc_scaffold`, `doc_section` | intake, planner (scaffold); server (section) | Template fill with schema validation (G/W/T, source tags, AC coverage, Assumption rewrites); Current Plan merge and context slicing |
| `plan_schedule` | server | Waves from `depends_on`, `parallel_group`, glob overlap |
| `run_tests`, `run_checks` | implementer, refactorer, escalation, server | Separate process per call; trimmed Failure Payloads with signatures |
| `test_triage`, `trace_matrix`, `review_bundle` | server | Deterministic classification, coverage, bundle building |
| `commit_prepare` | implementer, refactorer, escalation | Commits only the Run's diff to the Feature Branch |
| `bundle_get` | every Persona | Returns the Run's Input Bundle (or inlined Review Bundle) |
| `run_report` | every Persona | Status Code + summary + schema-validated `result`; read by `state_advance`; same-content repeat replays the stored result, conflicting repeat rejected |
| `handoff_create` | stuck Run | Schema-validated Handoff; server fills counters and Discard Refs |
| `ask_human` | any Persona | Raise an Ask Human Gate with reason and evidence |
| `claim_post` (post-MVP) | parallel `green` Runs | Post or update a Claim (refused on overlap) |
| `push_branch`, `pr_upsert` | server | Fast-forward push of the approved SHA; PR create/update |
| `ci_watch`, `ci_failure` | MCP server | In-process timer after push, one check on resume; parsed payload to `ci_failure.yml` |
| `ticket_list`, `ticket_get`, `jira_transition`, `jira_comment` | MCP server | Jira I/O behind `TicketSource`; outbound only, typed errors |
| `start_ticket`, `skip_ticket`, `stop_ticket` | Conductor only (from `start-ticket`) | Start or resume (`--restart` option), skip a not-started Ticket, stop a Ticket; served by the Repo Lock holder; skip, stop and restart first open a `confirm_action` Gate |
| `job_get` (conditional) | Conductor | Poll a long-running tool call; added only if the OQ-13 proof shows tool calls time out |
| `metrics_write`, tool-call logging | server | Run Metrics (`metrics.yml`), Tool-Call Log |
| `agentflow context init / refresh`, `agentflow init` (CLI) | Human | Project Context block; scaffold `.agentflow/` and `.github/` in a target repo |
| `agentflow config models` (CLI) | Human | Tier and model config, project/local layers |
| `agentflow unlock` (CLI) | Human | Removes a stale Repo Lock (mtime older than 90 s); refuses a fresh one |
| `agentflow gen agents` (CLI) | Human | Composes base + role prompts + tool allowlists into `.agent.md`; budget check |

Shell-wrapper tools (`run_tests`, `run_checks`, `ci_watch`) are declared in `.agentflow/tools/*.yml` and run by a generic TS runner with TS output parsers; tools with real logic are plain TS. The MVP ships a parser for Vitest/Jest JSON reporters only; other runners need a parser added. `[ASSUMPTION]`

## C. Hook-free enforcement

Source: `research/aidlc-token-review.md` §3, hardened by the finalize reviews. Two layers: **prevent** where the server owns the action (state, Gates, commit, push, CI, Jira) or the agent lacks the tool; **detect and refuse at the next transition** otherwise (file edits made with Copilot's own tools).

| Guard (AI-DLC uses a hook) | Agentflow enforcement |
|---|---|
| State transition | `state_advance` matches every transition to a Stage Graph row; Server Record outside the workspace, written only by the Repo Lock holder with an atomic `record.yml` commit (FR-4, FR-48) |
| Human presence | Gate Records created only by the server from elicitation / always-confirm responses (CLI-with-code only if needed); no tool takes a decision argument; Gate Records live outside the workspace where agent edit tools cannot reach (FR-8, FR-42, FR-48) |
| Plan approval (no code before approved plan) | **Prevent:** `intake`/`planner` have no edit or terminal tools; nobody has push/Jira tools (FR-40). **Detect:** baseline Snapshot at `start-ticket`, checked before the `spec` and `plan` Gates; per-Run attribution afterwards (FR-41) |
| Review freeze | Approved Versions (copy + hash) for Spec and Current Plan; validated HEAD for code; push Gate hash binds Walkthrough + HEAD (FR-10, FR-26, FR-51) |
| Status relay | `run_report` stored server-side and replayed on repeat; the Conductor cannot alter it (FR-44) |
| Irreversible actions | `stop_ticket`, `skip_ticket` and restart open a `confirm_action` Gate; Conductor-only, no Persona has them (FR-46) |
| Crash safety | Effect Journal: ordered `pending` effects committed with the new State, each repeatable; Discard Refs instead of `git stash` (FR-41, FR-48) |
| Secrets in child processes | Repo code runs with a scrubbed environment; git runs with the real environment minus Jira/GitHub tokens (NFR-6) |
| Sensors on write | Replaced by Checks after `green`/`refactor` Runs and the blocking Trace Matrix |
| Stage-rules delivery | `state_get` returns only the step rules and Context Slices that step needs, within NFR-10 |
| Audit log | Memlog and Tool-Call Log written only by the server |
| Continue workflow | Server-side chaining (FR-5); in-process CI timer with notification, plus one CI check on resume (FR-27, FR-49) |

Remaining risk: if Copilot doesn't enforce subagent tool allowlists (OQ-8), pre-approval edits and shell commands are detected at the next transition or by the remote-head check, not prevented (PRD §10, "Detect-not-prevent residue").

**Token budgets.** Agentflow's targets and estimation rule are in NFR-10. For comparison, the AI-DLC token review measured ~12K ambient tokens per session, ~51K before stage 1, 15–45K per stage, and ~150–250K framework tokens for this pipeline's slice.

**Not adopted from the token review:**
- Single-chat, no-subagent model — conflicts with fresh-context subagent Runs (user decision).
- Fixed CI retry cap (max 3) — replaced by the Loop Checkpoint (human decides; no hard cap).
- One adversarial model review of the Plan before the `plan` Gate — the human approves the Plan directly; listed as out of scope.
- A JSONL audit log — the Tool-Call Log uses YAML lines per NFR-7.

## D. Files

```
.github/ copilot-instructions.md (≤150 tokens), agents/ (generated), skills/start-ticket/SKILL.md, workflows/ci.yml
AGENTS.md                         Project Context block (delivered as a Context Slice, not ambient)
.agentflow/
  config.yml                      JQL, done transition, git.base, protected branches, pr.draft, parallel (post-MVP),
                                  claim.timeout (post-MVP), checkpoint.n, failures.max, ci.*, bundle budgets per model, language
  config.local.yml                personal overrides (gitignored)
  stage-graph.yml
  personas.yml                    Persona → role prompt, default Tier, tool allowlist
  prompts/_senior-base.md, prompts/<persona>.md, prompts/escalation.md
  tools/*.yml, templates/, schemas/ (spec, plan, patch, handoff, failure, gate, run-report, metrics; claim post-MVP)
  preferences.md, pitfalls.md
  tickets/<KEY>/                  Ticket Workspace (gitignored)
    ticket.json, requirements.md, plan.md, patch-<n>.md, correct-course-<n>.md,
    handoffs/H-n.yml, walkthrough.md, trace.yml, verdict.yml, ci_failure.yml
~/.agentflow/<repo-id>/
  lock                            Repo Lock (pid of the MCP server; touched every 30 s, stale after 90 s)
  logs/                           process diagnostics
  <KEY>/                          Server Record
    record.yml                    State (incl. `runs` map, `boot_id`), Gate Records, Approved Version hashes, counters, Run Reports, Snapshot ids, Effect Journal
                                  (atomic temp + rename; the single commit point)
    blobs/                        Approved Version copies (written before the rename that references them)
    memlog.md                     append-only; line count recorded in record.yml, truncated back on resume
    tool-calls.yml                append-only; never truncated, length not recorded
    metrics.yml                   Run Metrics, written at a terminal Stage
agentflow/ (TypeScript, one package; layout in the architecture spine)
.vscode/mcp.json                  starts the MCP server; credentials via its env block (not committed)
```

## E. Schemas (sketches)

**Plan** (fenced `yaml` block inside `plan.md`)

```yaml
goals:
  - id: G1
    acs: [AC-1, AC-2]
    goal: "Orders over $100 get free shipping"
    depends_on: []
    parallel_group: A
    files: [src/shipping/*.ts]
    items:
      - id: G1.I1
        text: "Add free-shipping threshold to pricing rules"
        scenarios:
          - { id: S1.1.1, tag: new, text: "Given a $120 order, When priced, Then shipping is 0" }
          - { id: S1.1.2, tag: existing, text: "Given a $50 order, When priced, Then shipping is unchanged" }
```

**Patch Plan** (delta; same block shape with an `op` per entry)

```yaml
patch: 2
reason: "CI: S1.1.1 fails on rounding"
changes:
  - { op: add_scenario, item: G1.I1, scenario: { id: S1.1.3, tag: new, text: "Given a $100.00 order, When priced, Then shipping is 0" } }
  - { op: change_item, id: G1.I1, text: "Threshold comparison uses cents" }
```

**State** (Server Record)

```yaml
stage: implement
wait: []                         # queue of Wait Reasons
wave: 1
goal: G2
phase: green                     # red | triage | green | refactor
goals: { G1: done, G2: in_progress, G3: pending }
current_run: R-14
counters: { G2.green.attempts: 2, G2.green.same_failure_runs: 1, G2.validation_rounds: 0, patch_loops: 0 }
approved: { spec: 1, plan: 1 }
validated_head: null
stopped_reason: null
```

**Run Report**

```yaml
run: { id: R-14, persona: implementer, phase: green, goal: G2, model: haiku-5.5, status: 1, summary: "Rounding still off by 1 cent", reason: null, start_snapshot: "…", end_snapshot: "…" }
```

**Handoff**

```yaml
handoff:
  id: H-2            # file handoffs/H-2.yml
  from: { persona: implementer, model: haiku-5.5, goal: G2, phase: green }   # server-filled
  role_prompt: prompts/implementer.md                                         # server-filled
  reason: stuck | cross_module | spec_conflict                               # Run-filled
  scope: { scenarios: [S2.1.1], files: [src/a.ts, test/a.test.ts] }          # server-filled
  progress: { attempts: 4, same_failure_runs: 3 }                            # server-filled
  discard_refs: [refs/agentflow/PROJ-123/R-12, refs/agentflow/PROJ-123/R-14]   # server-filled
  attempts: [ { n: 1, approach: "…", result: "…" } ]                          # Run-filled
  ask: "one sentence"                                                         # Run-filled
  constraints: [ "don't change public API" ]                                  # Run-filled
result: { status: resolved | partial | cannot, summary: "…", files_changed: [], follow_ups: [] }
```

**Gate Record**

```yaml
gate: { id: GR-3, kind: plan, artifact: plan.md, version: 1, sha256: "…", decision: approve, channel: elicitation, response_id: "…", at: 2026-11-12T15:04:00Z, note: "" }
```

**Failure Payload**

```yaml
- { source: test, name: "S1.1.1 free shipping over $100", location: "test/shipping.test.ts:42", message: "expected 0, got 5.99", signature: "9f2c…" }
- { source: ci, job: build, step: "npm test", name: "…", location: "…", message: "…", signature: "…" }
- { summary: "+14 more: src/a.ts (9), src/b.ts (5)" }
```

**Memlog line**

```
- 2026-11-12T15:04:00Z [gate] plan approved {gate=GR-3 version=1 channel=elicitation}
- 2026-11-12T15:20:11Z [claim] G2 green {run=R-14 files=src/a.ts,test/a.test.ts intent="threshold in cents"}   # post-MVP
```

## F. Personas

```yaml
base_prompt: prompts/_senior-base.md
personas:
  conductor:   { prompt: prompts/conductor.md,   default: cheap,  tools: [state_get, state_advance, gate_request, gate_confirm, start_ticket, stop_ticket, skip_ticket, subagent] }
  intake:      { prompt: prompts/intake.md,      default: cheap,  tools: [bundle_get, doc_scaffold, ask_human, run_report] }
  planner:     { prompt: prompts/planner.md,     default: medium, tools: [bundle_get, doc_scaffold, ask_human, run_report] }
  implementer: { prompt: prompts/implementer.md, default: cheap,  tools: [bundle_get, edit, read, search, run_tests, run_checks, commit_prepare, handoff_create, ask_human, run_report] }   # + claim_post post-MVP
  refactorer:  { prompt: prompts/refactorer.md,  default: cheap,  tools: [bundle_get, edit, read, search, run_tests, run_checks, commit_prepare, handoff_create, ask_human, run_report] }
  reviewer:    { prompt: prompts/reviewer.md,    default: cheap,  tools: [bundle_get, run_report] }
  synthesizer: { prompt: prompts/synthesizer.md, default: medium, tools: [bundle_get, ask_human, run_report] }
  walkthrough: { prompt: prompts/walkthrough.md, default: cheap,  tools: [bundle_get, run_report] }
  curator:     { prompt: prompts/curator.md,     default: cheap,  tools: [bundle_get, run_report] }
  escalation:  { prompt: prompts/escalation.md,  default: high,   tools: [bundle_get, edit, read, search, run_tests, run_checks, commit_prepare, ask_human, run_report] }
tiers: { cheap: [<model-a>, <model-b>], medium: [<model>], high: [<model>] }   # candidates for cheap: Haiku 5.5, luna-6
```

The escalation Run's prompt is the base prompt + the stuck Persona's role prompt + `escalation.md`. The senior base prompt is a stance, not a Tier; FR-47 sets its content and FR-16 the Status Code 2 criteria. The Conductor prompt is the loop contract only (FR-5).

## G. Build order (revised)

1. **Week 1 (prove the platform first):** OQ-11 org policy, OQ-1/OQ-10 elicitation and confirmation, OQ-8 tool allowlists, OQ-3 pinned subagent models, OQ-13 tool-call duration. Then: layout, `stage-graph.yml`, State Tool with chaining and Goal Phase cursor, Server Record (`record.yml` atomic commit) + Repo Lock, Memlog appends inside the State Tool, `gate_request`/`gate_confirm` (`agentflow approve` only if the proof needs it), notifier inside the MCP server, `start-ticket` (Jira query + list) + Conductor, Feature Branch and baseline Snapshot, Persona generator with tool allowlists and budget check, Tier config.
2. **Week 2:** Spec and Plan with schema validation and two-phase `spec` Gate, Approved Versions, `plan_schedule`, artifact freeze and restore, attribution Snapshots, Ask Human + Loop Checkpoint.
3. **Week 3:** sequential TDD Runs with `run_report`, cheap-model rotation, `test_triage`, `commit_prepare`, Checks, `trace_matrix`, `review_bundle`, Reviewers + Synthesizer, Handoff + `escalation` Gate, curator proposals.
4. **Week 4:** Walkthrough template, push + PR, in-process CI watch with resume check, Patch Plan loop, Correct-Course, done transition, Run Metrics, Tool-Call Log. Parallel Waves are post-MVP.

## H. Design rationale worth keeping

- **Why not wrap the AI-DLC engine or invoke BMAD skills:** hooks are forbidden on Copilot machines, and AI-DLC's framework text for this pipeline's slice is ~150–250K tokens (§C). About 90% of it is prose explaining the engine contract to the model, which a tool interface makes unnecessary. BMAD skills are likewise distilled into short Persona prompts (user decision), because invoking them would exceed the 3K-per-step budget (NFR-10).
- **Why server-side chaining:** a cheap Conductor turn still re-sends the whole chat; chaining Tool-owned Stages inside `state_advance` keeps them at zero model calls and zero Conductor turns.
- **Why no Daemon (revision 2026-11-13):** the user starts Tickets themselves, so polling Jira adds nothing; CI watching and notifications only matter while VS Code is open, and `start-ticket` checks CI once on resume. One process removes inter-process leases and observation protocols; the only heartbeat left is the Repo Lock file mtime. All calls are outbound, which suits running behind a VPN.
- **Why no HMAC:** the threat is agent drift, not same-user tampering; keeping the Server Record outside the workspace puts it out of reach of Copilot edit tools.
- **Why a human checkpoint instead of caps:** the user rejected hard caps; the Loop Checkpoint stops silent spend while leaving the decision to the human.
- **Why cheap-model rotation on retry:** each retry already runs in a fresh context, which acts as a second opinion; a different cheap model adds diversity without changing Tier. This replaces a review-only agent before Escalation.
- **Why no party-mode for spec conflicts:** cost.
- **Why parallel cheap Reviewers:** independent fresh-context opinions catch more than one medium pass, at cheap-Tier cost, provided each Review Bundle fits the model's context window. The Synthesizer is the only medium call.
- **Parallel execution tradeoff (post-MVP):** parallel Waves save wall-clock time, not requests; each Run re-reads its own Input Bundle. Claim-gated launches tell later Runs where not to act; Claims also let `commit_prepare` refuse edits outside a Run's own files.

## I. Future (not MVP)

PRD §8.2 lists the deferred features. Ideas recorded only here:
- CI-verified signed run manifest (approved hashes, Check results, Gate Records) committed with each change.
- Per-Goal git worktrees.
- Mutation checks specifically on `existing` tests.
- For the later Obsidian vault and RAG/graphRAG retrieval over Memlogs, Pitfalls and code, keep stable ids and frontmatter in those files so they stay retrieval-friendly.
