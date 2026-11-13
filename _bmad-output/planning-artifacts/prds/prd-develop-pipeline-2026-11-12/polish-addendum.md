# Polish log: addendum.md

Standard: `skill:bmad-review lenses=structure,prose`, run inline (the word-metrics script could not run because `uv` is not installed; counts are from `wc -w`). Backup: `.addendum-pre-polish.md`. `prd.md` was not edited.

**Word count:** 2,500 before, 2,470 after (-30, about 1%). The list conversions in §A and §I add line structure, so the net saving is small. The cuts removed text that restated the PRD.

## Structure changes
1. §C Token budgets: removed the restated NFR-10 targets (≤150 / ≤3K / ≤2K, bytes/4) and pointed to NFR-10. Kept only the AI-DLC measurements that are not in the PRD.
2. §C Remaining risk: removed "Nothing leaves the machine... without the push Gate", which repeats PRD §10, and pointed to that risk row.
3. §F: replaced the restated senior-base-prompt contents with pointers to FR-47 and FR-16.
4. §H: the ~150–250K figure now points to §C and the 3K budget points to NFR-10, so neither number is presented as a separate fact.
5. §I: removed the 9 items already listed in PRD §8.2 and pointed there. Kept the ideas found only here: signed run manifest, per-Goal worktrees, mutation checks on `existing` tests, and the retrieval-friendly note.
6. §A: turned the "Differences from v5" run-on sentence into a scannable list.

## Prose changes
- §A row 4: "each Run ends `commit_prepare` + `run_report`" became "ends with `commit_prepare` (on status 0) and `run_report`", which matches FR-15 and FR-17.
- §B: moved `[ASSUMPTION]` so it follows the Vitest/Jest parser sentence it tags. Before, it sat in front of the "plain TS" sentence. This placement matches the PRD Assumptions Index entry "Addendum B".
- §C: "Not adopted from the review" became "from the token review" to name which review is meant. "gates" became "Gates" (Glossary term).
- §H: "zero turns" became "zero Conductor turns"; "bundles fit the window" became "each Review Bundle fits the model's context window"; "its own bundle" became "its own Input Bundle"; "blow" became "exceed"; other small wording fixes.

No technical decisions, defaults, schemas, tool names, paths, YAML keys or FR references were changed.

## Contradictions with prd.md (flagged, not fixed)
1. **Triage granularity.** §A row 4 says "Per Goal: `red` Run → `test_triage` → `green`...". PRD §4.0 step 4, FR-4, FR-15 and FR-18 say the `red` Runs of every Goal in a Wave finish first, then one batched triage covers the whole Wave, and only then does each Goal run `green` → Checks → `refactor`.
2. **`memlog_append` tool.** §G Week 1 lists `memlog_append`, but the §B tool table has no such tool and gives Memlog appends to `state_get`/`state_advance`. The PRD never names it. This is internal to the addendum.
3. **Handoff id format.** The §E Handoff sketch uses `id: H-PROJ123-2`, but the PRD Glossary and §D use `handoffs/H-n.yml`. Minor.
4. **CI Ask Human trigger.** §A row 9 says `ask_human` "on no result". PRD §4.0 and FR-4 list cancelled, timed out, no run and max wait. The addendum's wording is looser but not strictly contradictory.
