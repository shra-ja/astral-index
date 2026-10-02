<script setup lang="ts">
// Presentational: why retrieval failed and what to do next. A device search can be
// tried again; a cache file can be chosen instead either way. Back returns to the
// start. The heading takes focus so the alert is read in full.
import { onMounted, useTemplateRef } from 'vue'
import type { Source } from '../composables/useRetrieval'
import CachePicker from './CachePicker.vue'

defineProps<{ title: string; message: string; source: Source }>()
const emit = defineEmits<{ retry: []; choose: [file: File]; back: [] }>()
const heading = useTemplateRef('heading')
onMounted(() => heading.value!.focus())
</script>

<template>
  <section class="failed" role="alert" aria-labelledby="failed-heading">
    <div class="summary">
      <span class="icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path
            d="M11 7v5M11 15.2v.1"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
          <path
            d="M9.3 3.4 2.6 15.2A2 2 0 0 0 4.3 18.2h13.4a2 2 0 0 0 1.7-3L12.7 3.4a2 2 0 0 0-3.4 0Z"
            stroke="currentColor"
            stroke-width="1.7"
            stroke-linejoin="round"
          />
        </svg>
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
h2:focus {
  outline: none;
}
h2:focus-visible {
  outline: 2px solid var(--accent);
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
