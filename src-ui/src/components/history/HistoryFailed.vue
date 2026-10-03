<script setup lang="ts">
// Presentational: why saved history couldn't be shown, with a way to read it again.
// The heading takes focus so the alert is read in full.
import { TriangleAlert } from '@lucide/vue'
import { onMounted, useTemplateRef } from 'vue'

defineProps<{ title: string; message: string }>()
const emit = defineEmits<{ retry: [] }>()
const heading = useTemplateRef('heading')
onMounted(() => heading.value!.focus())
</script>

<template>
  <section class="history-failed" role="alert" aria-labelledby="history-failed-heading">
    <span class="icon" aria-hidden="true">
      <TriangleAlert :size="22" :stroke-width="1.75" />
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
