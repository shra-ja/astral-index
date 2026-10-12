import { expect, test } from 'vitest'
import { acceptedLicences, buildNotices, chooseLicence, noticesText, type Sources } from './notices'

const accepted = ['MIT', 'Apache-2.0', 'ISC', 'MPL-2.0', 'OFL-1.1']
const mit = (holder: string) =>
  `MIT License\n\nCopyright (c) ${holder}\n\nPermission is hereby granted…`
const crate = (name: string, version: string) => ({ crate: { name, version } })
const sources = (overrides: Partial<Sources> = {}): Sources => ({
  cargo: {
    licenses: [
      {
        id: 'MIT',
        text: mit('Serde'),
        used_by: [crate('serde', '1.0.0'), crate('serde_json', '1.0.1')],
      },
      {
        id: 'MPL-2.0',
        text: 'Mozilla Public License Version 2.0…',
        used_by: [crate('cssparser', '0.37.0')],
      },
      { id: 'MIT', text: mit('Tauri'), used_by: [crate('tauri', '2.12.0')] },
    ],
  },
  npm: [
    { name: 'vue', version: '3.5.43', license: 'MIT', licenseText: mit('Evan You') },
    {
      name: '@tauri-apps/api',
      version: '2.12.0',
      license: 'Apache-2.0 OR MIT',
      licenseText: mit('Tauri'),
    },
  ],
  font: {
    name: '@fontsource-variable/hanken-grotesk',
    version: '5.3.0',
    license: 'OFL-1.1',
    licenseText: 'SIL Open Font License…',
  },
  ...overrides,
})

test('the accepted licences are read from cargo-about’s settings', () => {
  const toml = [
    '# notes',
    'accepted = [',
    '    "MIT",',
    '    "Apache-2.0", # dual',
    ']',
    'targets = ["x"]',
  ].join('\n')
  expect(acceptedLicences(toml)).toEqual(['MIT', 'Apache-2.0'])
  expect(acceptedLicences('targets = []')).toEqual([])
})

test('an expression’s first accepted choice is taken, all of an AND', () => {
  expect(chooseLicence('MIT', accepted)).toEqual(['MIT'])
  expect(chooseLicence('Apache-2.0 OR MIT', accepted)).toEqual(['Apache-2.0'])
  expect(chooseLicence('(GPL-3.0 OR MIT)', accepted)).toEqual(['MIT'])
  expect(chooseLicence('MIT AND ISC', accepted)).toEqual(['MIT', 'ISC'])
  expect(chooseLicence('GPL-3.0', accepted)).toBeUndefined()
  expect(chooseLicence('MIT AND GPL-3.0', accepted)).toBeUndefined()
})

test('every component is listed once with its source, and identical texts are shared', () => {
  const { notices, problems } = buildNotices(sources(), accepted)
  expect(problems).toEqual([])
  expect(notices.components).toEqual([
    {
      name: 'cssparser',
      version: '0.37.0',
      kind: 'crate',
      source: 'https://crates.io/crates/cssparser/0.37.0',
      licences: [{ id: 'MPL-2.0', text: 1 }],
    },
    {
      name: 'serde',
      version: '1.0.0',
      kind: 'crate',
      source: 'https://crates.io/crates/serde/1.0.0',
      licences: [{ id: 'MIT', text: 0 }],
    },
    {
      name: 'serde_json',
      version: '1.0.1',
      kind: 'crate',
      source: 'https://crates.io/crates/serde_json/1.0.1',
      licences: [{ id: 'MIT', text: 0 }],
    },
    {
      name: 'tauri',
      version: '2.12.0',
      kind: 'crate',
      source: 'https://crates.io/crates/tauri/2.12.0',
      licences: [{ id: 'MIT', text: 2 }],
    },
    {
      name: '@tauri-apps/api',
      version: '2.12.0',
      kind: 'npm',
      source: 'https://www.npmjs.com/package/@tauri-apps/api/v/2.12.0',
      licences: [{ id: 'Apache-2.0', text: 2 }],
    },
    {
      name: 'vue',
      version: '3.5.43',
      kind: 'npm',
      source: 'https://www.npmjs.com/package/vue/v/3.5.43',
      licences: [{ id: 'MIT', text: 3 }],
    },
    {
      name: '@fontsource-variable/hanken-grotesk',
      version: '5.3.0',
      kind: 'font',
      source: 'https://www.npmjs.com/package/@fontsource-variable/hanken-grotesk/v/5.3.0',
      licences: [{ id: 'OFL-1.1', text: 4 }],
    },
  ])
  // The Tauri crate's text and the API package's are the same, so they share one.
  expect(notices.texts).toEqual([
    mit('Serde'),
    'Mozilla Public License Version 2.0…',
    mit('Tauri'),
    mit('Evan You'),
    'SIL Open Font License…',
  ])
})

test('a crate under two licences lists both', () => {
  const both = sources({
    cargo: {
      licenses: [
        { id: 'Apache-2.0', text: 'Apache License…', used_by: [crate('ring', '0.17.14')] },
        { id: 'ISC', text: 'ISC License…', used_by: [crate('ring', '0.17.14')] },
      ],
    },
    npm: [],
  })
  expect(buildNotices(both, accepted).notices.components[0].licences).toEqual([
    { id: 'Apache-2.0', text: 0 },
    { id: 'ISC', text: 1 },
  ])
})

test('two versions of one crate are listed apart, in version order', () => {
  const twice = sources({
    cargo: {
      licenses: [
        {
          id: 'MIT',
          text: mit('miniz'),
          used_by: [crate('miniz_oxide', '0.9.1'), crate('miniz_oxide', '0.8.9')],
        },
      ],
    },
    npm: [],
  })
  expect(
    buildNotices(twice, accepted).notices.components.map(
      ({ name, version }) => `${name} ${version}`,
    ),
  ).toEqual(['miniz_oxide 0.8.9', 'miniz_oxide 0.9.1', '@fontsource-variable/hanken-grotesk 5.3.0'])
})

test('a missing text or an unaccepted licence is a problem naming the component', () => {
  const failing = sources({
    cargo: {
      licenses: [{ id: 'GPL-3.0', text: 'GNU GPL…', used_by: [crate('copyleft', '1.0.0')] }],
    },
    npm: [
      { name: 'untexted', version: '1.0.0', license: 'MIT', licenseText: null },
      { name: 'unlicensed', version: '2.0.0', license: null, licenseText: 'Some text' },
      { name: 'blank', version: '3.0.0', license: 'MIT', licenseText: '  \n' },
    ],
  })
  expect(buildNotices(failing, accepted).problems).toEqual([
    'crate copyleft 1.0.0: GPL-3.0 is not an accepted licence',
    'npm untexted 1.0.0: no licence text',
    'npm unlicensed 2.0.0: no accepted licence in (none)',
    'npm blank 3.0.0: no licence text',
  ])
})

test('licence texts are kept with Unix line endings, so they match their committed copy', () => {
  const windows = sources({
    cargo: { licenses: [] },
    npm: [
      {
        name: 'crlf',
        version: '1.0.0',
        license: 'MIT',
        licenseText: 'MIT License\r\n\r\nCopyright\r',
      },
    ],
  })
  const { notices } = buildNotices(windows, accepted)
  expect(notices.texts[0]).toBe('MIT License\n\nCopyright\n')
  expect(noticesText(notices)).not.toContain('\r')
})

test('the plain-text notices list the components, then each text with who uses it', () => {
  const { notices } = buildNotices(sources(), accepted)
  const text = noticesText(notices)
  expect(text.startsWith('Third-party notices for Astral Index\n\n')).toBe(true)
  expect(text).toContain(
    '- cssparser 0.37.0 (crate, MPL-2.0): https://crates.io/crates/cssparser/0.37.0\n',
  )
  expect(text).toContain('- @fontsource-variable/hanken-grotesk 5.3.0 (font, OFL-1.1): ')
  expect(text).toContain(
    `MIT, used by serde 1.0.0, serde_json 1.0.1\n${'-'.repeat(78)}\n${mit('Serde')}\n`,
  )
  expect(text).toContain(`MIT, used by tauri 2.12.0, @tauri-apps/api 2.12.0\n`)
  expect(text.endsWith('\n')).toBe(true)
})
