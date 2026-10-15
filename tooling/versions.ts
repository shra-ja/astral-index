// No manifest declares the app's version: builds receive it from the release tags
// (decision 0030), so a version written into a manifest would only go stale. The
// Tauri CLI requires a Cargo version, so `0.0.0` stands in as a placeholder. Pure
// functions over file contents; the gate in `tests/versions.test.ts` reads the files.

/** The only version a manifest may declare. */
const PLACEHOLDER = '0.0.0'

/** The version in a Cargo manifest's `[package]` section, the lines up to the next section. */
function packageVersion(toml: string): string | undefined {
  const lines = toml.split('\n')
  const start = lines.indexOf('[package]') + 1
  const end = lines.findIndex((line, index) => index >= start && line.startsWith('['))
  const section = lines.slice(start, end < 0 ? undefined : end)
  return start > 0
    ? section.map((line) => /^version = "(.+)"$/.exec(line)?.[1]).find(Boolean)
    : undefined
}

/** The version a manifest declares, or undefined when it declares none. */
export function declaredVersion(path: string, text: string): string | undefined {
  if (path.endsWith('.toml')) return packageVersion(text)
  const { version } = JSON.parse(text) as { version?: unknown }
  return typeof version === 'string' ? version : undefined
}

/** Problems with the versions `files` declare: any but the placeholder. */
export function versionProblems(files: ReadonlyMap<string, string>): string[] {
  return [...files].flatMap(([path, text]) => {
    const version = declaredVersion(path, text)
    return version === undefined || version === PLACEHOLDER
      ? []
      : [
          `${path} declares version ${version}, not the ${PLACEHOLDER} placeholder; release tags carry the version (decision 0030)`,
        ]
  })
}
