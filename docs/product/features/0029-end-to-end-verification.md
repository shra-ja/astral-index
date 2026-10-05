# 0029 — End-to-end verification

Status: Done · Milestone 7, Saved history display and refresh
Decisions: [0014](../../architecture/decisions/0014-mock-debug-binary.md)

Prove the whole HSR import flow through the mock binary before declaring it
complete.

## Complete flow

- [x] Verify the complete flow, restart persistence, repeat/overlap fetches,
  account isolation, cancellation, and failure recovery using local test data.
  - [x] Verify request, preview, commit, restart and display end to end with
    synthetic request mocks.
    - [x] Relaunch the mock binary on its saved data folder: the History screen
      and the "Last import" line show the saved history without retrieving.
  - [x] Verify that repeat and overlapping fetches, account isolation,
    cancellation and failure recovery leave stored history correct, and that
    no auth key is persisted.
    - [x] Cancel a retrieval in progress and discard a review: nothing is saved,
      and a later retrieval still works.
    - [x] A failed retrieval after a save leaves the saved history unchanged, and
      a retrieval after a failed one saves what the failed one could not.
    - [x] No file in the mock's data folder, its webview profile included, holds
      the auth key after saves, failures and cancellations.
    - [x] Add a mock scenario in which the same account has newer rolls: a quick
      refresh saves only those, numbered on from the saved rolls, and a full
      retrieval finds nothing new.
    - [x] Add a mock scenario for a second account on another server with the
      same roll IDs: a quick refresh still retrieves all of it, it is saved as a
      separate account, the History screen follows it, and the first account's
      stored rolls are unchanged.

## Account binding and empty states

- [x] At the end of this milestone, verify auth-key/account binding, response UID
  and server mapping, account switching, and empty/missing-context handling before
  declaring the milestone complete; preserve existing service isolation checks.
  Account switching is verified at the data level here; the History screen's
  account switcher is milestone 9.
  - [x] Verify auth-key/account binding and response UID and server mapping.
    - [x] The account and server come from the responses, never the cache file:
      the same cache file saves the second scenario's account under its own UID.
    - [x] Add a mock scenario whose pages disagree on the UID: the retrieval
      fails readably and saves nothing.
  - [x] Verify account switching and empty or missing-context handling.
    - [x] A retrieval with no history creates no account, and retrieving or
      saving without a validated context or preview is refused.
  - [x] Confirm the existing service isolation checks still pass.

## Notes

Completed 2026-10-04. The mock debug binary's end-to-end tests retrieve, review,
save and display synthetic history, relaunch on the saved data, refresh with
newer rolls and a second account, and recover from failures, cancellations and
mixed-account responses, with no auth key left in any file the app keeps. The
storage isolation, offline-network, CSP and capability checks still pass. Live
retrieval was last tried by hand on Windows with PR #37; verifying the current
build natively on each release OS belongs to milestone 10.
