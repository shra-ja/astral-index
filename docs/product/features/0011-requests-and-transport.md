# 0011 — Requests and transport

Status: Done · Milestone 4, HSR history acquisition
Decisions: [0008](../../architecture/decisions/0008-https-transport.md)

Build page requests, send them over a bounded HTTPS transport and classify each
outcome.

## Tasks

- [x] Build single-endpoint requests from an extracted context: fixed
  authentication, language and size, 1000-record default pages, and page and
  cursor parameters.
- [x] Add a mockable transport with finite timeouts that enforces the 2 MiB
  response bound while receiving data. Record the HTTP dependency choice.
- [x] Classify outcomes as actionable failures: `-101` expired key, other
  nonzero codes, rate limits, malformed responses, and transient connection
  failures or HTTP 5xx. Do not expose raw messages or payloads.
