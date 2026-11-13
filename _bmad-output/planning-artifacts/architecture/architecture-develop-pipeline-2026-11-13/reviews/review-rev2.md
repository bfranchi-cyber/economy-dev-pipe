# Adversarial review: ARCHITECTURE-SPINE.md revision 2

Reviewed against `prd.md` and `addendum.md` (2026-11-12/13). The spine was not edited. Daemon, HMAC and parallel Goal mode are not asked back. The threat model is agent drift and accident.

## Verdict

**Revise before building (targeted, not structural).** The one-process shape is right and the AD set is mostly coherent. But it has four gaps that a team of independent unit-builders would each fill differently:

- No concurrency rule inside the single process, while PRD FR-22 still needs N parallel Reviewer Runs.
- Crash recovery covers only external effects, and a single `pending_effect` slot.
- `skip`/`stop`/`start-ticket` have lost the human-only property the CLI gave them.
- The attribution model contradicts the curator/config flows and the Windows autocrlf pin.

None of these needs a new component. Each needs 1–3 sentences in an AD. The spine's own "Spine ↔ PRD deltas" table omits at least six PRD behaviours that are no longer supported.

Severity scale: **H** = units built to the spec will not work together or will lose data; **M** = a real hole that will be hit in daily use; **L** = trap or tidy-up.

---

## A. Pairs of units that obey every AD yet are incompatible

### F1 (H). N parallel Reviewer Runs vs one current Run, one directive and no write serialization

- PRD FR-22 runs one Reviewer per Review Bundle in parallel; this is not "parallel Goal mode" and is not deferred.
- The spine models `STATE ||--o| RUN : current` (single Run) and AD-14 says `state_get` returns *exactly one* `run_persona`.
- AD-6 resolves `run_id` "against the current Run". With N live Reviewers, either N-1 are refused or two builders invent different shapes (a `runs` map vs a Run-set with `run_personas[]`).
- Nothing says the server serializes record mutations. Parallel `run_report` calls, the CI timer, `gate_request` waiting on elicitation and every `bundle_get` call are all async.
- Each of these does read-modify-write on `record.yml` and appends to the logs, so lost updates are certain without a rule. FR-34 also requires "concurrent appends never interleave".
- The Deferred table defers the single-Run assumption to "when parallel Goals are built", which is wrong because Reviewers need it now.
- **Fix:** AD-19 gains "one per-Ticket async mutex; every handler and the timer run read→decide→commit inside it". AD-14/AD-6 gain `state_get → run_personas[]` (one or more) and `State.runs: Run[]` (in-flight set, size 1 except in `validate`).

### F2 (H). Server-written files under `.agentflow/` vs attribution, clean-tree and freeze checks

- FR-36 appends accepted entries to `.agentflow/preferences.md` and `pitfalls.md`, and `agentflow context refresh` rewrites `AGENTS.md`.
- AD-8 makes `commit_prepare` refuse any `.agentflow/` path. AD-10 excludes only `.agentflow/tickets/` from Snapshots.
- Consequences when each unit follows its AD:
  - The curator's accepted write shows up as an `unattributed_change` at the next Run start.
  - It shows up again as "uncommitted changes outside git-ignored paths" at the next `start-ticket` (FR-43).
  - It can never be committed, so it never reaches the repo.
- The same collision hits a legitimate `agentflow config models` run mid-Ticket: it trips the `config_changed` digest (AD-8) and the Snapshot comparison.
- **Fix:** Decide that `preferences.md`/`pitfalls.md` are either excluded from Snapshots and the clean-tree check, or committed by a dedicated server commit outside Run attribution. State it in AD-8 and AD-10. Say whether `config.local.yml` is in the digest. Define `config_changed` options (accept-and-rebaseline / restore).

### F3 (M). Snapshot hashing vs `commit_prepare` vs `run_report` ordering

- The Run's last two tasks are `commit_prepare` then `run_report` (FR-15). The end Snapshot is taken at `run_report` (FR-41), *after* the commit.
- Anything the Run edits between those two calls is in the end Snapshot but not in the commit. It is attributed, never committed, and absent from the pushed SHA.
- Nothing says `run_report(0)` checks that tree == the commit just made, or that `commit_prepare` was called at all. An empty-diff `refactor` Run is also unspecified.
- Snapshots pin `core.autocrlf=false` (AD-10), but `commit_prepare` commits under the repo's config (typically `autocrlf=true` on Windows). Snapshot tree hashes and commit tree hashes therefore cannot be compared. The obvious "tree == HEAD" check cannot be built by comparing hashes.
- AD-10 also never defines *restore start Snapshot* (needed by FR-41 for status 1/2). That operation does modify the working tree and index, is multi-step (delete created files, rewrite modified), and is not journaled (see F6).
- **Fix:** AD-10 adds: "`run_report(0)` takes the end Snapshot, requires `commit_prepare` ran in this Run, and diffs tree vs HEAD using the *same* pinned config; any residue → `unattributed_change`". It also adds a `restoreSnapshot` primitive that runs under a journaled `pending_effect`.

### F4 (M). Who transitions on CI completion: timer or tool chain?

- AD-2 says `decide` is the only state producer, tool-owned Stages run inside `state_advance` chaining, and handlers never write State.
- AD-21's timer "writes the result to the record, … and ends the wait". That is a third writer outside any tool call.
- One builder will have the timer call `decide(ci_result)` and fire the Jira transition and `ci_failure.yml` effects, running in the background. Another will record only an observation and leave the transition to the next `state_get`.
- Both obey the text. They differ on whether Jira is touched with no human present and whether the Memlog entry exists.
- **Fix:** AD-21: "the timer records an observation event and calls the same `advance()` path under the same mutex". Or "the timer records the result only; `state_advance` performs the transition".

### F5 (M). Module graph: prose, diagram and capability map disagree; no home for workspace and config I/O

- The prose says everything except `engine` "may be imported only by `tools/` and `bin/`". The diagram has `bundles → engine`, `bundles → store` and `git → run`.
- `bundles` needs diff slices (`git/`), workspace documents, `.agentflow/` preferences and Memlog. It cannot import `git`, and `store/` is defined only as the `~/.agentflow` record.
- The map puts `plan_schedule` (glob overlap "in the current tree"), `doc_scaffold` and `engine/docs` in `engine/`, which has no filesystem.
- No folder owns `loadConfig()`, `loadPersonas()`, the Ticket Workspace read/write, the `.gitignore` entry or the document writes of AD-8. Two builders will put these in `store/` and `tools/` respectively.
- **Fix:** Add `workspace/` (or widen `store/` to two rooted areas: record and workspace/config). Make the diagram the authority, and either allow `bundles` to take `GitPort`/`StorePort` as injected arguments or have `tools/` pass inputs in. State that `plan_schedule` receives a file list.

### F6 (M). Signature and composite digests have no single definition

- AD-13 says the Failure Signature is `sha256(id \n file-path \n normalized first message line)`.
- It is produced in three places: `run/` parser for tests and Checks, `remote/github` for CI, `engine` for comparison.
- "Normalized" is undefined (numbers, ANSI, absolute vs repo-relative paths, timestamps), and `engine` is barred from `fs`/`net` but `node:crypto` is not listed either way. Different normalizations mean the Loop Checkpoint never fires, the exact problem the AD claims to prevent.
- The push Gate's `subject_digest` covers "walkthrough.md plus HEAD SHA" (FR-26). The composition is unspecified, so `gates/` and the freeze check in `engine`/`store` can disagree.
- Test-title matching does not say which runner field is matched (title vs `fullName` including `describe` prefix).
- **Fix:** One `engine/signature.ts` with a normalizer spec (strip ANSI, digits runs, absolute prefixes), and a `subjectDigest(kind, parts[])` function. Name the Vitest/Jest field.

### F7 (L). `--restart` collides with ids and refs

- AD-20 stores discarded work under `refs/agentflow/<KEY>/<run-id>`. AD-19 ids (`R-n`, `H-n`) are "monotonic per Ticket, never reused", allocated inside `record.yml`.
- FR-46 `--restart` archives and starts a *new* Intent Record from `spec`, so a new `record.yml` starts at `R-1` again.
- The refs and `handoffs/H-n.yml` files from the old incarnation are overwritten or confusing. The archive location of the old record dir is unspecified.
- **Fix:** Add an `epoch` to the record, the ref path and the archive folder name (`<KEY>.<epoch>/`).

---

## B. Holes the simplification opened

### F8 (H). Crash recovery: the journal is too small for what the engine produces

- `decide` returns `effects[]` (AD-1), but `pending_effect` is a single `{kind, key}` slot (AD-20).
- A `push` Gate approval needs push → `pr_upsert` → record → (later) Jira. Chaining gives several effects per `state_advance`.
- The spine does not say whether `state'` is committed before or after the effects run:
  - Committed before: State says `ci` while the push never happened.
  - After: the order inside the journal is lost.
- Effect results that the next effect needs (PR number, pushed SHA) are not stored.
- AD-20's list of repeatable effects is wrong in two places:
  - A Jira transition to the *current* status is not a no-op. The transition id is unavailable from the target status, so Jira returns an error. The effect must read the current status first.
  - A Jira *comment* is not idempotent at all. Resume re-run posts a duplicate PR-link comment unless a marker is searched for.
- Local effects that mutate the tree are not journaled: restore-to-Snapshot (FR-41), discard stash/ref creation, and Approved-Version restore.
- Logs vs record (AD-19):
  - `tool-calls.yml` gets an entry for every call, including read-only and refused ones (AD-14, FR-50), while `record.yml` stores the line count and "a log longer than recorded is truncated back on resume".
  - Either `record.yml` is rewritten on every call (including `bundle_get`), or the truncation destroys audit entries for calls made after the last commit. These contradict each other.
  - The order is also unspecified: log append → fsync → record rename is the only safe order, and no fsync is mentioned.
  - Rename atomicity on Windows holds, but without a file fsync a power loss can leave a zero-length temp file renamed into place.
  - "Bounded retry on `EPERM`/`EBUSY`": exhausting the retry has no rule. The in-memory state must be discarded and re-read from disk, never kept.
- **Fix:**
  - `pending: Effect[]` is an ordered list with stored results; `state'` plus the list is committed in one rename *before* the first effect runs; each completion is a record commit.
  - Jira effects are "read status then transition" and "comment with `<!--agentflow:KEY:done-->` marker, search before post".
  - Local tree mutations go through the same journal.
  - Tool-Call Log is best-effort and never truncated (a sequence number per line is enough). Only the Memlog needs the recorded count.
  - Define the commit-failure rule (drop the cache, re-read).

### F9 (H). `skip`/`stop`/`start-ticket --restart` are now agent-reachable with no human check

- The delta table moves `skip`/`stop` from the CLI to MCP tools. AD-6 lists the Conductor-only tools as `state_get`, `state_advance`, `gate_request`, `gate_confirm`; FR-40 gives the Conductor the same set.
- So who may call `stop`, `skip`, `start-ticket` (a tool in the capability map, but a skill per OQ-12) or `--restart`? They take no `run_id`. A drifting Conductor, which is exactly the modeled adversary, can call `stop` and end a Ticket irreversibly (`stopped` has no outgoing edges; restart archives).
- Calling `stop` with no `run_id` is indistinguishable from the human's own request. AD-7's human-only decision property was previously provided by the human running the CLI.
- `skip` also needs a record for a not-started Ticket. FR-1 now creates the Intent Record at `start-ticket`, not at poll, so `skip` on a Ticket that has never been started has nothing to mark and the Ticket reappears in the next JQL listing.
- All of these need the repo lock and the mutex, and the CLI is a separate process that can never take the lock while the server holds it.
- **Fix:** Route `stop`/`skip`/`restart` through `gate_request` kind `confirm_action` (a human channel response), and add them to AD-7. `skip` writes a minimal `skipped` record (key, epoch, timestamp). Add them to the Conductor's tool list or to a named `user_command` class in AD-6.

### F10 (M). Run liveness: idempotent `state_get`, interrupted Runs and server restart

- AD-6: `state_get` "returns the outstanding directive instead of creating another Run". FR-6/FR-41: `start-ticket` with a Run in progress *discards* it and relaunches in a fresh context.
- After a crash or window close the outstanding Run is dead, but `state_get` hands out the same `R-14` over a partly-edited tree. The two ADs cannot be reconciled without a Run liveness notion, and AD-4 leases were removed.
- Worse, when VS Code restarts the MCP server (reload, config change) the subagent may still be running. Its `run_report` arrives at the new process, where the record still says `current_run = R-14`, so it is accepted. A new `start-ticket` also launches R-15 on the same tree, and two Runs edit one tree. The server's attribution cannot see Copilot's edit tool.
- **Fix:** Give each process a `boot_id`. A Run records the `boot_id` it started under; a Run with a different `boot_id` is `interrupted`. The next `state_get` discards it per FR-41 (stash, restore, new id) and refuses its late `run_report`.

### F11 (M). Lock robustness (repo lock, two windows, reload)

- Exclusive-create-with-pid is vulnerable on Windows:
  - **PID reuse.** A stale lock whose pid is now another live process blocks forever ("exits naming the holder").
  - **Takeover race.** Two windows starting together both see a dead pid, both replace the lock, and the later one deletes the earlier winner's file.
- VS Code reload: the old server may still be exiting when the new one starts. With "exits with an error" there is no retry, and VS Code shows a failed server for the window the user is actually working in.
- The lock is held for the process lifetime, but VS Code starts the server when tools are first discovered or called. An idle second window on the same repo (or a second git worktree, since `repoId` uses the common dir) that has ever opened chat holds the lock indefinitely and blocks the working window.
- Also, "ends with the chat" in the deployment paragraph is not accurate: the server lives with the window and its tool cache, not with a single chat.
- Contrast with the sentence in Deferred that the lock handles two windows. It handles two servers, not two *usable* windows.
- **Fix:** Take the lock lazily at the first mutating call, release after the last non-terminal Ticket is idle for ~N minutes or on stdin end / SIGTERM. Use a Windows named pipe (`\\.\pipe\agentflow-<repo-id>`) or at minimum pid + process start time. Retry up to ~10 s before failing. On permanent failure serve a single read-only `explain_lock` tool so the user sees why.

### F12 (M). The CI timer is not re-armed and is wall-clock only

- The timer is set "after a push". If the server restarts while the window stays open (reload, crash restart) a `ci_running` Ticket has no timer, so no notification, until the user happens to run `start-ticket`.
- "On resume a pending effect is re-run" does not say *when* resume happens (server start or `start-ticket`). At startup the server should scan its Tickets, re-run `pending`, and re-arm timers.
- `ci.max_wait` and `no_run_grace` use wall clock. After laptop sleep or hibernate, a 60-minute window can expire instantly and raise a spurious `ci_no_result`.
- Timer callbacks must catch everything: an uncaught exception kills the process and leaves the lock. The spine has no top-level crash policy.
- **Fix:** AD-21 gains "on startup: recover pending effects, re-arm `ci_running` timers from persisted `pushed_at`; max_wait counts only poll attempts × interval or is measured against a monotonic clock plus a sleep-gap guard; every timer callback is wrapped".

### F13 (M). Silent PRD behaviours the spine no longer supports and the deltas table omits

- **Run bundles via `bundle_get(run_id)`**: PRD FR-5/addendum return the Input Bundle inside `run_persona`. The spine adds `bundle_get` (AD-6), which is not in `personas.yml` (addendum F: reviewer/walkthrough/curator have only `run_report`, and FR-40 says Reviewers have no read tools because the bundle is inlined). AD-12 says `personas.yml` is the single source, so the generator and AD-6 disagree on whether every Persona gets `bundle_get`. Also a Conductor-token benefit that should be stated.
- **FR-22 parallel Reviewers** (F1), not in the deltas.
- **FR-6 `start-ticket` without key** ("works only when exactly one Ticket is not terminal; otherwise lists them", NFR-5 resume): AD-21 replaces it with the JQL listing of *new* Tickets. Neither text says how resumable on-disk Tickets are shown, or what happens when Jira is unreachable (which should not block resuming).
- **FR-41 stash named `agentflow/<KEY>/<run-id>`** becomes refs (AD-20); the Handoff `stashes` field contract changes. Not in the table.
- **FR-44 "second `run_report` for the same Run is rejected"** vs AD-6 "replay their stored result when repeated". Pick one (replay on identical args, reject on different).
- **FR-48 test "hand-written Gate Record rejected"** cannot be satisfied without HMAC. List it as dropped. `record_tampered` is retained in FR-45's reasons but "inconsistent" has no detection beyond parse failure and log line count.
- **FR-35 Run Metrics** have no file or record location in AD-19 or the layout (`record.yml, memlog.md, tool-calls.yml, blobs/`).
- **FR-1 consequences lost silently**: the poll interval and the "two-minute pickup" in UJ-1 (the delta covers it, but SM-1 "eligible Tickets" and `TicketSource` interface survive only implicitly).
- **Fix:** Add rows to the deltas table for each of these. For `bundle_get`, add it to all Persona allowlists in `personas.yml`.

---

## C. Windows traps

### F14 (M). Secrets and `.vscode/mcp.json`

- The deltas row says credentials reach `mcp-server` "through `.vscode/mcp.json` `env`". That file lives in the workspace and is routinely committed. Putting `JIRA_API_TOKEN`/`GITHUB_TOKEN` values there breaks NFR-2/NFR-6.
- **Fix:** Use `inputs` (`${input:…}` prompts) or `envFile` pointing at a user-level file, or a user-profile MCP config. Add `.vscode/mcp.json` to the layout and `init`.

### F15 (M). Scrubbed environment is too thin for git and package managers

- AD-9: win32 allowlist is `PATH, PATHEXT, SystemRoot, ComSpec, TEMP, TMP` plus a *scratch* `USERPROFILE`. `git/` runs through `run/` (diagram edge `git --> run`).
- Consequences:
  - No `~/.gitconfig` means no author identity, so `commit_prepare` fails with "tell me who you are". It also drops `core.autocrlf`, `safe.directory` and any signing config.
  - No `APPDATA`/`LOCALAPPDATA`/`ProgramFiles`/`ProgramData` breaks npm (cache/prefix), pnpm and Git Credential Manager.
  - Scratch `HOME` for the test runner hides legitimate user config needed by some toolchains.
- **Fix:** Name how git obtains identity (pass `-c user.name/-c user.email` from config or the real gitconfig path via `GIT_CONFIG_GLOBAL`) and add `APPDATA`, `LOCALAPPDATA`, `ProgramFiles*` to the allowlist (non-secret). Prove with week-1 spike on a real repo.

### F16 (L). `.cmd` shims, GIT_ASKPASS and kill trees

- "Resolve package-manager shims to Node entry points" means parsing `.cmd` shims for npm/pnpm/yarn variants. Spec a fallback (`cmd.exe /d /s /c` with config-only argv, since Node ≥ 20.12 refuses `.cmd` without `shell`).
- `GIT_ASKPASS` on Git for Windows is run through its bundled `sh`; a `.cmd`/`.js` askpass may not execute. "No `sh`/`bash` dependency" is violated by Git itself. Needs a week-1 proof, with `http.extraheader` via `-c` as the fallback.
- `taskkill /T /F` only walks live parent links; a grandchild whose parent exited is orphaned. Orphans after a *server crash* are never reaped. Record child PIDs in the record dir and sweep at startup.

### F17 (L). Hash instability for human-viewed documents

- AD-8 hashes "the exact bytes the server wrote". Approved `requirements.md`/`plan.md` live in the workspace, where VS Code on Windows can alter bytes on a save (EOL, final newline, BOM, format-on-save) without any intentional edit. This raises false `artifact_changed` Ask Human interrupts.
- **Fix:** Hash a canonical form (LF, trailing newline normalized) while the Approved Version blob keeps the raw bytes.

### F18 (L). `repoId` and relocated repos

- The id is derived from the realpath of the git common dir. Moving or renaming the repo folder changes the id; the record is orphaned while `.agentflow/tickets/<KEY>/` and the `agentflow/<KEY>` branch still exist.
- No rule covers workspace-present/record-missing, or the reverse (restored backup). Failing to Ask Human with "adopt old record / start over" is enough; today the behaviour is undefined.
- Also unspecified: which directory the server treats as repo root when VS Code opened a subfolder. Use `git rev-parse --show-toplevel`.

---

## D. Contradictions inside the spine

1. **Logs vs record commit point** (F8): "single commit point" vs append-only logs whose count is kept in the record but appended for every call.
2. **AD-2 "handlers never write State" vs AD-21 timer** (F4).
3. **AD-8 vs AD-10 vs FR-36 vs FR-43** on `.agentflow/` files (F2).
4. **Module graph prose vs diagram** (F5).
5. **AD-6 idempotent `state_get` vs FR-6 discard** (F10).
6. **"Deferred: single Run in State" vs MVP parallel Reviewers** (F1).
7. **Purpose line says "Governs … features FR-1..FR-51"** while FR-31–33 and §4.11 are excluded; fine as deltas, but `binds:` lists `FR-1..FR-51` without exceptions. Tests keyed by `binds` will expect parallel behaviour.
8. **AD-14 `state_get` returns exactly one of four vs FR-5 state-tool contract** is consistent, but see F1.
9. **Diagram says `engine -.-> engine` "pure: imports nothing above"** while AD-13 puts `sha256` hashing (a `node:crypto` import) in `engine/schemas`. Decide whether `crypto` is allowed in `engine`.

---

## E. Dimensions left silent

- **Schema/record versioning** is explicitly deferred, which is acceptable for a first version but means the first change to `record.yml` has no migration path. At minimum write `schema: 1` into the record now (one field).
- **Elicitation lifecycle:** `gate_request` blocks in-process awaiting a human. A hung elicitation holds a pending promise across the mutex scope. Say that Gate waits happen *outside* the mutex and that cancellation/timeouts leave a `pending` Gate in the record, with `gate_request` idempotent per subject (AD-7 says this; the mutex boundary is the missing part).
- **MCP tool-call cancellation** (client aborts mid-call) is not addressed: an effect may have run with no response sent. Covered if F8 is fixed; say so.
- **Process orphaning at server death** (test runners still running) is silent (F16).
- **Notification reachability:** `node-notifier` toasts from a child of VS Code need an AUMID on Windows; unregistered senders may be suppressed. The spine labels notifications best-effort, but FR-49's "notify on every wait" then has no verification step. Add a week-1 smoke test.
- **`agentflow init` and `context init`** appear only in the envelope paragraph (`[ASSUMPTION]`) with no owner folder, no model use stated for `context init`/`refresh`, and no Jira/Git preconditions.
- **Disk growth and retention** of `blobs/`, `refs/agentflow/*` and archived records: no cleanup (acceptable, but say "never").
- **Clock source** for monotonic measurement (F12) is not part of the injected `now`.
- **Observability of the lock/timer state** to the user: a `status` tool listing the Tickets, the lock holder and timers would remove most "why did nothing happen" cases; not required but cheap.

---

## Top fixes in priority order

1. F1: per-Ticket mutex plus `runs[]`/`run_personas[]` for Reviewers.
2. F8: ordered `pending[]` journal, comment/transition idempotency, log truncation rule, commit-failure rule.
3. F9: human-confirmed `stop`/`skip`/`restart`, skip record for never-started Tickets.
4. F2/F3: decide the status of `.agentflow/` server writes in Snapshots, and fix the commit/Snapshot/autocrlf contract.
5. F10/F11/F12: `boot_id` fencing, lazy lock with robust Windows primitive, timer re-arm on startup.
6. F13: add the six missing rows to the deltas table.
