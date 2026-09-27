# 0005 — Current-user Windows discovery

Date: 2026-09-26
Status: Accepted for the native discovery increment; platform validation pending.

Use Windows' Known Folder API through exactly pinned `dirs` 6.0.0 to locate
roaming AppData. Under WSL-marked Linux, query that Windows folder through one
fixed, noninteractive, profile-free PowerShell expression, then translate AppData
and each game-directory candidate through `wslpath`. Require `WSL_DISTRO_NAME`
and discover helpers through PATH. Keep explicit AppData, log and mount-root
inputs available when automatic discovery is unavailable.

This avoids assuming that Windows and Linux usernames match, scanning all user
profiles, or treating `/mnt` as a universal drive mapping. Microsoft documents
[WSL interop and path translation](https://learn.microsoft.com/en-us/windows/dev-environment/wsl-interop#path-translation);
the pinned [dirs Windows implementation](https://docs.rs/crate/dirs/6.0.0/source/src/win.rs)
uses the system folder API.

Promote the already resolved `dirs` and Tokio 1.53.1 versions to direct
dependencies. Tokio process/time/I/O support adds the locked signal-hook-registry
dependency and provides bounded subprocess operations without exposing shell
access to the webview. Test-only clock control enables deterministic timeout tests.

Only explicit service invocation starts helpers. PowerShell source is constant;
paths are separate `wslpath` arguments. Validate folder/path syntax, discard
stdin/stderr, cap stdout at 32 KiB and allow five seconds per helper plus up to
five seconds for error cleanup. Kill and reap failed helpers; cancellation uses
Tokio's kill-on-drop behavior with best-effort reaping. Keep each log's error
independent and never include private helper output or paths in diagnostics.

UNC/device, relative, traversal and non-Unicode folder results are unsupported.
The API returns game-directory candidates, without opening caches or fetching
history. Desktop integration must preserve this explicit invocation boundary.

Mocked OS/file unit tests and real Linux subprocess/file integration tests cover
the implementation. These do not establish native Windows Known Folder behavior,
actual WSL Windows-process cancellation, redirected-profile compatibility or
installed-game layouts. Those checks remain required before claiming support.

## Workflow clarification (2026-09-27)

Explicit AppData, log and mount-root inputs are internal service APIs, not extra
user-facing source choices. The intended desktop actions are automatic discovery
and extraction of `data_2`, or a user-provided file as the fallback if discovery
fails. Candidate paths stay inside the native discovery pipeline; no cache
catalog or game-directory picker is required.
