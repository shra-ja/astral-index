# 0039 — Distribution

Status: Planned · Milestone 10, Release readiness

Ship the app with documented formats and recovery help.

## Tasks

- [ ] Choose distribution, document supported formats, and provide recovery help.
  The code is MIT-licensed; ship the `THIRD-PARTY-NOTICES` file that every
  build generates ([0050](0050-about-and-notices.md)) beside the app.
  Sign the executable: a browser warned that the unsigned CI build held a virus
  in the first-release sign-off ([0038](0038-release-verification.md)), as
  heuristics and missing reputation flag new unsigned executables.
- [ ] Keep a synthetic database of the released schema as a test fixture, which
  each later migration's tests open to show saved history survives an upgrade
  ([decision 0029](../../architecture/decisions/0029-automated-release-verification.md)).
