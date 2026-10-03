import { mount } from '@vue/test-utils'
import { expect, test } from 'vitest'
import RollPager from './RollPager.vue'

function mountPager(page: number, pages: number, total = pages * 20) {
  return mount(RollPager, { props: { page, pages, pageSize: 20, total } })
}
type Wrapper = ReturnType<typeof mountPager>
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

test('says which rows are shown and windows the page numbers around the current one', () => {
  expect(mountPager(1, 1, 7).get('.showing').text()).toBe('Showing 1–7 of 7')
  expect(mountPager(3, 63, 1250).get('.showing').text()).toBe('Showing 41–60 of 1,250')
  expect(shown(mountPager(1, 1))).toEqual(['[1]'])
  expect(shown(mountPager(1, 63))).toEqual(['[1]', '2', '…', '63'])
  expect(shown(mountPager(3, 63))).toEqual(['1', '2', '[3]', '4', '…', '63'])
  expect(shown(mountPager(4, 63))).toEqual(['1', '2', '3', '[4]', '5', '…', '63'])
  expect(shown(mountPager(30, 63))).toEqual(['1', '…', '29', '[30]', '31', '…', '63'])
  expect(shown(mountPager(63, 63))).toEqual(['1', '…', '62', '[63]'])
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
