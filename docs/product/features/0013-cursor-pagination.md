# 0013 — Cursor pagination

Status: Done · Milestone 4, HSR history acquisition

Retrieve every page of every category by cursor, including the collaboration
endpoint.

## Tasks

- [x] Paginate each category by cursor. Stop on an empty page and advance on
  any other (corrected 2026-09-29: `getLdGachaLog` caps pages at 20, so a short
  page is not the last), reject repeated cursors and cycles, and enforce the
  16 MiB batch bound. Fetch all six known categories sequentially.
- [x] Request the collaboration categories from `getLdGachaLog`, found in
  Windows testing to hold their history; accept cached requests to either
  endpoint. Treat `retcode -110` as a rate limit and pause 500 ms before every
  request.
