# External Dependency Map: Agentflow MVP

A **Bolt** is one build pass over a piece of the work, ending in something that runs; the sequence is in `bolt-plan.md`. Everything below is outside the project's own code; the project is otherwise fully AI-contained.

## Sources

- [desc] Initial description: build Agentflow MVP from the existing PRD, addendum and architecture spine.
- [scope] Workflow-selected scope: express (custom plan `agentflow-mvp-build`).
- Units: `unit-of-work.md`, `unit-of-work-dependency.md`, `unit-of-work-story-map.md`. Practices: `team-practices.md`. Requirements: the PRD stands in for `requirements` (open questions OQ-1 to OQ-13). Components: the architecture spine stands in for `components`.
- [Q3] Platform assumptions are the biggest worry.

## Map

| Dependency | Owner | Lead time | Blocks | If it slips |
| --- | --- | --- | --- | --- |
| VS Code Copilot: elicitation prompts, auto-approve behavior (OQ-1, OQ-9, OQ-10) | Microsoft / GitHub | none (available now; unproven for this server) | B4, B8 | Use the always-confirm tool fallback; build the CLI code channel only if both fail |
| VS Code Copilot: subagent tool allowlists and pinned models (OQ-3, OQ-8) | Microsoft / GitHub | none (unproven) | B6, B7 | Rely on attribution and the server-side tool check; run all Personas on the conversation's model |
| MCP tool-call duration limit (OQ-13) | Microsoft / GitHub | none (unproven) | B4, B6 | Add the pending/poll envelope variant |
| Organization policy on MCP servers, skills, custom agents (OQ-11) | Your organization | unknown | B1 onward | Stop and re-plan; every Bolt needs the MCP server to run |
| Jira Cloud API (read, transition, comment) and a scoped API token | Jira admin or you | token creation, same day | B5, B8 | Develop B5 against a fake Ticket source; the interface already isolates it |
| GitHub: push, pull requests, Actions, `GITHUB_TOKEN` | You | same day | B8 | Test against a throwaway repository first |
| Quality-gate tools (crapper, dryer, mutator from the ub-mode project) and typescript-eslint | Third-party open source | none | B1 (gates) | Record the gap and run the gates that work |
| Model availability for the cheap, medium and high Tiers (OQ-4) | GitHub Copilot plan | none | B6 onward | Map Tiers to whatever models the plan offers |
