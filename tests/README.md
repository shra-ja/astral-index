# Application end-to-end tests

This directory contains tests that exercise the frontend and backend together.
`native.test.ts` launches the real Tauri app and checks bundled UI, keyboard
operation, network restrictions and graceful shutdown. `close-window.py` is its
X11 helper.

Frontend tests belong in `../src/tests/`, backend tests and fixtures in
`../src-tauri/tests/`, and development-tooling tests in `../scripts/tests/`.
See [testing guidance](../docs/TESTING.md).
