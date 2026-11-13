# Adversarial Review: Architecture Spine (Agentflow MVP)

Reviewer stance: find pairs of independently built units that each obey every AD literally yet do not fit together. Spine, PRD and addendum read in full; spine not edited. Severity: CRITICAL (data loss/corruption or cannot work as specified), HIGH (breaks a core guarantee or the target platform), MEDIUM (wrong behaviour under realistic conditions), LOW (papercut).

## Verdict

NOT READY for story-level build as written. The hexagonal split and the "single write path" idea are sound, but the spine specifies per-file atomicity where the system needs per-transaction atomicity, leaves "who executes a Tool-owned Stage / pending intent" open between two processes, and does not make agent-facing calls idempotent. AD-9/AD-18 as written do not work on Windows 11 with Node (cmd shims, env allowlist, stdin). 6 CRITICAL/HIGH holes, 9 MEDIUM, 3 LOW. Each has a proposed AD fix.

---

## CRITICAL

### H-1. Per-file atomic rename is not a transaction; HMAC does not detect rollback, deletion or cross-file skew (AD-3, AD-13, FR-48)

Pair: Builder A writes `gate_confirm` (writes `gates/GR-4.yml`, then `state.yml`, then appends `memlog.md`). Builder B writes `state_get` resume logic. Both obey AD-3 (lock, temp+rename, sign, release).
- Process killed (VS Code closes the chat, Windows sleep/kill, `taskkill`) after `GR-4.yml` renamed but before `state.yml`. Every file individually verifies. On resume, B's `decide` sees Wait `gate_plan` still queued and a Gate Record that says `approve`; A assumes the state was advanced. Either a duplicate Gate opens or the approval is applied twice. "A transaction that throws changes nothing" holds for exceptions, not for crashes.
- Rollback: the human (or an agent with the `read`/`edit` tools, see H-4) restores an older signed `state.yml` or deletes `gates/GR-5.yml`. HMAC is per file, so an old valid file verifies; "latest Gate Record of that kind" silently becomes GR-4. Truncating `memlog.md` to an earlier signed prefix is impossible to detect if HMAC covers only current content.
- Workspace vs record: `doc_scaffold` writes `plan.md` (workspace) and the Approved Version (record) in two places; a crash between them produces FR-10 `artifact_changed` Ask Human for a crash, not tampering.
- Windows: `rename` over an existing file fails with EPERM/EBUSY when Defender, VS Code's file watcher or a reader holds it. No retry policy is specified, so builders will each invent one (or none).

Fix (new AD-3a, "Commit point and manifest"): every transaction writes new files under unique names, then publishes by atomically replacing a single signed `manifest.yml` that lists every record file with its digest and a monotonically increasing `generation`. Only manifest-listed files are authoritative; orphans are ignored and swept; the manifest hash-chains to the previous generation (`prev_digest`). Verification checks the file set, not only each file. Rename is wrapped in a bounded retry-with-backoff (EPERM/EBUSY/EACCES, 5 tries over ~1 s) in `RecordStore` only. Workspace documents are written after the record commit and are re-materializable from the record copy; a digest mismatch caused by a pending write is not `artifact_changed`.

### H-2. Two executors for one Tool-owned Stage / one pending intent (AD-4, AD-5)

Pair: Builder A (Daemon CI watch, FR-27) implements `core.chainToolStages(key)` after a `ci_result` observation, as AD-5 allows. Builder B (`state_advance`, FR-5) chains the same stages in the MCP server after the Conductor's call.
- AD-5 lists `checks`, `trace`, `ci`, `done`, triage, deterministic `push` parts as runnable by the Daemon. Nothing says which process executes a given Stage; both may.
- AD-4: on resume "pending intents are re-executed". Daemon and MCP server both resume. Two processes run `push:<sha>` or `pr_upsert` concurrently; "create-or-update" is not atomic against a second creator (two PRs), and `jira_transition` + `jira_comment` double-comments (comment is not idempotent: "PR URL only" posted twice).
- `checks` runs the full test suite in the shared working tree. If the Daemon runs it while the human or an agent edits files, results belong to no Snapshot. It is also long: if run inside the MCP call it exceeds the host tool timeout (OQ-13); if run inside the transaction it holds the ticket lock for minutes (see M-1).
- If the Daemon is not running, `ci` and any Daemon-chained stage never progress, and nothing in `state_get` says so.

Fix (new AD-5a, "Stage executor and intent lease"): a static table in the Stage Graph assigns each Tool-owned Stage to exactly one executor class: `workspace` stages (`checks`, `trace`, triage, `push`, `pr_upsert`) run only in `mcp-server` (or CLI); `remote` stages (`ci` watch, `done`, Jira calls) run only in the Daemon. An intent is executed only after its executor takes a lease (`owner`, `pid`, `heartbeat`, `expires_at`) recorded in a transaction; a non-owner never re-executes, it may only observe. Long stages return `wait` with a Wait Reason and run as a leased background job whose result arrives as an observation. The Daemon writes a heartbeat; `state_get` returns `wait: daemon_down` (and the CLI warns) when a `remote` stage is pending and the heartbeat is stale. `jira_comment`/`pr_upsert` carry a marker (`agentflow:<intent-key>`) and the adapter searches before create.

---

## HIGH

### H-3. `state_get` mutates; `state_advance`/`run_report` are not idempotent; Run lifecycle undefined (AD-6, AD-14, FR-5, FR-41, FR-44)

Pair: Builder A (`state_get` builder) allocates `R-n`, takes the start Snapshot and increments `phase.attempts` when it hands out `run_persona` (FR-7: "a Run starts"). Builder B (resume, FR-6) treats a Run as started only when it makes its first tool call.
- A Conductor retry after a timeout (OQ-13) calls `state_get` twice: two Runs, one orphan with a Snapshot and an incremented counter, `same_failure_runs` inflated, a spurious `unattributed_change` at the next Run start.
- `state_advance` that completes but whose response is lost: retry gets "Run id not current" (FR-5) and the Conductor has no way to continue. The same applies to `run_report` ("second call rejected").
- `commit_prepare` commits in git, then the process dies before `run_report`. FR-41 then treats the Run as missing report, stashes the diff and "restores the start Snapshot" while HEAD already contains the commit, so the tree is reverted against HEAD or the commit is orphaned. `commit_prepare` is a handler with a side effect that bypasses AD-4 (effects come only from `decide`).
- `agentflow stop` while a Run is active leaves an agent editing the tree; its `run_report` is refused and its edits are unattributed forever (terminal Stage has no cleanup).

Fix (new AD-6a, "Run lifecycle and idempotent calls"): Run states `issued -> started -> reported -> advanced | discarded`. `state_get` is idempotent: while a directive is outstanding it returns the same directive (same Run id, same bundle digest) and increments nothing; counters increment on `issued -> started` (first authorized call) inside the transaction. `state_advance` and `run_report` accept an `idempotency_key` (the directive id) and replay the stored response. `commit_prepare` is modelled as an intent keyed `commit:<run-id>`, records the resulting SHA in the Run before returning, and recovery compares HEAD with `start_head` and the recorded SHA before any restore; restore uses `git reset`/tree checkout to `start_head` only when the SHA is unrecorded. Stashes are refs under `refs/agentflow/<KEY>/<run-id>` (not `git stash` entries, whose indices shift). Terminal transitions with an active Run close it as `discarded` and stash.

### H-4. Agents can write the files that define the pipeline's own behaviour (AD-2, AD-9, AD-12, FR-40)

Pair: Builder A (`run_tests`/`run_checks`) reads `.agentflow/tools/*.yml` to get the test command. Builder B (implementer Persona) has `edit` + `read`.
- `.agentflow/` (config, `stage-graph.yml`, `personas.yml`, `tools/*.yml`, prompts) lives in the target repo. An implementer edit to `tools/run_tests.yml` (`argv: [node, -e, "process.exit(0)"]`) or `config.yml` (`protected_branches`, `tools.timeout`, repo env allowlist) makes Checks pass vacuously or runs arbitrary code in the server process. `commit_prepare` will commit it as part of the Run diff.
- Graph and personas are "loaded once", but per process: a mid-ticket edit gives the Daemon the old graph and a restarted MCP server the new one. The Memlog stores graph row ids that may no longer exist.
- Workspace files not in AD-8's list (`ticket.json`, `trace.yml`, `ci_failure.yml`) are agent-writable and trusted by readers (`ticket.json` is the Spec's only source).
- The HMAC key at `~/.agentflow/key` is readable by Copilot's own `read` tool on the same user account; ACL hardening does not stop same-user agents. The integrity story only holds against accidents, and the spine should say so.

Fix (new AD-2a, "Pinned pipeline configuration"): at `start-ticket` the server records a digest of the effective config, graph, personas, tool definitions and prompts in the Server Record (`config_pin`); every process re-checks before a transition and a mismatch is `record_tampered`-class Ask Human; the graph version is part of State. `commit_prepare` refuses any path under `.agentflow/` except via named tools (preferences/pitfalls through curator tool). All workspace documents, including `ticket.json`, `trace.yml`, `ci_failure.yml`, are listed in AD-8 with a recorded digest, and tool-derived ones (`trace.yml`) are recomputed, never read back as input. State the threat model explicitly: HMAC detects accidental/non-malicious change, not a same-user agent that reads the key; true prevention depends on OQ-8.

### H-5. Windows: `CommandRunner` as specified cannot run `npm`/`npx`/`tsc`, and the env allowlist breaks git and Node (AD-9, AD-10, AD-18)

Pair: Builder A implements `CommandRunner` literally (argv array, no shell, allowlisted env). Builder B implements the Vitest `run_tests` tool whose repo command is `npm test`/`npx vitest`.
- On Windows, spawning `.cmd`/`.bat` shims without a shell fails (`EINVAL` since the Node 20.12 hardening); `npm`, `npx`, `tsc`, `eslint` are all shims.
- The allowlist (`PATH`, `HOME/USERPROFILE`, `TEMP`, `CI`) omits `SystemRoot`, `ComSpec`, `PATHEXT`, `APPDATA`, `LOCALAPPDATA`, `ProgramFiles*`; git and Node fail or behave oddly without `SystemRoot`/`ComSpec`.
- Push needs credentials but AD-9 strips secrets while AD-10/FR-26 push through the same runner: either Git Credential Manager pops an interactive window that hangs a stdio server, or builders each add an ad-hoc token env var.
- The MCP server's stdin and stdout are the protocol channel. A child that inherits stdin (git prompts, test runner watch mode) consumes frames; any child writing to the parent's stdout corrupts JSON-RPC.
- Timeout kill only kills the direct child on Windows; Vitest workers and `node` grandchildren survive, hold file handles (next restore/Snapshot hits EBUSY) and keep writing to the tree after "timeout", breaking attribution.

Fix (tighten AD-9, AD-18): `CommandRunner` always uses `stdio: ['ignore','pipe','pipe']`, `windowsHide`, no `shell`; `.cmd` shims are resolved to their node entry point (or run through one audited `cmd.exe /d /s /c` path with a quoting function and a test suite of hostile arguments). The env allowlist is a per-platform table including the Windows system variables; git credentials come from a one-purpose `GIT_ASKPASS` helper that returns `GITHUB_TOKEN` only for the `push` argv, injected by `GitPort`, not by the generic allowlist. Timeouts kill the process tree (`taskkill /T /F` or a Job Object) and verify the tree is gone before the next Snapshot. Localized `icacls` output must not be parsed; verify via SID-based checks or `icacls /save`.

### H-6. Gate single-flight, one-time code ownership and "match" definition (AD-7, FR-8, FR-9, FR-42, FR-10)

Pair: Builder A (`gate_request`) runs an elicitation and blocks for the answer. Builder B (CLI `approve <KEY> <GR-n> <decision> --code`) answers the same Gate.
- The CLI needs `GR-n` before any decision exists, so a pending-gate entity must exist; the spine says a Gate Record is built only from a ChannelResponse, so a pending Gate has no owner (state `wait` entry vs `gates/GR-n.yml` without decision). The two builders will choose differently.
- Two MCP processes (two VS Code windows, a restarted server whose previous elicitation died with its process) or CLI plus elicitation can both decide the same Gate: two Gate Records, or approve and reject. AD-7 does not make a decision single-use under the lock, nor state that the CLI code is consumed in the same transaction.
- The code "exists only in the desktop notification": the Daemon sends notifications (AD-5), but `gate_request` runs in the MCP server. If the Daemon reads the plaintext code from the record, an agent with `read` can too; if the MCP server sends it, adapters/notifier lives in a shell the diagram does not allow. If the Daemon is down, no notification exists and the fallback channel is unusable.
- "Matching" (Glossary): Gate hash is SHA-256 of "exact bytes shown" (AD-7), but freeze checks compare it to the artifact hash; the push Gate hash is `walkthrough.md + HEAD`. Two definitions of equality.

Fix (new AD-7a): pending Gate is a first-class record (`gates/GR-n.yml`, state `open`) created by `gate_request` inside a transaction with a salted-hash of the code; deciding is a compare-and-set `open -> decided` under the ticket lock, returning `E_GATE_ALREADY_DECIDED` otherwise; `gate_request` is idempotent per Gate id and records the `channel_owner` lease so a dead owner's elicitation is reissued. The plaintext code is passed only to the `Notifier` port invoked by whichever process opened the Gate (the Notifier port is allowed in `mcp-server`); the Daemon only re-notifies without a code. GateRecord carries `subject_digest` (hash over the ordered list of (artifact, version, sha256), including HEAD SHA for `push`) used for freeze matching, and separately `shown_digest` for audit.

---

## MEDIUM

### M-1. Lock mechanism does not match AD-3's semantics; lock scope and ordering undefined (AD-3, AD-10)
`proper-lockfile` decides staleness by mtime refresh (default stale 10 s), not "holder pid dead"; a synchronous git/test call in the holder stops the refresh and another process breaks a live lock mid-transaction. There are also three lock domains (ticket lock, per-repo git lock, `daemon.lock`) with no order: A takes the git lock then the ticket lock (`commit_prepare`), B the reverse (`state_advance` executing an effect) and they deadlock. Fix (AD-3b): lock order `daemon -> ticket -> git`, never reversed; no process blocking I/O (git, tests, network) while holding the ticket lock (effects execute outside, via AD-5a leases); lock files carry `pid + start time + hostname`, liveness is checked by pid+start-time, and the lock is also validated at commit (manifest generation CAS, H-1) so a broken lock cannot clobber.

### M-2. `repo-id` is undefined and the Daemon has no repo binding (AD-3, FR-1, FR-2, AD-18)
The record path is `~/.agentflow/state/<repo-id>/<KEY>/` but nothing defines `repo-id`. On Windows `C:\Users\x\repo`, `c:\users\x\repo`, a junction, `subst` drive or 8.3 short name yield different ids, so two processes lock different directories and write the same ticket unprotected. The Daemon polls Jira across projects but must write a Ticket Workspace in one repo; the mapping ticket to repo is not specified. Creation is also racy: Daemon, `start-ticket` and `skip` can create/replace an Intent Record; `--restart` archives the record, after which the Daemon sees "no Intent Record" for a Ticket still In Execution and re-selects it, violating FR-1. Fix (new AD-3c): `repo-id = sha256(realpath, case-folded on win32, of the git common dir + origin URL)`; the Daemon is configured per repo (`agentflow daemon --repo`), one Daemon per repo-id; Intent Record creation is create-if-absent under the lock; archival leaves a tombstone (`archived/<KEY>/<n>` plus `restart_count`) that counts as "has an Intent Record".

### M-3. Observations can be applied to the wrong push (AD-5)
`ci_result` observations are consumed "on next `state_get`/`state_advance`" or by Daemon chaining. A late observation from push 1 arrives after a Patch Plan and push 2 and is applied to push 2 (CI fail or success mis-attributed), or consumed twice by two processes. Fix: observations carry `{id, ticket, sha, push_intent_key}` and `decide` consumes only those matching the open push intent, marking them consumed in the same transaction; others are retained as stale.

### M-4. Schema/version skew between long-lived Daemon and per-chat MCP server (AD-13)
The Daemon runs for days; `npm link` rebuilds change the MCP server on the next chat. "Unknown keys rejected" plus Codec read-modify-write means the old Daemon either rejects the new record (false `record_tampered`) or strips unknown fields when it rewrites it. No `schema_version`, no migration rule. Fix: `format_version` in the manifest; a process that reads a higher version is read-only and refuses writes with a typed error; migrations run only in the CLI under the lock; Codec preserves unknown fields on round trip within a version.

### M-5. HMAC key creation race and Windows ACL check (AD-18, FR-48)
First run of Daemon and MCP server together both create `~/.agentflow/key`; last writer wins, records signed with the loser are unverifiable (false `record_tampered`). Fix: create with exclusive flag (`wx`), on `EEXIST` re-read; apply ACL before first use; the re-verify on every start must not depend on parsing localized `icacls` text.

### M-6. Failure Signature is unstable (FR-7 "Hashes" convention)
Signature includes `path:line`; a refactor Run that edits the file shifts line numbers, the signature changes, `same_failure_runs` resets and the Loop Checkpoint never fires for the exact loops it exists for. On Windows the parser may also emit backslash or absolute paths (Vitest reports absolute paths), so equal failures hash differently across processes. Fix (tighten Hashes row): signature over `<id>\n<repo-relative-slash-path>\n<first message line normalised>`; line number excluded; parser output normalised by `OutputParser`.

### M-7. Scenario id grammar and test-title matching (Ids, FR-18, FR-21)
`S<goal>.<item>.<n>` with Goals `G1` and items `G1.I1` (addendum plan sample uses `S1.1.1`) is ambiguous (goal number vs id). "Title starts with id" matches `S1.1.10` for `S1.1.1`; `S1.1.1` prefix-matches inside `S1.1.1a`. Builders for `trace_matrix` and `test_triage` will each choose a matcher. Fix: Ids row gets a regex (`^S(\d+)\.(\d+)\.(\d+)(?=\s|:|$)`) and one `parseScenarioId()` in `core`; goals use numeric part only in scenarios.

### M-8. Git working-tree interactions the lock does not cover (AD-10)
VS Code's git extension (autofetch, status) and the human create `index.lock`; `commit_prepare` and push fail intermittently with no retry rule. Snapshot via temp index honours `core.autocrlf`/`.gitattributes`, so AD-18's claim that hashing is independent of CRLF is true for the Codec but not for Snapshot tree hashes: a CRLF-only change is invisible to attribution and a normalize warning can print to stderr. "Restore the start Snapshot" is unspecified (what happens to untracked files created by the Run, and to files locked by an editor). Fix: AD-10 adds bounded retry on `index.lock`, a defined `restoreSnapshot()` (reset tracked + remove untracked files listed in the end Snapshot diff only), and states Snapshots are autocrlf-normalised by design.

### M-9. Notification reliability on Windows (AD-5, FR-49)
`node-notifier` toasts need an AppUserModelID and are dropped silently by Focus Assist; "failed notification is logged" means a Ticket can wait indefinitely with the human unaware, and the one-time code (H-6) is lost. "Not yet notified" is tracked in the record with at-most-once semantics. Fix: notified marker is `last_notified_at` with re-notify interval and `agentflow status` listing every waiting Ticket and reason; the code is re-mintable via `gate_request`/CLI (`agentflow approve --new-code`).

---

## LOW

- **L-1.** `Run` ids are "monotonic per Ticket, never reused", but `--restart` starts a new record (counter resets): stash/ref names `R-12` collide with the archived Ticket's. Namespace refs and ids by restart generation.
- **L-2.** `agentflow stop` and `start-ticket` against a Ticket whose record directory is on a lock held by a dead MCP server show the lock error with no recovery hint; add `agentflow doctor` that lists leases/locks and breaks only provably dead ones.
- **L-3.** Parallel mode: Run A's `run_tests` can fail because of Run B's half-edited files (shared tree); failures are attributed to A's Goal and feed A's Failure Signature. Record in AD-17 that parallel `run_tests` results are advisory and only Wave Checks are blocking.

---

## Proposed AD additions (summary)

| New/tightened | Closes |
| --- | --- |
| AD-3a manifest + generation + hash chain + rename retry | H-1 |
| AD-5a executor table + intent leases + daemon heartbeat | H-2 |
| AD-6a Run lifecycle, idempotent `state_get`/`state_advance`/`run_report`, `commit_prepare` as intent, ref-based stashes | H-3 |
| AD-2a pinned configuration; `.agentflow/` write guard; AD-8 covers every workspace file; explicit threat model | H-4 |
| AD-9/AD-18 Windows runner rules (shims, env table, stdio, tree kill, git askpass) | H-5 |
| AD-7a pending Gate record, CAS decide, code ownership, `subject_digest` | H-6 |
| AD-3b lock order and no I/O under lock; AD-3c `repo-id`, Daemon-per-repo, create-if-absent, tombstones | M-1, M-2 |
| Observation key fields; `format_version`; key create `wx`; signature/ids grammar; git retry and restore definition; re-notify | M-3..M-9 |
