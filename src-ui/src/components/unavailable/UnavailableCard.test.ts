import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import UnavailableCard from './UnavailableCard.vue'

type Props = { copy: string | null; checking?: boolean; failure?: string | null }
const card = (props: Props) =>
  mount(UnavailableCard, { props: { checking: false, ...props }, attachTo: document.body })
const button = (wrapper: ReturnType<typeof card>, name: string) =>
  wrapper.findAll('button').find((candidate) => candidate.text() === name)!

test('says the history failed to upgrade, names the copy and how to use it again', () => {
  const wrapper = card({ copy: 'history-v2-20261021-143000.sqlite' })
  const alert = wrapper.get('[role="alert"]')
  expect(alert.get('h2').text()).toBe('Your History Couldn’t Be Upgraded')
  // The alert is named by its heading.
  expect(alert.get(`#${alert.attributes('aria-labelledby')}`).element).toBe(alert.get('h2').element)
  expect(document.activeElement).toBe(alert.get('h2').element)
  expect(alert.text()).toContain(
    'This version of Astral Index stores history in a new format, and your existing history failed to upgrade automatically to support it. Nothing was changed, but your history can’t be shown or added to until this is fixed.',
  )
  expect(wrapper.get('.copy').text()).toContain('A copy was kept before the upgrade')
  expect(wrapper.get('.copy .name').text()).toBe('history-v2-20261021-143000.sqlite')
  expect(wrapper.get('.copy').text()).toContain('in the data folder beside your history.')
  expect(wrapper.findAll('ol li').map((item) => item.text())).toEqual([
    'If you’ve just updated Astral Index, reinstall the version you used before. Your history is unchanged, so it opens there as it did.',
    'Report this problem, so it can be fixed in the next version.',
    'Or restore a backup, which replaces this history and keeps it as a safety copy.',
  ])
  wrapper.unmount()
})

test('without a copy, it says none could be kept', () => {
  const wrapper = card({ copy: null })
  expect(wrapper.get('.copy').text()).toContain('No copy could be kept')
  expect(wrapper.get('.copy').text()).toContain(
    'Your history itself is unchanged, in the data folder.',
  )
  expect(wrapper.find('.copy .name').exists()).toBe(false)
  wrapper.unmount()
})

test('it asks to open the folder, report the problem or restore a backup', async () => {
  const wrapper = card({ copy: null })
  await button(wrapper, 'Open folder').trigger('click')
  await button(wrapper, 'Report this problem').trigger('click')
  await button(wrapper, 'Restore a backup…').trigger('click')
  expect(wrapper.emitted('reveal')).toHaveLength(1)
  expect(wrapper.emitted('report')).toHaveLength(1)
  expect(wrapper.emitted('restore')).toHaveLength(1)
  ;(wrapper.vm as unknown as { focus: () => void }).focus()
  expect(document.activeElement).toBe(button(wrapper, 'Restore a backup…').element)
  wrapper.unmount()
})

test('while a backup is checked it waits, and a failure shows in its status line', async () => {
  const wrapper = card({ copy: null, checking: true })
  const restore = wrapper.get('button[aria-describedby="unavailable-status"]')
  expect(restore.text()).toBe('Checking backup…')
  expect(restore.attributes('disabled')).toBeDefined()
  expect(wrapper.get('#unavailable-status').attributes('role')).toBe('status')
  expect(wrapper.get('#unavailable-status').text()).toBe('')
  await wrapper.setProps({
    checking: false,
    failure: 'This backup is damaged and can’t be restored.',
  })
  expect(wrapper.get('#unavailable-status').text()).toBe(
    'This backup is damaged and can’t be restored.',
  )
  wrapper.unmount()
})
