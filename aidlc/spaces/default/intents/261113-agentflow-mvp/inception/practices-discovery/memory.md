# Practices Discovery Diary

## Interpretations

- 2026-11-13T14:48:00Z Treated org.md sections as suggested defaults; tagged each bullet [stated] or [draft].
- 2026-11-13T14:58:52Z Final integration: removed draft tags; wrote the develop-to-main release flow as a working assumption.
- 2026-11-13T14:58:52Z Q7 A yielded two ALWAYS and two NEVER rules only; "small ordered commits" and "test-first" mapped to Mandated.

## Deviations

- 2026-11-13T14:48:00Z None.
- 2026-11-13T14:58:52Z The person's `develop` choice departs from the org.md trunk-based worktree default (base and target `main`); recorded in evidence.md.

## Tradeoffs

- 2026-11-13T14:48:00Z Chose test-after as methodology (org.md default) over test-first because the spine states no cadence for the developer's own work.

- 2026-11-13T14:58:52Z Methodology set to tdd per Q3 A; replaced the draft 80% line-coverage floor with ub-mode gates per Q4 A, accepting tool-support risk.

## Open questions

- 2026-11-13T14:58:52Z Do crapper, dryer and mutator support TypeScript? Unconfirmed; recorded UNRESOLVED in evidence.md.
- 2026-11-13T14:58:52Z How does `develop` merge into `main` (merge style, cadence)? Assumed; person to confirm if it matters.
- 2026-11-13T14:58:52Z Is typescript-eslint compatible with TypeScript 7.0.2? Check at configuration time.
- 2026-11-13T14:48:00Z Branching strategy, methodology, coverage floor, formatter/linter, CI gating, and any hard constraints need interview confirmation.
