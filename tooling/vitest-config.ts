// The repository's test configuration, kept here so it is unit-tested: Vitest never
// measures `vitest.config.ts` itself, which only delegates to this module.
import type { ViteUserConfig } from 'vitest/config';

/**
 * Repository tooling, whose unit tests sit beside it in `tooling/`, and the
 * repository-level verification in `tests/`: the native end-to-end test and the
 * coverage gates, run through the check commands. The frontend (`src-ui/`) runs
 * its own tests and coverage, as the backend does with Cargo.
 */
export function vitestConfig(): ViteUserConfig {
  return {
    test: {
      projects: [
        { test: { name: 'tooling', environment: 'node', include: ['tooling/**/*.test.ts'] } },
        { test: { name: 'gates', environment: 'node', include: ['tests/**/*.test.ts'] } },
      ],
      coverage: {
        provider: 'v8',
        reportsDirectory: 'coverage/tooling',
        include: ['tooling/**/*.ts'],
        exclude: ['**/*.test.ts', '**/*.d.ts'],
        reporter: ['text', 'json', 'json-summary'],
        thresholds: { perFile: true, 100: true },
      },
    },
  };
}
