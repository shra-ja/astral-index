import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import emblem from '../../assets/brand/astral-index-emblem-small.svg?raw'
import AstralTile from './AstralTile.vue'

// The drawing that matters: the canvas, the group's fill and placement, and each path.
const drawing = (svg: Element) => ({
  viewBox: svg.getAttribute('viewBox'),
  group: [
    svg.querySelector('g')?.getAttribute('fill'),
    svg.querySelector('g')?.getAttribute('transform'),
  ],
  paths: [...svg.querySelectorAll('path')].map((path) => [
    path.getAttribute('d'),
    path.getAttribute('transform'),
  ]),
})

test('draws the supplied small emblem exactly, in the current colour', () => {
  const supplied = new DOMParser().parseFromString(emblem, 'image/svg+xml').documentElement
  const tile = mount(AstralTile).get('svg').element
  expect(drawing(supplied).paths).toHaveLength(7)
  expect(drawing(tile)).toEqual(drawing(supplied))
  expect(drawing(tile).group[0]).toBe('currentColor')
})

test('is decorative, without the file’s title or description to show as a tooltip', () => {
  const wrapper = mount(AstralTile)
  expect(wrapper.attributes('aria-hidden')).toBe('true')
  expect(wrapper.find('title').exists()).toBe(false)
  expect(wrapper.find('desc').exists()).toBe(false)
  expect(wrapper.get('svg').attributes('role')).toBeUndefined()
})
