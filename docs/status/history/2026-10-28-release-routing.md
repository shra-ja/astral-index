# 2026-10-28: release routing (archived 2026-10-29)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Release routing (2026-10-28)

Integrated through PR #152.

`docs/release-routing`: AGENTS.md routes releases to DEVELOPMENT's Releasing section, which nothing pointed to before, so an agent drafting 1.1.0's notes missed it. That section's step 3 now keeps hand-written entries close to the generated ones: each pull request's title with its verb in the third-person present tense, related pull requests sharing an entry and ones users would not notice left out. Docs only; markdownlint and the docs check pass.
