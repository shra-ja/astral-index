import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import type { FileAccount, FileContents } from '../../commands'
import FileAccounts from './FileAccounts.vue'

const importable = (uid: string, server: string, rolls: number): FileAccount => ({
  uid,
  kind: 'importable',
  server,
  rolls,
})
const contents = (accounts: FileAccount[], more: Partial<FileContents> = {}): FileContents => ({
  accounts,
  malformed_uids: 0,
  other_games: [],
  ...more,
})
const picker = (read: FileContents, busy = false) =>
  mount(FileAccounts, {
    props: { name: 'export.json', contents: read, busy },
    attachTo: document.body,
  })
const button = (wrapper: ReturnType<typeof picker>, name: string) =>
  wrapper.findAll('button').find((candidate) => candidate.text() === name)!
const choices = (wrapper: ReturnType<typeof picker>) =>
  wrapper
    .findAll<HTMLInputElement>('input[type="radio"]')
    .map((radio) => [
      radio.element.labels![0].textContent.replace(/\s+/g, ' ').trim(),
      radio.element.checked,
    ])

const mixed = contents(
  [
    importable('800000117', 'prod_official_asia', 2030),
    { uid: '700000311', kind: 'timezone_mismatch' },
    importable('600000204', 'prod_official_usa', 1),
    { uid: '800000118', kind: 'records', missing: { name: 12 }, invalid: 3, newer_categories: 0 },
  ],
  { malformed_uids: 1, other_games: ['hk4e'] },
)

test('lists the importable accounts to choose from, the first chosen, with the rest explained', () => {
  const wrapper = picker(mixed)
  expect(wrapper.get('h2').text()).toBe('Choose an Account')
  expect(document.activeElement).toBe(wrapper.get('h2').element)
  expect(wrapper.get('.intro p').text()).toBe(
    'export.json holds 4 Star Rail accounts. Choose one to review; to import another afterwards, choose the file again.',
  )
  expect(wrapper.get('legend').text()).toBe('Can be imported')
  expect(choices(wrapper)).toEqual([
    ['UID 800000117 Asia 2,030 rolls', true],
    ['UID 600000204 America 1 roll', false],
  ])
  expect(wrapper.get('.blocked h3').text()).toBe('Can’t be imported')
  expect(
    wrapper
      .findAll('.blocked li')
      .map((item) => [item.get('.uid').text(), item.get('.reason').text()]),
  ).toEqual([
    ['UID 700000311', 'Its time zone in the file differs from its server’s.'],
    ['UID 800000118', '12 records lack an item name; 3 records have values that can’t be read.'],
  ])
  expect(wrapper.findAll('.left-out li').map((item) => item.text())).toEqual([
    '1 more account has a UID that isn’t a number, so it isn’t listed.',
    'The file’s Genshin Impact history was left out: only Star Rail is read from files.',
  ])
  expect(wrapper.get('.footnote').text()).toBe(
    'The review shows what saving would add. Nothing is saved yet.',
  )
  wrapper.unmount()
})

test('the chosen account is reviewed, by its button or Enter, and Cancel leaves', async () => {
  const wrapper = picker(mixed)
  await button(wrapper, 'Review account').trigger('click')
  await wrapper.findAll('input[type="radio"]')[1].setValue(true)
  // Enter in the form submits it, as the Review button does.
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted('review')).toEqual([['800000117'], ['600000204']])
  await button(wrapper, 'Cancel').trigger('click')
  expect(wrapper.emitted('cancel')).toHaveLength(1)
  wrapper.unmount()
})

test('while an account is previewed or the file left, nothing more can be asked', async () => {
  const wrapper = picker(mixed, true)
  expect(button(wrapper, 'Review account').attributes('disabled')).toBeDefined()
  expect(button(wrapper, 'Cancel').attributes('disabled')).toBeDefined()
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted()).not.toHaveProperty('review')
  wrapper.unmount()
})

test('a file whose accounts can’t be imported has nothing to review, only Cancel', async () => {
  const wrapper = picker(contents([{ uid: '800000001', kind: 'no_rolls' }]))
  expect(wrapper.get('.intro p').text()).toBe(
    'export.json holds 1 Star Rail account. It can’t be imported.',
  )
  expect(wrapper.find('fieldset').exists()).toBe(false)
  expect(wrapper.find('.left-out').exists()).toBe(false)
  expect(button(wrapper, 'Review account').attributes('disabled')).toBeDefined()
  await wrapper.get('form').trigger('submit')
  expect(wrapper.emitted()).not.toHaveProperty('review')
  wrapper.unmount()
  const two = picker(
    contents([
      { uid: '800000001', kind: 'no_rolls' },
      { uid: '800000002', kind: 'repeated' },
    ]),
  )
  expect(two.get('.intro p').text()).toBe(
    'export.json holds 2 Star Rail accounts. None of them can be imported.',
  )
  two.unmount()
})

test('a lone importable account is offered for review, with what was left out', () => {
  const wrapper = picker(
    contents([importable('800000001', 'prod_official_asia', 5)], { other_games: ['nap'] }),
  )
  expect(wrapper.get('.intro p').text()).toBe(
    'export.json holds 1 Star Rail account. Review it to see what saving would add.',
  )
  expect(choices(wrapper)).toEqual([['UID 800000001 Asia 5 rolls', true]])
  expect(wrapper.find('.blocked').exists()).toBe(false)
  wrapper.unmount()
})
