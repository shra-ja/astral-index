import { expect, test } from 'vitest'
import { viteConfig } from '../src-ui/build/vite'
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

test('the frontend’s Vite configuration, which cannot import this module, puts its reports in the same places', () => {
  const frontend = (env: NodeJS.ProcessEnv) =>
    viteConfig(env, 'production').test?.coverage?.reportsDirectory
  // Vite resolves the frontend's paths from src-ui/.
  expect(frontend({})).toBe(`../${outputs({}).coverage}/frontend`)
  expect(frontend({ [PROBE_RUN]: '1' })).toBe(`../${probeOutputs.coverage}/frontend`)
})
