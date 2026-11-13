# BMAD Amelia vs. AIDLC Developer Agent

Both agents are copied here **unmodified** and kept separate. Nothing was merged or rewritten.
Paths inside each folder mirror their original location in the project, so internal references
(`.claude/skills/...`, `_bmad/scripts/...`, `.claude/knowledge/...`) still resolve if a folder is used as a project root.

## Layout

```
agents/
├── COMPARISON.md                     (this file)
├── bmad/                             BMAD developer: Amelia
│   ├── .claude/skills/
│   │   ├── bmad-agent-dev/           the agent (SKILL.md + customize.toml: persona, principles, menu)
│   │   ├── bmad-build/               BD: clarify -> plan -> implement -> review -> present
│   │   └── bmad-code-review/         CR: gather context -> parallel review -> triage -> present
│   └── _bmad/
│       ├── scripts/                  resolve_customization.py, resolve_config.py, config_utils.py, render_skill.py
│       ├── config.toml, config.user.toml
│       └── custom/                   team/user override files
└── aidlc/                            AIDLC developer: Developer Agent
    ├── .claude/agents/aidlc-developer-agent.md        the agent
    ├── .claude/knowledge/
    │   ├── aidlc-developer-agent/    api-design, code-analysis, code-generation (+patterns), data-modelling, re-artifacts
    │   └── aidlc-shared/             adding-a-repo, ai-dlc-principles, brownfield, rules-reading, verification
    ├── .claude/skills/               stage runners: aidlc-code-generation, aidlc-contract-design, aidlc-infrastructure-design
    └── aidlc/active-memory/          org.md, team.md, project.md, phases/construction.md  (the rules the agent reads)
```

## Scope decisions applied

- Sources: only the two developer agents.
- Capabilities kept: core implementation, code review, and API / data model / IaC design.
- Left out: BMAD `bmad-qa-generate-e2e-tests`, `bmad-sprint-planning`, `bmad-retrospective` (Amelia's menu still lists them, so those three menu items will not resolve here), and the AIDLC operation/inception/ideation phase rules.
- Caveat: the AIDLC agent's knowledge preflight loads every file in `aidlc-developer-agent/`, so the reverse-engineering guides (`code-analysis-guide.md`, `re-artifacts.md`) were kept even though reverse engineering was not selected. The agent file itself still describes that responsibility.

## Architecture

| Aspect | BMAD Amelia | AIDLC Developer Agent |
|---|---|---|
| Form | Skill (`SKILL.md` + `customize.toml`) the user talks to directly | Subagent definition (frontmatter `.md`) dispatched by the `/aidlc` orchestrator |
| Invocation | User asks for Amelia; she stays in character until dismissed | Orchestrator delegates stages (Code Generation, Reverse Engineering, mob/hub-and-spoke collaborator). `disallowedTools: Task`, `model: inherit`; never calls other agents |
| Identity | Named persona: Amelia, Senior Software Engineer, icon, greeting by `user_name` | Unnamed role: "senior software developer" |
| Customization | 3-layer TOML merge: `customize.toml` -> `_bmad/custom/<skill>.toml` -> `.user.toml`. Fields: role, identity, communication_style, principles, persistent_facts, activation steps, menu | 5-layer rules chain: org -> team -> project -> phase -> stage (`aidlc/active-memory/*.md`), strict-additive; contradictions rejected |
| Capabilities | Menu of skills: BD build, QA, CR review, SP sprint plan, ER retrospective | Fixed responsibilities: code generation, reverse engineering, API & data design, build/quality |
| Workflow shape | Step files loaded one at a time (`step-01` ... `step-05`), halting at human checkpoints | Stage protocol run by the engine (`aidlc engine orchestrate next/continue/report`), with approval gates, sensors, and an audit log |
| Knowledge | Config (`project_knowledge`, `project-context.md`) | Mandatory preflight over `knowledge/aidlc-shared/` + `aidlc-developer-agent/` and the space-level equivalents |
| State | Spec file frontmatter, `sprint-status.yaml` | `aidlc-state.md`, audit shards, per-stage `memory.md` |
| Config scripts | Python via `uv` (`resolve_customization.py`, `resolve_config.py`) | Self-contained `aidlc` binary |
| Collaboration | Subagents inside bmad-build/code-review (parallel reviewers) | Receives from architect/quality; hands off to quality/architect; orchestrator mediates |

## Behavioural differences

| Topic | Amelia | AIDLC Developer |
|---|---|---|
| Voice | Ultra-succinct; speaks in file paths and AC IDs; every statement citable | No voice rule; neutral and professional |
| Testing method | Fixed: red, green, refactor. "No task complete without passing tests." | Not fixed. The brief's `## Testing Contract` is authoritative (TDD, BDD, ATDD, test-after, custom). Default in `org.md` is test-after; the agent must not re-resolve it and stops if the contract is absent or conflicts |
| Task order | Tasks executed in the sequence written | Per the stage protocol and Testing Contract |
| Test floor | Every task needs passing tests | At least a happy-path test per unit; edge cases when the spec calls for them; 80% line-coverage floor for most scopes (from `org.md`) |
| Refactor | Always part of the loop | Only when the Testing Contract includes a Refactor step; otherwise deferred |
| Philosophy | Production-ready, clean, minimal, free of AI noise | "Working code over perfect code", convention over configuration, explicit over clever, fail fast |
| Comments | Explain why, not what. Never epic/story/planning refs in source | "Inline documentation for non-obvious logic" (no ban on workflow refs) |
| Error handling | Not stated | Fail fast and loud; never swallow exceptions; validate at boundaries |
| Input spec | Approved stories, spec with Given/When/Then ACs, "Ready for Development" standard (actionable, logical, testable, complete) | Unit specifications, design patterns and API specs from the architect |
| Scope control | One user-facing goal per spec, 900-1600 tokens (proposal, overridable) | Units of work and Bolts, from the Unit DAG |
| Review | Dedicated code-review skill: parallel reviewers, edge-case hunter, verification-gap, triage | Reviewer passes by separate review agents; quality-agent tests the handoff |
| Repos | Single project root | Multi-repo: a repo the change will modify joins the work via `intent add-repo` |
| Extras unique to AIDLC | n/a | Reverse engineering, API contract and data-model design, DB migrations, IaC (CDK/CloudFormation), dependency/CVE parsing |
| Extras unique to BMAD | Sprint planning, epic retrospective, e2e test generation | n/a |

## Direct conflicts to resolve if these are ever combined

1. **Test ordering**: Amelia's strict TDD vs. the AIDLC Testing Contract (default test-after). Under AIDLC, the contract wins; under BMAD, TDD wins.
2. **Communication style**: Amelia's terse voice is persona-level; AIDLC places no constraint, so it would not conflict if one layer owns style.
3. **Comment policy**: Amelia forbids planning/story references in code; AIDLC leaves it open. Compatible if Amelia's rule is kept.
4. **Quality bar**: "Production-ready, minimal" vs. "working code over perfect code". Related but ordered differently.
5. **Config roots**: `_bmad/` TOML vs. `aidlc/active-memory/` Markdown rules. They don't overlap and would need a precedence rule if merged.

## Dependencies not copied

- AIDLC engine and stage definitions (the compiled `aidlc` runtime, `.claude/tools`, hooks, sensors). The stage runner skills here call `aidlc engine orchestrate ...`, which needs that runtime to execute.
- BMAD workflow snapshots rendered by `render_skill.py` (`[[bmad-snapshot:...]]` references in `bmad-build/workflow.md`) require that script; it is included.
- The `uv` tool, needed by the BMAD scripts, is not installed in this environment (the builder fell back to reading TOML directly).
