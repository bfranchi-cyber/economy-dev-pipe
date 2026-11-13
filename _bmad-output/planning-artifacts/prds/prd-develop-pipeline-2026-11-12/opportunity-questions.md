# Opportunity Questions: MVP plan × AI-DLC × BMAD

Source: `agentic-workflow-mvp.md` v5. AI-DLC and BMAD references point to what is **installed in this repo** (`.claude/`, `_bmad/`). The v5 doc relied on general knowledge, so these questions replace that with concrete mechanisms.

Format per theme: **MVP element** → **AI-DLC counterpart** → **BMAD counterpart**, then questions.

---

## Q0. Build, adopt or wrap (the meta question)

- **MVP:** custom TS MCP server, `conductor` agent, state tool, generated `.agent.md` files.
- **AI-DLC:** already ships a GitHub Copilot harness (`AGENTS.md`, skills under `.github/skills/`), an engine CLI (`aidlc engine orchestrate next|report|park`), hooks and sensors.
- **BMAD:** skills packaged as portable `SKILL.md` folders; `bmad-build` / `bmad-build-auto` already run a dev loop.

1. Is the goal to **build a new pipeline** that borrows ideas, to **extend AI-DLC** with a Jira/CI "ticket scope", or to **run BMAD skills inside an AI-DLC lifecycle**? This decides most of the PRD.
R1: Run BMAD skills inside a personalized AI-DLC lifecycle that is focused on token economy and deterministic pipelines. Uses AI only in MUST use scenario like coding. 
2. Should the MVP's `state_get`/`state_advance` wrap the existing `aidlc engine orchestrate` engine instead of reimplementing ordering logic? 
R2: We could borrow central parts of the aidlc usage. I feel like it cost too much token-wise tho.
3. Does your org policy allow the AI-DLC binary and hooks on Copilot machines? If not, which parts must be ported into your MCP server?
R3: Do not allow hooks unfortunatelly.
## Q1. Orchestration and state

- **MVP:** cheap `conductor` with logic held in `state.yml`; steps 1-10.
- **AI-DLC:** compiled `stage-graph.json` (33 stages across 5 phases), `aidlc-state.md`, a state-transition guard hook, `park`/`continue`, session resumption.
- **BMAD:** `bmad-sprint-planning` sprint-status file; `bmad-build-auto` as one iteration of an unattended loop.

4. Should the ten MVP steps be modelled as a **custom AI-DLC scope** (a new `scopes/aidlc-ticket.md`, compiled into the stage graph), so ordering, resume and guards come for free?
R4: yes, i feel like we could also integrate obsidian and future RAG or graphRAG search. Still i would like to review the aidlc workflow for token usage.
5. Is `state.yml` per ticket the same concept as an AI-DLC **intent record** (`intents/<YYMMDD>-<label>/`)? Is one Jira ticket one intent?
R5: yes, 1:1
6. Do you want BMAD's sprint-status view across many tickets (a board), or is one ticket at a time enough for the MVP?
R5: one ticket for the first mvp, sprint status view would be great for a second iteration
7. Which `park` reasons should map to `needs_human` (gate wait, CI wait, escalation pending)?
R7: point to mee what is a park reason and where it sits on the mvp. Needs human is on steps 2 and 3 for passing to the next. Step 7 also for commiting. If patching human gates are the same.

## Q2. Human gates

- **MVP:** gates at 2 (requirements), 3 (plan) and 7 (commit), with no approval on patch plans.
- **AI-DLC:** plan-approval guard, **review freeze** (re-approval when approved files change), summary confirmation, human-presence guard, Guard Policy `strict|relaxed|off`, autonomy choice (`gated` vs `autonomous` Construction).
- **BMAD:** Reviewer Gate menu (all, subset or skip); `bmad-walkthrough` for human review of a change.

8. Should requirements.md and plan.md be **frozen on approval**, so a later agent edit forces re-approval? Or would that fight the "no approval for patch plans" rule?
R8: Approval for generating code after generating patch plans. On patch the initial requirements document should be reused, since requirements shouldnt change to fix a bad implementation.
9. Is "no patch-plan approval" the same as AI-DLC's **autonomous** Construction mode? Should it be a recorded per-ticket choice rather than hard-coded?
R9: NO, it is only skipping requirements, runing from 3-7 after a gate approving the patch plan.

10. At gate 7, would a `bmad-walkthrough` summary (purpose, what to look at, how to test) make the human commit approval faster?
R10: Yes. Commits should happen granullarly and this should be mapped inside the handoff, the last task of a developer sub-agent should using the commit tool. Approval gate is only for pushing. 
11. Should the human-presence check apply, so a gate can't be approved by an agent turn?
R11: Yes but i fear that this would generate errors without hooks.

## Q3. Requirements and plan artifacts

- **MVP:** `intake` writes requirements.md with numbered ACs; `planner` writes goals and scenarios tagged `new|change|existing`, with `depends_on` and `parallel_group`.
- **AI-DLC:** requirements-analysis, user-stories (inception rules **mandate Given/When/Then**), units-generation (Unit DAG with `depends_on`), delivery-planning (Bolts), practices-discovery.
- **BMAD:** `bmad-spec` (condense to SPEC.md and break into stories), `bmad-create-epics-and-stories`, story files with acceptance criteria.

12. Your scenarios already read as Given/When/Then. Should AC and scenario text be **required** in that format, so AI-DLC's inception rule applies and tests derive from it mechanically?
R12:yes
13. Are MVP **goals** the same as AI-DLC **Units**, and are `plan_schedule` waves the same as **Bolts**? If so, reuse that vocabulary in the PRD glossary.
R13: Goals are the first order of granularity from the final deliver, bellow them should be smaller checklist implementation items that are the logical foundation for test scenarios.

14. Should `intake` work like `bmad-spec` (condense the Jira ticket, comments and links into one spec) instead of a freeform requirements doc?
Exactly
15. Is there a step where large tickets get split (epic → stories) before intake, or is that out of scope because Jira already holds stories?
Out of scope for now
16. Should **practices-discovery** run once per repo to fill `team.md` (testing posture, code style), so every ticket inherits it instead of the prompts restating it?
Out of scope

## Q4. Traceability, sensors and validation

- **MVP:** `trace_matrix` (AC → goal → scenario → test → result), a `validator` agent, `[verify]` items.
- **AI-DLC sensors:** `traceability`, `upstream-coverage`, `claim-sources` (separates assumptions from sourced claims), `required-sections`. They are deterministic, fire on write or at gates, and can block.
- **BMAD:** `bmad-review` lenses (adversarial, edge cases, verification gaps); `bmad-code-review` with parallel independent reviewers; the PRD validation rubric.

17. Should `trace_matrix` be an **AI-DLC-style blocking sensor** at gate 7, so missing AC coverage stops the commit before any model is called?
Yes, it should be an indicator of re-iterating steps 5 and 6 or not
18. Should the validator's checks for vacuous tests and out-of-scope changes use BMAD's **verification-gaps** and **edge-case** lenses as its prompt basis?
No, this is a job for the plan creation.
19. Is one medium validator enough, or do you want BMAD-style **parallel independent reviewers** (cheap, different lenses) with a triage step? What does that cost in premium requests?
Maybe cheap parallel independent would be better and a medium to synthesize after they finish. For this would be necessary to ensure that the size of verification is suitable for the models context window. probabbly haiku 5.5 or luna-6.
20. Should `claim-sources` apply to requirements.md so every inferred AC is tagged `[assumption]` and confirmed at gate 2?
Yes

## Q5. Checks as a tool

- **MVP:** `run_checks` returns failures only, with no model call when clean.
- **AI-DLC:** `linter` and `type-check` sensors run on matching writes.
- **BMAD:** `bmad-build` verifies before it reports done.

21. Should lint and types run **per write** (an AI-DLC sensor, fast feedback to the implementer) as well as once at step 5, or only at step 5 to save time?
No, per goal, automatically after an implementer agent outputs that it is finished. maybe an deterministic obligation for the implementer and refactorer agent to output 0,1, or 2 being two the automatic model escalation that should be gate approved by human.
22. Should the trimmed-failure output format be one shared schema used by checks, tests, CI and sensors?
Yes, maybe CI sensors will have different output than regular tests and checks.

## Q6. Personas, tiers and escalation

- **MVP:** `_senior-base.md` plus role prompts, generated agents, `personas.yml` tiers, one `escalation` agent with a structured handoff.
- **AI-DLC:** 14 agents with per-agent `knowledge/` folders, `aidlc config models --agent --model/--effort`, review-only agents (architecture-reviewer, product-lead).
- **BMAD:** named personas (Amelia dev, Winston architect, John PM), `bmad-customize` TOML overrides (team and user layers), `bmad-agent-builder`, `bmad-party-mode`.

23. Should persona tiers be set through a config command like AI-DLC's `config models` (with project and local layers) instead of hand-editing `personas.yml`?
yep
24. Should prompts be **customizable in layers** like BMAD (base ships, team override, personal override), so teams adjust personas without forking?
out of scope but high value
25. Should escalation go to a **review-only** agent first (a cheap second opinion, like architecture-reviewer) before the high tier?
I dont see why. iterations should be fresh context so naturally a second opinion, maybe even switching from haiku to luna.
26. Does each persona need its own knowledge folder (repo conventions, domain glossary), or is one shared bundle enough for the MVP?
Shared bundle enough.
27. Is `bmad-party-mode` useful for `spec_conflict` escalations (several personas debate, human decides), or is that too costly?
Too costly i fear

## Q7. Memory, learning and audit

- **MVP:** handoff files, counters, metrics, escalation log.
- **AI-DLC:** audit shards, a per-stage `memory.md` diary, a **learnings ritual** that writes corrections into `team.md`/`project.md`, and the `session-cost`, `replay` and `outcomes-pack` skills.
- **BMAD:** append-only `.memlog.md`, `bmad-retrospective` (evidence-based), `bmad-project-context` (records agent **pitfalls** in AGENTS.md), `bmad-correct-course`.

28. When a gate-2 or gate-3 human edit corrects an agent, should it be captured as a **learning** (AI-DLC) or a **pitfall** (BMAD) so the next ticket doesn't repeat it? Is that in MVP scope?
Learning and pitfall are kind of the same, maybe a doc for user preferences and other for known pitfalls. Valuable.
29. Should each ticket get a BMAD-style **memlog** (decisions with reasons) that the validator and escalation agent can read, instead of transcripts?
Yes
30. Is a **per-ticket retrospective** (a Jira comment with iterations, escalations and cost) worth automating at step 10, or should it be weekly across tickets?
nope, this can be done locally instead. valuable for future eval
31. Should your metrics reuse the AI-DLC `runtime summary` counts, or come from your own `state.yml` counters?
reuse part, but personalize

## Q8. Right-sizing per ticket

- **MVP:** one pipeline shape for every ticket.
- **AI-DLC:** scopes (`bugfix`, `feature`, `express`, `refactor`, `security-patch`, ...), the **composer agent** (scores ambiguity and risk, then composes the minimum workflow), `--depth`, `--test-strategy`.
- **BMAD:** `bmad-build` for small changes vs. the full planning chain.

32. Should a typo fix and a new feature go through the same ten steps? Should the Jira issue type or a label pick a **scope** that skips the planner or the validator?
Out of scope for now. Trivial fixes shouldnt go through the pipeline. this is more like a history resolution pipe.
33. Is a cheap **composer-style triage** at step 1 (rating ambiguity and risk, then choosing a path) worth one model call per ticket?
Out of scope but valuable for second mvp
34. Should AI-DLC's per-scope **test floors** (for example a regression test required for bugfix) become rules the validator enforces?
out of scope

## Q9. Parallel work

- **MVP:** `plan_schedule` waves, disjoint file sets, worktrees later.
- **AI-DLC:** `aidlc-swarm` referees parallel Construction, `team-board`, per-Bolt **worktrees squash-merged** to trunk.

35. Should the "worktrees later" step adopt AI-DLC's Bolt worktree and squash-merge model directly?
The desired workflow for parallel agents is having a shared memlog and delayed launches of subagents so they can see the first output in the memlog from the previous ones. although having shared memlog they should have isolated terminals.
36. Is a swarm referee (detecting file conflicts at runtime) needed, or is the static `files` overlap check enough?
Should have a final synthesizer for conflicts and coherence.

## Q10. CI failure loop

- **MVP:** CI fails → patch plan → steps 4-8, with no approval and `patch_loops` counted.
- **AI-DLC:** revision backstop guard, feedback-optimization stage.
- **BMAD:** `bmad-correct-course` (assess impact across artifacts, then propose a change).

37. When CI fails because the **requirements or plan were wrong** (not the code), should the loop switch to a correct-course step that updates requirements.md and plan.md and re-opens gate 2 or 3? Only if human approved.
38. What should make the patch loop stop on its own: an AI-DLC-style revision backstop, or only the agent's own `ask_human` judgment as v5 says (no caps)?
stop before generating code, wait on user input

## Q11. Testing posture

- **MVP:** strict TDD with triage of Red-step anomalies.
- **AI-DLC:** Testing Posture in `team.md` with `Methodology` and `Ordering` fields; org default is test-after.
- **BMAD:** `bmad-qa-generate-e2e-tests`.

39. Should TDD be recorded as the team's affirmed posture (`Methodology: TDD`, `Ordering: red-green-refactor`), so any AI-DLC stage you reuse follows it?
TDD only, team customization out of scope for now
40. Are E2E/API tests in scope for the MVP (a BMAD QA step after validation), or unit and integration tests only?
no

## Q12. Host and portability

41. Copilot is the host today. Should the PRD require the workflow to stay **harness-portable** (AI-DLC supports Claude, Codex, Cursor, Kiro and Copilot; BMAD skills are plain `SKILL.md`), or is Copilot-only acceptable?
COPILOT ONLY
42. Should repo onboarding use `bmad-project-context` (an AGENTS.md block) so agents start each ticket with stable repo knowledge?
sounds great