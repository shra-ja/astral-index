import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import router from '../../router'
import AppSidebar from './AppSidebar.vue'

const sidebar = (game: 'genshin-impact' | 'honkai-star-rail', screen: 'history' | 'import') =>
  mount(AppSidebar, { props: { game, screen }, global: { plugins: [router] } })
const links = (wrapper: ReturnType<typeof sidebar>, group: string) =>
  wrapper
    .get(`[aria-labelledby="${group}"]`)
    .findAll('a')
    .map((link) => [
      link.attributes('aria-label'),
      link.attributes('href'),
      link.attributes('aria-current'),
    ])

test('lists the games and screens as links, marking the current ones', () => {
  const wrapper = sidebar('honkai-star-rail', 'history')
  expect(wrapper.get('nav').attributes('aria-label')).toBe('Main')
  expect(wrapper.text()).toContain('Roll Tracker')
  expect(links(wrapper, 'sidebar-games')).toEqual([
    ['Genshin Impact', '#/genshin-impact/history', undefined],
    ['Honkai: Star Rail', '#/honkai-star-rail/history', 'true'],
  ])
  expect(links(wrapper, 'sidebar-screens')).toEqual([
    ['Warp History', '#/honkai-star-rail/history', 'page'],
    ['Import', '#/honkai-star-rail/import', undefined],
  ])
  expect(wrapper.text()).toContain('Stored on this device')
  expect(wrapper.text()).toContain('No account, no cloud sync')
})

test('switching games keeps the current screen, and each game names its history', () => {
  const wrapper = sidebar('genshin-impact', 'import')
  expect(links(wrapper, 'sidebar-games')).toEqual([
    ['Genshin Impact', '#/genshin-impact/import', 'true'],
    ['Honkai: Star Rail', '#/honkai-star-rail/import', undefined],
  ])
  expect(links(wrapper, 'sidebar-screens')).toEqual([
    ['Wish History', '#/genshin-impact/history', undefined],
    ['Import', '#/genshin-impact/import', 'page'],
  ])
})

test('labels stay in each link, beside the game monograms, for the expanded sidebar', () => {
  const wrapper = sidebar('honkai-star-rail', 'import')
  expect(wrapper.findAll('a').map((link) => link.text())).toEqual([
    'GIGenshin Impact',
    'SRHonkai: Star Rail',
    'Warp History',
    'Import',
  ])
})
