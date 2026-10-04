# 0012 — Auth-key validation

Status: Done · Milestone 4, HSR history acquisition
Decisions: [0007](../../decisions/0007-validate-during-extraction.md)

Check extracted auth keys with HoYoverse in the same user action, keeping only a
working one.

## Tasks

- [x] Validate at most five extracted contexts, in reverse file order, by
  sending each cached request unchanged, and use the first whose auth key
  works. If none works, stop with an actionable error
  ([auth-key validation](../../HSR-API-CONTRACT.md#auth-key-validation)). Run
  validation in the same user action as extraction, keep each cached URL only
  until validation ends, and hold only the validated context in the session
  ([decision 0007](../../decisions/0007-validate-during-extraction.md)). Update the
  controls, which will then contact HoYoverse, and their failure messages.
  Retries during validation arrive with the retry-budget step.
