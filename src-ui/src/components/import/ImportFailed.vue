<script setup lang="ts">
// Presentational: why retrieval failed and what to do next. A device search can be
// tried again; a cache file can be chosen instead either way. Back returns to the
// start. The heading takes focus so the alert is read in full.
import { TriangleAlert } from '@lucide/vue'
import { onMounted, useTemplateRef } from 'vue'
import type { Source } from '../../composables/useRetrieval'
import CachePicker from '../shared/CachePicker.vue'

defineProps<{ title: string; message: string; source: Source }>()
const emit = defineEmits<{ retry: []; choose: [file: File]; back: [] }>()
const heading = useTemplateRef('heading')
onMounted(() => heading.value!.focus())
</script>

<template>
  <section class="failed" role="alert" aria-labelledby="failed-heading">
    <div class="summary">
      <span class="icon" aria-hidden="true">
        <TriangleAlert :size="22" :stroke-width="1.75" />
      </span>
      <div class="text">
        <h2 id="failed-heading" ref="heading" tabindex="-1">{{ title }}</h2>
        <p>{{ message }}</p>
      </div>
    </div>
    <div class="buttons">
      <button v-if="source === 'device'" type="button" @click="emit('retry')">Try again</button>
      <CachePicker id="retry-cache-file" @choose="emit('choose', $event)" />
      <button type="button" class="back" @click="emit('back')">Back</button>
    </div>
  </section>
</template>

<style scoped>
.failed {
  display: flex;
  flex-direction: column;
  gap: 22px;
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
  padding: 32px;
  border: 1px solid var(--rim);
  border-radius: 14px;
  background: var(--panel);
}
.summary {
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
/* The heading takes focus only so it is announced; it is not a control. */
h2:focus {
  outline: none;
}
p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.back {
  color: var(--text-secondary);
  background: none;
}
</style>
