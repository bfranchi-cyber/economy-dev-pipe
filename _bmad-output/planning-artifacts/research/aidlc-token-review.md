# AI-DLC token review: what to port to a token-lean, hook-free Copilot pipeline

- Date: 2026-11-12
- Scope: the AI-DLC framework installed in this repo (`.claude/`, `aidlc/active-memory/`). This is a read-only analysis: no workflow was run and nothing else in the repo was changed.
- Method: file sizes measured with `wc -c`, tokens estimated as bytes/4. Load points come from reading `SKILL.md`, `.claude/tools/aidlc-directive.ts` / `aidlc-orchestrate.ts` (what a `run-stage` directive carries), the agent files' "knowledge preflight" lines, and the hooks registered in `.claude/settings.json`.
- Caveat: the sizes are exact, but the load points are inferred from code and prose, not traced from a live run. Real cost can be lower where the engine trims (the `rules_held` digest, the roster cap on knowledge) and higher after a context compaction, when files are read again. A file read once stays in the conversation and is **re-sent as input on every later turn**, so a 50K-token preamble over a 40-turn stage run costs about 2M input tokens before caching.

## 1. Ranked token costs

Classes: **(a)** a deterministic TypeScript MCP tool can do it with zero model calls · **(b)** keep as a compressed prompt or rule · **(c)** not needed for our pipeline.

| # | Piece | Bytes | ≈ Tokens | When it enters context | Class |
|---|---|---:|---:|---|---|
| 1 | `.claude/aidlc-common/protocols/stage-protocol.md` | 93,960 | **23.5K** | Once per `/aidlc` session, when the first `run-stage` names it; again after compaction | (a) mostly, (b) ~1.5K |
| 2 | Agent knowledge packs `.claude/knowledge/aidlc-<agent>/` | 7–44K each (product 44K, pipeline-deploy 44K, developer 37K, architect 35K) | **2–11K** | Every inline stage for the lead (and supports), every subagent and reviewer dispatch ("knowledge preflight") | (b) a few hundred tokens per role, (c) the rest |
| 3 | Rule bundle: `aidlc/active-memory/*.md` + phase file (`rules_content`) | ~25,650 | **6.4K** | (i) every session, through `CLAUDE.md` → `rules/aidlc.md` `@`-imports; (ii) inside every `run-stage` directive unless the `rules_held` digest applies; (iii) injected by the `deliver-stage-rules` hook into **every subagent brief** | (b) ~0.8K |
| 3a | …of which the 4 "Conversation language" mandates in `org.md` | 9,434 | 2.4K | Same as 3, so every session and dispatch | (c) replace with one line |
| 4 | `.claude/skills/aidlc/SKILL.md` | 49,688 | **12.4K** | Once per `/aidlc` session | (a) the routing, (b) ~1K of loop contract |
| 5 | `.claude/CLAUDE.md` (onboarding, Guards table, Where things live) | 23,138 | **5.8K** | **Every session**, even when AI-DLC isn't used | (c) except ~300 tokens |
| 6 | `aidlc-composer-agent.md` + its knowledge + `composer.md` | 64,931 + 14,621 + 12,986 | **23K** | Per compose request (plan shaping, `--report`, mid-flow reshape) | (a) scope selection, (c) the entropy essay |
| 7 | `stage-protocol-reviewer.md` | 40,560 | **10.1K** | Each of the 13 stages with a reviewer | (a) receipts and freeze, (b) ~0.8K review rubric |
| 8 | Reviewer agents (`architecture-reviewer` 18.7K, `product-lead` 15.5K) + knowledge (8.8K / 7.3K) + rules 6.4K + shared knowledge 4.5K | ~50K | **~12–14K per review pass**, ×2 with adversarial iterations | Per reviewer dispatch | (b) one ~1K review prompt |
| 9 | `stage-protocol-swarm.md` | 36,488 | 9.1K | Construction with parallel Units | (c) for the MVP |
| 10 | `stage-protocol-construction.md` | 34,762 | 8.7K | Every Construction step | (a) mostly, (b) ~0.5K |
| 11 | Stage file `code-generation.md` | 37,327 | 9.3K | Per Unit (it runs for each unit-of-work) | (b) ~1.5K TDD + plan prompt |
| 12 | Stage file `reverse-engineering.md` | 28,000 | 7K | Brownfield runs | (c) for the MVP (or (b) ~0.5K if we need a repo scan) |
| 13 | Shared knowledge preflight (`aidlc-shared/` minus format refs: principles, rules-reading, verification, brownfield, adding-a-repo) | 18,122 | 4.5K | Every agent and every inline stage | (c) |
| 14 | `stage-protocol-recovery.md` / `-learnings.md` / `-checkpoint.md` / `-ensemble.md` / `-loopback.md` | 14.6–18K each | 3.7–4.5K each | Resume, a learnings step, a checkpoint, a mob stage, a loopback | (a) recovery and checkpoints, (c) the rest |
| 15 | Other stage files (`build-and-test` 18.5K, `delivery-planning` 17.2K, `requirements-analysis` 15.6K, `intent-capture` 13.2K, others 3–12K) | 295K total for 33 stages | 0.7–4.6K each | Once per stage that runs | (b) for the 4–5 stages we keep |
| 16 | `.claude/aidlc-common/conductor.md` (persona) | 11,177 | 2.8K | Baked into the first `run-stage` directive | (b) ~0.4K |
| 17 | Lead persona `aidlc-<role>-agent.md` (11 roles) | 4.6–7.2K | 1.2–1.8K | Per inline stage (`lead_persona`) and as the system prompt per dispatch | (b) ~200 tokens each, (c) for unused roles |
| 18 | SessionStart hook context (`aidlc-session-start.ts`) | ~4–6K rendered | 1–1.5K | Every session while a workflow is active | (a) a `status` MCP tool |
| 19 | `question-rendering.md` / `tables.md` | 8,679 / 7,215 | 2.2K / 1.8K | At asks or gates, and table rendering | (b) ~200 tokens |
| 20 | Stop hook `aidlc-continue-workflow.ts` ("AI-DLC is carrying on…") | ~100 per fire | ~25–100 | Each turn end during an unattended run | (a) not needed: the pipeline runner owns the loop |
| 21 | `stage-graph.json` (91K), `scope-grid.json` (13.5K), scopes (21K), manifest (46K), sensors (18.6K) | ~190K | 0 | Read only by the engine binary, never by the model | (a) already deterministic |
| 22 | Remaining hooks (fold-usage, write-audit-log, validate-state, sync-workflow-state, log-subagent, rebuild-stage-graph, record-human-turn) | 757K of TS | ~0 (only refusals reach context) | Every tool call: latency, not tokens | (a) or (c) |

### What a run actually costs

| Moment | Rough new tokens |
|---|---|
| Any session in this repo (ambient: CLAUDE.md + rule imports) | **~12K**, even with no AI-DLC use |
| Plus `/aidlc` started (SKILL.md + stage-protocol.md + conductor) | **+39K**, so ~51K before stage 1 does any work |
| Per inline stage (directive with rules + stage file + persona + shared + role knowledge) | **~15–30K** |
| Per reviewer pass | **~12–14K** + the artifacts it reads; up to 2 passes |
| Per Code Generation Unit (stage file + construction module + developer dispatch with rules/knowledge) | **~35–45K** before reading any code |
| Per compose | **~23K** |

A feature-scope run that covers only our pipeline's slice (requirements → plan → code-gen → build-and-test → CI) lands around **150–250K tokens of framework text**, re-sent each turn, before any Jira ticket, code or test output. The work content itself is often smaller than that.

## 2. Port / keep / drop

### Port as deterministic MCP tools (class a, zero model calls)

| AI-DLC piece | MCP tool for the Copilot pipeline | Notes |
|---|---|---|
| `aidlc engine orchestrate next/report/park` + `stage-graph.json` + `scope-grid.json` | `pipeline_next(runId)` → returns **one small directive**: `{step, inputsPaths, outputPaths, promptId, gate}`; `pipeline_report(runId, step, result, evidence)` | Keep AI-DLC's best idea: **the engine owns routing; the model only executes the step it's given.** Make the directive tiny: paths and a prompt id, not the rule text. |
| `aidlc-state.md` + state guard + `ENGINE_OWNED_STATE_TRANSITIONS` | A state JSON file written only by the MCP server; a transition table in code | The model has no write tool for state. |
| Audit shards (`audit-format.md` is 102K of spec!) | Append-only JSONL in the MCP server | Drop the spec doc. The schema lives in TypeScript types. |
| Sensors: required-sections, traceability, upstream-coverage, claim-sources, linter, type-check | `check_artifact(step)`, `check_trace(step)`, `run_lint()`, `run_typecheck()` | Already `kind: deterministic` in AI-DLC. Port the logic. Results go back as a compact `{pass, findings[]}` (cap the findings). |
| Scope selection (composer's entropy estimate) | A rule table keyed on Jira issue type, labels, story points and touched paths | Use the model only when the table can't decide, through a ~300-token classifier prompt rather than a 23K composer. |
| Gate bookkeeping (approval receipts, iteration counters, reviewer max iterations) | Part of `pipeline_report` | |
| Recovery/resume (`stage-protocol-recovery.md`) | `pipeline_status(runId)` returns the current step and next action | Resume becomes one tool call instead of 4.5K tokens of prose. |
| Status line, fold-usage, session-cost | `pipeline_status` + token accounting in the server | Optional. |
| Unit DAG / delivery planning bookkeeping | A plan JSON validated by a schema in the server | The model writes the plan; the tool validates it. |
| Conversation-language resolution | A `language` field in the run config | Replaces 2.4K tokens of mandates per context. |

### Keep, compressed (class b)

Target: **under 3K tokens of framework text per step**, loaded per step and never ambient.

1. **Loop contract** (from SKILL.md, ~1K → ~300 tokens): "Call `pipeline_next`. Do exactly that step. Write only the listed outputs. Call `pipeline_report`. Stop when the directive says stop. Never edit state."
2. **Per-step prompts** for the 4–5 steps we keep, each ≤1.5K: requirements (from `requirements-analysis.md`), plan (from the `code-generation.md` plan section), TDD generation (from `code-generation.md` + the developer persona + `code-generation-guide.md`, distilled), validation/build-and-test (from `build-and-test.md`), and CI patch (from `ci-pipeline.md`). Put templates and required headings in the prompt; let `check_artifact` enforce them.
3. **Rule bundle** distilled to ~800 tokens: Testing Posture (methodology, ordering, coverage floor), Construction guardrails (complete files, error handling at boundaries, no secrets, 1 happy + 2 edge-case tests, no `assert True`), Code Style deferral to linter config. Deliver it **inside the step prompt** (the MCP tool returns it), never as an always-on instruction file.
4. **One review prompt** (~1K) folded from `architecture-reviewer` + `stage-protocol-reviewer.md` §12a: adversarial, verdict `READY|NOT-READY`, findings as JSON. Run it **only** at the plan gate and optionally at code review. Not on every stage.
5. **Conductor persona** core (~400 tokens): ask only what's needed, Keep/Modify/Redo on corrections, never narrate internals.
6. **Question format** (~200 tokens): numbered options + "Other". The tool records the answer.
7. **Personas**: only developer + quality, ~200 tokens each.

### Drop (class c)

- Ideation and Operation phases entirely (intent-capture, market research, feasibility, mockups, team formation, approval-handoff, deployment, observability, incident response, feedback): the Jira ticket is the intent.
- Most of Inception: domain/contract design, units generation, delivery planning, practices discovery, user stories mob. One "requirements + plan" step replaces them.
- Swarm, wave, ensemble/mob, collaborators, learnings ritual, loopback, walking-skeleton ceremony, spaces/intents/DocumentKB, plugins, composer agent.
- `CLAUDE.md`'s 5.8K always-on onboarding, the Guards table and the "Where things live" prose.
- The 9.4K language mandates (one config field instead).
- The 102K `audit-format.md` and 37K `worktree-info-schema.md` (the spec belongs in code), and the shared knowledge preflight.
- 9 of the 11 domain personas and their knowledge packs (aws-platform, compliance, design, delivery, operations, pipeline-deploy, product, architect, devsecops), unless a later scope needs one.

## 3. Hook-free enforcement

In AI-DLC every guard is a Claude Code hook (PreToolUse exit 2, UserPromptSubmit, Stop). Copilot agent mode gives us no hooks, so enforcement has to move to one place the model **must** pass through: the MCP server. The model can still write files with Copilot's own edit tools, so there are two layers:

- **Prevent** where the MCP server owns the action: state, commits, push, CI, gate recording.
- **Detect and refuse at the next transition** where it doesn't own the action: file edits made with Copilot's tools.

The rule that makes this work: **nothing leaves the machine (commit or push) except through `pipeline_commit` / `pipeline_push`, and those refuse unless every check passes.** Back this up by removing or denying the raw git and terminal tools in the Copilot agent's tool set, and by checking evidence in CI.

| AI-DLC guard (hook) | What it enforces | Hook-free MCP equivalent |
|---|---|---|
| **Plan approval** (`aidlc-plan-approval-guard.ts`, PreToolUse: blocks dev-agent dispatch and writes outside `aidlc/` until "Approve Plan") | No code before an approved plan | `pipeline_next` never returns the `generate` step until the plan's SHA-256 is recorded as approved. `pipeline_approve(runId, planHash, nonce)` stores the hash. **Detect:** at `pipeline_report(generate)` and at `pipeline_commit`, the server checks that (1) the approved plan hash still equals the plan file on disk, and (2) the git diff's first change happened after the approval timestamp (compare `git stash`/worktree snapshot or file mtimes taken at approval). If code changed before approval or the plan changed after it, refuse and require re-approval. |
| **Human presence** (`aidlc-record-human-turn.ts`, UserPromptSubmit writes HUMAN_TURN; the gate refuses without one) | The model can't approve its own gate | No prompt hook exists, so make approval **unforgeable by the model**: `pipeline_gate_open` creates a one-time code and shows it **outside the chat** (VS Code notification or quick-pick from a small companion extension, a terminal prompt, or a Jira comment the user must post). `pipeline_approve` needs that code. Cheaper option: rely on Copilot's built-in **MCP tool confirmation dialog**. Mark `pipeline_approve` as a tool that always requires manual confirmation (never auto-approved), so a human click is the presence proof. Log both the code and the confirmation in the audit JSONL. |
| **State transition** (`aidlc-state-transition-guard.ts` + the state tool refusing direct verbs) | Only the engine moves stages | State lives in the MCP server, and the model has no write path. Put the state file outside the workspace (or keep an HMAC of it in the server), so a hand edit is detected and refused. Transitions are a coded table; `pipeline_report` with an illegal transition returns an error with the one allowed next call. |
| **Review freeze** (`aidlc-review-freeze.ts`: no writes to reviewed artifacts after the review receipt) | The reviewed bytes are what the human approves | `pipeline_report(review)` stores the SHA-256 of each reviewed artifact. `pipeline_approve` and `pipeline_commit` recompute the hashes and refuse on mismatch with "artifact changed after review: re-run review or request changes". Detect-at-transition gives the same guarantee without blocking the write. |
| **Sensors on write** (`aidlc-run-sensors.ts`, PostToolUse Write/Edit) and at the gate | Artifacts have the required shape and traceability | Run the checks **at transition time**: `pipeline_report(step)` runs `check_artifact`, `check_trace`, lint and type-check, and returns `{pass, findings}`. A failing blocking check keeps the step open. Copilot can call `run_checks` itself mid-step for early feedback, but enforcement happens only at report and commit. Nothing needs to fire on each write. |
| **Reviewer scope** (`aidlc-reviewer-scope.ts`: a reviewer reads only allowed paths) | Reviews stay independent and bounded | `pipeline_review_bundle(step)` returns exactly the files the reviewer may see (inlined, size-capped), and the review prompt says to use only that bundle. Enforcement is soft, because Copilot can't sandbox reads; accept that, or run the review as a separate model call made **by the MCP server** (if the org allows the server an API key), which gives a hard bound and keeps tokens out of the main chat. |
| **Stage-rules delivery** (`aidlc-deliver-stage-rules.ts`: injects the rule bundle into every subagent brief) | Every worker sees the rules | `pipeline_next` returns the compressed rules inside the step prompt. There are no subagents to inject into: one chat, one step at a time. |
| **Continue workflow** (Stop hook: keeps an unattended run going) | Don't end the turn mid-work | Not needed for the MVP: the human drives Copilot turn by turn. For the CI patch loop, the MCP tool returns `next: "call pipeline_ci_status again"` with a bounded attempt counter in the server (for example max 3), so the loop is deterministic and capped. |
| **Audit/write log** (`write-audit-log`, `log-subagent`, `fold-usage`) | Traceable record | The MCP server logs every tool call it receives. File edits it didn't see appear in the diff at `pipeline_report`/`pipeline_commit` and get logged there. |
| **Validate state / session start / session end** | Consistent resume | `pipeline_status(runId)` at the start of any chat. The `.github/copilot-instructions.md` line says: "If a pipeline run is open, call `pipeline_status` first." |

Backstop outside the IDE: have CI verify a signed or hashed **run manifest** committed with the change (approved plan hash, review hashes, check results, human approval codes). A PR without a valid manifest fails. That moves the final enforcement to a place no local agent can skip.

## 4. Recommendations for the PRD

1. **Keep AI-DLC's architecture, not its text.** The part worth copying is "a deterministic engine owns routing, state, gates and checks; the model does one step and reports". About 90% of the tokens are prose that explains this contract to the model, and a tool interface makes that prose unnecessary.
2. **Zero ambient instructions.** Keep `.github/copilot-instructions.md` under ~150 tokens: name the MCP server and the first call. Everything else arrives per step from `pipeline_next`. (AI-DLC spends ~12K tokens per session before anyone types `/aidlc`.)
3. **Budget per step: ≤3K framework tokens**, against AI-DLC's 15–45K. Return paths and a prompt id, plus only the rules that step needs.
4. **Use the model only for:** turning requirements into a plan, writing tests and code, diagnosing a CI failure, and one plan review. Everything else (scope choice, sequencing, checks, gates, commit, push, CI polling, retry cap) is TypeScript.
5. **Enforce at the chokepoints:** state, approve, commit and push live only in the MCP server; hash-based detect-at-transition replaces PreToolUse blocks; the Copilot tool-confirmation dialog (or an out-of-band code) replaces the human-presence hook; a CI manifest check is the backstop.
6. Watch the main residual risk: Copilot can still edit files freely, so "no code before plan approval" is **detected** (at report/commit), not **prevented**. If the org needs prevention, run code generation through an MCP tool that writes files itself, or restrict the agent's edit tools until the plan is approved (a custom chat mode / tool set per step).
