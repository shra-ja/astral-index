<script setup lang="ts">
// Presentational: which rows are shown, seven places for the pages around the current
// one, and rows per page. The first and last pages stay in reach; gaps stand for
// skipped pages. Every place is the same width, so the buttons never move between
// pages. The pager keeps to one line, page numbers centred, while that fits, hiding
// its label first, then takes two lines; hidden copies of the widest rows text and
// the label measure what one line needs (decision 0013).
import { ChevronDown, ChevronLeft, ChevronRight } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'

const props = defineProps<{ page: number; pages: number; pageSize: number; total: number }>()
const emit = defineEmits<{ go: [page: number]; resize: [size: number] }>()

const sizes = [20, 50, 100]
const count = (rows: number) => rows.toLocaleString('en')
const first = computed(() => (props.page - 1) * props.pageSize + 1)
const last = computed(() => Math.min(props.page * props.pageSize, props.total))
// The last page's rows have the most digits, so its text is the widest.
const widest = computed(
  () =>
    `Showing ${count((props.pages - 1) * props.pageSize + 1)}–${count(props.total)} of ${count(props.total)}`,
)

// All pages when there are seven or fewer; otherwise the first, the last, and the
// current page between its neighbours, with a gap either side, or five pages from
// the end nearest the current one.
const items = computed((): (number | 'gap')[] => {
  const { page, pages } = props
  const range = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, index) => from + index)
  if (pages <= 7) return range(1, pages)
  if (page <= 4) return [...range(1, 5), 'gap', pages]
  if (page >= pages - 3) return [1, 'gap', ...range(pages - 4, pages)]
  return [1, 'gap', page - 1, page, page + 1, 'gap', pages]
})

// The gaps between the pager's parts, and between the label and its select.
const gap = 24
const labelGap = 10
const root = useTemplateRef('root')
const nav = useTemplateRef('nav')
const control = useTemplateRef('control')
const widestCopy = useTemplateRef('widestCopy')
const labelCopy = useTemplateRef('labelCopy')
const arrangement = ref<'full' | 'bare' | 'stacked'>('full')

// One line centres the page numbers, so it needs twice its wider side.
function measure() {
  const fits = (side: number) =>
    2 * Math.max(widestCopy.value!.offsetWidth, side) + nav.value!.offsetWidth + 2 * gap <=
    root.value!.clientWidth
  const select = control.value!.offsetWidth
  if (fits(labelCopy.value!.offsetWidth + labelGap + select)) arrangement.value = 'full'
  else if (fits(select)) arrangement.value = 'bare'
  else arrangement.value = 'stacked'
}

let observer: ResizeObserver
onMounted(() => {
  observer = new ResizeObserver(measure)
  observer.observe(root.value!)
})
onBeforeUnmount(() => observer.disconnect())
watch(() => [props.pages, props.total, props.pageSize], measure, { flush: 'post' })
</script>

<template>
  <div
    ref="root"
    class="roll-pager"
    :class="arrangement"
    :style="{ '--gap': `${gap}px`, '--label-gap': `${labelGap}px` }"
  >
    <span class="showing">Showing {{ count(first) }}–{{ count(last) }} of {{ count(total) }}</span>
    <nav ref="nav" aria-label="Pages" :style="{ '--digits': String(pages).length }">
      <button
        type="button"
        class="step"
        aria-label="Previous page"
        :disabled="page === 1"
        @click="emit('go', page - 1)"
      >
        <ChevronLeft :size="16" />
      </button>
      <template v-for="(item, index) in items" :key="index">
        <span v-if="item === 'gap'" class="gap" aria-hidden="true">…</span>
        <button
          v-else
          type="button"
          class="number"
          :aria-label="`Page ${item}`"
          :aria-current="item === page ? 'page' : undefined"
          @click="emit('go', item)"
        >
          {{ item }}
        </button>
      </template>
      <button
        type="button"
        class="step"
        aria-label="Next page"
        :disabled="page === pages"
        @click="emit('go', page + 1)"
      >
        <ChevronRight :size="16" />
      </button>
    </nav>
    <label class="size">
      <span class="size-label">Rows per page</span>
      <span ref="control" class="control">
        <select
          :value="pageSize"
          @change="emit('resize', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="size in sizes" :key="size" :value="size">{{ size }}</option>
        </select>
        <ChevronDown :size="14" />
      </span>
    </label>
    <div class="measure" aria-hidden="true">
      <span ref="widestCopy" class="showing">{{ widest }}</span>
      <span ref="labelCopy" class="size-label">Rows per page</span>
    </div>
  </div>
</template>

<style scoped>
/* On one line the page numbers sit in the middle, whatever the sides' widths. */
.roll-pager {
  position: relative;
  display: grid;
  flex-shrink: 0;
  grid-template-areas: 'showing pages size';
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px var(--gap);
  min-height: 40px;
  color: var(--text-secondary);
  font-size: 14px;
}
/* Two lines: the rows and the size above, the pages centred below. */
.roll-pager.stacked {
  grid-template-areas:
    'showing size'
    'pages pages';
  grid-template-columns: 1fr auto;
}
.showing {
  grid-area: showing;
  justify-self: start;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
nav {
  display: flex;
  grid-area: pages;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 4px;
}
/* Each place fits the last page's number, so every one is the same width. */
nav button,
.gap {
  width: max(36px, calc(var(--digits) * 1ch + 16px));
}
nav button {
  justify-content: center;
  min-width: 36px;
  min-height: 36px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: none;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
nav .step {
  border-color: var(--rim);
  background: var(--panel);
  color: var(--text);
}
nav [aria-current='page'] {
  border-color: var(--accent);
  background: var(--accent-tint);
  color: var(--accent);
}
.gap {
  color: var(--text-faint);
  text-align: center;
}
.size {
  display: flex;
  grid-area: size;
  justify-self: end;
  align-items: center;
  gap: var(--label-gap);
  margin: 0;
  font-size: 14px;
}
.control {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.control select {
  min-height: 36px;
  padding: 0 34px 0 12px;
  border: 1px solid var(--rim);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: 14px;
  appearance: none;
}
.control svg {
  position: absolute;
  right: 12px;
  pointer-events: none;
}
/* Without room for it, the label is hidden but still names its select. */
.roll-pager:not(.full) .size > .size-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.measure {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
}
.measure > * {
  position: absolute;
  white-space: nowrap;
}
</style>
