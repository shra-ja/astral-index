import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import type { CheckedBackup } from '../../commands'
import RestoreConfirm from './RestoreConfirm.vue'

const account = (uid: string, rolls: number) => ({
  uid,
  server: 'prod_official_asia',
  timezone: 8,
  rolls,
})
const CHECKED: CheckedBackup = {
  name: 'Astral-Index-backup-2026-10-16.sqlite',
  backup: { accounts: [account('800000117', 2030), account('800004421', 312)], last_import: null },
  current: { accounts: [account('800000117', 2244), account('800009999', 51)], last_import: null },
}
const confirm = (checked = CHECKED) =>
  mount(RestoreConfirm, { props: { checked, restoring: false }, attachTo: document.body })
const note = (wrapper: ReturnType<typeof mount>) => wrapper.find('.safety')

test('compares the backup with the current history, marking what the backup lacks', () => {
  const wrapper = confirm()
  const panels = wrapper.findAll('section')
  expect(panels.map((panel) => panel.get('h2').text())).toEqual([
    'In the Backup',
    'Your Current History',
  ])
  expect(panels.map((panel) => panel.get('.tag').text())).toEqual([
    'Becomes your history',
    'Kept as a safety copy',
  ])
  expect(panels[0].classes()).toContain('accent')
  expect(panels[0].find('.missing').exists()).toBe(false)
  expect(panels[1].findAll('.missing').map((chip) => chip.text())).toEqual(['Not in the backup'])
  expect(note(wrapper).text()).toBe(
    'Before anything is replaced, your current history is copied to a safety copy in the data folder, named with the date and time. Accounts not in the backup keep their rolls there.',
  )
  expect(wrapper.get('.footnote').text()).toBe(
    'Restoring replaces 2,295 rolls in 2 accounts with 2,342 rolls in 2 accounts.',
  )
  wrapper.unmount()
})

test('takes focus as it appears, so screen readers announce it', () => {
  const wrapper = confirm()
  expect(document.activeElement).toBe(wrapper.get('.intro').element)
  wrapper.unmount()
})

test('Cancel asks to close and Restore to restore; while restoring, both wait', async () => {
  const wrapper = confirm()
  const [cancel, restore] = wrapper.findAll('footer button')
  expect(cancel.text()).toBe('Cancel')
  await cancel.trigger('click')
  expect(wrapper.emitted('cancel')).toHaveLength(1)
  expect(restore.text()).toBe('Restore backup')
  expect(restore.attributes('disabled')).toBeUndefined()
  await restore.trigger('click')
  expect(wrapper.emitted('restore')).toHaveLength(1)
  await wrapper.setProps({ restoring: true })
  expect(restore.text()).toBe('Restoring…')
  expect([cancel, restore].map((button) => button.attributes('disabled'))).toEqual(['', ''])
  wrapper.unmount()
})

test('over an empty history nothing is replaced, so no safety copy is mentioned', () => {
  const wrapper = confirm({ ...CHECKED, current: { accounts: [], last_import: null } })
  expect(wrapper.findAll('section')[1].get('.empty').text()).toBe(
    'No history is saved on this device yet, so nothing is replaced.',
  )
  expect(note(wrapper).exists()).toBe(false)
  expect(wrapper.get('.footnote').text()).toBe('Restoring saves 2,342 rolls in 2 accounts.')
  wrapper.unmount()
})

test('without missing accounts the note says only where the copy goes', () => {
  const wrapper = confirm({ ...CHECKED, current: CHECKED.backup })
  expect(note(wrapper).text()).toBe(
    'Before anything is replaced, your current history is copied to a safety copy in the data folder, named with the date and time.',
  )
  wrapper.unmount()
})

test('over a history that couldn’t be upgraded, it says it can’t be compared and is kept as it is', () => {
  const wrapper = confirm({ ...CHECKED, current: null })
  expect(wrapper.get('#in-current').element.closest('section')!.textContent).toContain(
    'Your current history couldn’t be upgraded, so it can’t be compared. It’s kept as a safety copy exactly as it is.',
  )
  // A safety copy is always kept, so the note shows; no account can be told missing.
  expect(note(wrapper).exists()).toBe(true)
  expect(note(wrapper).text()).not.toContain('Accounts not in the backup')
  expect(wrapper.get('.footnote').text()).toBe(
    'Restoring replaces your current history with 2,342 rolls in 2 accounts.',
  )
  wrapper.unmount()
})
