# 0025 — Mock debug binary

Status: Done · Milestone 6, Desktop UI foundation
Decisions: [0014](../../architecture/decisions/0014-mock-debug-binary.md)

The app against a synthetic HoYoverse, for end-to-end tests and manual checks.

## Tasks

- [x] Add a mock HoYoverse debug binary, `roll-tracker-mock`: the same app
  with an in-process mock transport serving synthetic scenarios chosen by an
  environment variable (multi-page success, expired link, network failure,
  rate limit, no history). The shipped binary keeps no test hooks. Add a
  native smoke test that runs the full flow through it with screenshots of
  each screen, and a command to run it by hand. Record it as a decision
  ([decision 0014](../../architecture/decisions/0014-mock-debug-binary.md)).
