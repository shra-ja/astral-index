# 0042 — Overlap anomaly detection

Status: Backlog · Backlog

Flag suspiciously unmatched roll IDs across overlapping history periods.

## Tasks

- [ ] Detect suspiciously unmatched roll IDs across substantially overlapping older
  history periods using timestamps, scoped to the same game/account/server/banner.
  Distinguish genuine gaps from anomalous overlap and flag detected mismatches
  before commit without automatic reconciliation. Define thresholds and test
  incorrect/skipped earlier imports and legitimate same-second rolls. This niche
  diagnostic is not a prerequisite for milestones 2 to 7; see the
  [identity contract](../../games/hsr/api-contract.md#identity-and-mismatch-handling).
