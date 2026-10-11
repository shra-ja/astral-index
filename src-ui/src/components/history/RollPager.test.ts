import { mount } from '@vue/test-utils'
import { afterEach, expect, test, vi } from 'vitest'
import RollPager from './RollPager.vue'

// jsdom has no layout: a test sets the widths the pager measures, then reports a
// resize as the browser would.
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

function mountPager(page: number, pages: number, total = pages * 20) {
  return mount(RollPager, { props: { page, pages, pageSize: 20, total } })
}
type Wrapper = ReturnType<typeof mountPager>
interface Widths {
  showing?: number
  nav?: number
  control?: number
  label?: number
}
// Give the pager and the parts it measures their widths, then report a resize.
async function layout(
  wrapper: Wrapper,
  pager: number,
  { showing = 200, nav = 356, control = 70, label = 100 }: Widths = {},
) {
  const width = (selector: string, property: string, value: number) =>
    Object.defineProperty(wrapper.get(selector).element, property, {
      value,
      configurable: true,
    })
  width('.roll-pager', 'clientWidth', pager)
  width('.measure .showing', 'offsetWidth', showing)
  width('nav', 'offsetWidth', nav)
  width('.control', 'offsetWidth', control)
  width('.measure .size-label', 'offsetWidth', label)
  resized()
  await wrapper.vm.$nextTick()
}
const arrangement = (wrapper: Wrapper) =>
  ['full', 'bare', 'stacked'].find((each) => wrapper.classes().includes(each))
// The page buttons and gaps as shown, the current page in brackets.
const shown = (wrapper: Wrapper) =>
  wrapper
    .findAll('nav > *')
    .slice(1, -1)
    .map((item) =>
      item.element.tagName === 'BUTTON'
        ? item.attributes('aria-current')
          ? `[${item.text()}]`
          : item.text()
        : '…',
    )
const button = (wrapper: Wrapper, name: string) =>
  wrapper.findAll('nav button').find((each) => each.attributes('aria-label') === name)!

test('says which rows are shown and keeps seven page places around the current one', () => {
  expect(mountPager(1, 1, 7).get('.showing').text()).toBe('Showing 1–7 of 7')
  expect(mountPager(3, 63, 1250).get('.showing').text()).toBe('Showing 41–60 of 1,250')
  expect(shown(mountPager(1, 1))).toEqual(['[1]'])
  expect(shown(mountPager(2, 7))).toEqual(['1', '[2]', '3', '4', '5', '6', '7'])
  // With more pages, the first and last stay, and gaps stand for skipped pages, in
  // seven places whatever the page, so the buttons never move.
  expect(shown(mountPager(1, 63))).toEqual(['[1]', '2', '3', '4', '5', '…', '63'])
  expect(shown(mountPager(4, 63))).toEqual(['1', '2', '3', '[4]', '5', '…', '63'])
  expect(shown(mountPager(5, 63))).toEqual(['1', '…', '4', '[5]', '6', '…', '63'])
  expect(shown(mountPager(30, 63))).toEqual(['1', '…', '29', '[30]', '31', '…', '63'])
  expect(shown(mountPager(59, 63))).toEqual(['1', '…', '58', '[59]', '60', '…', '63'])
  expect(shown(mountPager(60, 63))).toEqual(['1', '…', '59', '[60]', '61', '62', '63'])
  expect(shown(mountPager(63, 63))).toEqual(['1', '…', '59', '60', '61', '62', '[63]'])
  expect(shown(mountPager(1, 8))).toEqual(['[1]', '2', '3', '4', '5', '…', '8'])
  // Every place is as wide as the last page's number needs.
  expect(mountPager(1, 63).get('nav').attributes('style')).toBe('--digits: 2;')
  expect(mountPager(1, 120).get('nav').attributes('style')).toBe('--digits: 3;')
})

test('moves between pages, with previous and next disabled at the ends', async () => {
  const first = mountPager(1, 3)
  expect(button(first, 'Previous page').attributes('disabled')).toBeDefined()
  expect(button(first, 'Page 2').text()).toBe('2')
  await button(first, 'Next page').trigger('click')
  await button(first, 'Page 3').trigger('click')
  expect(first.emitted('go')).toEqual([[2], [3]])
  const last = mountPager(3, 3)
  expect(button(last, 'Next page').attributes('disabled')).toBeDefined()
  await button(last, 'Previous page').trigger('click')
  expect(last.emitted('go')).toEqual([[2]])
})

test('offers 20, 50 or 100 rows per page', async () => {
  const wrapper = mountPager(1, 3)
  const select = wrapper.get('select')
  expect(wrapper.get('label').text()).toContain('Rows per page')
  expect(select.findAll('option').map((option) => option.text())).toEqual(['20', '50', '100'])
  expect((select.element as HTMLSelectElement).value).toBe('20')
  await select.setValue('50')
  expect(wrapper.emitted('resize')).toEqual([[50]])
})

test('keeps to one line while it fits, hiding its label first, then takes two', async () => {
  const wrapper = mountPager(3, 63, 1250)
  // It measures the widest rows text, the last page's, so pages never change its lines.
  expect(wrapper.get('.measure .showing').text()).toBe('Showing 1,241–1,250 of 1,250')
  // One line, with the page numbers centred: twice the wider side, the pages and the
  // 24px gaps, here 2 × 200 + 356 + 48.
  await layout(wrapper, 804)
  expect(arrangement(wrapper)).toBe('full')
  await layout(wrapper, 803)
  expect(arrangement(wrapper)).toBe('stacked')
  // With shorter rows text the label is the wider side, so it goes first: with it,
  // 2 × (100 + 10 + 70) + 356 + 48; without it, 2 × 120 + 356 + 48.
  await layout(wrapper, 764, { showing: 120 })
  expect(arrangement(wrapper)).toBe('full')
  await layout(wrapper, 763, { showing: 120 })
  expect(arrangement(wrapper)).toBe('bare')
  await layout(wrapper, 644, { showing: 120 })
  expect(arrangement(wrapper)).toBe('bare')
  await layout(wrapper, 643, { showing: 120 })
  expect(arrangement(wrapper)).toBe('stacked')
  // Hidden or not, the label still names its select.
  expect(wrapper.get('label').text()).toContain('Rows per page')
})

test('measures again when its rows change, and stops when removed', async () => {
  const disconnect = vi.spyOn(ResizeObserver.prototype, 'disconnect')
  const wrapper = mountPager(1, 3, 45)
  await layout(wrapper, 800, { showing: 120 })
  expect(arrangement(wrapper)).toBe('full')
  // Many more rows make the rows text wider than the pager can keep on one line.
  Object.defineProperty(wrapper.get('.measure .showing').element, 'offsetWidth', {
    value: 300,
  })
  await wrapper.setProps({ pages: 63, total: 1250 })
  await wrapper.vm.$nextTick()
  expect(arrangement(wrapper)).toBe('stacked')
  wrapper.unmount()
  expect(disconnect).toHaveBeenCalled()
})
