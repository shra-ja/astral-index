import { mount } from '@vue/test-utils';
import { expect, test } from 'vitest';
import RetrievalStart from './RetrievalStart.vue';

const fileInput = (wrapper: ReturnType<typeof mount>) => wrapper.get<HTMLInputElement>('input[type="file"]');
function choose(input: HTMLInputElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
}

test('explains that retrieval checks with HoYoverse, and offers a search and a cache file', () => {
  const wrapper = mount(RetrievalStart);
  expect(wrapper.text()).toContain('checks it with HoYoverse, so you need to be online');
  const button = wrapper.get('button');
  expect(button.text()).toBe('Start retrieval');
  expect(button.attributes('type')).toBe('button');
  const input = fileInput(wrapper);
  expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'));
  expect(wrapper.get(`#${input.attributes('aria-describedby')}`).text())
    .toBe('It’s in the game’s webCaches folder, under Cache\\Cache_Data.');
});

test('Start retrieval asks for a search', async () => {
  const wrapper = mount(RetrievalStart);
  await wrapper.get('button').trigger('click');
  expect(wrapper.emitted('search')).toEqual([[]]);
});

test('choosing a file passes it on; a change without one passes nothing', () => {
  const wrapper = mount(RetrievalStart);
  const file = new File(['synthetic'], 'data_2');
  choose(fileInput(wrapper).element, [file]);
  choose(fileInput(wrapper).element, []);
  expect(wrapper.emitted('choose')).toEqual([[file]]);
});

test('the chosen file is cleared only as the dialog opens, so the same file can be chosen again', () => {
  const wrapper = mount(RetrievalStart);
  const writes: string[] = [];
  Object.defineProperty(fileInput(wrapper).element, 'value', {
    configurable: true, get: () => 'data_2', set: (value: string) => { writes.push(value); },
  });
  choose(fileInput(wrapper).element, [new File(['synthetic'], 'data_2')]);
  expect(writes).toEqual([]);
  fileInput(wrapper).element.click();
  expect(writes).toEqual(['']);
});

test('focuses the control that started retrieval', () => {
  const wrapper = mount(RetrievalStart, { attachTo: document.body });
  wrapper.vm.focus('file');
  expect(document.activeElement).toBe(fileInput(wrapper).element);
  wrapper.vm.focus('device');
  expect(document.activeElement).toBe(wrapper.get('button').element);
  wrapper.unmount();
});
