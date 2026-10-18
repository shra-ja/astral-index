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
  mount(RestoreConfirm, { props: { checked }, attachTo: document.body })
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

test('Cancel asks to close; Restore is not available yet', async () => {
  const wrapper = confirm()
  const [cancel, restore] = wrapper.findAll('footer button')
  expect(cancel.text()).toBe('Cancel')
  await cancel.trigger('click')
  expect(wrapper.emitted('cancel')).toHaveLength(1)
  expect(restore.text()).toBe('Restore backup')
  expect(restore.attributes('aria-disabled')).toBe('true')
  const tip = document.getElementById(restore.attributes('aria-describedby')!)
  expect(tip?.textContent).toBe('Restoring isn’t available yet.')
  await restore.trigger('click')
  expect(Object.keys(wrapper.emitted())).not.toContain('restore')
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
