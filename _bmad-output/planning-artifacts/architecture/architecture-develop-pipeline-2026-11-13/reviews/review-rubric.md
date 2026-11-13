# Rubric Review — ARCHITECTURE-SPINE.md (Agentflow MVP)

Reviewer: independent. Spine not edited. Inputs: spine, PRD (FR-1..51, NFR-1..10), addendum.
Stack versions were not verified against registries (not in scope of this pass); flagged where doubtful.

## Verdict: REVISE (sound paradigm, fixable gaps; not ready to bind the level below)

The hexagonal core + table-driven interpreter is the right shape and most ADs have a testable Rule. Coverage of FR/NFR is complete at map level. But four divergence points the level below will hit on day one are undecided, and two security-relevant Rules do not prevent what they claim.

## Checklist results

| Check | Result |
| --- | --- |
| Fixes the real divergence points, misses none | FAIL: F1, F2, F3, F4, F7, F9 |
| Every AD Rule enforceable and prevents its Prevents | PARTIAL: AD-1 (no tooling), AD-3 (lock mismatch), AD-6 (run_id not a secret), AD-7 (code path), AD-9/18 (key readable) |
| Nothing in Deferred lets units diverge | PARTIAL: OQ-13 long-call strategy (F8) |
| FR-1..51 / NFR-1..10 each map somewhere | PASS for FR (every FR appears in the Capability Map or an AD Binds). NFR-2 (no hooks) and NFR-3 (host) are bound by no AD (low). |
| Mermaid valid | PASS (3 diagrams parse; semantic omissions noted in L5) |
| Altitude dimensions decided/deferred/open | PARTIAL: deployment present; security, versioning/migration, repo binding, recovery missing (F4, F6, F9) |

## Findings

### F1 [HIGH] Agent-writable files are the authority for authorization, graph and tool commands
`personas.yml` (AD-6/AD-12 runtime authorizer), `stage-graph.yml` (AD-2), `.agentflow/tools/*.yml` (shell-wrapper commands run by the generic runner, addendum B), `prompts/`, `config.yml` all live in the target repo under `.agentflow/`, which is NOT git-ignored (only `tickets/` is). Implementer/refactorer/escalation have edit tools, and `commit_prepare` commits the whole Run diff. AD-8 protects only ticket documents. An agent (or injected Jira text) can add itself a tool, change `tools/run_tests.yml`, or alter the graph; mcp-server reloads it next session.
Fix: new AD: at `start-ticket`, hash `stage-graph.yml`, `personas.yml`, `tools/*.yml`, `config.yml`, `prompts/` into the Server Record; verify on every load and before every transition (mismatch -> Ask Human `config_changed`); additionally make `commit_prepare` refuse and `push` Gate list any path under `.agentflow/` except `tickets/` (git-ignored). Config edits go only through `agentflow config`.

### F2 [HIGH] Persona structured output and bundle delivery have no channel
Reviewers, synthesizer, walkthrough and curator are allowed only `run_report` (addendum F), yet they must produce `{ac_id: met|partial|missing...}`, verdict, Walkthrough judgment parts, curator proposals, escalation `{status, summary, files_changed}`. AD-8 says those documents are written only by validating tools, and no such tool exists. Also, "Review Bundle is inlined" (FR-22/40) but no AD says how a bundle reaches a Run: by value through the Conductor (token cost, unreliable copy) or by reference (a `bundle_get(run_id)` tool no Persona is granted).
Fix: add an AD: `run_report(run_id, status, summary, result?)` where `result` is validated against a per-(Persona, Goal Phase) Zod schema in `core/schemas`; the server writes `verdict.yml`, `walkthrough.md` parts, curator proposals, escalation result from it. Decide bundle delivery: `run_persona` returns a bundle reference and the Persona's first call is `bundle_get(run_id)` (added to every Persona's allowlist; inlined text arrives as tool result, never via the Conductor).

### F3 [HIGH] No executor ownership for intents and Tool-owned Stages across processes
AD-4 re-executes pending intents "on resume" and AD-5 lets both the Daemon (`chainToolStages`) and mcp-server drive Tool-owned Stages (`checks` runs the full suite, `push`, `done` hits Jira). AD-3's lock covers transactions only; nothing says whether the lock is held across minutes of I/O, nor who may execute an intent. Two processes can run the same intent/stage concurrently (double push attempt, two test suites in one tree). Also: AD-3 says stale lock = dead pid, but the chosen `proper-lockfile` 4.1.2 uses mtime staleness (and is unmaintained); AD-10 adds a second per-repo lock with no ordering rule (deadlock risk).
Fix: intent state machine `pending -> claimed(owner pid, lease expiry) -> done`, claimed inside a short transaction, executed outside the lock; a Tool-owned Stage run takes the same claim. Define lock order (ticket lock then repo lock, never reverse), lock never held across `CommandRunner`/network. Reconcile the lock mechanism with the library (or replace it) and state it once.

### F4 [HIGH] Daemon-to-repo binding and `<repo-id>` are undecided
The Server Record path is `~/.agentflow/state/<repo-id>/<KEY>/` but no rule says how `<repo-id>` is derived (path? origin URL hash?), and three processes must compute it identically (mcp-server from the VS Code workspace, cli from cwd, daemon from?). The Daemon is one per user (`~/.agentflow/daemon.lock`, FR-1) and polls all of the user's In Execution Tickets, yet each Ticket's workspace is `.agentflow/tickets/<KEY>/` inside one repo. Nothing maps a Jira Ticket to a repo. (PRD gap too: PRD says single repo per Ticket, one Daemon per user, but not how the repo is chosen.)
Fix: decide one: per-repo Daemon lock `~/.agentflow/daemon-<repo-id>.lock` with the Daemon started in the repo; or a user-level `repos:` map (Jira project key -> repo path). Define `repoId()` once in core (hash of normalized `origin` URL, fallback to realpath). Raise as PRD open question if the user must choose.

### F5 [MED] One-time code path contradicts AD-5 and weakens AD-7
AD-7: the code "exists only in the desktop notification text". AD-5: notifications are emitted by the Daemon from the record. For the Daemon to display the code, mcp-server must store it (plaintext) in the Server Record, readable by any agent with a read tool; and if the Daemon is down the CLI fallback has no code at all.
Fix: mcp-server emits the gate-code notification itself via the `Notifier` port in `gate_request` and persists only a salted hash; the Daemon handles only Wait Reason and CI notifications.

### F6 [MED] HMAC key threat model and recovery are not decided
(a) Agent-authored tests/code run via `run_tests` as the same OS user; the env allowlist keeps `HOME/USERPROFILE`, and the key file is same-user readable, so such code can read the key and forge a valid Gate Record or State. AD-9's Prevents covers env secrets but not this. (b) `record_tampered`/lost key opens Ask Human, but opening it needs a signed write to a record whose files all fail verification: circular. No repair path.
Fix: state explicitly that HMAC defends against accidental/naive edits and non-malicious drift (accepted residue; real prevention is push Gate + human code); set child `HOME`/`USERPROFILE` to a scratch dir as a cheap barrier. Add a human-only `agentflow record reseal <KEY>` that lists differing files, requires the CLI code channel, and writes an audited Memlog entry; Ask Human `record_tampered` is raised in an unsigned `quarantine.yml` outside the verified set.

### F7 [MED] Crash between `commit_prepare` and `run_report`; stash/restore semantics
`commit_prepare` is an agent-called tool, not an AD-4 effect. FR-6/41 relaunch a mid-Run session by discarding the Run and "restoring the start Snapshot", but the Run may already have committed. Restore would have to reset a commit; AD-10 says nothing (no reset/stash operation in `GitPort`, and parallel mode would destroy sibling Runs' work). AD-3 also lists "`S` stash names", clashing with the Scenario id prefix `S<goal>...`.
Fix: make commit an intent keyed `commit:<run-id>:<tree>`; on resume, a Run with a commit but no report is treated as status `0` pending report (or `git reset --soft` to the recorded start HEAD, by named rule); define `GitPort.stashRun/restore` with temp index, forbidden in parallel mode (Claim-scoped revert only); rename stash ids to `agentflow/<KEY>/<run-id>` as in FR-41.

### F8 [MED] OQ-13 deferral changes the tool contract
Whether `gate_request`, `run_tests`, `run_checks` are synchronous or return `pending` + poll is a contract-level decision (AD-14 envelope, every handler, the Conductor loop). Deferring it lets units implement them blocking. `tools.timeout` as config does not cover it.
Fix: decide now that long tools return `{ok:true, data:{status:"running", ...}}` and complete via the Server Record (Daemon/`state_get` observe it), or decide sync-only and record the fallback trigger. Add the `pending` variant to the envelope either way.

### F9 [MED] Security and operations dimensions only partly decided
Missing or implicit: (1) Jira/ticket text is untrusted input that flows into Spec -> Plan -> Runs with edit tools (prompt injection); mitigation is the Gates but no AD says ticket text is data, size-capped and never placed in tool allowlists/rules. (2) Raw test output and Failure Payloads are stored as received (NFR-7): no secret redaction. (3) How `JIRA_*`/`GITHUB_TOKEN` reach the VS Code-spawned mcp-server (`mcp.json` `env`/`envFile`/input prompts) and the Daemon is not decided; token scopes (NFR-6) not enforced anywhere. (4) No schema_version on record files, no migration/compat rule between tool version, `.agentflow/` templates copied by `agentflow init`, and in-flight Tickets; editing `stage-graph.yml` mid-Ticket breaks stored row ids. (5) Recovery for Daemon-down, notification-failure, and Windows lock cases is not listed.
Fix: add short ADs for (1)-(4) (`schema_version` in every record kind + refuse-and-ask on mismatch; graph hash pinned per Ticket per F1) and list (5) under Deferred or Open Questions.

### F10 [MED] AD-6 identity is not a credential; Conductor-only tools cannot be identified
`run_id` is a predictable `R-n`, appears in Claims/Memlog slices, and a stdio MCP server cannot tell a Conductor from a subagent. "Conductor-only tools are refused when called with a `run_id`" is trivially bypassed by omitting it. In parallel mode a Run can report as another Run.
Fix: issue an unguessable per-Run token in `run_persona` (never logged in Memlog slices) required as first arg; accept that Conductor-only calls are unauthenticated and rely on AD-7 (no decision argument) plus FR-41 detection; say so in the Rule.

### F11 [MED] AD-1/AD-2 enforceability and port completeness
AD-1 claims "lint-enforced" but the Stack has no ESLint, boundary plugin or dependency-cruiser; "a shell may not branch on Stage, Goal Phase or Gate kind" has no mechanism. "core imports nothing outside itself and the standard library" conflicts with `zod`, `yaml` in core/schemas and Codec. Core needs file access it has no port for: FR-14 glob overlap vs current tree, bundle slicing of workspace files, `doc_section`. Ports list omits `GateChannel`, `TicketSource`, `OutputParser`, workspace/repo file reader; Capability Map cites `adapters/channels` which the layer table and tree omit. Entry point is also undefined: `start-ticket`/`state_get` has no key parameter or ticket-resolution rule (FR-6 "without a key"), and no `start_ticket` tool exists in addendum B.
Fix: add `eslint-plugin-boundaries` (or dependency-cruiser) + `no-restricted-imports` to Stack and the CI line; allow `zod`/`yaml`/`node:crypto` explicitly in the core rule; add `WorkspaceReader`, `GateChannel`, `TicketSource` to the port list and `adapters/channels` to the layout; define `state_get({key?})` and the `start` input event.

## Low findings
- L1 AD-16 "findings change adapters or config, never graph rows or schemas" is an unverifiable promise (OQ-3 "no pinning" breaks FR-16 rotation and Tier semantics; OQ-7 "no concurrency" breaks FR-32). Rephrase as a goal with the fallback list per OQ.
- L2 AD-4 lists Jira transition and PR idempotency but not `jira_comment` (PR link posted twice on resume); use a marker lookup before post.
- L3 NFR-2 and NFR-3 are bound by no AD; add to AD-1/AD-16 Binds.
- L4 Spine `state.active_runs` vs addendum State sketch `current_run`: update the addendum or note supersession.
- L5 Structural diagram: Daemon writes `ticket.json` to the Ticket Workspace (FR-2) but has no edge to `ws`; `mcp --> gh/jira` vs Capability Map attributing Done to the Daemon is unclear (AD-5 allows Daemon to chain `done`). Diagrams otherwise parse.
- L6 Stack versions (TypeScript 7.0.2, Node 26.13.1, execa 10.2.1, node-notifier 12.1.0, proper-lockfile 4.1.2) were not verified; proper-lockfile is old and unmaintained.
- L7 Windows-first (AD-18) is a spine assumption; the PRD is silent on OS. Mark `[ASSUMPTION]` and add to PRD open questions.

## Spine vs PRD contradictions
1. PRD FR-5/FR-30: "the server" runs Tool-owned Stages and Done; spine AD-5 also lets the Daemon run them. Not contradictory, but PRD FR-27 limits the Daemon to CI watch + notify; PRD should be amended or the spine should restrict the Daemon to `ci` observations only.
2. PRD FR-40 gives reviewer/synthesizer/walkthrough/curator no output tool beyond `run_report`; spine AD-8 requires validated tools. Same gap in both (F2).
3. PRD FR-48 "mode 600" vs spine AD-18 ACL approach: consistent, but PRD should say so for Windows.
4. PRD FR-9/FR-12 vs OQ-9: spine AD-16 handles through ports; no conflict.
5. Spine `intents.yml`, `observations.yml` are not in PRD/addendum Server Record file lists; additive, update the glossary.

## What is good (keep)
Single write path under lock (AD-3), write-ahead intents (AD-4), gate minting from channel responses (AD-7), canonical codec (AD-13), temp-index snapshots (AD-10), one tool envelope (AD-14), Windows-first thinking, Deferred table mostly honest, and full FR map.
