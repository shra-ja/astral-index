import { mount } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import CategoryTabs from './CategoryTabs.vue'

// jsdom has no layout: each test sets the widths the component measures, then
// reports a resize as the browser would.
let resized: () => void
vi.stubGlobal(
  'ResizeObserver',
  class {
    constructor(callback: () => void) {
      resized = callback
    }
    observe() {}
    disconnect() {}
  },
)
afterEach(() => vi.clearAllMocks())

const tabs = [
  { gacha_type: '11', label: 'Character Event', total: 1250 },
  { gacha_type: '12', label: 'Light Cone Event', total: 0 },
  { gacha_type: '1', label: 'Stellar', total: 300 },
]
function mountTabs() {
  return mount(CategoryTabs, { props: { tabs, selected: '11' } })
}
type Wrapper = ReturnType<typeof mountTabs>
// Give the frame and the two measuring rows their widths, then report a resize.
async function layout(wrapper: Wrapper, frame: number, full = 600, bare = 400) {
  const width = (selector: string, property: string, value: number) =>
    Object.defineProperty(wrapper.get(selector).element, property, {
      value,
      configurable: true,
    })
  width('.category-tabs', 'clientWidth', frame)
  width('.measure .full', 'offsetWidth', full)
  width('.measure .bare', 'offsetWidth', bare)
  resized()
  await wrapper.vm.$nextTick()
}
const shownTabs = (wrapper: Wrapper) =>
  wrapper
    .findAll('.tabs:not(.measure *) button')
    .map((tab) => [tab.text(), tab.attributes('aria-pressed')])

test('tabs with counts mark the selected category and choose another', async () => {
  const wrapper = mountTabs()
  await layout(wrapper, 800)
  expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe('Banner category')
  expect(shownTabs(wrapper)).toEqual([
    ['Character Event 1,250', 'true'],
    ['Light Cone Event 0', 'false'],
    ['Stellar 300', 'false'],
  ])
  expect(wrapper.find('select').exists()).toBe(false)
  await wrapper.findAll('.tabs:not(.measure *) button')[2].trigger('click')
  expect(wrapper.emitted('select')).toEqual([['1']])
})

test('counts drop first, then the tabs become a dropdown, and return with room', async () => {
  const wrapper = mountTabs()
  await layout(wrapper, 500)
  expect(shownTabs(wrapper).map(([text]) => text)).toEqual([
    'Character Event',
    'Light Cone Event',
    'Stellar',
  ])
  await layout(wrapper, 300)
  expect(shownTabs(wrapper)).toEqual([])
  const select = wrapper.get('select')
  expect(wrapper.get('label.select').text()).toContain('Banner category')
  expect(select.findAll('option').map((option) => option.text())).toEqual([
    'Character Event · 1,250',
    'Light Cone Event · 0',
    'Stellar · 300',
  ])
  expect((select.element as HTMLSelectElement).value).toBe('11')
  await select.setValue('12')
  expect(wrapper.emitted('select')).toEqual([['12']])
  await layout(wrapper, 600)
  expect(shownTabs(wrapper)).toHaveLength(3)
  expect(wrapper.find('select').exists()).toBe(false)
})

test('new counts are measured again, and the observer stops on unmount', async () => {
  const disconnect = vi.spyOn(ResizeObserver.prototype, 'disconnect')
  const wrapper = mountTabs()
  await layout(wrapper, 500, 450)
  expect(shownTabs(wrapper)[0][0]).toBe('Character Event 1,250')
  // Longer counts no longer fit beside the labels.
  Object.defineProperty(wrapper.get('.measure .full').element, 'offsetWidth', { value: 550 })
  await wrapper.setProps({ tabs: tabs.map((tab) => ({ ...tab, total: tab.total * 100 })) })
  await wrapper.vm.$nextTick()
  expect(shownTabs(wrapper)[0][0]).toBe('Character Event')
  wrapper.unmount()
  expect(disconnect).toHaveBeenCalled()
})
