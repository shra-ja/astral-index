# 0008 — HTTPS transport

Date: 2026-09-27
Status: Accepted for the transport step of milestone 3; not yet used by any command.

Fetch history with exactly pinned `reqwest` 0.13.5, the version already in the
lockfile through Tauri's mobile dependencies, with default features disabled and
only `rustls-no-provider` enabled. Add exactly pinned `rustls` 0.23.45 with
default features disabled and only `ring`, `std` and `tls12`. The transport
installs `ring` as the process-wide rustls crypto provider before building its
client. `reqwest` then verifies certificates against the operating system's
trust store through `rustls-platform-verifier`.

The user chose this over two alternatives:

- `reqwest`'s default rustls uses the `aws-lc-rs` provider, whose `aws-lc-sys`
  build needs CMake and often NASM for the Windows cross-build.
- `native-tls` uses SChannel on Windows and OpenSSL on Linux, so TLS behaviour
  would differ by platform and Linux builds would depend on system OpenSSL.

The dependency tree contains `ring` and no `aws-lc-rs`, `aws-lc-sys`,
`openssl-sys` or `native-tls`. The lockfile gains 23 packages, mostly TLS and
HTTP plumbing. The `cargo-xwin` Windows build compiles `ring` with the existing
LLVM toolchain.

## Client policy

- HTTPS only; any URL other than the exact history endpoint is refused before a
  request is made.
- Redirects are never followed; any status other than 200 is an error.
- No system proxy: `reqwest`'s `system-proxy` feature is disabled. Users behind a
  mandatory proxy cannot fetch history; this is untested and unsupported for now.
- A 10-second connect timeout and a 30-second overall request timeout.
- Bodies are read in chunks and rejected once they exceed the 2 MiB response
  bound, without reading further.
- Errors are safe categories: unsupported URL, client unavailable, timeout,
  connection, HTTP status or too large. No URL, credential or response text.

## Testing

Unit tests replace `reqwest` and the provider with a scripted double, so they
never open sockets. An integration test builds the real client twice and checks
that a non-endpoint URL is refused before any connection. No automated test
requests the real endpoint.
