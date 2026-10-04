# 0009 — Extraction commands and controls

Status: Done · Milestone 3, HSR request discovery and extraction
Decisions: [0006](../../decisions/0006-desktop-extraction-commands.md)

Narrow desktop commands and accessible controls for automatic extraction and the
cache file fallback.

## Tasks

- [x] Expose automatic extraction and the user-provided cache file fallback
  through narrow Tauri commands and permissions. Keep paths native-only. Hold
  extracted auth keys only in short-lived native memory, never persisted or
  sent to the frontend.
- [x] Add accessible HSR controls for both actions, with readable empty,
  failure and fallback states.
