# 0004 — HSR API contract

Status: Done · Milestone 2, HSR API import foundations
Decisions: [0002](../../decisions/0002-user-requested-history-acquisition.md)

An accepted contract for the HSR history API, with synthetic fixtures and request
mocks.

## Tasks

- [x] Formalise the initial HSR API contract: observed fields, banner codes,
  stable-ID policy, auth-key account selection, server-local timestamps, tested
  cursor pagination and bounded errors/retries, including `-101` for an expired
  auth key. Adopt the user's assumptions and defer formal account/server verification to
  the end of milestone 3. This is an accepted contract, not proof of all live behaviour.
- [x] Create synthetic response fixtures and request mocks; keep all automated
  tests local and self-contained, with no live API calls or player credentials.
