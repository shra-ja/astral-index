import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import RestoreCard from './RestoreCard.vue'

const status = (wrapper: ReturnType<typeof mount>) => wrapper.get('[role="status"]').text()

test('offers restoring a backup, and asks for one with an event', async () => {
  const wrapper = mount(RestoreCard, { props: { checking: false } })
  expect(wrapper.get('h3').text()).toBe('Restore')
  expect(wrapper.get('h3 + p').text()).toBe(
    'Replace your saved history with a backup’s. Your current history is kept as a safety copy first.',
  )
  expect(wrapper.findAll('li').map((item) => item.text())).toEqual([
    'Backups from this or any earlier version of Astral Index',
    'Shows what will change before anything is replaced',
  ])
  const button = wrapper.get('button')
  expect(button.text()).toBe('Restore from backup…')
  expect(button.classes()).toContain('secondary')
  expect(button.attributes('disabled')).toBeUndefined()
  expect(status(wrapper)).toBe('')
  await button.trigger('click')
  expect(wrapper.emitted('choose')).toHaveLength(1)
})

test('while checking the button waits; a refusal says why', async () => {
  const wrapper = mount(RestoreCard, { props: { checking: true } })
  expect(wrapper.get('button').text()).toBe('Checking backup…')
  expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  await wrapper.setProps({
    checking: false,
    outcome: { kind: 'failed', message: 'This backup is damaged and can’t be restored.' },
  })
  expect(wrapper.get('button').text()).toBe('Restore from backup…')
  expect(status(wrapper)).toBe('This backup is damaged and can’t be restored.')
  expect(wrapper.find('[role="status"] .failed').exists()).toBe(true)
})

test('a restore names the backup, and the safety copy when the history was kept', async () => {
  const wrapper = mount(RestoreCard, {
    props: {
      checking: false,
      outcome: {
        kind: 'restored',
        name: 'Astral-Index-backup-2026-10-16.sqlite',
        safetyCopy: 'history-before-restore-20261020-143005.sqlite',
      },
    },
  })
  expect(status(wrapper)).toBe(
    'Restored Astral-Index-backup-2026-10-16.sqlite. Your previous history is kept in the data folder as history-before-restore-20261020-143005.sqlite.',
  )
  expect(wrapper.find('[role="status"] .done').exists()).toBe(true)
  expect(wrapper.findAll('[role="status"] .name').map((name) => name.text())).toEqual([
    'Astral-Index-backup-2026-10-16.sqlite',
    'history-before-restore-20261020-143005.sqlite',
  ])
  // With no history before, nothing was kept.
  await wrapper.setProps({
    outcome: { kind: 'restored', name: 'Astral-Index-backup-2026-10-16.sqlite', safetyCopy: null },
  })
  expect(status(wrapper)).toBe('Restored Astral-Index-backup-2026-10-16.sqlite.')
})

test('its button can take focus again, once the confirmation closes', () => {
  const wrapper = mount(RestoreCard, { props: { checking: false }, attachTo: document.body })
  ;(wrapper.vm as unknown as { focus: () => void }).focus()
  expect(document.activeElement).toBe(wrapper.get('button').element)
  wrapper.unmount()
})
