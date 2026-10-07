import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import LayoutSwitch from './LayoutSwitch.vue'

const render = (layout: 'list' | 'grid') => mount(LayoutSwitch, { props: { layout } })

test('offers each layout as a toggle in a named group, pressing the current one', () => {
  const wrapper = render('list')
  expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('Layout')
  expect(
    wrapper
      .findAll('button')
      .map((button) => [button.attributes('aria-label'), button.attributes('aria-pressed')]),
  ).toEqual([
    ['List view', 'true'],
    ['Grid view', 'false'],
  ])
  // Icon-only buttons, named in styled tooltips under the pointer or on focus.
  expect(wrapper.findAll('[role="tooltip"]').map((tip) => tip.text())).toEqual(['List', 'Grid'])
  expect(
    render('grid')
      .findAll('button')
      .map((button) => button.attributes('aria-pressed')),
  ).toEqual(['false', 'true'])
})

test('choosing a layout asks for it', async () => {
  const wrapper = render('list')
  await wrapper.findAll('button')[1].trigger('click')
  await wrapper.findAll('button')[0].trigger('click')
  expect(wrapper.emitted('change')).toEqual([['grid'], ['list']])
})
