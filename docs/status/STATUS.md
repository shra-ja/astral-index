# Project status

Updated: 2026-10-04

Milestones 1 and 2 provide the local Tauri shell, HSR response parser, immutable
import previews and transactional SQLite history storage. Repeated imports retain
unique rolls, first-import provenance and compact batch summaries. The
[HSR API contract](../HSR-API-CONTRACT.md) contains the settled acquisition assumptions
and retry policy. Milestone 3 is complete: on the user's request the app
retrieves Honkai: Star Rail warp history from HoYoverse, reviews and saves it
locally, and shows the saved history, which survives restarts.

## Probe failure snapshots (2026-10-04)

Work is on `fix/frontend-emit-flake`. Twice on 2026-10-04 the suite-discovery
probe failed in its last `coverage:json` run, because frontend component tests
(CategoryTabs, ImportSaved, ReviewPanel) found `wrapper.emitted()` empty after a
click. VTU still recorded the native `click`, so the click reached the DOM but the
components' own events went unrecorded: VTU captures those only through Vue's
devtools hook. The cause is unknown and the failure does not reproduce. Every one of 74 attempts passed:
20 direct test and coverage runs, 12 runs in shuffled file order with fixed seeds, 8
with a Vitest worker's environment variables, 24 replaying the probe's commands
from the shell and 5 real probe runs. Four suites run at once failed only from
starved worker pools, a different error. Ruled out: a second Vue instance (the
components and VTU share one), `NODE_ENV` (`test`), test order, Vue's 3-second
devtools buffer (not used under jsdom) and the renderer resetting the hook (VTU
attaches it after `createApp` on every mount).

Switching the 19 `emitted()` assertions to listener props was considered and
set aside: `emitted()` is the API that Vue Test Utils and Testing Library document
for component events, and nothing showed the change would fix the flake. Instead,
the probes that expect a command to fail share `expectCommandFailure`, which on
an unexpected outcome saves a snapshot to `test-results/probe-failures/`: the
command's full output, the machine's processes, load and memory, and Vitest's
results caches. Passing runs write nothing. Checked by giving the coverage probe a
message its command never prints: the probe failed and left a snapshot with the
output, process list, memory and both results caches; that snapshot was removed.

## Next

If the emit flake recurs, read its snapshot in `test-results/probe-failures/`
before rerunning. Milestone 4: propose its PR split first; its first items are
file imports through the shared pipeline, the second game's adapter, and account
switching with filters on the History screen. Native Windows validation of the
current build remains for milestone 6.

Earlier implementation details, dated measurements and superseded next steps are
in the [historical status log](history/2026-09-25-shell-and-storage-foundations.md).
