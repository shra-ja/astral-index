import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import AboutSummary from './AboutSummary.vue'

const info = { version: '0.1.0', folder: '/local/astral-index', portable: false }
const button = (wrapper: ReturnType<typeof mount>, name: string) =>
  wrapper.findAll('button').find((each) => each.text() === name)!
const text = (wrapper: ReturnType<typeof mount>) => wrapper.text().replace(/\s+/g, ' ')

test('names the app, its version and licence, and what it is not', () => {
  const wrapper = mount(AboutSummary, { props: { info, failed: null } })
  expect(wrapper.get('[role=img]').attributes('aria-label')).toBe('Astral Index')
  expect(wrapper.get('.version').text()).toBe('Version 0.1.0 · MIT License')
  expect(text(wrapper)).toContain(
    'Astral Index is not affiliated with or endorsed by HoYoverse; game names and trademarks belong to their owners. History is retrieved only when requested, and only from HoYoverse’s history service, with no telemetry. Statistics are calculated from saved rolls; keeping the history complete is up to the user.',
  )
  // Before the details are read, the version is left out rather than guessed.
  const unread = mount(AboutSummary, { props: { info: null, failed: null } })
  expect(unread.get('.version').text()).toBe('MIT License')
})

test('shows where the history is kept and how to back it up', () => {
  const wrapper = mount(AboutSummary, { props: { info, failed: null } })
  expect(wrapper.get('#about-data').text()).toBe('Saved History')
  expect(wrapper.get('.mode').text()).toBe('App data folder')
  expect(wrapper.get('.path').text()).toBe('/local/astral-index')
  expect(text(wrapper)).toContain(
    'To back up the history, close Astral Index and copy history.sqlite from this folder.',
  )
  const portable = mount(AboutSummary, {
    props: { info: { ...info, folder: 'D:\\AstralIndex\\data', portable: true }, failed: null },
  })
  expect(portable.get('.mode').text()).toBe('Portable mode')
  expect(portable.get('.path').text()).toBe('D:\\AstralIndex\\data')
})

test('without a data folder there is nothing to show or open', () => {
  for (const unknown of [null, { ...info, folder: null }]) {
    const wrapper = mount(AboutSummary, { props: { info: unknown, failed: null } })
    expect(wrapper.find('.path').exists()).toBe(false)
    expect(wrapper.find('.mode').exists()).toBe(false)
    expect(button(wrapper, 'Show in Folder')).toBeUndefined()
    expect(text(wrapper)).toContain('No data folder is available on this device.')
  }
})

test('each button asks for its action', async () => {
  const wrapper = mount(AboutSummary, { props: { info, failed: null } })
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
  const folder = mount(AboutSummary, { props: { info, failed: 'folder' } })
  expect(folder.findAll('[role=alert]').map((alert) => alert.text())).toEqual([
    'The folder couldn’t be opened. Its path is shown above.',
  ])
  expect(
    folder
      .get('#about-data')
      .element.closest('section')!
      .contains(folder.get('[role=alert]').element),
  ).toBe(true)
  const issues = mount(AboutSummary, { props: { info, failed: 'issues' } })
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
    mount(AboutSummary, { props: { info, failed: null } })
      .find('[role=alert]')
      .exists(),
  ).toBe(false)
})
