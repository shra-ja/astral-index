# 2026-10-05: Astral Index rebrand (archived 2026-10-05)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Project cleanup and Astral Index rebrand (2026-10-05)

Integrated through PR #71. Work was on `docs/project-cleanup-milestone`, one
PR. Milestone 8, Project cleanup, holds the Markdown checks (0044, moved from
the backlog) and the Astral Index rebrand (0045); later milestones moved to 9
to 11. Decision 0017 records the names: data
folders `Astral-Index` and `astral-index`, identifier `astral-index`, no
migration of old test folders. The sidebar mark is now the icon's star.

Evidence: the renamed unit, component, guarded-delegate and end-to-end
assertions failed against the old names (title, folders, variables, binary
paths), then passed. The staged `npm run check` and offline tests passed; a
release `.deb` bundle built with the new identifier without warnings. The GitHub
repository is renamed `shra-ja/astral-index`, with `origin` and CONTRIBUTING
updated. CI passed on the renamed repository with PR #71.
