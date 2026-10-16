import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import type { AppInfo } from '../../commands'
import AboutSummary from './AboutSummary.vue'

const info: AppInfo = {
  version: '1.2.0',
  build: { kind: 'release' },
  folder: '/local/astral-index',
  file: '/local/astral-index/history.sqlite',
  portable: false,
}
const button = (wrapper: ReturnType<typeof mount>, name: string) =>
  wrapper.findAll('button').find((each) => each.text() === name)!
const text = (wrapper: ReturnType<typeof mount>) => wrapper.text().replace(/\s+/g, ' ')

test('names the app, its version and licence, and what it is not', () => {
  const wrapper = mount(AboutSummary, { props: { info, read: 'read', failed: null } })
  expect(wrapper.get('[role=img]').attributes('aria-label')).toBe('Astral Index')
  expect(wrapper.get('.version').text()).toBe('Version 1.2.0 · MIT License')
  expect(text(wrapper)).toContain(
    'Astral Index is not affiliated with or endorsed by HoYoverse; game names and trademarks belong to their owners. History is retrieved only when requested, and only from HoYoverse’s history service, with no telemetry. Statistics are calculated from saved rolls; keeping the history complete is up to the user.',
  )
  // Before the details are read, the version is left out rather than guessed.
  const unread = mount(AboutSummary, { props: { info: null, read: 'read', failed: null } })
  expect(unread.get('.version').text()).toBe('MIT License')
})

test('says which build it is: a release, a CI build of a commit, or a local build', () => {
  const shown = (build: AppInfo['build']) =>
    mount(AboutSummary, { props: { info: { ...info, build }, read: 'read', failed: null } })
      .get('.version')
      .text()
  expect(shown({ kind: 'release' })).toBe('Version 1.2.0 · MIT License')
  expect(shown({ kind: 'dev', commit: 'a1b2c3d' })).toBe(
    'Version 1.2.0 · dev build a1b2c3d · MIT License',
  )
  // A local build's version means nothing, so it is left out.
  expect(shown({ kind: 'local' })).toBe('Local build · MIT License')
})

test('shows where the history is kept and how to back it up', () => {
  const wrapper = mount(AboutSummary, { props: { info, read: 'read', failed: null } })
  expect(wrapper.get('#about-data').text()).toBe('Saved History')
  expect(wrapper.get('.mode').text()).toBe('App data folder')
  expect(wrapper.get('.path').text()).toBe('/local/astral-index')
  expect(text(wrapper)).toContain('To back up the history, use Backup & Restore.')
  const portable = mount(AboutSummary, {
    props: {
      info: { ...info, folder: 'D:\\AstralIndex\\data', portable: true },
      read: 'read',
      failed: null,
    },
  })
  expect(portable.get('.mode').text()).toBe('Portable mode')
  expect(portable.get('.path').text()).toBe('D:\\AstralIndex\\data')
})

test('without a data folder there is nothing to show or open', () => {
  for (const unknown of [null, { ...info, folder: null, file: null }]) {
    const wrapper = mount(AboutSummary, { props: { info: unknown, read: 'read', failed: null } })
    expect(wrapper.find('.path').exists()).toBe(false)
    expect(wrapper.find('.mode').exists()).toBe(false)
    expect(button(wrapper, 'Show in Folder')).toBeUndefined()
    expect(text(wrapper)).toContain('No data folder is available on this device.')
  }
})

test('each button asks for its action', async () => {
  const wrapper = mount(AboutSummary, { props: { info, read: 'read', failed: null } })
  for (const name of ['Show in Folder', 'Issues Page', 'Licence Text', 'Third-Party Notices']) {
    await button(wrapper, name).trigger('click')
  }
  for (const event of ['reveal', 'issues', 'licence', 'notices']) {
    expect(wrapper.emitted(event)).toHaveLength(1)
  }
  expect(text(wrapper)).toContain(
    'Provide the version and operating system; never include the warp history link, an account UID or the history database.',
  )
})

test('a failed opening is announced beside what failed', () => {
  const folder = mount(AboutSummary, { props: { info, read: 'read', failed: 'folder' } })
  expect(folder.findAll('[role=alert]').map((alert) => alert.text())).toEqual([
    'The folder couldn’t be opened. Its path is shown above.',
  ])
  expect(
    folder
      .get('#about-data')
      .element.closest('section')!
      .contains(folder.get('[role=alert]').element),
  ).toBe(true)
  const issues = mount(AboutSummary, { props: { info, read: 'read', failed: 'issues' } })
  expect(issues.findAll('[role=alert]').map((alert) => alert.text())).toEqual([
    'The issues page couldn’t be opened. Its address is github.com/shra-ja/astral-index/issues.',
  ])
  expect(
    issues
      .get('#about-reports')
      .element.closest('section')!
      .contains(issues.get('[role=alert]').element),
  ).toBe(true)
  expect(
    mount(AboutSummary, { props: { info, read: 'read', failed: null } })
      .find('[role=alert]')
      .exists(),
  ).toBe(false)
})
