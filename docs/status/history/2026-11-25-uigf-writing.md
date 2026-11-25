# 2026-11-25: UIGF writing (archived 2026-11-25)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

### UIGF writing (2026-11-25)

Integrated through PR #170.

`feat/uigf-writing`: 0055's second task. `uigf::write` turns saved accounts into a UIGF v4.2 document, with no file access. Each account has its UID as text and its time zone, plus a language when every written record shares one UIGF lists; records keep their stored fields. It reports for each account the rolls written and those left out without a pool ID; an account without a time zone, or with a UID given twice, is left out whole (any repeat counts, even of an account without a time zone). Red: the four new tests failed on a stub; green: all 15 uigf tests, with `uigf.rs` at 100% coverage. The tests check every output against the pinned schema and read it back with `uigf::read`. From review: each record takes the account's UID, so a roll holding another can't make the account unreadable (red first).
