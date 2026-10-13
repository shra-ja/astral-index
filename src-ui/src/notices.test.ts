import { expect, test } from 'vitest'
import { loadNotices, noticesFrom, type Notices } from './notices'

const notices: Notices = {
  texts: ['MIT License…'],
  components: [
    {
      name: 'serde',
      version: '1.0.0',
      kind: 'crate',
      source: 'https://crates.io/crates/serde/1.0.0',
      licences: [{ id: 'MIT', text: 0 }],
    },
  ],
}

test('the generated notices load when the build made them', async () => {
  const files = { './assets/third-party-notices.json': () => Promise.resolve(notices) }
  expect(await noticesFrom(files)).toBe(notices)
})

test('without generated notices, as in development, there are none', async () => {
  expect(await noticesFrom({})).toBeNull()
})

test('the app’s own loader finds the generated file or nothing, never failing', async () => {
  const loaded = await loadNotices()
  expect(loaded === null || Array.isArray(loaded.components)).toBe(true)
})
