# 0019 — Retrieve and commit commands

Status: Done · Milestone 5, Import review and save

Desktop commands that retrieve history into a held preview, then commit or discard
it.

## Tasks

- [x] Add a `retrieve_history` command: retrieve from the held context with
  its budget, cancellably, stream progress over a Tauri channel, resolve the
  account and preview it. Return the review or "no history found", with the
  failing category and page for retrieval failures. Clear the auth key as
  soon as retrieval ends, whether it succeeds, fails or is cancelled.
- [x] Add `commit_import` and `discard_import` commands for the held preview.
