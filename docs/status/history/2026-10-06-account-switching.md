

## Bounded probe commands (2026-10-06)

Integrated through PR #79, whose CI run took 10 minutes. On
`fix/probe-native-timeouts`. PR #78's first CI run was cancelled at the job's
30-minute limit: a native end-to-end run inside the mutation probes stalled, and
the probes ran it synchronously with its output captured, so nothing showed
where. The rerun passed in 14 minutes. Every probe command now runs for at most
10 minutes under coreutils `timeout`, which stops its whole process group, and
any unexpected outcome, timeouts included, saves a snapshot with the output. The
two native probes now run only the end-to-end shell test, about 5 s instead of
the full 2-minute suite each; the probes' final refresh still runs it all.

Evidence: the new `tooling/probe-run.ts` tests failed first (missing module),
then passed at 100% coverage; a command whose background child holds the output
pipe is stopped within seconds of its bound.
The staged `npm run check` passes; with the scoped native probes the probes
stage takes 238 s locally instead of 473 s.
