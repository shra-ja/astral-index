# 0008 — Current-user discovery

Status: Done · Milestone 3, HSR request discovery and extraction
Decisions: [0005](../../architecture/decisions/0005-current-user-windows-discovery.md)

Find the current user's game data from the player logs on Windows and from WSL,
and compose it with extraction.

## Tasks

- [x] Read game-data directories from bounded `Player.log` and `Player-prev.log`
  headers with independent outcomes and explicit WSL drive mapping (`0fc2cc7`).
- [x] Resolve the current user's roaming AppData on native Windows and on WSL
  through bounded, killable helpers, without profile scans
  ([decision 0005](../../architecture/decisions/0005-current-user-windows-discovery.md), `4b360f2`).
- [x] Compose current-user discovery, `data_2` resolution and extraction into
  one native automatic-extraction service, tested with mocked OS and file APIs.
  Assume a single cache file holds requests for one account, and return its
  contexts in reverse file order.
