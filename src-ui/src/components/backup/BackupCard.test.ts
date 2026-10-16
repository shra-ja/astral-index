import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import BackupCard from './BackupCard.vue'

const NAME = 'Astral-Index-backup-2026-10-16.sqlite'
const status = (wrapper: ReturnType<typeof mount>) => wrapper.get('[role="status"]').text()

test('offers a backup of everything saved, and asks for it with an event', async () => {
  const wrapper = mount(BackupCard, { props: { state: 'idle' } })
  expect(wrapper.get('h3').text()).toBe('Backup')
  expect(wrapper.findAll('li').map((item) => item.text())).toEqual([
    'Every account, roll and import in one file',
    'Restore it here or on another computer',
    'Written on this device; nothing is sent anywhere',
  ])
  const button = wrapper.get('button')
  expect(button.text()).toBe('Save backup…')
  expect(button.attributes('disabled')).toBeUndefined()
  expect(status(wrapper)).toBe('')
  await button.trigger('click')
  expect(wrapper.emitted('save')).toHaveLength(1)
})

test('while saving the button waits; then it names the file or says what went wrong', async () => {
  const wrapper = mount(BackupCard, { props: { state: 'saving' } })
  expect(wrapper.get('button').text()).toBe('Saving backup…')
  expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  await wrapper.setProps({ state: 'saved', name: NAME })
  expect(wrapper.get('button').text()).toBe('Save backup…')
  expect(status(wrapper)).toBe(`Saved ${NAME}`)
  expect(wrapper.find('[role="status"] .saved').exists()).toBe(true)
  await wrapper.setProps({
    state: 'failed',
    name: null,
    message: 'The backup couldn’t be saved there. Choose another folder and try again.',
  })
  expect(status(wrapper)).toBe(
    'The backup couldn’t be saved there. Choose another folder and try again.',
  )
  expect(wrapper.find('[role="status"] .failed').exists()).toBe(true)
})
