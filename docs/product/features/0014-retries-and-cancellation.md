# 0014 — Retries and cancellation

Status: Done · Milestone 4, HSR history acquisition

A bounded retry budget and user cancellation that stops requests and writes
nothing.

## Tasks

- [x] Apply the retry budget: one retry per transiently failed request after a
  short bounded delay, and at most two extra attempts per acquisition,
  including validation requests.
- [x] Support cancellation that stops further requests and writes nothing.
