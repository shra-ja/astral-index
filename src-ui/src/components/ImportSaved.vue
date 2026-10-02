<script setup lang="ts">
// Presentational: what a save added. The caller supplies the link to the history;
// Done returns to the start. The heading takes focus so the result is announced.
import { onMounted, useTemplateRef } from 'vue'
import type { Counts } from '../commands'
import { savedDetail, savedTitle } from '../messages'

defineProps<{ saved: { summary: Counts; uid: string; server: string } }>()
const emit = defineEmits<{ done: [] }>()
const heading = useTemplateRef('heading')
onMounted(() => heading.value!.focus())
</script>

<template>
  <section class="saved" aria-labelledby="saved-heading">
    <span class="icon" aria-hidden="true">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path
          d="m8 14.5 4 4 8-9"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
    <h2 id="saved-heading" ref="heading" tabindex="-1">{{ savedTitle(saved) }}</h2>
    <p>{{ savedDetail(saved) }}</p>
    <div class="buttons">
      <slot />
      <button type="button" class="secondary" @click="emit('done')">Done</button>
    </div>
  </section>
</template>

<style scoped>
.saved {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: 100%;
  max-width: 520px;
  margin: auto;
  padding: 36px;
  border: 1px solid var(--rim);
  border-radius: 14px;
  background: var(--panel);
  text-align: center;
}
.icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--accent-tint);
  color: var(--accent);
}
h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
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
  font-variant-numeric: tabular-nums;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}
</style>
