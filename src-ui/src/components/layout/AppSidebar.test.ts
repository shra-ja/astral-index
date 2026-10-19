import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import router from '../../router'
import AppSidebar from './AppSidebar.vue'

type Game = 'genshin-impact' | 'honkai-star-rail'
const sidebar = (
  game: Game,
  screen: 'history' | 'import' | 'backup',
  games: Game[] = ['genshin-impact', 'honkai-star-rail'],
) => mount(AppSidebar, { props: { game, screen, games }, global: { plugins: [router] } })
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
  expect(links(wrapper, 'sidebar-games')).toEqual([
    ['Genshin Impact', '#/genshin-impact/history', undefined],
    ['Honkai: Star Rail', '#/honkai-star-rail/history', 'true'],
  ])
  expect(links(wrapper, 'sidebar-screens')).toEqual([
    ['Warp History', '#/honkai-star-rail/history', 'page'],
    ['Import', '#/honkai-star-rail/import', undefined],
  ])
  // Backup & Restore covers every game, in a group of its own (decision 0033).
  expect(wrapper.get('#sidebar-data').text()).toBe('Data')
  expect(links(wrapper, 'sidebar-data')).toEqual([['Backup & Restore', '#/backup', undefined]])
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

test('on Backup & Restore no game is current, and the game shown last keeps its screens', () => {
  const wrapper = sidebar('genshin-impact', 'backup')
  // Choosing a game opens its history.
  expect(links(wrapper, 'sidebar-games')).toEqual([
    ['Genshin Impact', '#/genshin-impact/history', undefined],
    ['Honkai: Star Rail', '#/honkai-star-rail/history', undefined],
  ])
  expect(links(wrapper, 'sidebar-screens')).toEqual([
    ['Wish History', '#/genshin-impact/history', undefined],
    ['Import', '#/genshin-impact/import', undefined],
  ])
  expect(links(wrapper, 'sidebar-data')).toEqual([['Backup & Restore', '#/backup', 'page']])
})

test('lists only the games the build shows', () => {
  const wrapper = sidebar('honkai-star-rail', 'import', ['honkai-star-rail'])
  expect(wrapper.get('#sidebar-games').text()).toBe('Game')
  expect(links(wrapper, 'sidebar-games')).toEqual([
    ['Honkai: Star Rail', '#/honkai-star-rail/import', 'true'],
  ])
  expect(wrapper.text()).not.toContain('Genshin')
})

test('labels stay in each link, beside the game monograms, for the expanded sidebar', () => {
  const wrapper = sidebar('honkai-star-rail', 'import')
  expect(wrapper.findAll('a').map((link) => link.text())).toEqual([
    'GIGenshin Impact',
    'SRHonkai: Star Rail',
    'Warp History',
    'Import',
    'Backup & Restore',
  ])
})

test('each link names itself in a tooltip beside it, for the icon rail', () => {
  const wrapper = sidebar('honkai-star-rail', 'history')
  expect(
    wrapper.findAll('li').map((item) => {
      const tooltip = item.get('[role="tooltip"]')
      return [tooltip.text(), tooltip.attributes('data-placement')]
    }),
  ).toEqual([
    ['Genshin Impact', 'right'],
    ['Honkai: Star Rail', 'right'],
    ['Warp History', 'right'],
    ['Import', 'right'],
    ['Backup & Restore', 'right'],
  ])
  // The links already carry their names, so the tooltips only show them.
  expect(
    wrapper.findAll('a').every((link) => link.attributes('aria-describedby') === undefined),
  ).toBe(true)
})

test('names the app with the wordmark beside the decorative emblem', () => {
  const brand = sidebar('honkai-star-rail', 'history').get('.brand')
  const wordmark = brand.get('img')
  expect(wordmark.attributes('alt')).toBe('Astral Index')
  expect(wordmark.attributes('src')).toContain('astral-index-wordmark-small.svg')
  expect(brand.get('.astral-emblem').attributes('aria-hidden')).toBe('true')
  // The wordmark is the title: no live text repeats it.
  expect(brand.text()).toBe('')
})

test('an About button above the device note asks for the About dialog', async () => {
  const wrapper = sidebar('honkai-star-rail', 'history')
  const about = wrapper.get('button.about')
  expect(about.attributes('aria-label')).toBe('About')
  expect(about.attributes('aria-haspopup')).toBe('dialog')
  expect(about.text()).toBe('About')
  // Named in a tooltip for the icon rail, like the links.
  const tooltip = about.element.parentElement!.querySelector('[role="tooltip"]')!
  expect([tooltip.textContent, tooltip.getAttribute('data-placement')]).toEqual(['About', 'right'])
  // It sits after the screens and before the note at the foot.
  const note = wrapper.get('.local').element
  expect(
    about.element.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy()
  await about.trigger('click')
  expect(wrapper.emitted('about')).toHaveLength(1)
})
