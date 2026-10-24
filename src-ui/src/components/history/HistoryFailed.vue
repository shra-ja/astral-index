<script setup lang="ts">
// Presentational: why saved history couldn't be shown, with a way to read it again.
// The heading takes focus so the alert is read in full.
import { TriangleAlert } from '@lucide/vue'
import { onMounted, useTemplateRef } from 'vue'
import IconTile from '../shared/IconTile.vue'

defineProps<{ title: string; message: string }>()
const emit = defineEmits<{ retry: [] }>()
const heading = useTemplateRef('heading')
onMounted(() => heading.value!.focus())
</script>

<template>
  <section class="history-failed" role="alert" aria-labelledby="history-failed-heading">
    <IconTile :icon="TriangleAlert" tone="error" />
    <h2 id="history-failed-heading" ref="heading" tabindex="-1">{{ title }}</h2>
    <p>{{ message }}</p>
    <button type="button" @click="emit('retry')">Try again</button>
  </section>
</template>

<style scoped>
.history-failed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
  max-width: 440px;
  margin: auto;
  text-align: center;
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
