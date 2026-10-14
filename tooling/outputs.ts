// Where a check writes its reports and results. The mutation probes break gates on
// purpose, so their runs write to a folder of their own and never touch the reports
// the gates leave (TESTING: Mutation probes).

/** Set to `1` by the mutation probes, for every command they run. */
export const PROBE_RUN = 'ASTRAL_INDEX_PROBE_RUN'

/** The probe run's own folders, which only the probes write and clear. */
export const probeOutputs = {
  coverage: 'test-results/probe-run/coverage',
  results: 'test-results/probe-run',
}

export function outputs(env: NodeJS.ProcessEnv = process.env) {
  if (env[PROBE_RUN] === '1') return probeOutputs
  return { coverage: 'coverage', results: 'test-results' }
}
