# Native shell

`src/main.rs` launches the real Tauri event loop. `build.rs` generates build
metadata; both are covered by native tests. `tauri.conf.json` defines bundled
assets, the development loopback URL and production CSP. No plugins, custom
commands or native capabilities are enabled yet.

Run commands from the repository root; see `../README.md`. Future services,
adapters and persistence follow `../docs/ARCHITECTURE.md`.

`src/hsr.rs` is the pure Rust library target for bounded HSR response parsing.
It returns validated page/roll values and safe error categories. It has no native
commands, I/O, database, acquisition, or startup integration. See the response
contract and limits in [API research](../docs/HSR-API-RESEARCH.md).
