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

Tauri originates from the project brief. Decision 0002 replaces the original
offline-only acquisition assumption with user-requested HoYoverse fetching.

- [0001 — Minimal offline shell and test stack](0001-shell-and-test-stack.md)
- [0002 — User-requested HoYoverse history acquisition](0002-user-requested-history-acquisition.md)

- [0005 — Current-user Windows discovery](0005-current-user-windows-discovery.md)
- [0006 — Desktop extraction commands](0006-desktop-extraction-commands.md)
