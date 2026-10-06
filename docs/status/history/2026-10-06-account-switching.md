

## Pity column (2026-10-06)

Integrated through PR #80. Feature 0035's first task, on `feat/pity-column`.
Decision 0019 records the user's choices: pity is counted on read, in the page
read's ordered pass before filters, as a 5★ count on every roll (rolls since the
previous 5★, counting itself), shown as plain numbers even where older rolls may
be missing. The list gains a Pity column after Item, with 5★ counts emphasised.

Evidence: the storage, roll list and app tests failed first (no `pity` field or
column), then passed; real-SQLite tests check counts and that filters don't
change them. The end-to-end test checks every row's pity follows from the roll
before it in the mock's history.
The staged `npm run check` and offline tests pass on the first run, and a
release `.deb` builds cleanly.
