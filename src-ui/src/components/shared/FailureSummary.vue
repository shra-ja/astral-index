<script setup lang="ts">
// Presentational: what failed and why, beside a warning. The heading takes focus so
// the caller's alert is read in full.
import { TriangleAlert } from '@lucide/vue'
import { onMounted, useTemplateRef } from 'vue'
import IconTile from './IconTile.vue'

defineProps<{ id: string; title: string; message: string }>()
const heading = useTemplateRef('heading')
onMounted(() => heading.value!.focus())
</script>

<template>
  <div class="failure-summary">
    <IconTile :icon="TriangleAlert" tone="error" />
    <div class="text">
      <h2 :id ref="heading" tabindex="-1">{{ title }}</h2>
      <p>{{ message }}</p>
    </div>
  </div>
</template>

<style scoped>
.failure-summary {
  display: flex;
  align-items: flex-start;
  gap: 16px;
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
p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
}
</style>
