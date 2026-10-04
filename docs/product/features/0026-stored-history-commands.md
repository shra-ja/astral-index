# 0026 — Stored-history commands

Status: Done · Milestone 7, Saved history display and refresh

Local-only commands that read saved history, category counts and the latest
import.

## Tasks

- [x] Count the new 5★ and 4★ rolls in a save, as rows with that rarity
  among the rolls being added (not unique items), and show them on the
  Saved screen.
- [x] Add a native command returning one page of an account's stored rolls
  for one banner category, newest first. Order by time, then by numeric roll
  ID within the same second, matching the observed descending API order;
  page in Rust.
- [x] Return every category's count with each page, for the History
  screen's tab counts.
- [x] Expose the latest import (time, source, account and rolls saved) from the
  stored batch summaries, for the Import screen's "Last import" line.
