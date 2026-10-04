// Checks the repository's Markdown so agents can rely on it: links and anchors resolve,
// every doc can be reached from the agent entry point, and STATUS stays within its
// budget. Pure functions over file contents; the gate in `tests/docs.test.ts` reads them.
import { posix } from 'node:path'

/** What the check needs: tracked files' contents and the rules to apply. */
export interface DocsInput {
  /** Markdown and Rust sources to check, by repository-relative path. */
  files: ReadonlyMap<string, string>
  /** Every tracked path, so links to any file can resolve. */
  tracked: ReadonlySet<string>
  /** The agent entry point every doc must be reachable from. */
  entry: string
  /**
   * Markdown that need not be reachable from the entry point: exact paths, or folder
   * prefixes ending in `/`.
   */
  unreachable: readonly string[]
  /** STATUS and its line budget. */
  status: { path: string; maxLines: number }
}

const LINK = /!?\[[^\]]*\]\(([^)\s]+)\)/g
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i
const FENCE = /^\s*(```|~~~)/

/** Lines outside fenced code, with their 1-based numbers. */
function proseLines(text: string): [number, string][] {
  let fenced = false
  return text.split('\n').flatMap((line, index): [number, string][] => {
    if (FENCE.test(line)) {
      fenced = !fenced
      return []
    }
    return fenced ? [] : [[index + 1, line]]
  })
}

/**
 * Relative link targets in a Markdown file, or in a Rust file's doc comments, with
 * their lines. Code spans, fenced code and external URLs are skipped.
 */
export function links(text: string, file: string): { line: number; target: string }[] {
  const rust = file.endsWith('.rs')
  return proseLines(text)
    .filter(([, line]) => !rust || /^\s*\/\/[!/]/.test(line))
    .flatMap(([line, content]) =>
      [...content.replace(/`[^`]*`/g, '').matchAll(LINK)]
        .map((match) => match[1])
        .filter((target) => !EXTERNAL.test(target))
        .map((target) => ({ line, target })),
    )
}

/** The anchors GitHub gives a Markdown file's headings, repeats numbered from 1. */
export function headingAnchors(markdown: string): Set<string> {
  const seen = new Map<string, number>()
  const anchors = new Set<string>()
  for (const [, line] of proseLines(markdown)) {
    const heading = /^#{1,6} (.+)$/.exec(line)
    if (!heading) continue
    const slug = heading[1]
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .toLowerCase()
      .replace(/[^\p{L}\p{N} _-]/gu, '')
      .replace(/ /g, '-')
    const count = seen.get(slug) ?? 0
    seen.set(slug, count + 1)
    anchors.add(count ? `${slug}-${count}` : slug)
  }
  return anchors
}

/** Every problem found, as `file:line: message` or `file message`. */
export function checkDocs(input: DocsInput): string[] {
  const { files, tracked, entry, unreachable, status } = input
  const exists = (path: string) =>
    tracked.has(path) || [...tracked].some((file) => file.startsWith(`${path}/`))
  const problems: string[] = []
  const edges = new Map<string, string[]>()

  for (const [file, text] of files) {
    const targets: string[] = []
    for (const { line, target } of links(text, file)) {
      const [path, anchor] = target.split('#')
      const resolved = path
        ? posix.normalize(posix.join(posix.dirname(file), decodeURI(path))).replace(/\/$/, '')
        : file
      if (!exists(resolved)) {
        problems.push(`${file}:${line}: ${path} does not exist`)
        continue
      }
      targets.push(resolved)
      if (anchor && resolved.endsWith('.md') && !headingAnchors(files.get(resolved)!).has(anchor)) {
        problems.push(`${file}:${line}: ${path || file} has no heading for #${anchor}`)
      }
    }
    edges.set(file, targets)
  }

  const reached = new Set([entry])
  const queue = [entry]
  for (let file = queue.shift(); file; file = queue.shift()) {
    for (const next of edges.get(file)!) {
      if (next.endsWith('.md') && !reached.has(next)) {
        reached.add(next)
        queue.push(next)
      }
    }
  }
  for (const file of files.keys()) {
    const exempt = unreachable.some((entry) =>
      entry.endsWith('/') ? file.startsWith(entry) : file === entry,
    )
    if (file.endsWith('.md') && !reached.has(file) && !exempt) {
      problems.push(`${file} is not reachable by links from ${entry}`)
    }
  }

  const lines = files.get(status.path)!.trimEnd().split('\n').length
  if (lines > status.maxLines) {
    problems.push(
      `${status.path} has ${lines} lines, over its budget of ${status.maxLines}; archive integrated sections`,
    )
  }
  return problems
}
