# 0020 — Review and save controls

Status: Done · Milestone 5, Import review and save

Accessible controls that chain retrieval into review, with Save, Discard and
readable failures.

## Tasks

- [x] Add accessible review and commit controls for the preview: chain "Start
  retrieval" into retrieval, show progress beside a Cancel control, then the
  review with Commit and Discard. Give every failure, `cancelled` and "no
  history found" a readable message.
  - [x] Chain retrieval after validation, with progress, Cancel and a message
    for every retrieval failure and "no history found".
  - [x] Show the review with Save and Discard, conflicts and the save result.
