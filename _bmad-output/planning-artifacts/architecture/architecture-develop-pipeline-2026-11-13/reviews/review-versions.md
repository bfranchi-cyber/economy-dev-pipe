# Review: Stack versions and technology claims (checked 2026-11-13)

Verdict: Stack table is accurate and current (all versions equal npm `latest`; none deprecated). Two fit issues to fix, two cautions.

## Version table (npm view, nodejs.org/dist)
| Tech | Spine | Registry latest | Modified | Deprecated | engines.node |
|---|---|---|---|---|---|
| Node | 26 LTS (26.13.1) | v26.13.1, LTS "Lithium", 2026-11-10 | | n/a | |
| Node 24 | floor 24 | v24.22.3 LTS "Krypton" | | n/a | |
| typescript | 7.0.2 | 7.0.2 | 2026-11-13 | no | >=16.20 |
| @modelcontextprotocol/sdk | 1.32.2 | 1.32.2 (only dist-tag) | 2026-10-23 | no | >=18 |
| zod | 4.6.7 | 4.6.7 | 2026-10-12 | no | none |
| yaml | 2.9.1 | 2.9.1 | 2026-09-11 | no | >=14.6 |
| vitest | 5.1.0 | 5.1.0 | 2026-11-02 | no | ^22.12 or ^24 or >=26 |
| @octokit/rest | 22.0.1 | 22.0.1 | 2026-07-24 | no | >=20 |
| commander | 15.1.0 | 15.1.0 | 2026-11-09 | no | >=22.12.0 |
| execa | 10.2.1 | 10.2.1 | 2026-10-23 | no | >=22 |
| proper-lockfile | 4.1.2 | 4.1.2 | 2022-06-24 | no | none |
| node-notifier | 12.1.0 | 12.1.0 | 2026-10-31 | no | ^22.22.2 or ^24.15.0 or >=26 |
| git | >=2.40 (2.53.0 dev) | local 2.53.0.windows.2 | | | |

## Findings
1. FIT ISSUE - Node floor: spine says `engines` floor 24. node-notifier 12 requires `^24.15.0` on the 24 line (not plain 24.0); vitest 5 is fine on any 24. Set floor to `>=24.15.0` (or state "24.15+"). commander (>=22.12) and execa (>=22) are compatible with 24 and 26.
2. node-notifier 12 is ESM-only (CJS require works via require(esm) on supported Node). Fine for an ESM TS project; ensure the adapter uses `import`. Actively maintained again (v12.0/12.1 in 2026). Windows uses bundled SnoreToast 0.9.1 (x64 only; 32-bit stays 0.7.0, binary unsigned, so AV/SmartScreen may flag it - note for the adapter). `duration: 'long'` (~25s) only works on x64. Relevant to the CLI gate channel (one-time code in the toast text): a missed ~7s toast means the code is lost, so use `duration: 'long'` and have a re-show path.
3. proper-lockfile 4.1.2: not deprecated, works on Windows (uses atomic mkdir plus mtime refresh, stale detection), but no release since 2022-06 - effectively unmaintained/stable. Acceptable; caution: mtime-based staleness needs `update`/`stale` tuned (default stale 10s) and is weak on network drives/OneDrive-synced folders. Keep it behind a `Lock` port so it can be swapped.
4. MCP SDK 1.x: 1.32.2 is the current line; supports stdio transport and server-side elicitation (`server.elicitInput`, spec 2025-06-18+; spine's 2025-11-25 target is consistent with 1.32). Elicitation is a client capability, so the `GateCapabilities` probe (client capabilities at initialize) is the correct design.
5. VS Code Copilot: supports MCP elicitation (spec 2025-06-18, per VS Code docs and GitHub blog). Limit: servers must not request secrets via elicitation (fine - gates are approvals). Other Copilot surfaces (CLI, JetBrains, cloud agent) not confirmed; the spine's fallback channel chain (tool_confirmation, cli_code) covers this.
6. TypeScript 7.0.2 (native port) is current. Caution only: tooling that depends on the JS compiler API (typescript-eslint, some vitest transforms) should be verified against 7; not a spine error.

## Claim checks
- `git write-tree` over a temporary `GIT_INDEX_FILE`: VERIFIED locally (git 2.53 on Windows). With a temp index, `git add -A` then `git write-tree` yielded a tree; real `.git/index` was byte-identical afterward and `git status` still showed a.txt modified and b.txt untracked. Notes: the temp index must start empty (or seeded with `read-tree HEAD`), else add -A gives a full-worktree tree, which is what is wanted; ignored paths are excluded automatically by add -A; excluding `.agentflow/tickets/` needs a pathspec (`:(exclude)`) or an info/exclude entry - `add -A` alone will not do it. CRLF warnings appear on Windows with autocrlf: tree contents are normalized per autocrlf, so snapshot hashes depend on git config; spine AD-13 handles document hashing but snapshot trees do follow `core.autocrlf` - set it explicitly on the temp invocation (`-c core.autocrlf=false` or consistent) if tree hashes must be reproducible.
- Windows has no chmod 600: TRUE (Node `fs.chmod` only toggles read-only flag; mode 0600 is ignored). The icacls approach is viable: `icacls <file> /inheritance:r /grant:r "%USERNAME%:(R,W)"` removes inherited ACEs and grants only the current user; re-verifying via `icacls` output parsing on each start is workable but locale-sensitive output - verify by checking that only the current user SID (and optionally SYSTEM/Administrators) appears, using SIDs rather than names. Spawn `icacls` via execa without a shell. On a OneDrive-redirected or FAT/exFAT path ACLs may not apply; the key is under `os.homedir()`, so fine.

## Summary of corrections
- engines floor `24` -> `>=24.15.0` (node-notifier 12 constraint).
- Add notes: node-notifier ESM-only/unsigned binary/`duration:'long'`; snapshot hash and `core.autocrlf`; exclusion of `.agentflow/tickets/` needs explicit pathspec; proper-lockfile unmaintained since 2022 (keep behind a port).
