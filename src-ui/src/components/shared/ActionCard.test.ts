import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import ActionCard from './ActionCard.vue'

const card = () =>
  mount(ActionCard, {
    props: {
      id: 'card-title',
      title: 'Backup',
      text: 'Save a copy.',
      points: ['One', 'Two'],
    },
    slots: {
      icon: '<svg class="glyph" />',
      default: '<fieldset class="extra" />',
      actions: '<button type="button">Save</button>',
    },
  })

test('names its section by its heading and shows the text, points and slots in order', () => {
  const wrapper = card()
  const section = wrapper.get('section')
  expect(section.attributes('aria-labelledby')).toBe('card-title')
  expect(wrapper.get('h3#card-title').text()).toBe('Backup')
  expect(wrapper.get('h3 + p').text()).toBe('Save a copy.')
  expect(wrapper.findAll('li').map((item) => item.text())).toEqual(['One', 'Two'])
  expect(wrapper.find('ul + .extra').exists()).toBe(true)
  expect(wrapper.get('.actions button').text()).toBe('Save')
})

test('hides the icon from screen readers and marks an accented one', async () => {
  const wrapper = card()
  const icon = wrapper.get('.icon')
  expect(icon.attributes('aria-hidden')).toBe('true')
  expect(icon.find('.glyph').exists()).toBe(true)
  expect(icon.classes()).not.toContain('accent')
  await wrapper.setProps({ accent: true })
  expect(wrapper.get('.icon').classes()).toContain('accent')
})
