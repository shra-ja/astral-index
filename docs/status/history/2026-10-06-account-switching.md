

## Item search (2026-10-06)

Integrated through PR #77. Feature 0032's fourth task, on `feat/item-search`.
`history_page` takes a `search` of up to 100 characters. SQLite folds case only
for ASCII, so the page read now makes one ordered pass in Rust: it summarises
and numbers the category, keeps the rarities and names shown (Unicode case
folding, trimmed), then reads only the page's payloads; the separate summary
query is gone. About 48 ms for 20,000 rolls. The toolbar's search box reads
again 250 ms after typing pauses (decision 0013, amended).

Evidence: the client, composable, component and app tests failed first (no
options or search, no component, no box in the view), then passed. The storage
and command tests were written first but could not compile against the old
signatures; making every name match fails three of them. Real-SQLite tests
match Cyrillic and accented names in any case, and the end-to-end test types
"acheron" to find the mock's six Acheron rolls.
The first staged check found the malformed `search` argument untested; it is
now covered. The staged `npm run check` and offline tests pass, and a release
`.deb` builds cleanly.
