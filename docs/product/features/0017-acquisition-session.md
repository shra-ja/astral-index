# 0017 — Acquisition session

Status: Done · Milestone 5, Import review and save
Decisions: [0007](../../architecture/decisions/0007-validate-during-extraction.md)

Hold the validated context and its retry budget in native memory, with a cancel
command.

## Tasks

- [x] Hold the validated context with the retry budget its extraction started,
  and add a `cancel_acquisition` command that stops the running operation
  (validation now, retrieval later) and drops the context. A cancelled or
  superseded operation keeps no late result.
