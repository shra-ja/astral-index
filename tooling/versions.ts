// The app's version is written in four manifests, and the native side reports one
// of them to the About dialog, so they must agree. Pure functions over file
// contents; the gate in `tests/versions.test.ts` reads the files.

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

/** Problems with the versions `files` declare: a missing one, or any disagreement. */
export function versionProblems(files: ReadonlyMap<string, string>): string[] {
  const declared = [...files].map(([path, text]) => [path, declaredVersion(path, text)] as const)
  const missing = declared
    .filter(([, version]) => version === undefined)
    .map(([path]) => `${path} declares no version`)
  const found = declared.filter(([, version]) => version !== undefined)
  const differ = new Set(found.map(([, version]) => version)).size > 1
  const listed = found.map(([path, version]) => `${path} ${version}`).join(', ')
  return differ ? [...missing, `versions differ: ${listed}`] : missing
}
