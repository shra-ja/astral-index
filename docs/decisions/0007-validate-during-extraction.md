# 0007 — Validate during extraction

Date: 2026-09-27
Status: Accepted; implemented in milestone 3 through PRs #21 and #22 and the
command and control change that followed them.

Validate extracted request contexts in the same user action that extracts them.
The first context whose cached request succeeds is the only one kept for
pagination. All other contexts, and every cached URL, are dropped as soon as
validation ends, whether it succeeds or fails.

Previously, extraction stored every distinct context in the native session and
validation was planned as a later, separate step. Combining them:

- holds one known-good auth key in memory instead of every extracted key;
- stops at the first working key, so no further contexts are validated;
- gives pagination, preview and commit a single validated context;
- keeps full cached URLs, needed to send cached requests unchanged, only for the
  duration of validation rather than in the session.

Extraction remains a local function and validation a network function, composed
by the command, so each stays separately testable. Parsing the cache lazily while
validating would save little: extraction is a bounded local parse, and the saving
comes from stopping validation at the first success.

## Consequences

The extraction action now contacts HoYoverse. This remains an explicit user
action under [decision 0002](0002-user-requested-history-acquisition.md), but the
interface must present it as starting history retrieval. The current "Nothing is
sent anywhere" note and the "Found your warp history request" success message
must change when validation is implemented. The file fallback validates the
chosen file's contexts in the same way.

Cancellation, the retry budget and auth-key failure messages (expired key,
refresh in game) apply from the extraction action onwards. Extraction must retain
one cached URL per context until validation ends; deduplication by credential
fields keeps the URL of each context's last occurrence in the file.
