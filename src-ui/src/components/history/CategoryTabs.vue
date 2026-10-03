<script setup lang="ts">
// Presentational: the banner categories, as tabs with counts. When those don't fit,
// the counts drop, then the tabs become a "Banner category" dropdown. Hidden copies
// of the tab row measure the width each form needs, so the switch follows the
// labels and counts rather than fixed window widths (decision 0013).
import { ChevronDown } from '@lucide/vue'
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'

export interface Tab {
  gacha_type: string
  label: string
  total: number
}
const props = defineProps<{ tabs: readonly Tab[]; selected: string }>()
const emit = defineEmits<{ select: [gacha_type: string] }>()

const count = (total: number) => total.toLocaleString('en')
const frame = useTemplateRef('frame')
const full = useTemplateRef('full')
const bare = useTemplateRef('bare')
const mode = ref<'full' | 'bare' | 'select'>('full')

function measure() {
  const width = frame.value!.clientWidth
  if (full.value!.offsetWidth <= width) mode.value = 'full'
  else if (bare.value!.offsetWidth <= width) mode.value = 'bare'
  else mode.value = 'select'
}

let observer: ResizeObserver
onMounted(() => {
  observer = new ResizeObserver(measure)
  observer.observe(frame.value!)
})
onBeforeUnmount(() => observer.disconnect())
watch(() => props.tabs, measure, { flush: 'post' })
</script>

<template>
  <div ref="frame" class="category-tabs">
    <div v-if="mode !== 'select'" class="tabs" role="group" aria-label="Banner category">
      <button
        v-for="tab in tabs"
        :key="tab.gacha_type"
        type="button"
        class="tab"
        :aria-pressed="tab.gacha_type === selected"
        @click="emit('select', tab.gacha_type)"
      >
        {{ tab.label }}
        <span v-if="mode === 'full'" class="count">{{ count(tab.total) }}</span>
      </button>
    </div>
    <label v-else class="select">
      Banner category
      <span class="control">
        <select
          :value="selected"
          @change="emit('select', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="tab in tabs" :key="tab.gacha_type" :value="tab.gacha_type">
            {{ tab.label }} · {{ count(tab.total) }}
          </option>
        </select>
        <ChevronDown :size="14" />
      </span>
    </label>
    <div class="measure" aria-hidden="true">
      <div ref="full" class="tabs full">
        <span v-for="tab in tabs" :key="tab.gacha_type" class="tab">
          {{ tab.label }} <span class="count">{{ count(tab.total) }}</span>
        </span>
      </div>
      <div ref="bare" class="tabs bare">
        <span v-for="tab in tabs" :key="tab.gacha_type" class="tab">{{ tab.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.category-tabs {
  position: relative;
  flex-shrink: 0;
  min-width: 0;
}
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--divider);
}
.tab {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  margin-bottom: -1px;
  padding: 0 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: none;
  color: var(--text-secondary);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}
.tab[aria-pressed='true'] {
  border-bottom-color: var(--accent);
  color: var(--text);
}
.count {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--selected);
  color: var(--text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.tab[aria-pressed='true'] .count {
  background: var(--accent-tint);
  color: var(--accent);
}
/* Laid out at their natural width, out of sight and out of the page's flow. */
.measure {
  position: absolute;
  top: 0;
  left: 0;
  visibility: hidden;
  pointer-events: none;
}
.measure .tabs {
  width: max-content;
}
.select {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 14px;
}
.control {
  position: relative;
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  color: var(--text-secondary);
}
.control select {
  max-width: 100%;
  min-height: 40px;
  padding: 0 34px 0 12px;
  border: 1px solid var(--rim);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  appearance: none;
}
.control svg {
  position: absolute;
  right: 12px;
  pointer-events: none;
}
</style>
