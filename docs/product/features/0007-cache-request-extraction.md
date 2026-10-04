# 0007 — Cache request extraction

Status: Done · Milestone 3, HSR request discovery and extraction

Read request contexts from the game's `data_2` web cache, in its versioned
folders.

## Tasks

- [x] Read a selected cache file within size bounds without modifying it,
  rejecting non-regular files. Extract the encoded request-context fields,
  validate the exact endpoint, deduplicate contexts in first-seen order and
  redact credentials from debug output (`55e09f3`, `a0eb47f`).
- [x] Resolve versioned `webCaches` folders in a game-data directory, latest
  first (`55e09f3`). Narrowed after WSL verification to the two newest version
  folders, without the unversioned layout.
