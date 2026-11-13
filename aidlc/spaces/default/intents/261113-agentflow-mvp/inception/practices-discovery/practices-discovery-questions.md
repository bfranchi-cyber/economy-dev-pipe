# Practices Discovery Questions

Greenfield, single developer. Suggested answers come from the drafts in `team-practices.md`; your answers decide.

## Q1. [Developer] How do you want to use git branches?
Context: decides the Way of Working section and how Construction merges finished work.

A. One `main` branch; each piece of work on a short-lived branch, squash-merged into `main` (Recommended)
B. Commit straight to `main`, no branches
C. A long-lived `develop` branch plus feature branches
X. Other (please specify)

[Answer]: C

## Q2. [Developer] Build a thin end-to-end slice first? A walking skeleton is a minimal version that runs the whole way through, built first to prove the pieces connect before the real features go in.
Context: decides whether the first unit is the smallest working slice (MCP server plus CLI running one stage end to end) before the rest.

A. Yes, build the thin slice first (Recommended)
B. No, build unit by unit in plan order
X. Other (please specify)

[Answer]: A

## Q3. [Quality] When do you write tests relative to the code?
Context: becomes the Methodology and Ordering fields that Code Generation follows. The spine already fixes Vitest and one test per graph row.

A. Test-first (red, green, refactor) for every unit (Recommended, ub-mode's TDD)
B. Test-after: implement a layer, then write and run its tests (the framework default)
C. Mixed: test-first for the pure engine, test-after for the rest
X. Other (please specify)

[Answer]: A

## Q4. [Quality] What coverage bar should Build and Test enforce?
Context: the floor can't be relaxed later just to make a step pass.

A. ub-mode's gates: CRAP score under 10 per function, duplication below 0.8 similarity, and mutation testing to kill surviving mutants (Recommended; needs TypeScript-capable tools, which I have not confirmed)
B. 80% line coverage, checked in CI
C. ub-mode's gates plus an 80% line-coverage floor
X. Other (please specify)

[Answer]: A

## Q5. [Operations] How should the project's own CI and releases work?
Context: the product is a local tool with no hosted environment, so this covers only checks on the repository itself.

A. GitHub Actions runs type-check and Vitest on push and pull request, and a failure blocks merge; releases are tags on `main` (Recommended)
B. GitHub Actions runs the same checks but never blocks merge
C. No CI; run checks locally before merging
X. Other (please specify)

[Answer]: A

## Q6. [Developer] Which formatter and linter should the repo use?
Context: the spine doesn't name one, and agents defer to the repo's own config for style.

A. Prettier plus ESLint (with typescript-eslint)
B. Biome for both
C. Only the TypeScript compiler's checks, no separate formatter or linter
X. Other (please specify)

[Answer]: A

## Q7. [Developer] Are there hard rules every stage must always or never follow?
Context: these become `ALWAYS ...` / `NEVER ...` rules that stay in the project's rules. The code-phase rules already forbid hardcoded secrets.

A. Yes, make ub-mode's practices hard rules: always test-first, always small ordered commits, never leave dead code or duplicated structure behind
B. None beyond the existing rules
C. Yes, I'll write my own
X. Other (please specify)

[Answer]: A
