# 2026-11-25: UIGF writing and schema notices (archived 2026-11-25)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

### UIGF writing (2026-11-25)

Integrated through PR #170.

`feat/uigf-writing`: 0055's second task. `uigf::write` turns saved accounts into a UIGF v4.2 document, with no file access. Each account has its UID as text and its time zone, plus a language when every written record shares one UIGF lists; records keep their stored fields. It reports for each account the rolls written and those left out without a pool ID; an account without a time zone, or with a UID given twice, is left out whole (any repeat counts, even of an account without a time zone). Red: the four new tests failed on a stub; green: all 15 uigf tests, with `uigf.rs` at 100% coverage. The tests check every output against the pinned schema and read it back with `uigf::read`. From review: each record takes the account's UID, so a roll holding another can't make the account unreadable (red first).

### Schema notices (2026-11-25)

Integrated through PR #171.

`feat/schema-notices`: 0055's third task, split from the validated export. UIGF's schema and its MIT licence move from the test fixtures to `src-tauri/schemas/uigf/`, with their provenance beside them, and the third-party notices gain bundled data files, listing the schema with its licence and pinned source; the About dialog shows them as Data Files. Red: the notices builder's four tests that expected the schema failed, and so did the About list's grouping test; green: all tooling and frontend tests, with `tooling/notices.ts` at 100% coverage. `npm run notices` lists the schema. From review: the gate fails when a folder in `src-tauri/schemas/` is not listed or its README does not name the linked commit (both probed), and the kind lists are records, so a new kind cannot be left unsorted or unshown.
