# 2026-10-16: README presentation (archived 2026-10-16)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## README presentation (2026-10-16)

Integrated through PR #123.
[0054](../../product/features/0054-readme-presentation.md) on
`docs/readme-presentation`: the README gains the logo, badges, a framed History
hero, a two-image gallery and current-only content. `npm run readme:logo:check`
(with a mutation probe) keeps the logo in step with the brand files;
`npm run readme:screenshots` retakes the screenshots from the mock, whose
Character Event history now spans a year with a realistic newest month (its
mock tests went red, then green). The e2e smoke test passes 12/12 offline with
the new dates. Previewed through GitHub's Markdown API in both themes. The
staged `npm run check` passes: static, gates at 100% coverage, and 16 probes.

## Release docs housekeeping (2026-10-16)

Integrated through PR #124.
`docs/release-docs-housekeeping`: 0054 done; 0039's release docs task rewritten to what the README delivered and ticked; the Releasing guide says when to write notes and to keep them unwrapped; staged check passes (static 17 s, gates 236 s, probes 161 s).

## Release notes without a heading (2026-10-16)

Integrated through PR #125.
`feat/release-notes-without-heading`: the notes no longer open with "Astral Index" and the tag, as the release's title shows the version (4 release-notes tests red, then green); 1.0.0's draft was edited to match before it was published. Staged check passes (static 15 s, gates 238 s, probes 159 s).

## Migration fixture (2026-10-16)

Integrated through PR #126.
`test/migration-fixture`: 1.0.0's database, written once by its `Store` from synthetic history, is frozen in `src-tauri/tests/fixtures/storage/`; `released_databases.rs` pins its SHA-256, reads a copy back and imports into it (4 tests red while it was missing, then green). Staged check passes (static 18 s, gates 244 s, probes 162 s). 0039 and milestone 10 are done; the `v*` tag rulesets and the repository's description, topics and social preview are set.

## Milestone 11 requirements (2026-10-16)

Integrated through PR #127.
`docs/milestone-11-requirements`: requirements for 0037 and 0030, new features 0055 (UIGF export), 0056 (Star Rail Station import) and 0057 (pool ID completion), both after 0034, decisions 0031 and 0032, and file research from a player's StarDB and Star Rail Station exports, inspected for structure only.
