import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import type { HistoryContents } from '../../commands'
import { localDateTime } from '../../format'
import ContentsPanel from './ContentsPanel.vue'

const account = (uid: string, server: string, rolls: number) => ({
  uid,
  server,
  timezone: 8,
  rolls,
})
const LAST = {
  imported_at: 1790000000,
  source: 'hoyoverse' as const,
  uid: '800000117',
  server: 'prod_official_asia',
  inserted: 96,
}
const BACKUP: HistoryContents = {
  accounts: [
    account('800000117', 'prod_official_asia', 2030),
    account('800004421', 'prod_official_eur', 312),
  ],
  last_import: LAST,
}
const panel = (props: {
  contents: HistoryContents | null
  compared?: HistoryContents
  accent?: boolean
  empty?: string
  unreadable?: string
}) =>
  mount(ContentsPanel, {
    props: {
      id: 'in-backup',
      title: 'In the Backup',
      tag: 'Becomes your history',
      empty: 'None.',
      ...props,
    },
  })
const rows = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('li').map((row) => row.findAll('span').map((part) => part.text()))

test('names its section, then shows the totals, each account and the last import', () => {
  const wrapper = panel({ contents: BACKUP, accent: true })
  const section = wrapper.get('section')
  expect(section.attributes('aria-labelledby')).toBe('in-backup')
  expect(section.classes()).toContain('accent')
  expect(wrapper.get('h2#in-backup').text()).toBe('In the Backup')
  expect(wrapper.get('.tag').text()).toBe('Becomes your history')
  expect(wrapper.findAll('.figure').map((figure) => figure.text())).toEqual([
    'Rolls2,342',
    'Accounts2',
  ])
  expect(rows(wrapper)).toEqual([
    ['UID 800000117', 'Asia', '2,030 rolls'],
    ['UID 800004421', 'Europe', '312 rolls'],
  ])
  expect(wrapper.get('.last').text()).toBe(
    `Last import${localDateTime(LAST.imported_at)}·Retrieved from HoYoverse·UID 800000117 (Asia)·96 new rolls saved`,
  )
})

test('marks the accounts missing from the history it is compared with', () => {
  const current: HistoryContents = {
    accounts: [
      account('800000117', 'prod_official_asia', 2244),
      account('800009999', 'prod_official_asia', 51),
      // The same UID on another server is another account.
      account('800000117', 'prod_official_eur', 7),
    ],
    last_import: null,
  }
  const wrapper = panel({ contents: current, compared: BACKUP })
  expect(wrapper.get('section').classes()).not.toContain('accent')
  expect(rows(wrapper)).toEqual([
    ['UID 800000117', 'Asia', '2,244 rolls'],
    ['UID 800009999', 'Asia', 'Not in the backup', '51 rolls'],
    ['UID 800000117', 'Europe', 'Not in the backup', '7 rolls'],
  ])
  // With no import, there is no last import to show.
  expect(wrapper.find('.last').exists()).toBe(false)
})

test('an empty history says so instead of totals', () => {
  const wrapper = panel({
    contents: { accounts: [], last_import: null },
    empty: 'Nothing saved yet.',
  })
  expect(wrapper.find('.figure').exists()).toBe(false)
  expect(wrapper.find('ul').exists()).toBe(false)
  expect(wrapper.get('.empty').text()).toBe('Nothing saved yet.')
})

test('a history that couldn’t be read says so in place of its contents', () => {
  const wrapper = panel({ contents: null, unreadable: 'It couldn’t be read.' })
  expect(wrapper.get('.empty').text()).toBe('It couldn’t be read.')
  expect(wrapper.find('li').exists()).toBe(false)
})
