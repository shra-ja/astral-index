# 0046 — History gap detection

Status: Backlog · Backlog
Decisions: [0021](../../architecture/decisions/0021-history-completeness.md)

Flag stored history that may be missing rolls, as a low-priority diagnostic.

## Tasks

- [ ] Detect patterns in stored history that suggest missing rolls, such as an
  unusually long gap between rolls in a category, and show them to the user as a
  possible issue, never as a correction. Completeness stays the user's
  responsibility (decision 0021). Define thresholds and test legitimate long
  breaks. Related to
  [0042 — Overlap anomaly detection](0042-overlap-anomaly-detection.md).
