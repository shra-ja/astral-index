import { spawnSync } from 'node:child_process'
import { copyFileSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

/**
 * The longest a mutation probe may run one command, in seconds. A native run takes
 * a few minutes even on CI, and a stalled one must fail well within CI's 30-minute
 * job, leaving its output, rather than run out the job's time with nothing to show.
 */
export const PROBE_COMMAND_SECONDS = 600

/** How a bounded command ended, with its standard output and error together. */
export interface ProbeRun {
  status: number | null
  output: string
  timedOut: boolean
}

/**
 * Run a command for at most `seconds`. Coreutils `timeout` runs it in its own
 * process group and signals the whole group, so a stray app or X server it started
 * can't hold the output pipe open; anything still running 30 s later is killed.
 */
export function runBounded(
  command: string,
  args: string[],
  seconds = PROBE_COMMAND_SECONDS,
): ProbeRun {
  const result = spawnSync('timeout', ['--kill-after=30', String(seconds), command, ...args], {
    encoding: 'utf8',
  })
  // 124: stopped at the bound; 137: killed after ignoring the stop.
  return {
    status: result.status,
    output: result.stdout + result.stderr,
    timedOut: result.status === 124 || result.status === 137,
  }
}

let saved = 0

/**
 * Save what a rare probe failure can't show afterwards: the command and how it
 * ended against what was expected, the machine's load, memory and processes, the
 * command's output, and Vitest's results caches, which order the next run. Returns
 * the snapshot's folder, inside `root`.
 */
export function saveFailureSnapshot(
  root: string,
  command: string,
  args: string[],
  run: ProbeRun,
  expected: string,
): string {
  const folder = `${root}/${new Date().toISOString().replace(/[:.]/g, '-')}-${++saved}`
  mkdirSync(folder, { recursive: true })
  const machine = (file: string, options: string[]) =>
    spawnSync(file, options, { encoding: 'utf8' }).stdout
  const ended = run.timedOut ? `timed out after ${PROBE_COMMAND_SECONDS} s` : `exit ${run.status}`
  writeFileSync(
    `${folder}/snapshot.log`,
    [
      `$ ${command} ${args.join(' ')}`,
      `${ended}; expected ${expected}`,
      `load ${readFileSync('/proc/loadavg', 'utf8')}`,
      machine('free', ['-m']),
      machine('ps', ['-eo', 'pid,ppid,etime,pcpu,rss,args', '--sort=-pcpu']),
      run.output,
    ].join('\n'),
  )
  for (const cache of globSync('{,src-ui/}node_modules/.vite/vitest/*/results.json')) {
    copyFileSync(cache, `${folder}/${cache.replaceAll('/', '_')}`)
  }
  return folder
}
