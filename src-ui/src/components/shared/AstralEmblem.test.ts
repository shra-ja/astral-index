import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import emblem from '../../assets/brand/astral-index-emblem-small.svg?raw'
import AstralEmblem from './AstralEmblem.vue'

// The drawing that matters: the group's fill and placement, and each path.
const drawing = (svg: Element) => ({
  group: [
    svg.querySelector('g')?.getAttribute('fill'),
    svg.querySelector('g')?.getAttribute('transform'),
  ],
  paths: [...svg.querySelectorAll('path')].map((path) => [
    path.getAttribute('d'),
    path.getAttribute('transform'),
  ]),
})

test('draws the supplied small emblem exactly, in the current colour, cropped to its artwork', () => {
  const supplied = new DOMParser().parseFromString(emblem, 'image/svg+xml').documentElement
  const drawn = mount(AstralEmblem).get('svg').element
  expect(drawing(supplied).paths).toHaveLength(7)
  expect(drawing(drawn)).toEqual(drawing(supplied))
  expect(drawing(drawn).group[0]).toBe('currentColor')
  // The brand's crop for the small emblem without its tile.
  expect(drawn.getAttribute('viewBox')).toBe('40.76 66.68 189.39 129.72')
})

test('is decorative, without the file’s title or description to show as a tooltip', () => {
  const wrapper = mount(AstralEmblem)
  expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true')
  expect(wrapper.find('title').exists()).toBe(false)
  expect(wrapper.find('desc').exists()).toBe(false)
  expect(wrapper.get('svg').attributes('role')).toBeUndefined()
})
