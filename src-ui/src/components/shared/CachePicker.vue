<script setup lang="ts">
// Presentational: asks for the game's data_2 cache file. The native side opens the
// dialog and reads the file, so the webview never handles it (decision 0034).
import { useTemplateRef } from 'vue'

defineProps<{ id: string; disabled?: boolean }>()
const emit = defineEmits<{ choose: [] }>()
const button = useTemplateRef('button')
defineExpose({ focus: () => button.value!.focus() })
</script>

<template>
  <button :id ref="button" type="button" class="button secondary" :disabled @click="emit('choose')">
    Choose cache file…
  </button>
</template>
