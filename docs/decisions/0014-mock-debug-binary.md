# 0014 — Mock debug binary

Date: 2026-10-02
Status: Accepted

## Context

The native smoke test runs the real app offline, so retrieval always fails at
validation: the Progress, Review and Saved screens, and saving into a real
database, were never exercised natively, and checking them needed a manual
retrieval against HoYoverse. Tests must stay local and never call live APIs.

## Decision

- **A second debug binary,** `src-tauri/src/bin/roll-tracker-mock.rs`, runs the
  same app with a synthetic HoYoverse. It reads `ROLL_TRACKER_MOCK_SCENARIO` and
  calls `desktop::register_mock`; it adds no behaviour of its own. The shipped
  binary, `main.rs`, is unchanged and has no test hooks or switches. The mock
  binary is built only with the `mock` Cargo feature (`required-features`), so
  release builds do not produce it; the feature gates nothing in the library.
  Cargo's `default-run` keeps `cargo run` and `tauri dev` on the real app.
- **An in-process mock transport,** `acquisition::mock::MockTransport`, answers the
  history endpoints from the request alone (category, cursor, size), so nothing
  is sent anywhere, not even to localhost, and it runs inside the offline test
  sandbox. Scenarios: `history` (the default: every category, several pages where
  long, collaboration pages capped at 20 as HoYoverse's are), `expired-link`
  (`retcode -101`), `network-failure` (Light Cone Event Warp unreachable after
  earlier categories), `rate-limited` (`retcode -110`) and `no-history`.
- **Selection by managed state:** commands take their transport from a managed
  `Network`: `Https` in the real app, `Mock(scenario)` only from the mock binary.
- **Separate history:** the mock binary keeps its database in its own
  `roll-tracker-mock` folder and never uses portable mode, so synthetic history
  cannot mix with real history.
- **Verification:** the native smoke test runs the mock binary through retrieval,
  review, saving, a second retrieval that finds everything saved, and a network
  failure, with screenshots of each screen. `npm run tauri:mock` runs it by hand.
- **Coverage:** the mock transport and registration are library code at 100%
  unit coverage. The mock binary joins `main.rs` and `build.rs` as a minimal
  delegate with its own native gate, its source body pinned by the report gate.

## Alternatives and consequences

- **A Cargo feature** swapping the transport keeps one binary, but feature-gated
  code is missing from the normal coverage build, hiding untested code.
- **A local mock HTTP server** is closest to real networking but needs TLS or an
  HTTP exception and a port, and cannot run inside the network-isolated sandbox.
- The mock transport ships in the library, unused by the real app. Its synthetic
  data is generated, not recorded, and contains no player data.
- Scenario coverage is limited to what the mock generates; real-API differences
  still need live checks recorded in the HSR research notes.
