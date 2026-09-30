import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import GameSelect from './GameSelect.vue'

test('offers each game by name under a label, showing the bound game', () => {
  const wrapper = mount(GameSelect, { props: { modelValue: 'honkai-star-rail' } })
  const select = wrapper.get('select')
  expect(wrapper.get('label').text()).toBe('Your game')
  expect(wrapper.get('label').attributes('for')).toBe(select.attributes('id'))
  expect(
    select.findAll('option').map((option) => [option.attributes('value'), option.text()]),
  ).toEqual([
    ['genshin-impact', 'Genshin Impact'],
    ['honkai-star-rail', 'Honkai: Star Rail'],
  ])
  expect((select.element as HTMLSelectElement).value).toBe('honkai-star-rail')
})

test('choosing a game updates the binding', async () => {
  const wrapper = mount(GameSelect, { props: { modelValue: 'genshin-impact' } })
  await wrapper.get('select').setValue('honkai-star-rail')
  expect(wrapper.emitted('update:modelValue')).toEqual([['honkai-star-rail']])
})
