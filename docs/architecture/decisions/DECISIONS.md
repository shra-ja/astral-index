# Architecture decisions

Add a numbered Markdown record when a consequential choice is made, for example
`0001-frontend-stack.md`. Keep proposals distinct from accepted decisions. Link
superseded decisions instead of rewriting their history.

Suggested record:

```markdown
# NNNN — Decision title

Date: YYYY-MM-DD
Status: Proposed | Accepted | Superseded by NNNN

## Context

What problem and constraints require a choice?

## Decision

What was chosen, and why?

## Alternatives and consequences

What tradeoffs, limitations, and follow-up work result?

## Evidence

Relevant documentation, experiments, or validation results.
```

Tauri itself comes from the project brief rather than a decision. Decision 0002
replaces the original offline-only acquisition assumption with user-requested
HoYoverse fetching.

- [0001 — Minimal offline shell and test stack](0001-shell-and-test-stack.md)
- [0002 — User-requested HoYoverse history acquisition](0002-user-requested-history-acquisition.md)
- [0003 — SQLite storage and reviewed imports](0003-sqlite-import-foundations.md)
- [0004 — Compact provenance for overlapping imports](0004-compact-import-provenance.md)
- [0005 — Current-user Windows discovery](0005-current-user-windows-discovery.md)
- [0006 — Desktop extraction commands](0006-desktop-extraction-commands.md)
- [0007 — Validate during extraction](0007-validate-during-extraction.md)
- [0008 — HTTPS transport](0008-https-transport.md)
- [0009 — Local database location](0009-local-database-location.md)
- [0010 — Portable mode](0010-portable-mode.md)
- [0011 — Vue frontend](0011-vue-frontend.md)
- [0012 — Linting and formatting](0012-linting-and-formatting.md)
- [0013 — Visual design](0013-visual-design.md)
- [0014 — Mock debug binary](0014-mock-debug-binary.md)
- [0015 — Incremental retrieval](0015-incremental-retrieval.md)
- [0016 — Markdown checks](0016-markdown-checks.md)
- [0017 — Astral Index name](0017-astral-index-name.md)
- [0018 — Star Rail first release](0018-star-rail-first-release.md)
- [0019 — Pity derived on read](0019-pity-derived-on-read.md)
- [0020 — Soft-pity colours](0020-soft-pity-colours.md)
- [0021 — History completeness is the user's responsibility](0021-history-completeness.md)
- [0022 — Banner catalogue from a standalone downloader](0022-banner-catalogue-downloader.md)
