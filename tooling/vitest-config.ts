// The repository's test configuration, kept here so it is unit-tested: Vitest never
// measures `vitest.config.ts` itself, which only delegates to this module.
import type { ViteUserConfig } from 'vitest/config'
import { outputs } from './outputs.ts'

/**
 * Repository tooling, whose unit tests sit beside it in `tooling/`, and the
 * repository-level verification in `tests/`: the native end-to-end test and the
 * coverage gates, run through the check commands, and the Windows smoke test in
 * `tests/windows/`, run on Windows alone. The frontend (`src-ui/`) runs
 * its own tests and coverage, as the backend does with Cargo.
 */
export function vitestConfig(env: NodeJS.ProcessEnv = process.env): ViteUserConfig {
  return {
    test: {
      // In GitHub Actions, annotate failures but write no job summary: CI writes one
      // per job, which the probes' expected failures cannot reach.
      reporters:
        env.GITHUB_ACTIONS === 'true'
          ? ['default', ['github-actions', { jobSummary: { enabled: false } }]]
          : ['default'],
      projects: [
        { test: { name: 'tooling', environment: 'node', include: ['tooling/**/*.test.ts'] } },
        {
          test: {
            name: 'gates',
            environment: 'node',
            include: ['tests/**/*.test.ts'],
            exclude: ['tests/windows/**'],
          },
        },
        // The Windows smoke test runs only on Windows, against the release executable.
        { test: { name: 'windows', environment: 'node', include: ['tests/windows/**/*.test.ts'] } },
      ],
      coverage: {
        provider: 'v8',
        reportsDirectory: `${outputs(env).coverage}/tooling`,
        include: ['tooling/**/*.ts'],
        exclude: ['**/*.test.ts', '**/*.d.ts'],
        reporter: ['text', 'json', 'json-summary'],
        thresholds: { perFile: true, 100: true },
      },
    },
  }
}
