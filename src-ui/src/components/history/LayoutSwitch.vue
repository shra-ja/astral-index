<script setup lang="ts">
// Presentational: the History screen's layout switch, a group of icon toggles, each
// named in a styled tooltip. It emits the chosen layout; the screen keeps it.
import { LayoutGrid, List } from '@lucide/vue'
import { layouts, type Layout } from '../../format'
import AppTooltip from '../shared/AppTooltip.vue'

defineProps<{ layout: Layout }>()
const emit = defineEmits<{ change: [layout: Layout] }>()
const icons = { list: List, grid: LayoutGrid }
</script>

<template>
  <div class="layouts" role="group" aria-label="Layout">
    <AppTooltip v-for="option in layouts" :key="option.id" :text="option.label">
      <button
        type="button"
        :aria-label="`${option.label} view`"
        :aria-pressed="option.id === layout"
        @click="emit('change', option.id)"
      >
        <component :is="icons[option.id]" :size="16" />
      </button>
    </AppTooltip>
  </div>
</template>

<style scoped>
/* The 1px gaps show the group's rim between the toggles. */
.layouts {
  display: flex;
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--rim);
  border-radius: 9px;
  background: var(--rim);
}
button {
  justify-content: center;
  width: 40px;
  height: 32px;
  padding: 0;
  border-radius: 0;
  background: var(--panel);
  color: var(--text-muted);
}
button[aria-pressed='true'] {
  background: var(--rim-strong);
  color: var(--text);
}
</style>
