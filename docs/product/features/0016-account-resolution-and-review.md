# 0016 — Account resolution and review

Status: Done · Milestone 5, Import review and save

Resolve the account and server from the responses and summarise a retrieval for
review.

## Tasks

- [x] Resolve the account UID and server from the retrieved responses, per
  the [contract](../../games/hsr/api-contract.md#account-server-and-timestamps): every
  record's `uid` and every page's `region` must agree, and neither is ever
  fabricated. A retrieval with no records is a normal outcome, not an import
  error: report readably that no history was found, and create no account.
- [x] Build the native review DTO from an acquisition preview. Besides counts,
  account and server, include per-category counts and the covered time range,
  so the user can judge whether the retrieval looks complete.
