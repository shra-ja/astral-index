

## Rarity filters (2026-10-06)

Integrated through PR #76. Feature 0032's third task, on `feat/rarity-filters`.
`history_page` takes the rarities shown; rolls are numbered across the whole category before filtering,
so hidden ones leave gaps, and a new `matched` count drives paging while the
tabs and strip still count everything. The rolls panel gains a toolbar with
5★, 4★ and 3★ toggles, kept across categories and accounts, and a "No rolls
match these filters" state. A filtered page of 20,000 rolls took about 38 ms, so
no rarity index was added.

Evidence: the client, composable, component and app tests failed first (no
rarities sent or kept, no component, no filters in the view), then passed. The
storage and command tests were written before the code but not run red first;
binding every rarity as shown, or counting every rarity as matched, makes them
fail. The real-SQLite test checks numbering and paging under filters, and the
end-to-end test filters the mock's history to its 143 5★ and 4★ rolls.
The first staged check found two Rust error paths unreached: a damage test's
two-column row made the fake database panic before the page read failed, and a
malformed `rarities` argument was untested. Both are now covered; the staged
`npm run check` and offline tests pass, and a release `.deb` builds cleanly.
