# Repository-level verification

Tests that belong to neither the frontend nor the backend alone.

- `native.test.ts` launches the real Tauri app and checks the bundled UI, keyboard
  operation, network restrictions and graceful shutdown; `close-window.py` is its
  X11 helper.
- `native-coverage.test.ts` runs the instrumented Rust stages (unit, integration,
  native smoke) and writes their coverage reports.
- `reports.test.ts` holds the coverage gates, and `probes.test.ts` the mutation
  probes proving each gate fails when it should.

The check commands run these explicitly. Frontend tests live in `../src-ui/`,
backend tests in `../src-tauri/`, and the tooling's unit tests beside it in
`../tooling/`. See [testing guidance](../docs/TESTING.md).
