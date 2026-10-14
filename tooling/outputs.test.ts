import { expect, test } from 'vitest'
import { outputs, PROBE_RUN, probeOutputs } from './outputs'

test('checks write to the repository’s report and result folders', () => {
  expect(outputs({})).toEqual({ coverage: 'coverage', results: 'test-results' })
  expect(outputs({ [PROBE_RUN]: '0' })).toEqual({ coverage: 'coverage', results: 'test-results' })
})

test('during the mutation probes, everything goes to the probe run’s own folder', () => {
  expect(PROBE_RUN).toBe('ASTRAL_INDEX_PROBE_RUN')
  expect(outputs({ [PROBE_RUN]: '1' })).toEqual({
    coverage: 'test-results/probe-run/coverage',
    results: 'test-results/probe-run',
  })
})

test('the probe run’s folders sit apart from the repository’s, inside its results', () => {
  expect(probeOutputs).toBe(outputs({ [PROBE_RUN]: '1' }))
  expect(probeOutputs.results).toMatch(/^test-results\/.+/)
  expect(probeOutputs.coverage.startsWith(`${probeOutputs.results}/`)).toBe(true)
})
