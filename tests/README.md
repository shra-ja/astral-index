# Repository-level verification

Tests that belong to neither the frontend nor the backend alone.

- `e2e-smoke.test.ts` launches the real Tauri app and checks the bundled UI,
  keyboard operation, tooltips under the pointer and the keyboard, network
  restrictions and graceful shutdown. It then runs
  the mock debug binary (decision 0014) against a synthetic HoYoverse: retrieval,
  review and saving, then failed, cancelled and discarded retrievals and a restart
  on the saved data folder, checking that no file the app keeps holds the auth key;
  then newer rolls of the same account, a second account with the same roll IDs
  and pages that disagree on the account, checked against the database file;
  and a retrieval with no history, and requests made without a validated link or
  a review; and the About commands, whose openings the mock records rather than
  launches; a 20,000-roll history within time bounds; and an axe-core
  accessibility audit of every screen and step, run by `accessibility.ts`.
  `app-driver.ts` drives each app
  through tauri-driver and WebDriver; `close-window-helper.py` closes its window
  as a user would.
- `windows/smoke.test.ts` runs the release executable on Windows, in CI only
  (`npm run test:windows-smoke`, its own Vitest project, never in the gates): a
  windowed app with no console, the committed icon in Explorer and on the
  window, the history and webview profile in the local data folder or the
  portable `data` folder, a second start on saved history, and a clean exit.
- `backend-coverage-stages.test.ts` holds named stages, selected by the npm
  scripts, that run the instrumented Rust tests (unit, integration) and write
  their coverage reports.
- `app-icons.test.ts` holds named stages: one writes the app icons from the
  brand's emblems (`npm run icons`), the other checks the committed ones match
  (`npm run icons:check`).
- `notices.test.ts` writes the third-party notices, failing on a missing or
  unaccepted licence (`npm run notices`, which every build runs).
- `versions.test.ts` checks that every manifest declares the same app version
  (`npm run versions:check`).
- `coverage-reports.test.ts` holds the coverage gates, and
  `mutation-probes.test.ts` the mutation probes proving each gate fails when it
  should. The probes write everything to `test-results/probe-run/`, starting
  from a baseline of their own, and check that they left `coverage/` and the
  rest of `test-results/` as they found them. Each probe command is stopped
  after 10 minutes. One that does not end
  as expected, or runs out of time, leaves a snapshot in
  `test-results/probe-failures/`: its full output, the machine's processes, load
  and memory, and Vitest's results caches.
- `job-summary.test.ts` writes a CI job's summary (`npm run ci:summary`), from
  `tooling/job-summary.ts`.

The check commands run these explicitly. Frontend tests live in `../src-ui/`,
backend tests in `../src-tauri/`, and the tooling's unit tests beside it in
`../tooling/`. See [testing guidance](../docs/development/TESTING.md).
