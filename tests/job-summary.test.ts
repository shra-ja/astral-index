// The summary each Linux CI job writes for its run: `npm run ci:summary`, with the
// job in CHECK_JOB and GitHub's job status in CHECK_STATUS (tooling/job-summary.ts).
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { isCheckJob, jobSummary } from '../tooling/job-summary'

test('write the job summary', () => {
  const { GITHUB_STEP_SUMMARY: path, CHECK_JOB: job, CHECK_STATUS: status } = process.env
  expect(path, 'GITHUB_STEP_SUMMARY').toBeTruthy()
  expect(isCheckJob(job), `CHECK_JOB ${job}`).toBe(true)
  expect(status, 'CHECK_STATUS').toBeTruthy()
  const read = (report: string) => (existsSync(report) ? readFileSync(report, 'utf8') : undefined)
  appendFileSync(path!, jobSummary(job as Parameters<typeof jobSummary>[0], status!, read))
})
