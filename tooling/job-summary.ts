// The summary each Linux CI job writes for its run: what it ran, how it ended and,
// for the gates, each coverage report's totals. Vitest writes none of its own, so
// the probes' deliberate failures never reach it.
import type { LlvmCoverageExport } from './coverage'

const jobs = {
  static: {
    title: 'Format, lint, docs and Rust lints',
    ran: 'Ran `npm run check:static`: formatting, lint, the docs, icon and version checks, the frontend bundle, Rust formatting and Clippy.',
  },
  gates: {
    title: 'Tests and 100% coverage',
    ran: 'Ran `npm run check:gates`: the build, coverage, the offline native tests and report validation.',
  },
  probes: {
    title: 'Mutation probes',
    ran: [
      'Ran `npm run check:probes`: the build, then the mutation probes.',
      'Each probe runs a gate expecting it to fail, so failures inside a probe are the probe working.',
      'A probe fails this job only when its gate did not fail as expected, and saves a snapshot in the `probe-failures` artifact.',
    ].join(' '),
  },
}
export type CheckJob = keyof typeof jobs

export function isCheckJob(job: string | undefined): job is CheckJob {
  return job !== undefined && Object.hasOwn(jobs, job)
}

/** GitHub's job status, in the summary's words. */
const outcomes: Record<string, string> = { success: 'passed', failure: 'failed' }

/** The reports the gates write, as Istanbul summaries or LLVM exports. */
const reports = [
  ['Frontend', 'coverage/frontend/coverage-summary.json'],
  ['Tooling', 'coverage/tooling/coverage-summary.json'],
  ['Rust, unit tests', 'coverage/backend-unit/coverage.json'],
  ['Rust, all tests', 'coverage/backend/coverage.json'],
] as const

type Count = { covered: number; total: number }
type IstanbulSummary = { total: Record<string, Count> }

/** "100% (250/250)", or up to 99.99% with two decimals, so a near miss shows. */
function percent({ covered, total }: Count) {
  if (total === 0) return 'None'
  const share =
    covered === total ? 100 : Math.min(99.99, Number(((covered / total) * 100).toFixed(2)))
  return `${share}% (${covered}/${total})`
}

/** Lines, statements or regions, functions and branches, summed over a report's files. */
function totals(json: string): Count[] {
  const report = JSON.parse(json) as Partial<LlvmCoverageExport> & Partial<IstanbulSummary>
  if (report.total) {
    return ['lines', 'statements', 'functions', 'branches'].map((metric) => report.total![metric])
  }
  return (['lines', 'regions', 'functions', 'branches'] as const).map((metric) =>
    report.data![0].files.reduce(
      (sum, file) => ({
        covered: sum.covered + file.summary[metric].covered,
        total: sum.total + file.summary[metric].count,
      }),
      { covered: 0, total: 0 },
    ),
  )
}

function coverageTable(read: (path: string) => string | undefined) {
  const rows = reports.map(([name, path]) => {
    const json = read(path)
    const cells = json === undefined ? ['Not produced', '', '', ''] : totals(json).map(percent)
    // Empty cells close up to a single space, as Markdown tables write them.
    return `| ${[name, ...cells].join(' | ')} |`.replaceAll('  ', ' ')
  })
  return [
    '| Report | Lines | Statements or regions | Functions | Branches |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

/** The job's summary in Markdown; `read` returns a report's text, if it was written. */
export function jobSummary(
  job: CheckJob,
  status: string,
  read: (path: string) => string | undefined,
): string {
  const { title, ran } = jobs[job]
  const parts = [`## ${title}: ${outcomes[status] ?? status}`, ran]
  if (job === 'gates') parts.push(coverageTable(read))
  return `${parts.join('\n\n')}\n`
}
