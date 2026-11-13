# PRD polish — change log (2026-11-13)

Standard: `skill:bmad-review lenses=structure,prose` (structure first, then prose on the result; reader type: LLM/code-generation). Backup: `.prd-pre-polish.md`.

**Word count:** 12,438 → 11,764 (−674, −5.4%).

Integrity checks after the edits: 51 FR headings, 10 NFR, 9 SM, 13 OQ IDs, 13 `[ASSUMPTION` tags, all unchanged. The set of backticked tokens is identical before and after. The §12 index needed no change because no tags were added or removed.

## Structure (cut / merge / condense)

- **FR-46 table merged into FR-4.** The per-Gate approve/edit/reject table repeated the Gate rows of FR-4. Its two extra details went into FR-4: the `escalation` edit becomes a "fresh cheap Run with the note as guidance", and `push` approve becomes "push and PR (FR-26) → `ci`". FR-46 now points to FR-4 and FR-45 and keeps its own testable rules (`stopped`, `skipped`, Jira, Gate Records).
- **§4.0 "Main loop-backs" list cut.** Every bullet was already an edge in FR-4. The intro now says FR-4 lists every edge, including the loop-backs. The ASCII diagram is kept as a visual aid.
- **Glossary de-duplicated against the FRs.** Gate Record fields now point to FR-8, Wait Reason values to FR-6, Ask Human reasons and options to FR-45, and Walkthrough contents to FR-26. The AI-DLC "park" aside is gone; it is covered in §6.
- **§8.1 In Scope condensed.** The 12-bullet restatement of §4 is now one line: all of §4.1–4.13 and §5, with parallel execution (§4.11) shipped last behind its flag.
- **Repeated "distilled from BMAD …; the skill itself is not invoked" sentences removed** from §4.4, FR-26, FR-29 and FR-37. §1 now points to §6, which holds the lineage.
- **FR-17:** merged the two "no push outside the `push` Gate" bullets into one.
- **FR-3:** removed the sentence about the Jira status that repeated its own consequence.
- **FR-43:** removed the "added during finalize" note, which repeated §0.
- **Feature descriptions condensed:** §4.1, 4.2, 4.3, 4.6, 4.7, 4.9, 4.10, 4.11, 4.12 and 4.13 had restated their own FRs. The §4.2 aside "replaces AI-DLC's hook engine" was removed; §6 and NFR-2 cover it.
- **§8.2:** "Trivial fixes" removed; §2.2 already lists it.
- **§0 and §1** tightened; the "Risks are in §10" pointer was removed.
- Minor tightening: FR-9 `spec` Gate (now points to FR-12 for the options), FR-27 (notification clause now points to FR-49), FR-29 (cross-reference to FR-10 reworded), OQ-6, the §6 intro.

## Prose

- "Phase" used alone now reads "Goal Phase" (FR-7 counter scope and reset, FR-19).
- "push Gate" now reads "`push` Gate" (FR-10, FR-26, Walkthrough glossary entry).
- "senior base prompt" now reads "senior-engineer base prompt" (FR-25).
- "medium Synthesizer" now reads "medium-Tier Synthesizer" (§4.8).
- FR-48: "the key or its path contents" now reads "the key file's contents".
- FR-28: "The Spec must match…" now reads "The reused Spec must match…".

## Deliberately kept

- The UJ-1 narrative, the §4.0 table and diagram, the §6 lineage table, and the model-use list in §1 alongside NFR-1. These are overview or reinforcement, not true duplicates.
- Glossary entries that define a term before first use, even where an FR repeats the detail.
- Every testable consequence, including short cross-reference restatements such as FR-5's "Every transition appends one Memlog entry" next to FR-34.
- "Realizes UJ-1" lines, kept for traceability.
