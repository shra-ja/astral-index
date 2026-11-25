// The third-party notices (decision 0025): `npm run notices`, which every build runs,
// writes them from what the release build ships, and fails when a component has no
// licence text or a licence is outside the accepted list. They are not committed.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import license from 'rollup-plugin-license'
import { build } from 'vite'
import { expect, test } from 'vitest'
import {
  acceptedLicences,
  buildNotices,
  noticesText,
  type CargoAboutReport,
  type Package,
  type Sourced,
} from '../tooling/notices'

const files = {
  json: 'src-ui/src/assets/third-party-notices.json',
  text: 'THIRD-PARTY-NOTICES',
}

/** The crates in the release dependency graph, offline, with cargo-about's settings. */
function crates(): CargoAboutReport {
  const json = execFileSync(
    'cargo',
    ['about', 'generate', '--format', 'json', '--config', 'about.toml', '--frozen'],
    { cwd: 'src-tauri', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  return JSON.parse(json) as CargoAboutReport
}

/**
 * The npm packages the production bundle contains, from a build that writes nothing.
 * Vitest sets `NODE_ENV` to `test`, which Vite would follow, so the build sets it back
 * to `production` while it runs: only then does it leave out development-only code.
 */
async function bundled(): Promise<Package[]> {
  let packages: Package[] = []
  const environment = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    await build({
      configFile: 'src-ui/vite.config.ts',
      root: 'src-ui',
      mode: 'production',
      logLevel: 'silent',
      build: { write: false },
      plugins: [
        license({
          thirdParty: {
            includePrivate: false,
            output: (dependencies) => {
              packages = dependencies.map(({ name, version, license, licenseText }) => ({
                name: name ?? '',
                version: version ?? '',
                license,
                licenseText,
              }))
            },
          },
        }),
      ],
    })
  } finally {
    process.env.NODE_ENV = environment
  }
  return packages
}

/** The bundled typeface's package, which the bundle reaches through CSS. */
function font(): Package {
  const resolve = createRequire(join(process.cwd(), 'src-ui/package.json')).resolve
  const manifest = resolve('@fontsource-variable/hanken-grotesk/package.json')
  const { name, version, license } = JSON.parse(readFileSync(manifest, 'utf8')) as Package
  const text = join(dirname(manifest), 'LICENSE')
  return {
    name,
    version,
    license,
    licenseText: existsSync(text) ? readFileSync(text, 'utf8') : null,
  }
}

/**
 * The data files the app bundles from elsewhere, each with its licence from its folder
 * in `src-tauri/schemas/`: UIGF's schema, for validating exports. Every folder there is
 * listed, so none ships without its notice, and its README names the pinned commit the
 * source links to.
 */
function data(): Sourced[] {
  const files = {
    uigf: {
      name: 'UIGF schema',
      version: 'v4.2',
      license: 'MIT',
      repository: 'UIGF-org/UIGF-org.github.io',
      commit: '9570eeecd1bf4b60734274afbe72e82ff9c789d4',
      path: 'docs/.vuepress/public/schema/uigf.json',
    },
  }
  expect(readdirSync('src-tauri/schemas').sort(), 'every bundled data folder is listed').toEqual(
    Object.keys(files).sort(),
  )
  return Object.entries(files).map(([folder, { repository, commit, path, ...file }]) => {
    const dir = `src-tauri/schemas/${folder}`
    expect(readFileSync(`${dir}/README.md`, 'utf8'), `${dir}/README.md`).toContain(commit)
    return {
      ...file,
      licenseText: readFileSync(`${dir}/LICENSE`, 'utf8'),
      source: `https://github.com/${repository}/blob/${commit}/${path}`,
    }
  })
}

/** The notices as files, with every reason they would be incomplete. */
async function generate() {
  const accepted = acceptedLicences(readFileSync('src-tauri/about.toml', 'utf8'))
  const { notices, problems } = buildNotices(
    { cargo: crates(), npm: await bundled(), font: font(), data: data() },
    accepted,
  )
  return { problems, json: `${JSON.stringify(notices, null, 2)}\n`, text: noticesText(notices) }
}

test('generate notices', async () => {
  const fresh = await generate()
  expect(fresh.problems).toEqual([])
  writeFileSync(files.json, fresh.json)
  writeFileSync(files.text, fresh.text)
}, 300000)
