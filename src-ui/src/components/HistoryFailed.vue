<script setup lang="ts">
// Presentational: why saved history couldn't be shown, with a way to read it again.
// The heading takes focus so the alert is read in full.
import { onMounted, useTemplateRef } from 'vue'

defineProps<{ title: string; message: string }>()
const emit = defineEmits<{ retry: [] }>()
const heading = useTemplateRef('heading')
onMounted(() => heading.value!.focus())
</script>

<template>
  <section class="history-failed" role="alert" aria-labelledby="history-failed-heading">
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
.icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--error-tint);
  color: var(--error);
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
</style>
