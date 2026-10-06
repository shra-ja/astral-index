import { mount } from '@vue/test-utils'
import { afterEach, expect, test } from 'vitest'
import DateRangeFilter from './DateRangeFilter.vue'

type Props = { from?: string; to?: string; offset: string; span?: string }
let wrapper: ReturnType<typeof render>
const render = (props: Props) =>
  mount(DateRangeFilter, {
    props: { today: '2026-10-06', ...props },
    attachTo: document.body,
  })
afterEach(() => wrapper.unmount())

const toggle = () => wrapper.get('button[aria-haspopup="dialog"]')
const dialog = () => wrapper.find('[role="dialog"]')
const quick = () => wrapper.findAll('[aria-label="Quick ranges"] button')
// The date field inside the label that names it.
const field = (name: string) =>
  wrapper
    .findAll('label')
    .find((label) => label.text() === name)!
    .get<HTMLInputElement>('input[type="date"]')

test('the button names the range shown and opens the date popover', async () => {
  wrapper = render({ offset: 'UTC+8', span: '26 Apr 2023 – 28 Sep 2026' })
  expect(toggle().text()).toBe('All dates')
  expect(toggle().classes()).not.toContain('active')
  expect(toggle().attributes('aria-expanded')).toBe('false')
  expect(dialog().exists()).toBe(false)
  await toggle().trigger('click')
  expect(toggle().attributes('aria-expanded')).toBe('true')
  expect(dialog().attributes('aria-label')).toBe('Date range')
  expect(toggle().attributes('aria-controls')).toBe(dialog().attributes('id'))
  expect(quick().map((button) => [button.text(), button.attributes('aria-pressed')])).toEqual([
    ['All dates', 'true'],
    ['Last 7 days', 'false'],
    ['Last 30 days', 'false'],
    ['Last 6 months', 'false'],
    ['This year', 'false'],
  ])
  // Opening moves focus to the range shown.
  expect(document.activeElement).toBe(quick()[0].element)
  expect(wrapper.get('.note').text()).toBe(
    'Server time (UTC+8). Saved rolls span 26 Apr 2023 – 28 Sep 2026.',
  )
  await toggle().trigger('click')
  expect(dialog().exists()).toBe(false)
})

test('a chosen range is named and marked, and each change applies at once', async () => {
  wrapper = render({ from: '2026-09-30', offset: 'UTC+8' })
  expect(toggle().text()).toBe('Last 7 days')
  expect(toggle().classes()).toContain('active')
  await toggle().trigger('click')
  expect(quick()[1].attributes('aria-pressed')).toBe('true')
  expect(field('From').element.value).toBe('2026-09-30')
  expect(field('To').element.value).toBe('')
  // The days can't cross: To starts at From, and From ends at To.
  expect(field('To').attributes('min')).toBe('2026-09-30')
  expect(field('From').attributes('max')).toBeUndefined()
  await quick()[4].trigger('click')
  await field('To').setValue('2026-10-01')
  await field('From').setValue('')
  await wrapper.get('button.clear').trigger('click')
  expect(wrapper.emitted('change')).toEqual([
    [{ from: '2026-01-01', to: undefined }],
    [{ from: '2026-09-30', to: '2026-10-01' }],
    [{ from: undefined, to: undefined }],
    [{}],
  ])
  // Changes keep the popover open.
  expect(dialog().exists()).toBe(true)
})

test('days chosen by hand are named by their dates, with no quick range marked', async () => {
  wrapper = render({ from: '2026-04-26', to: '2026-09-28', offset: 'UTC+8' })
  expect(toggle().text()).toBe('26 Apr 2026 – 28 Sep 2026')
  expect(toggle().attributes('aria-label')).toBe('Dates shown: 26 Apr 2026 – 28 Sep 2026')
  await toggle().trigger('click')
  expect(quick().filter((button) => button.attributes('aria-pressed') === 'true')).toEqual([])
  // Focus then starts at the first quick range.
  expect(document.activeElement).toBe(quick()[0].element)
})

test('without a known offset or saved rolls the note says only server time', async () => {
  wrapper = render({ to: '2026-09-28', offset: 'server time' })
  await toggle().trigger('click')
  expect(wrapper.get('.note').text()).toBe('Server time.')
  expect(field('From').attributes('max')).toBe('2026-09-28')
})

test('Done and Escape close the popover and return focus; Tab out or a press outside close it', async () => {
  wrapper = render({ offset: 'UTC+8' })
  await toggle().trigger('click')
  await wrapper.get('button.done').trigger('click')
  expect(dialog().exists()).toBe(false)
  expect(document.activeElement).toBe(toggle().element)
  await toggle().trigger('click')
  await dialog().trigger('keydown', { key: 'Escape' })
  expect(dialog().exists()).toBe(false)
  expect(document.activeElement).toBe(toggle().element)
  // Other keys leave it open.
  await toggle().trigger('click')
  await dialog().trigger('keydown', { key: 'a' })
  expect(dialog().exists()).toBe(true)
  // Focus moving out of the switcher closes it; moving within it does not.
  await dialog().trigger('focusout', { relatedTarget: quick()[1].element })
  expect(dialog().exists()).toBe(true)
  await dialog().trigger('focusout', { relatedTarget: document.body })
  expect(dialog().exists()).toBe(false)
  await toggle().trigger('click')
  await dialog().trigger('focusout', { relatedTarget: null })
  expect(dialog().exists()).toBe(true)
  quick()[2].element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  await wrapper.vm.$nextTick()
  expect(dialog().exists()).toBe(true)
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  await wrapper.vm.$nextTick()
  expect(dialog().exists()).toBe(false)
  expect(wrapper.emitted('change')).toBeUndefined()
})
