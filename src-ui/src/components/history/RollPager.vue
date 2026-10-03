<script setup lang="ts">
// Presentational: which rows are shown, the pages around the current one, and rows
// per page. The first and last pages stay in reach; gaps stand for skipped pages.
import { ChevronDown, ChevronLeft, ChevronRight } from '@lucide/vue'
import { computed } from 'vue'

const props = defineProps<{ page: number; pages: number; pageSize: number; total: number }>()
const emit = defineEmits<{ go: [page: number]; resize: [size: number] }>()

const sizes = [20, 50, 100]
const first = computed(() => (props.page - 1) * props.pageSize + 1)
const last = computed(() => Math.min(props.page * props.pageSize, props.total))

// The first, last and neighbouring pages; a gap of one page shows that page instead.
const items = computed(() => {
  const { page, pages } = props
  const shown = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter((each) => each >= 1 && each <= pages)
    .sort((a, b) => a - b)
  const items: (number | 'gap')[] = []
  for (const each of shown) {
    const before = items.at(-1)
    if (typeof before === 'number' && each - before === 2) items.push(before + 1)
    else if (typeof before === 'number' && each - before > 2) items.push('gap')
    items.push(each)
  }
  return items
})
</script>

<template>
  <div class="roll-pager">
    <span class="showing">
      Showing {{ first.toLocaleString('en') }}–{{ last.toLocaleString('en') }} of
      {{ total.toLocaleString('en') }}
    </span>
    <nav aria-label="Pages">
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
      Rows per page
      <span class="control">
        <select
          :value="pageSize"
          @change="emit('resize', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="size in sizes" :key="size" :value="size">{{ size }}</option>
        </select>
        <ChevronDown :size="14" />
      </span>
    </label>
  </div>
</template>

<style scoped>
.roll-pager {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 24px;
  min-height: 40px;
  color: var(--text-secondary);
  font-size: 14px;
}
.showing {
  font-variant-numeric: tabular-nums;
}
nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
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
  width: 24px;
  color: var(--text-faint);
  text-align: center;
}
.size {
  display: flex;
  align-items: center;
  gap: 10px;
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
</style>
