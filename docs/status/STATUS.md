# Project status

Updated: 2026-10-04

Milestones 1 and 2 provide the local Tauri shell, HSR response parser, immutable
import previews and transactional SQLite history storage. Repeated imports retain
unique rolls, first-import provenance and compact batch summaries. The
[HSR API contract](../HSR-API-CONTRACT.md) contains the settled acquisition assumptions
and retry policy. Milestone 3 is complete: on the user's request the app
retrieves Honkai: Star Rail warp history from HoYoverse, reviews and saves it
locally, and shows the saved history, which survives restarts.

## Next

If the emit flake recurs, read its snapshot in `test-results/probe-failures/`
before rerunning. Milestone 4: propose its PR split first; its first items are
file imports through the shared pipeline, the second game's adapter, and account
switching with filters on the History screen. Native Windows validation of the
current build remains for milestone 6.

Earlier implementation details, dated measurements and superseded next steps are
in the [historical status log](history/2026-09-25-shell-and-storage-foundations.md).
