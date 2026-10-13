// The third-party notices (decision 0025): every component the release build ships,
// with its version, licence, source and licence text. Pure functions over what
// cargo-about reports for the crates, what the bundler reports for the npm packages,
// and the bundled font's package; the gate in `tests/notices.test.ts` gathers those
// and writes or checks the committed files.

/** What cargo-about's JSON output holds that the notices need. */
export interface CargoAboutReport {
  licenses: { id: string; text: string; used_by: { crate: { name: string; version: string } }[] }[]
}
/** An npm package as the bundler's licence report gives it. */
export interface Package {
  name: string
  version: string
  license: string | null
  licenseText: string | null
}
export interface Sources {
  cargo: CargoAboutReport
  /** The packages the frontend bundle contains. */
  npm: Package[]
  /** The bundled typeface, which the bundle reaches through CSS. */
  font: Package
}
type Kind = 'crate' | 'npm' | 'font'
export interface Component {
  name: string
  version: string
  kind: Kind
  /** Where the component's published source is. */
  source: string
  /** Each licence that applies, with the index of its text. */
  licences: { id: string; text: number }[]
}
/** The notices: each distinct licence text once, and the components that use them. */
export interface Notices {
  texts: string[]
  components: Component[]
}

/** The licences listed in cargo-about's `accepted` setting. */
export function acceptedLicences(toml: string): string[] {
  const list = /^accepted = \[([\s\S]*?)^\]/m.exec(toml)?.[1] ?? ''
  return [...list.matchAll(/^\s*"([^"]+)"/gm)].map((match) => match[1])
}

/**
 * The licences an SPDX expression applies under, taking its first alternative whose
 * every part is accepted, or none. Enough for the simple expressions npm packages use.
 */
export function chooseLicence(expression: string, accepted: string[]): string[] | undefined {
  return expression
    .replace(/[()]/g, '')
    .split(' OR ')
    .map((alternative) => alternative.split(' AND ').map((part) => part.trim()))
    .find((parts) => parts.every((part) => accepted.includes(part)))
}

const sourceOf = (kind: Kind, name: string, version: string) =>
  kind === 'crate'
    ? `https://crates.io/crates/${name}/${version}`
    : `https://www.npmjs.com/package/${name}/v/${version}`

/** Gather the components and their texts, and every reason the notices are incomplete. */
export function buildNotices(sources: Sources, accepted: string[]) {
  const texts: string[] = []
  const problems: string[] = []
  const components = new Map<string, Component>()
  // Texts keep Unix line endings, as the repository stores them (`.gitattributes`).
  const textIndex = (raw: string) => {
    const text = raw.replace(/\r\n?/g, '\n')
    const known = texts.indexOf(text)
    return known >= 0 ? known : texts.push(text) - 1
  }
  const add = (kind: Kind, name: string, version: string, id: string, text: string) => {
    const key = `${kind} ${name} ${version}`
    const component = components.get(key) ?? {
      name,
      version,
      kind,
      source: sourceOf(kind, name, version),
      licences: [],
    }
    component.licences.push({ id, text: textIndex(text) })
    components.set(key, component)
  }

  for (const { id, text, used_by } of sources.cargo.licenses) {
    for (const { crate } of used_by) {
      if (accepted.includes(id)) add('crate', crate.name, crate.version, id, text)
      else problems.push(`crate ${crate.name} ${crate.version}: ${id} is not an accepted licence`)
    }
  }
  const packages: [Kind, Package][] = [
    ...sources.npm.map((pkg): [Kind, Package] => ['npm', pkg]),
    ['font', sources.font],
  ]
  for (const [kind, { name, version, license, licenseText }] of packages) {
    const ids = chooseLicence(license ?? '', accepted)
    if (!licenseText?.trim()) problems.push(`${kind} ${name} ${version}: no licence text`)
    else if (!ids)
      problems.push(`${kind} ${name} ${version}: no accepted licence in ${license ?? '(none)'}`)
    else for (const id of ids) add(kind, name, version, id, licenseText)
  }

  // Crates, then npm packages, then the font, each by name and then version; a plain
  // comparison, so the order never depends on the machine's locale.
  const order: Kind[] = ['crate', 'npm', 'font']
  const compare = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0)
  const sorted = [...components.values()].sort(
    (a, b) =>
      order.indexOf(a.kind) - order.indexOf(b.kind) ||
      compare(a.name, b.name) ||
      compare(a.version, b.version),
  )
  return { notices: { texts, components: sorted }, problems }
}

/** The notices as plain text, for shipping beside the app. */
export function noticesText({ texts, components }: Notices): string {
  const ids = (component: Component) => component.licences.map(({ id }) => id).join(' AND ')
  const listed = components.map(
    (component) =>
      `- ${component.name} ${component.version} (${component.kind}, ${ids(component)}): ${component.source}`,
  )
  const sections = texts.map((text, index) => {
    const users = components.flatMap((component) =>
      component.licences
        .filter((licence) => licence.text === index)
        .map((licence) => ({ licence, component })),
    )
    const names = users.map(({ component }) => `${component.name} ${component.version}`)
    return `${users[0].licence.id}, used by ${names.join(', ')}\n${'-'.repeat(78)}\n${text.trimEnd()}\n`
  })
  return [
    'Third-party notices for Astral Index',
    '',
    'Astral Index includes the components below, each under its own licence. The',
    'licence texts follow, each with the components it covers.',
    '',
    'Components',
    '',
    ...listed,
    '',
    'Licence texts',
    '',
    sections.join('\n'),
  ].join('\n')
}
