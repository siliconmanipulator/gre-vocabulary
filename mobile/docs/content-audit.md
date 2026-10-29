# Content audit — 2026-10-25

Inputs are byte-for-byte copies of ../vocab.md and ../qn.md. Neither original is modified. Only the Markdown files are parsed; companion JSON/PDFs are not content inputs.

## Vocabulary

The actual schema has 959 canonical word records, 277 meaning families, and 32 original source groups. Families explicitly warn that their members are not all interchangeable synonyms. There is no root/synonym field to invent. Each listed word is imported independently with its own meaning, Bengali, mnemonic, progress, history, and due date. Family relationships and source record order remain attached.

The ordered family lists contain 977 references: 700 additional members after each first member. Repeated references to the same explicit canonical ID are relationship links, not additional source records. 18 repeated references are retained as associations and do not inflate the 959 items. The source already consolidates the repeated original entry `cumbersome` across G11/G22; both associations remain.

Schedule: 22 days, 64 blocks. Full days contain 45 items, each divided into 15/15/15; final day has 14 items. Order is first occurrence in the supplied family order, then any unreferenced word records in their original order. No padding.

Missing original Markdown fields: {"meaning": 0, "bengali": 0, "mnemonic": 0, "example": 959, "families": 0, "explicitSynonymField": 959}. Original example fields remain absent; ETS enrichment and the user's subsequently authorized generated practice examples are tracked separately. Five correction notes are preserved verbatim. Exact/case-folded term collisions: {}. Malformed or unresolved IDs: 0 (strict import assertions). Unreferenced records: [].

## Official practice

354 questions: {"TC": 121, "Legacy TC": 104, "SE": 129}. Keys: 354; missing keys: 0. Source explanations: 251; missing: 103. Q032's supplied discrepancy note is preserved. Stems, choices, key lines, explanations, source references, and complete raw record slices are bundled without paraphrase.

Mapping uses ONLY each question's explicit **Verified vocabulary** links, including source-provided inflections. A question may appear on more than one day when its verified answers span days. No fuzzy matching. Unmapped questions: [].

| Day | Items | Blocks | Mapped questions |
|---|---:|---:|---:|
| 1 | 45 | 3 | 21 |
| 2 | 45 | 3 | 26 |
| 3 | 45 | 3 | 20 |
| 4 | 45 | 3 | 24 |
| 5 | 45 | 3 | 15 |
| 6 | 45 | 3 | 11 |
| 7 | 45 | 3 | 13 |
| 8 | 45 | 3 | 11 |
| 9 | 45 | 3 | 13 |
| 10 | 45 | 3 | 17 |
| 11 | 45 | 3 | 20 |
| 12 | 45 | 3 | 21 |
| 13 | 45 | 3 | 34 |
| 14 | 45 | 3 | 18 |
| 15 | 45 | 3 | 26 |
| 16 | 45 | 3 | 21 |
| 17 | 45 | 3 | 17 |
| 18 | 45 | 3 | 11 |
| 19 | 45 | 3 | 11 |
| 20 | 45 | 3 | 20 |
| 21 | 45 | 3 | 15 |
| 22 | 14 | 1 | 5 |

Full question IDs per day, repeated family reference IDs and SHA256 fingerprints are in `audit.json`. All canonical records and questions are accounted for.

## Annotation revisions

Native TC counts by number of blanks: {'1': 38, '3': 25, '2': 58}. These questions were already present; format filters and per-blank choices make them visible. Legacy pairs remain one selected pair for two blanks; SE remains two selections for one blank.

Example coverage: 346 words have ETS contexts; 613 previously uncovered words now have an explicitly labeled generated practice example, authorized by the user's 2026-10-26 annotation. Total coverage: 959 / 959. Source meanings and original question/Markdown text remain unchanged. See `examples-audit.md` and `generated-examples-audit.md`.
