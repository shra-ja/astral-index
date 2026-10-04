# 0006 — Desktop extraction commands

Date: 2026-09-27
Status: Accepted; the session and failure categories were amended by
[decision 0007](0007-validate-during-extraction.md).

Expose request-context extraction to the webview through two Tauri commands,
`extract_automatically` and `extract_from_file`. Both return nothing on success
or a safe failure category. Extracted contexts, including auth keys, stay in an
in-memory native session for the next acquisition step. They are never
serialized, persisted or returned to the webview. Each extraction replaces the
session's contexts, and a failed extraction leaves none. Since decision 0007,
both commands also validate the keys with HoYoverse, the session holds only the
validated context, and failures cross IPC as `{"kind": ...}` objects, with a
`code` only for API errors.

Commands are the Tauri 2 mechanism for webview-to-Rust calls with a typed reply.
The webview cannot read AppData, player logs or caches, and file access belongs
in Rust. Events lack a typed reply. A local server or sidecar would add network
or process surface the project rules out.

## Wrapper exceptions

`src-tauri/src/main.rs` and `src-tauri/build.rs` keep their separate 100% native
coverage gate. The user reviewed the exception on 2026-09-27. Neither file can
run inside a unit test: `main` starts the real event loop, and Cargo runs
`build.rs` as a separate build-time program. Both remain delegates without logic:

- `main.rs` passes the builder through `roll_tracker::desktop::register`.
  Its only other line is Tauri's standard attribute selecting the Windows GUI
  subsystem for release builds, which adds no executable code.
  Registration, state and command bodies are library code with unit coverage
  through Tauri's mock runtime (dev-only `test` feature, no new crates).
- `build.rs` declares an app manifest from `src/desktop/commands.in`, which
  the library also includes as `desktop::COMMANDS`. Declaring app commands makes
  each one require a capability grant; `capabilities/main.json` grants only the
  two commands to the main window for local content.

The source-body guard in `scripts/tests/reports.test.ts` pins both new bodies.
A unit test asserts every listed command is registered. A command registered
but not listed would be denied at runtime, failing closed. The native test calls
a granted command and an undeclared one from the real webview.

## File fallback

The webview reads the user-selected file with an HTML file input and sends its
bytes as a raw IPC body. No path crosses IPC, and no dialog plugin is added.
Rust applies the existing 16 MiB bound and validation. The user chose this over a
native dialog plugin, accepting that cache bytes, including auth keys, pass
through webview memory in transit. Native code never returns them.

## IPC transport and CSP

The production CSP previously set `connect-src 'none'`. That also blocks Tauri's
fetch-based IPC to the local `ipc:` protocol, so Tauri fell back to `postMessage`,
which delivers raw bytes as JSON. The native test found this: the file command
received a JSON body and answered `invalid_file`. Both CSPs now allow only
`ipc: http://ipc.localhost` in `connect-src`, as Tauri's configuration
documentation shows. Every network origin stays blocked: the native test still
requires an enforced `connect-src` violation for a loopback fetch, and the
mutation probe still fails a permissive `connect-src *` policy.

## Frontend client

The webview calls the commands through the official `@tauri-apps/api` package,
pinned exactly to match the Rust `tauri` minor line: 2.11.1 at first, 2.12.0
with `tauri` 2.12 since 2026-09-29. It has no
dependencies and replaces the undocumented `__TAURI_INTERNALS__` object; its
`mockIPC` helper lets frontend tests script native results.

## Consequences

Automatic extraction runs bounded synchronous log and cache reads on the async
worker executing the command. Real Windows and WSL behavior is unverified.
Clearing contexts when an import completes, fails or is cancelled arrives with
the acquisition commands.
