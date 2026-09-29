# Repository-level verification

Tests that belong to neither the frontend nor the backend alone.

- `e2e-smoke.test.ts` launches the real Tauri app and checks the bundled UI,
  keyboard operation, network restrictions and graceful shutdown;
  `close-window-helper.py` closes its window as a user would.
- `backend-coverage-stages.test.ts` holds named stages, selected by the npm
  scripts, that run the instrumented Rust tests (unit, integration) and write
  their coverage reports.
- `coverage-reports.test.ts` holds the coverage gates, and
  `mutation-probes.test.ts` the mutation probes proving each gate fails when it
  should.

The check commands run these explicitly. Frontend tests live in `../src-ui/`,
backend tests in `../src-tauri/`, and the tooling's unit tests beside it in
`../tooling/`. See [testing guidance](../docs/TESTING.md).
