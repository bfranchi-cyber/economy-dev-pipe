# Team-Level Rules

> This team's affirmed practices and corrections. Loaded after `org.md` as
> strict-additive guidance; contradictions with broader policy are rejected.
> Populated by the practices-discovery affirmation gate. Edit at the gate,
> not directly.

## Way of Working

- We keep a long-lived `develop` branch and do each piece of work on a feature branch that merges back into `develop`.
- Releases merge `develop` into `main`, and the release is tagged on `main`. This is the working assumption: the person chose the `develop` model and tags on `main`; the exact merge style is not specified.
- We are a solo developer on Windows 11 with git and GitHub; no peer review is required before merge.
- Commits go on the branch currently checked out; we make a branch only when asked or when this practice says so.
- We make small, ordered commits.

## Walking Skeleton

- We build a thin end-to-end slice first: a minimal MCP server process plus CLI that runs the whole way through before the real features go in.
- The skeleton is verified with the human-authorized Construction Verification Command, then approved at the skeleton checkpoint.

## Testing Posture

- **Methodology**: tdd
- **Ordering**: For every unit, write the failing test first, make it pass, then refactor.
- **Methodology evidence**: The person chose test-first (red, green, refactor) for every unit, following ub-mode's practices (https://github.com/unclebob/ub-mode).
- Quality gates are ub-mode's: CRAP score under 10 per function; structural duplication below 0.8 similarity; mutation testing to kill surviving mutants. There is no separate line-coverage floor.
- Runner is Vitest; the `engine` is tested without fakes, and fakes are used only for `git`, `remote`, `run`, `store`, and the clock/id source.
- One test per graph row, named by its row id.

## Guard Policy

<!-- Affirmed by the team. Mode: strict, relaxed, or off. Strict here holds for every intent, whatever one person asks in chat; relaxed or off here applies to every intent whose policy came from its scope, unless project.md or the person sets another; changing this line changes it. A section under the retired Change Control heading, written by an earlier release, is still read. -->

## Deployment

- No hosted environments: the product is a local tool (MCP server over stdio plus CLI) run on the developer's machine.
- GitHub Actions runs type-check and Vitest on push and pull request, and a failure blocks merge.
- Releases are tags on `main`; there are no staging or production environments.

## Code Style

- Formatter is Prettier; linter is ESLint with typescript-eslint. We defer to the repo-root configuration, and check TypeScript 7 compatibility of typescript-eslint when configuring it.
- Files are `kebab-case.ts`; types are `PascalCase`; tool names are `snake_case`; ids and statuses follow the architecture spine's Consistency Conventions.
- TypeScript 7.0.2 on Node.js 26 LTS; no `catch` that swallows errors; Zod-validated config; ISO 8601 UTC timestamps.
- Type-check (`tsc --noEmit`) runs in CI and blocks merge.
## Forbidden

<!-- Team-specific forbidden patterns -->

## Mandated

<!-- Team-specific mandates -->

## Corrections

<!-- Self-learning loop appends here. -->
