# Code-Generation Readiness Review: Agentflow MVP PRD

- **Reviewed:** `prd.md`, `addendum.md` (same folder), with `.memlog.md` consulted for intent only
- **Date:** 2026-11-13
- **Stance:** adversarial. The reviewer acted as the epics → stories → code workflow and tried to break it
- **Verdict:** Not ready for code generation. The pipeline's core safety claims (only a human can approve, nothing changes before approval, frozen artifacts) can be broken with the PRD as written. The state machine also has no terminal "stopped" state and no per-Goal cursor, and the Conductor's tool set cannot run the deterministic steps the State Tool tells it to run.

| Severity | Count |
|---|---|
| Critical | 6 |
| High | 13 |
| Medium | 17 |
| Low | 9 |
| **Total** | **45** |

---

## Critical

### C-1. The Conductor cannot run the tools that `state_get` tells it to run
- **Location:** FR-40 vs FR-5, §4.0 table ("Done by: Tool"), addendum B/C
- **Quote:** FR-40: "The Conductor's tool set is limited to `state_get`, `state_advance`, `gate_request` and subagent launch." FR-5: "`state_get` returns one action: a tool to call, a Persona to run with its input bundle, or a Gate to open."
- **Problem:** Steps 5, 6, 9 and 10b (`run_checks`, `trace_matrix`, `ci_watch`, `ci_failure`, `jira_transition`, `jira_comment`, `metrics_write`, `pr_upsert`, `push_branch`, `review_bundle`, `plan_schedule`) are "Tool" steps. The Conductor is the only agent in the main loop, and it is not allowed to call any of them. `gate_confirm` is also missing from its set, so the FR-42 fallback can never be used. An implementer has to guess: either the State Tool runs these internally (then "a tool to call" is never a valid action), or the allowlist is wrong.
- **Suggested fix:** Pick one model and state it. Recommended: deterministic Stages run inside `state_advance`/`state_get` (server-side), so `state_get` only ever returns `run_persona` or `open_gate`. Otherwise, list every deterministic tool in the Conductor's allowlist and add `gate_confirm`. Update FR-5, FR-40 and addendum B together.

### C-2. No terminal "stopped" state; reject semantics and the Wait Reason set don't add up
- **Location:** Glossary (Wait Reason), FR-6, FR-9, FR-25, FR-29, FR-35, FR-4
- **Quote:** FR-9: "`reject` (stops the Ticket with Wait Reason kept)". FR-35: "On `done` (or a stopped Ticket)". FR-6: "Running `start-ticket <KEY>` on a waiting Ticket re-opens the pending Gate".
- **Problem:** A rejected Ticket keeps its Wait Reason, so `start-ticket` re-opens the same Gate. "Stopped" and "waiting" look the same. There is no `stopped` Stage in FR-4, no Wait Reason for it, and no way to end, abandon or restart a stopped Ticket. The Jira status stays In Execution and FR-1 never re-selects it. Reject means "stop" at `spec`/`plan`/`push`, "guidance or stop" at `escalation` (FR-25), and "back to Patch Plan drafting" for Correct-Course (FR-29). Nothing says which reject at the Patch Plan Gate applies. The Wait Reason enum also has no value for "Intent Record created, `start-ticket` not yet run" (FR-2 starts at `spec`) or for a pending Correct-Course decision.
- **Suggested fix:** Add a terminal `stopped` Stage plus a State field `stopped_reason`. Define a per-Gate-kind table: approve / edit / reject → next Stage and Wait Reason. Add Wait Reasons `not_started` and `gate_correct_course`, or say which existing value is reused. Define how a stopped Ticket is resumed or abandoned (e.g. `start-ticket <KEY> --restart-from <stage>`, `skip`).

### C-3. Re-tagging accepted Assumptions after approval breaks the FR-10 hash freeze
- **Location:** FR-12 vs FR-10, FR-8
- **Quote:** FR-12: "Accepted Assumptions stay tagged `[assumption: accepted]` for traceability." FR-10: "a mismatch blocks the Stage and re-opens the matching Gate."
- **Problem:** The Spec shown at the Gate contains `[assumption]`. If something rewrites it to `[assumption: accepted]` after approval, the SHA-256 no longer matches the Gate Record, and every later Stage re-opens the `spec` Gate, forever. If the rewrite happens before approval, the human approves without a recorded per-Assumption decision. FR-9 also gives only `approve | edit | reject`, so there is no way to accept one Assumption and edit another inside one elicitation.
- **Suggested fix:** Use a two-phase Gate. (1) A per-Assumption elicitation (accept / edit / remove) that `doc_scaffold` applies deterministically. (2) A final `approve` that hashes the rewritten Spec. Or store accepted Assumption ids in the Gate Record instead of rewriting the file. State that the stored hash is taken after all rewrites.

### C-4. FR-41's snapshot is taken at approval, so it can never see changes made before approval
- **Location:** FR-41, addendum C ("Plan approval")
- **Quote:** "When the `plan` Gate is approved, the State Tool records a snapshot (git tree hash of the working tree)." … "any working-tree difference against the approval snapshot that the State Tool cannot attribute to an implement Stage run fails"
- **Problem:** Any edit made during `spec`/`plan` (the very thing this FR is meant to detect) is already in the snapshot, so it becomes the baseline and is never reported. The check only catches unattributed edits after approval. The title "Detect pre-approval changes" therefore promises something the mechanism cannot do.
- **Suggested fix:** Record a baseline snapshot at Intent Record creation or at `start-ticket` (branch base). At `plan` approval, compare against that baseline and refuse, or show the diff in the Gate, if the code tree changed outside `tickets/<KEY>/`. Keep the approval snapshot as the baseline for attribution after approval.

### C-5. Gate Records can be forged by any agent with file-edit tools
- **Location:** FR-5 (HMAC), FR-8, FR-40, addendum C/D
- **Quote:** FR-5: "The State Tool keeps an HMAC of `state.yml`". FR-8: "A Gate Record can only be created from a human's answer to an MCP elicitation prompt". Addendum D: `gates/G-n.yml`.
- **Problem:** After the `plan` Gate, the implementer, refactorer and escalation agents have file-edit tools. Only `state.yml` is HMAC-protected. An agent can write `tickets/<KEY>/gates/G-7.yml` with `kind: push, decision: approve` and a matching sha256. FR-5 only checks for "a matching Gate Record", and nothing verifies the record's origin. The same applies to `memlog.md` ("append-only" is not enforced), `handoffs/`, `metrics.yml` and the Preferences/Pitfalls docs. The HMAC key location is also undefined. If it sits in the repo or in an env var readable from a terminal, the HMAC is forgeable too.
- **Suggested fix:** HMAC or sign every Gate Record (or keep the record index inside the HMAC'd State). Define where the key lives (e.g. OS keychain or a per-machine file outside the workspace, never exposed through a tool). Have `commit_prepare` refuse any change under `tickets/<KEY>/` other than those the server writes. Add a test: a hand-written `gates/G-n.yml` is rejected.

### C-6. Spec/Plan freeze invariants conflict with Patch Plans and Correct-Course
- **Location:** FR-10, FR-28, FR-29, §4.0 loop-backs, `.memlog.md` Q37
- **Quote:** FR-10: "During a patch loop the Spec hash must equal the originally approved hash." FR-29: "Approving it re-opens the `spec` or `plan` Gate with the revised artifact".
- **Problem:** (a) After a Correct-Course changes the Spec, the next CI failure starts a patch loop where the Spec can never equal the *originally* approved hash, so the Ticket is blocked permanently. (b) FR-10 checks "the Spec and Plan", but a Patch Plan lives in `patch-<n>.md`. It is never said which Plan is current, whether `patch-<n>.md` is a delta or a full replacement, whether `plan.md` stays frozen, or which file `trace_matrix`, `review_bundle` and the implementer read. (c) When a re-approved Spec changes, nothing says whether the Plan's approval is invalidated, or whether already-committed or pushed code is kept, reverted or re-validated.
- **Suggested fix:** Replace "originally approved" with "the hash in the most recent `approve` Gate Record of that kind". Define "current Plan" = `plan.md` plus the ordered list of approved `patch-<n>.md`, or make every Patch Plan a full replacement. State that a Spec re-approval forces a Plan re-approval and a full re-run of `trace`/`validate`. Add Stage Graph edges for each case.

---

## High

### H-1. State has no per-Goal / Wave / sub-step cursor
- **Location:** Glossary (State, Stage), FR-4, FR-5, FR-15, FR-19, §4.0 table
- **Quote:** Glossary: "State — … current Stage, Wait Reason, counters, timestamps." FR-19: "`run_checks` runs automatically after each Goal's Status Code `0`."
- **Problem:** `implement` and `checks` alternate per Goal, and Red → triage → Green → Refactor are sub-steps. The State holds only one "current Stage", so it cannot represent "Goal G2, Wave 1, refactor pending". `state_advance` "for a Stage that is not current" cannot tell "checks for G1" from "checks for G3". Resume (FR-6 "restarts that Stage") would restart every Goal.
- **Suggested fix:** Add `current_wave`, `current_goal`, `goal_phase (red|green|refactor|checks)` and per-Goal status (`pending|in_progress|checked|done`) to the State schema. Make `state_advance` take `(stage, goal_id, phase)`. Define resume at Goal-phase level.

### H-2. Inner loops are unbounded and have no human stop
- **Location:** FR-7, FR-16, FR-19, FR-21, FR-23, FR-32, addendum C
- **Quote:** FR-7: "No counter value ever blocks progress (no caps)." FR-16: "A run without a parseable `0 | 1 | 2` is treated as `1`." Addendum C: "the human stops the patch loop at the Patch Plan Gate".
- **Problem:** Only the CI patch loop passes through a Gate. A model that keeps emitting unparseable output, a check that fails forever, a validation that keeps returning `partial`, or a Claim that keeps timing out (FR-32 → status 1 → relaunch) all loop with premium requests and never stop. This contradicts the token-economy vision, and stories cannot define "done" for these loops.
- **Suggested fix:** Keep "no hard caps", but add a soft threshold per counter (configurable) that opens an `escalation`-style Gate ("continue / escalate / stop"). Or define that `status1_retries ≥ N` auto-converts to Status Code `2`. Add tests for each loop.

### H-3. Working tree after Status Code `1`/`2` runs is undefined; FR-41 "attribution" has no mechanism
- **Location:** FR-16, FR-17, FR-41, FR-25
- **Quote:** FR-17: "Each … run that ends with Status Code `0` commits its own changes". FR-41: "that the State Tool cannot attribute to an implement Stage run".
- **Problem:** A failed run leaves uncommitted edits. The PRD never says whether the "fresh context" retry starts on that dirty tree or on a reset to the last commit. Escalation partial changes are the same. Nothing defines how the State Tool attributes a diff to a run (it cannot see Copilot's file-edit calls), so `commit_prepare` will sweep failed-attempt debris into the next commit or refuse it.
- **Suggested fix:** Record HEAD and the tree hash at each run start (via `state_get`). On status `1`/`2`, `state_advance` stashes or resets to that point (configurable) and logs the discarded diff path in the Memlog. Attribution = "diff between run-start tree and run-end tree while that run was the current Goal-phase".

### H-4. Feature-branch lifecycle and the location of `tickets/` in git are unspecified
- **Location:** FR-1, FR-17, FR-26, NFR-6, addendum D
- **Quote:** FR-17: "Commits go only to the Ticket's feature branch". FR-1: "A Ticket whose key already has a `tickets/<KEY>/` folder is never selected again."
- **Problem:** No FR says who creates the branch, how it is named, which base branch it comes from, or how "protected branches" are configured. Nobody says whether `tickets/` is committed. If it is, the folder exists only on the feature branch, the poller (running on another checkout or branch) re-selects the Ticket, and the PR contains State, HMAC and Memlog files. If it is not, FR-41's working-tree hash must exclude it. Which repo is used when several workspaces are open is also unspecified.
- **Suggested fix:** Add an FR: on `start-ticket`, create `<prefix>/<KEY>` from a configured base, with protected branches in config. State that `tickets/` lives outside git tracking (gitignored or a separate state dir) and is excluded from snapshots, diffs, `commit_prepare` and the PR.

### H-5. "No raw git push" is unenforceable once agents have terminal tools
- **Location:** FR-40, FR-32, NFR-6, addendum C
- **Quote:** FR-40: "No agent has raw `git push` or Jira-write tools". Addendum C: "Nothing still leaves the machine without the push Gate."
- **Problem:** FR-32 has subagents "run commands in separate terminals", and implementers need to run things. Any terminal tool can run `git push`, `curl` to Jira, or `gh pr create`. Tool allowlists cannot block a command inside a terminal tool, so the addendum's guarantee is false.
- **Suggested fix:** Either give implementers no terminal (only `run_tests`/`run_checks`) and say so in FR-40, or accept the risk explicitly and add a detection (e.g. `ci_watch`/`push_branch` verifies the remote branch head equals the last approved push SHA, else alert). Add an Open Question on whether Copilot terminal command allow/deny lists can block `git push`.

### H-6. Escalation outcomes and the escalation agent's contract are undefined
- **Location:** FR-24, FR-25, addendum E (Handoff), addendum F, Glossary (Escalation)
- **Quote:** FR-25: "It returns `{status: resolved | partial | cannot, summary, files_changed, follow_ups}`; the caller sees only that." Addendum E: `to: { agent: escalation, tier: high, role_prompt: prompts/implementer.md }`, `return: patch_summary | verdict | revised_plan_section`.
- **Problem:** No next Stage is given for `resolved`, `partial` or `cannot`. Nothing says whether the escalation agent emits a Status Code, commits through `commit_prepare`, or triggers Checks. `revised_plan_section` would modify a frozen Plan (FR-10). Reasons `spec_conflict` and `quality_review` are never raised by any FR, and `spec_conflict` should probably route to Correct-Course. The prompt used is contradictory: FR-25 and addendum E say the original role prompt, while addendum F gives `prompts/escalation.md`. `edit` at the escalation Gate is undefined. Who writes the Handoff fields (ask, attempts) is also unclear: FR-16 says "`2` creates a Handoff" as if it were deterministic, but those fields need a model.
- **Suggested fix:** Add a transition table: `resolved` → status-0 path (commit + Checks); `partial` → reopen the escalation Gate with the summary; `cannot` → stop or Correct-Course. Say that the stuck Persona fills `ask`/`attempts` through `handoff_create` before ending with status 2. Remove `revised_plan_section`, or route it through the `plan` Gate. Pick one prompt composition (base + original role + escalation addendum).

### H-7. Correct-Course is neither a Stage nor a Gate kind; the authoring Persona is unclear
- **Location:** FR-4, FR-29, Glossary (Gate), §4.0 diagram, addendum A row 10a, FR-40
- **Quote:** FR-4 Stage list has no `correct_course`. Glossary: "Gate kinds: `spec`, `plan`, `escalation`, `push`." §4.0: "Correct-Course [H] (from 10a)".
- **Problem:** Approving the proposal is a human decision, but no Gate kind or Wait Reason exists for it, so no Gate Record can authorize it under FR-5. Nothing says who writes the revised Spec: the planner, whose only write path is `doc_scaffold`, or intake. FR-40's "before the `plan` Gate is approved, no running agent has file-edit tools" becomes ambiguous when the Ticket loops back to `spec` after code exists. Do agents lose tools again?
- **Suggested fix:** Add Gate kind `correct_course` (or state it reuses `plan`/`spec` with a `proposal` artifact type). Add Stage `correct_course` and edges `ci → correct_course → spec|plan`, plus `correct_course(reject) → patch_plan`. Name the Persona that revises the Spec. State the tool-set rule for a loop-back.

### H-8. CI `cancelled` / `timed out`, missing runs and `ci_watch` timeout are not handled
- **Location:** FR-27, FR-4, §4.0 step 9
- **Quote:** "Terminal states: success, failure, cancelled, timed out."
- **Problem:** Only failure (→ `patch_plan`) and success (→ `done`) have edges. If no workflow run is created for the commit (no CI configured, path filters), `ci_watch` polls forever. The poll interval, maximum wait and the GitHub auth/env var are unspecified. A long-blocking MCP tool call may also hit Copilot's tool-call timeout (not in the Open Questions).
- **Suggested fix:** Map `cancelled`/`timed_out` → a `gate_ci` Wait Reason (retry / treat as failure / stop). Add config `ci.poll_interval`, `ci.max_wait`, `ci.no_run_grace`. Make `ci_watch` non-blocking (returns `pending`, and the State Tool tells the Conductor to wait and re-call).

### H-9. Parallel mode collides with commits, Checks order, escalations and a shared working tree
- **Location:** FR-17, FR-19, FR-32, FR-33, FR-6, Glossary (Wait Reason)
- **Quote:** FR-19: "`run_checks` runs automatically after each Goal's Status Code `0`." FR-33: "a Synthesizer checks the combined change … before Checks run." FR-32: "Each subagent's terminal and test run is isolated".
- **Problem:** (a) FR-19 and FR-33 contradict each other on when Checks run in parallel mode. (b) Parallel subagents commit concurrently in one working tree and one index (git `index.lock` races). Commits already exist when FR-33 finds conflicts, and "routed back to implementation" does not say whether they are reverted. (c) Test "isolation" is impossible in a shared tree with other agents' half-written files. (d) A Status `2` mid-Wave opens a Gate while siblings run, and State holds only one Wait Reason. Two simultaneous escalations cannot be represented. (e) FR-41 attribution across concurrent runs is undefined.
- **Suggested fix:** In parallel mode, serialize `commit_prepare` through a server-side lock and run Checks only after FR-33. Make Wait Reason a queue of pending Gates. Either require per-Goal worktrees (now under Future) or downgrade "isolated" to "scoped to the Goal's test files". Define the revert policy for conflicted commits.

### H-10. Background poller and desktop notification rest on unlisted VS Code/MCP capabilities
- **Location:** FR-1, FR-3, §10 Open Questions
- **Quote:** FR-1: "The system polls Jira … on a configurable interval". FR-3: "The system sends a desktop notification".
- **Problem:** MCP servers in VS Code are started and stopped by the client. Nothing guarantees the server runs when no chat is active, and MCP has no "desktop notification" primitive. The mechanism (OS toast library, VS Code notification via an extension, MCP log message) is unspecified and untestable. No Open Question covers this.
- **Suggested fix:** Add OQ-9: "Does VS Code keep a stdio MCP server running in the background, and how can it raise a user-visible notification?" Specify the mechanism (e.g. a separate `agentflow poll` CLI daemon plus an OS notification library) and whether the poller is part of the MCP server.

### H-11. FR-35 premium-request counts cannot be observed by the MCP server
- **Location:** FR-35, SM-2, §10 OQ-2
- **Quote:** "Fields: premium requests by Persona and Tier".
- **Problem:** Copilot does not report billing or request counts to MCP servers. OQ-2 asks how billing works, not whether the server can see it. The headline metric SM-2 is therefore unimplementable as written.
- **Suggested fix:** Define the field as *estimated* requests = count of Persona runs launched via `state_get` × the configured multiplier per model. Or add an OQ about a Copilot usage API and mark the field optional.

### H-12. The Status Code reaches the State Tool only via the Conductor (unspecified, forgeable)
- **Location:** FR-16, FR-5, addendum E (Status Code contract)
- **Quote:** FR-16: "Every implementer and refactorer run ends with a Status Code that the State Tool parses deterministically."
- **Problem:** The subagent's final message returns to the Conductor, not to the MCP server. The PRD never says which `state_advance` argument carries the raw output, or whether the Conductor may paraphrase it. A cheap Conductor can drop or alter `AGENTFLOW_STATUS`, so "deterministic parsing" is untestable.
- **Suggested fix:** Require subagents to end by calling a server tool `run_report(status, summary)` (allowlisted to implementer and refactorer), and have `state_advance` read that record instead of chat text. Treat a missing report as `1`.

### H-13. Trace Matrix needs a Scenario-to-test link convention and a test-runner format, neither defined
- **Location:** FR-21, FR-18, FR-7, addendum B/E
- **Quote:** FR-21: "builds AC → Goal → Checklist Item → Scenario → test → result". FR-18: "Classification comes from the test runner's JSON output".
- **Problem:** Nothing says how a test is tied to a Scenario id (the name prefix `S1.1.1` appears only as an addendum example) or how `existing` Scenarios map to pre-existing tests. The test runner (Vitest/Jest/pytest?) and its JSON format are not specified. "Same failure signature" (FR-7) has no definition. The matrix and triage cannot be built or tested.
- **Suggested fix:** Mandate the convention "test title starts with the Scenario id" (or a `@scenario S1.1.1` tag). Name a supported runner set for the MVP, with a parser contract in `.agentflow/tools/*.yml`. Define the signature as a hash of (test id, `file:line`, first message line).

---

## Medium

### M-1. Memlog entry format undefined, yet a deterministic launcher must parse Claims from it
- **Location:** FR-32, FR-34, Glossary (Claim)
- **Quote:** FR-34: "Every Stage, Gate decision, Escalation and loop appends one line". Types: "`decision | change | event | assumption | escalation`".
- **Problem:** A Claim (Goal id, file list, intent) is a Memlog entry, but `claim` is not a listed type, and a file list does not fit "one line". Open/closed Claim status needs a closing entry format. FR-5 ("every advance appends one Memlog entry") and FR-34 may double-log the same event.
- **Suggested fix:** Define a line grammar (e.g. `- <ISO ts> [<type>] <key>=<value> …`, or YAML front-delimited entries), add types `claim | claim_update | claim_close | gate`, and state which tool writes each.

### M-2. NFR-7 "YAML only" is contradicted by JSON artifacts
- **Location:** NFR-7 vs FR-2 (`ticket.json`), FR-27 (`ci_failure.json`), FR-18
- **Quote:** "YAML for config, schemas and frontmatter; Markdown for prompts and documents; TypeScript for tool logic. No other formats."
- **Problem:** `ticket.json` and `ci_failure.json` are JSON. A strict generator will either fail the NFR or change the file names.
- **Suggested fix:** Allow JSON for raw external payloads and tool I/O, or rename the files to `.yml`.

### M-3. The §4.0 diagram and the FR-4 edge list disagree
- **Location:** §4.0 diagram and loop-backs, FR-4, FR-33
- **Quote:** Diagram: "└──── 10a Patch Plan [H] ◄── fail" (arrow into step 3 Plan). FR-4: "approved Patch Plan → `implement`".
- **Problem:** The diagram routes an approved Patch Plan into step 3, while the text says step 4. The diagram shows Correct-Course going only to Spec, while FR-29 says Spec or Plan. FR-4's edge list omits status-1 retry, escalation, FR-33 synthesis conflicts, Correct-Course, and edit-loops at each Gate. FR-33 Wave synthesis is not in §4.0 or the Stage Graph at all. A generator building `stage-graph.yml` from FR-4 will produce an incomplete graph, and FR-4's own "unreachable Stage" validation would fail on any Stage added for these cases.
- **Suggested fix:** Make FR-4 the full normative edge list (from, to, condition) and redraw the diagram from it. Add `wave_synthesis` as a conditional Stage, or as a sub-step of `implement`.

### M-4. `edit` semantics per Gate kind undefined
- **Location:** FR-9, FR-26, FR-25
- **Quote:** "`edit` (free text returned to the authoring Persona)".
- **Problem:** At `push`, the authoring Persona is the committer. Does an edit change only the Walkthrough, or request code changes, which have no route back to `implement`? At `escalation` there is no authored artifact. There is no counter for edit rounds, which SM-4 needs.
- **Suggested fix:** Add a per-Gate table of what `edit` re-runs and where it goes. For `push`, offer "edit Walkthrough" vs "send back to implement with note". Add counter `gate.edit_rounds`.

### M-5. A "matching Gate Record" is ambiguous; Gate ids collide with Goal ids
- **Location:** FR-5, FR-10, addendum E (Gate Record `id: G-3`), Plan (`id: G1`)
- **Quote:** FR-5: "`state_advance` past a Gate without a matching Gate Record returns an error."
- **Problem:** `edit` and `reject` also create Gate Records. The PRD never says that "matching" means `decision: approve`, the latest record of that kind, and a hash equal to the current artifact. `G-3` (Gate) vs `G3` (Goal) will be confused in logs, Memlog lines and commit messages.
- **Suggested fix:** Define matching precisely. Rename Gate Record ids to `GR-n`.

### M-6. Counter semantics, resets and keys undefined
- **Location:** FR-7, FR-23, FR-16, addendum E (Handoff `progress`)
- **Quote:** "Counters: `scenario.iteration`, `goal.validation_rounds`, `ticket.patch_loops`, `goal.status1_retries`, `ticket.escalations`."
- **Problem:** Nothing says what increments `scenario.iteration` (each `run_tests` call? per Scenario, while the runner runs a suite?), or whether counters reset per patch loop or after an escalation. Counters are keyed by Goal id, which a Patch Plan or Correct-Course may renumber. The Handoff field `same_failure_runs` is not an FR-7 counter.
- **Suggested fix:** Give a table per counter: incremented by, scope key, reset rule. Add `scenario.same_failure_runs`.

### M-7. Context budgets will be broken at runtime by growing docs; the over-budget path is undefined
- **Location:** NFR-10, FR-36, FR-37, FR-22
- **Quote:** NFR-10: "an over-budget prompt fails generation". FR-36: "Both docs are included in every Persona's input bundle."
- **Problem:** The Preferences/Pitfalls docs and the Memlog grow without bound and are sent to every Persona and Reviewer bundle. NFR-10 does not say whether they count toward the 3K framework budget or the work content. What `state_get` does when over budget at runtime is undefined. A Project Context "with stable repo knowledge" loaded every session must fit in 150 ambient tokens together with copilot-instructions, which is likely unrealistic. The bytes/4 estimate is only in the addendum.
- **Suggested fix:** Classify each input as framework or work, set caps for the Pitfalls/Preferences/Memlog slices (most recent N or relevant to the touched files), and define runtime behaviour (truncate plus a Memlog warning). Clarify whether the AGENTS.md block counts as ambient.

### M-8. FR-36 learning proposals need a model, but no Persona owns them; Pitfalls source differs from the Glossary
- **Location:** FR-36, Glossary (Pitfalls Doc), addendum B (`learning_propose`)
- **Quote:** Glossary: "derived from Gate edits and failed attempts". FR-36: "When a human `edit` at a Gate changes an artifact".
- **Problem:** Turning an edit into a generalized preference requires judgment, yet `learning_propose` is listed with the deterministic tools and no Persona or Tier is assigned. "Failed attempts" as a source is never specified. The "same elicitation flow after the edit" is impossible: the edit has to go back to a Persona first, and the diff exists only after it rewrites.
- **Suggested fix:** Assign a Persona (e.g. the committer, cheap Tier). Trigger the proposal at the next approval of the edited artifact, with the diff. Either add failed attempts (from Handoffs) as a source or drop it from the Glossary.

### M-9. Entry and re-entry edge cases for `start-ticket` and the poller
- **Location:** FR-1, FR-2, FR-3, FR-6
- **Quote:** FR-3: "<KEY> ready, run start-ticket". FR-6: "Running `start-ticket <KEY>`". FR-1: "never selected again" plus "a 'skip' command may remove it".
- **Problem:** It is not said whether the KEY is optional, or what happens when several Tickets are ready. A Ticket bounced back to In Execution after In Tests is never re-selected, so rework is impossible. "skip" removing the folder makes the poller re-select the Ticket on the next tick. The poller is meant to run in the background, but whether two VS Code windows each run a poller (duplicate Intent Records) is not addressed.
- **Suggested fix:** Make the KEY required when more than one Ticket is ready. Make `skip` write a tombstone instead of deleting. Define re-entry for a `done` Ticket back in In Execution (new patch cycle or new record). Add a lock file for single-instance polling.

### M-10. Implement sub-step ownership: who triggers Checks, who runs triage, and what triage anomalies do
- **Location:** FR-15, FR-16, FR-18, §4.0 step 4
- **Quote:** FR-16: "`0` triggers the Goal's Checks". FR-18: "No anomalies → no output."
- **Problem:** Both the implementer and refactorer end with status 0. It is not said whether Checks run after each, or only after the refactorer. Red → triage → Green happens inside one implementer run, or two, so who calls `test_triage`? What an anomaly causes (block, retry Red, warn) is undefined. "Red: tests written before production code changes" is untestable when there is one commit per run.
- **Suggested fix:** Define the run sequence explicitly (implementer-red run → `test_triage` by the State Tool → implementer-green run → refactorer run → Checks), with a commit per run. Give an action per anomaly type.

### M-11. Review bundle sizing edge cases
- **Location:** FR-22, FR-23, OQ-5
- **Quote:** "a bundle never exceeds it" … "Each bundle holds: … the Memlog."
- **Problem:** A single file diff, or the Memlog alone, may exceed the limit, which makes "never exceeds" impossible. There is no rule for an AC split across bundles. The per-Goal verdict format is undefined (only per-AC is given).
- **Suggested fix:** Define the overflow behaviour (truncate the diff hunk with a marker, or summarize the Memlog slice) and the Goal verdict schema.

### M-12. Plan file format and `files` overlap semantics
- **Location:** FR-13, FR-14, FR-32, addendum E
- **Quote:** FR-13: "`plan.md`". Addendum E: YAML with `files: [src/shipping/*.ts]`.
- **Problem:** It is unclear whether the plan is Markdown with YAML frontmatter, a fenced YAML block, or pure YAML. `files` are globs, but the overlap rule for globs vs new files is undefined. Claims list concrete paths, and the check of Claim paths against Goal globs is unspecified.
- **Suggested fix:** Specify the plan as Markdown with one fenced `yaml` block validated by `schemas/plan`. Define overlap as "glob intersection over the current tree plus declared new paths".

### M-13. Per-Stage allowlists "taken from the Stage Graph", which has no tool field
- **Location:** FR-38, FR-40, FR-4
- **Quote:** FR-40: "explicit tool allowlist taken from the Stage Graph". FR-4 lists only "Stages, their order, their Gates, their owner … and loop-back edges".
- **Problem:** The schema has nowhere to put the allowlist. Allowlists are per Stage, but agent files are per Persona: the implementer and refactorer share `implement`, and the planner works in both `plan` and `patch_plan`.
- **Suggested fix:** Add a `tools:` field per Stage-Persona pair to the Stage Graph schema, or move allowlists to `personas.yml`.

### M-14. GitHub auth, PR base and re-push behaviour unspecified
- **Location:** FR-26, FR-27, NFR-6
- **Quote:** "A PR is created (or updated) with the Walkthrough as its body."
- **Problem:** There is no env var name for the GitHub token, no remote name, no PR base branch, and no draft flag. It is not said whether a re-push after a patch loop is fast-forward only, or whether force-push is ever allowed. Behaviour when the base advanced is undefined.
- **Suggested fix:** Add config keys (`github.remote`, `github.base`, `pr.draft`) and an env var name. State "fast-forward only, never force". Define the stale-base behaviour.

### M-15. "Linked content" ingestion scope undefined
- **Location:** Glossary (Spec), FR-2, FR-11
- **Quote:** FR-2: "links and attachments metadata". Glossary: "built from the Jira issue, its comments and linked content".
- **Problem:** `ticket.json` stores only link metadata. The PRD does not say who fetches linked issues, Confluence pages or URLs, with what tool and to what depth. The intake Persona has no such tool in FR-40.
- **Suggested fix:** Specify depth-1 linked Jira issues fetched by `ticket_get` into `ticket.json`, with external URLs listed but not fetched in the MVP (or add a tool).

### M-16. The `push` Gate artifact is composite and not stored; its hash is undefined
- **Location:** FR-9, FR-8, FR-26, addendum D
- **Quote:** FR-8: "the SHA-256 of the artifact shown". FR-9: "`push` Gate: the Walkthrough, Trace Matrix summary, synthesized verdict and commit list."
- **Problem:** There is no `walkthrough.md`, `verdict` or `trace` file in the Intent Record layout. It is not said what the hash covers. It should bind to the commit SHA being pushed, otherwise new commits after approval would be pushed under an old approval.
- **Suggested fix:** Persist `walkthrough.md`, `trace.yml` and `verdict.yml`. Define the push Gate hash = sha256(walkthrough + HEAD SHA). Have `push_branch` refuse if HEAD ≠ the approved SHA.

### M-17. Copilot capabilities assumed but not in the Open Questions
- **Location:** §10, FR-8, FR-12, FR-32, FR-42, addendum D (`.github/skills/start-ticket/SKILL.md`)
- **Quote:** OQ-1 covers elicitation support, timeout and always-confirm only.
- **Problem:** The PRD also relies on, without listing: (a) elicitation messages able to show a full Markdown Spec or Plan and a dynamic per-Assumption form (MCP elicitation schemas are flat primitives); (b) VS Code auto-approve settings ("Always allow", `chat.tools.autoApprove`) not bypassing `gate_confirm`; (c) a server tool (`wave_launch`) being able to launch a Copilot subagent (OQ-7 asks about watching, not launching from a tool); (d) Copilot "skills" under `.github/skills/` being a supported, invocable artifact; (e) maximum MCP tool-call duration for blocking `gate_request`/`ci_watch`; (f) the per-subagent model pinning that Tier config depends on (OQ-3 asks only about `start-ticket`).
- **Suggested fix:** Add OQ-9…OQ-14 for each, with the fallback design if the answer is "no".

---

## Low

### L-1. Tier drift: "small"
- **Location:** FR-26
- **Quote:** "The committer Persona (small) writes the Walkthrough"
- **Problem:** `small` is not a Tier (`cheap | medium | high`).
- **Suggested fix:** Use `cheap`.

### L-2. Wait Reason naming inconsistent with Gate kinds
- **Location:** Glossary, FR-6
- **Quote:** "`gate_spec | gate_plan | escalation | push`"
- **Problem:** The `gate_` prefix is used for two values and not the other two. Codegen will produce mismatched enums.
- **Suggested fix:** Use `gate_spec | gate_plan | gate_escalation | gate_push` (plus the values added in C-2).

### L-3. Undefined or synonym terms
- **Location:** FR-32 ("launcher"), FR-5/FR-22 ("input bundle", "review bundle"), FR-17 ("feature branch"), §4.0 ("Item"), addendum C ("Patch Plan Gate"), FR-39 (Conductor listed as a Persona while the Glossary calls it an agent), FR-25 ("escalation agent" vs Persona `escalation`)
- **Quote:** Addendum C: "the human stops the patch loop at the Patch Plan Gate"
- **Problem:** §0 says vocabulary is fixed in §3, but these terms are missing or used as synonyms.
- **Suggested fix:** Add Glossary entries for Launcher, Input Bundle, Review Bundle and Feature Branch. Replace "Patch Plan Gate" with "`plan` Gate (Patch Plan)" and "Item" with "Checklist Item". Decide whether the Conductor is a Persona.

### L-4. The Vision's approval count is inaccurate
- **Location:** §1 Vision
- **Quote:** "approves at three fixed moments … A fourth approval appears only when a cheap agent is stuck"
- **Problem:** Correct-Course approvals, repeated push approvals and Preferences/Pitfalls acceptances are also human approvals.
- **Suggested fix:** Reword as "three Gate kinds per pass, plus escalation and Correct-Course when triggered".

### L-5. JTBD start state
- **Location:** §2.1
- **Quote:** "from Backlog to 'In Tests'"
- **Problem:** The pipeline starts at In Execution. The user moves the Ticket out of Backlog manually.
- **Suggested fix:** Say "from In Execution to In Tests".

### L-6. The Status Code wire format exists only in the addendum
- **Location:** FR-16 vs addendum E
- **Quote:** Addendum: "`AGENTFLOW_STATUS: 0|1|2`"
- **Problem:** A testable FR depends on a format that appears only in a "sketch".
- **Suggested fix:** Move the format into FR-16, or supersede it with H-12's `run_report` tool.

### L-7. AC source-tag format unspecified
- **Location:** FR-11
- **Quote:** "Every AC carries a source tag: the Jira field or comment it came from, or `[assumption]`."
- **Problem:** `doc_scaffold` cannot validate a tag with no syntax.
- **Suggested fix:** Define e.g. `[src: description]`, `[src: comment:<id>]`, `[assumption]`.

### L-8. Failure Payload field naming drift
- **Location:** FR-20 vs addendum E
- **Quote:** FR-20: "`file:line`". Addendum: `location: "test/shipping.test.ts:42"`.
- **Problem:** The field name is ambiguous for schema generation.
- **Suggested fix:** Name the field `location` with format `path:line` in FR-20.

### L-9. FR-10 checks before the artifacts exist
- **Location:** FR-10
- **Quote:** "Before any Stage runs, the State Tool compares the current hash of the Spec and Plan with their Gate Records"
- **Problem:** Before the `spec`/`plan` approval there is no Gate Record, so a literal implementation errors at the first Stage. Also, since post-plan agents have edit tools, an accidental `plan.md` edit re-opens the Gate and discards in-flight work, and no recovery path is described.
- **Suggested fix:** Say "for each artifact that has an approved Gate Record". On a mismatch, offer "restore the approved version" (the server keeps a copy) as well as re-approval.
