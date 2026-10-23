<script setup lang="ts">
// Presentational: what failed, beside a warning, with the message in the default
// slot. The heading takes focus so the caller's alert is read in full.
import { TriangleAlert } from '@lucide/vue'
import { onMounted, useTemplateRef } from 'vue'

defineProps<{ id: string; title: string }>()
const heading = useTemplateRef('heading')
onMounted(() => heading.value!.focus())
</script>

<template>
  <div class="failure-summary">
    <span class="icon" aria-hidden="true">
      <TriangleAlert :size="22" :stroke-width="1.75" />
    </span>
    <div class="text">
      <h2 :id ref="heading" tabindex="-1">{{ title }}</h2>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.failure-summary {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--error-tint);
  color: var(--error);
}
.text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.text :slotted(p) {
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
}
</style>
