# Evidence

## Sources inspected

- `aidlc/spaces/default/memory/org.md`: five matching sections read as suggested defaults (greenfield), not team facts.
- `aidlc/spaces/default/memory/team.md`, `project.md`, `phases/inception.md`: team and project sections empty; no affirmed baseline.
- `_bmad-output/planning-artifacts/architecture/architecture-develop-pipeline-2026-11-13/ARCHITECTURE-SPINE.md`: Consistency Conventions (naming, errors, config, tests) and Stack (Node 26 LTS, TypeScript 7.0.2, Vitest 5.1.0, git >= 2.40).
- `_bmad-output/planning-artifacts/prds/prd-develop-pipeline-2026-11-12/prd.md`: product non-goals (no deployment, no auto-merge) and product-level test-first flow.
- Environment: Windows 11, git and GitHub; the workspace is not a git repository (hence `at commit no-git`).
- ub-mode (https://github.com/unclebob/ub-mode): the person chose "Adopt its practices". Its SKILL.md could not be fetched, so only the practices the person stated are recorded.

## Stated versus inferred

- Stated by the architecture spine: Vitest, kebab-case file names, TypeScript, Node 26 LTS, fakes policy for tests, error handling convention, GitHub Actions for CI.
- Stated by the person at interview: everything in the decisions below.
- Inferred: no deployment environments (product is a local tool, PRD non-goal).

## Interview decisions

- Q1: C, a long-lived `develop` branch plus feature branches.
- Q2: A, build a thin end-to-end slice first.
- Q3: A, test-first (red, green, refactor) for every unit.
- Q4: A, ub-mode's gates: CRAP under 10 per function, duplication below 0.8 similarity, mutation testing; no separate line-coverage floor.
- Q5: A, GitHub Actions runs type-check and Vitest on push and PR, failure blocks merge; releases are tags on `main`.
- Q6: A, Prettier plus ESLint with typescript-eslint.
- Q7: A, hard rules: always test-first, always small ordered commits, never leave dead code or duplicated structure behind.

## Unresolved uncertainty

- UNRESOLVED: the ub-mode companion tools crapper, dryer and mutator (unclebob/crapper, dryer, mutator) have NOT been confirmed to support TypeScript. The CRAP, duplication and mutation gates in Testing Posture depend on TypeScript-capable tooling; Build and Test may need an alternative tool, to be decided with the person.
- Assumption: how `develop` merges into `main` (merge style, release cadence) is not specified; the working assumption is that releases merge `develop` into `main` and are tagged on `main`.
- Conflict with a framework default: `org.md` makes Construction worktrees default to trunk-based development with base and target `main`. The person's `develop` choice overrides this for this project, so Construction worktree base and target should be `develop`; this is for the orchestrator and Construction to apply.
- typescript-eslint compatibility with TypeScript 7 is not verified; check when configuring.
