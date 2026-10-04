# 0005 — HSR response parser

Status: Done · Milestone 2, HSR API import foundations

Validated parsing of HSR API response pages, test first.

## Tasks

- [x] Implement the domain model and response parser with test-first validation.
  The initial model validates individual pages and preserves optional context;
  it is not yet a resolved account or transactional import model. Request mocks
  are scripted parser-boundary responses, not tests of a production HTTP client.
  See [response review](../../status/history/2026-09-21-response-parser-review.md#response-foundation-review-2026-09-21)
  for policy and remaining external-verification limits.
