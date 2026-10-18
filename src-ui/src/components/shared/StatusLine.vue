<script setup lang="ts">
// Presentational: one line saying how an action went, after an icon for its tone:
// done, or failed. A card's status region announces it.
import { Check, CircleAlert } from '@lucide/vue'

defineProps<{ tone: 'done' | 'failed' }>()
</script>

<template>
  <p class="status-line" :class="tone">
    <Check v-if="tone === 'done'" :size="16" :stroke-width="2" />
    <CircleAlert v-else :size="16" :stroke-width="1.75" />
    <span><slot /></span>
  </p>
</template>

<style scoped>
.status-line {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}
svg {
  flex-shrink: 0;
  margin-top: 1px;
}
.done {
  color: var(--text-secondary);
}
.done svg {
  color: var(--accent);
}
.failed {
  color: var(--error);
}
</style>
