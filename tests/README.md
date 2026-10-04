# Repository-level verification

Tests that belong to neither the frontend nor the backend alone.

- `e2e-smoke.test.ts` launches the real Tauri app and checks the bundled UI,
  keyboard operation, network restrictions and graceful shutdown. It then runs
  the mock debug binary (decision 0014) against a synthetic HoYoverse: retrieval,
  review and saving, then failed, cancelled and discarded retrievals and a restart
  on the saved data folder, checking that no file the app keeps holds the auth key;
  then newer rolls of the same account, a second account with the same roll IDs
  and pages that disagree on the account, checked against the database file. `app-driver.ts` drives each app
  through tauri-driver and WebDriver; `close-window-helper.py` closes its window
  as a user would.
- `backend-coverage-stages.test.ts` holds named stages, selected by the npm
  scripts, that run the instrumented Rust tests (unit, integration) and write
  their coverage reports.
- `coverage-reports.test.ts` holds the coverage gates, and
  `mutation-probes.test.ts` the mutation probes proving each gate fails when it
  should.

The check commands run these explicitly. Frontend tests live in `../src-ui/`,
backend tests in `../src-tauri/`, and the tooling's unit tests beside it in
`../tooling/`. See [testing guidance](../docs/TESTING.md).
