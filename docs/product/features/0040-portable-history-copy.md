# 0040 — Portable history copy

Status: Backlog · Backlog
Decisions: [0010](../../decisions/0010-portable-mode.md)

Offer to copy history into a new portable `data` folder.

## Tasks

- [ ] On the first start in portable mode, when the `data` folder has no database
  but the local folder does, offer to copy the history across: verify the copy
  and keep the original. Replaces the documented manual copy.
