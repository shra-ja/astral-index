# Discovery and extraction

Status: implemented for Honkai: Star Rail on Windows and from WSL. See
[decision 0005](../decisions/0005-current-user-windows-discovery.md) and the
[supported sources](../games/hsr/api-research.md#supported-and-unsupported-extraction-sources-2026-09-27).

Extraction finds the request context (an auth key and its fixed query fields)
that the game cached when the player last opened their warp history. It runs only
when the user asks, as part of the same action that validates the key
([acquisition](acquisition.md)). There are two ways in: automatic discovery for
the current user, or a cache file the user chooses. There is no discovered-cache
chooser or game-directory picker.

## Automatic discovery

`discovery::system::extract_current_user_contexts` composes three steps:

1. **Roaming AppData.** On Windows, the Known Folder API. On Linux, only when
   `WSL_DISTRO_NAME` is set: a fixed, profile-free `powershell.exe` query for
   the Windows folder, translated with `wslpath`. Each helper runs with a
   five-second limit and a 32 KiB output limit, is killed and reaped on failure,
   and never runs on ordinary Linux (`UnsupportedHost`).
2. **Player logs.** `LocalLow/Cognosphere/Star Rail/Player.log`, then
   `Player-prev.log`, each read independently: only the first 11 lines and
   64 KiB. Startup markers yield game-data directories, current log first,
   without repeats. A bad log fails alone and never suppresses the other.
3. **Cache.** In each game-data directory, `webCaches/<version>/Cache/Cache_Data/data_2`
   for the two newest four-part version folders, latest first (auth keys last
   about a day, so an older version only matters just after an update). The
   first cache that yields any context is used whole; caches are never merged,
   since each is assumed to hold one account's requests.

Failures report the furthest stage reached as a safe category: discovery failed,
no game data, no cache or no usable request.

## Cache extraction

`acquisition.rs` reads one regular file, read-only, up to 16 MiB (oversize fails
rather than yielding a partial result; FIFOs never block). It finds
NUL-terminated `1/0/` entries for the exact HTTPS spelling of either history
endpoint (`getGachaLog`, or `getLdGachaLog` for collaboration warps) and keeps
five required query fields with their encoded bytes. Malformed, duplicated or
foreign entries are skipped; no valid entry is a safe error. Distinct contexts
come back in **reverse file order**, each with the exact cached URL so
validation can send it unchanged. Order implies neither age nor validity.

## Invariants

- Paths are validated before use: drive-absolute Windows paths only (no UNC,
  device, relative or traversal paths); WSL paths come from `wslpath`, never
  from assumed mounts, drive probes or profile scans.
- Discovery never writes, never fetches history and opens no game files beyond
  the two logs and the selected caches.
- Request contexts and cached URLs are opaque native values: redacted in debug
  output, never serialized, persisted or sent to the webview. Errors carry
  categories, never paths or source text.
- No discovery runs at startup or in the background.
