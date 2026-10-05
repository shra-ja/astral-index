# 2026-10-04: probe failure snapshots (archived 2026-10-04)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

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

## Markdown checks (2026-10-04)

Integrated through PR #70. Feature 0044, on `chore/markdown-checks`; decision 0016. `npm run docs:check`
fails on broken links or anchors, docs unreachable from `AGENTS.md`, and STATUS
over 150 lines; markdownlint checks structure in `lint:check`. Prettier stays off
Markdown, since it padded tables and grew the docs by 14%. The docs check's unit
tests failed against a stub, then passed at 100% coverage; its mutation probe and
probe documents showed each check failing. Agent skills are exempt from the
reachability rule, since agent tools discover them from their skill folders.
markdownlint found one real issue.
