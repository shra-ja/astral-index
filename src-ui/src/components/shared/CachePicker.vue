<script setup lang="ts">
// Presentational: asks for the game's data_2 cache file. The native side opens the
// dialog and reads the file, so the webview never handles it (decision 0034).
import { useTemplateRef } from 'vue'

// `busy` marks it unavailable while it stays focusable, as while its dialog is open.
defineProps<{ id: string; disabled?: boolean; busy?: boolean }>()
const emit = defineEmits<{ choose: [] }>()
const button = useTemplateRef('button')
defineExpose({ focus: () => button.value!.focus() })
</script>

<template>
  <button
    :id
    ref="button"
    type="button"
    class="button secondary"
    :disabled
    :aria-disabled="busy || undefined"
    @click="emit('choose')"
  >
    Choose cache file…
  </button>
</template>
