# 2026-11-05: Shared filesystem test double (archived 2026-11-07)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

### Shared filesystem test double (2026-11-05)

Integrated through PR #165.

`test/shared-filesystem-double`: the in-memory filesystem that unit tests use in place of the host's moved from `acquisition::tests` to the crate's own `tests` module, as modules across the crate use it; only imports change. A pure move with no behavior change, so no red step: all 305 unit tests pass at 100% unit coverage.
