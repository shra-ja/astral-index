<script setup lang="ts">
// Presentational: chooses the game's data_2 cache file. A button-styled label opens
// the visually hidden file input, which keeps the keyboard focus and reports the file.
import { useTemplateRef } from 'vue'

defineProps<{ id: string; disabled?: boolean }>()
const emit = defineEmits<{ choose: [file: File] }>()
const input = useTemplateRef('input')

// Clear only as the dialog opens: choosing the same file again still fires a change.
function clear() {
  input.value!.value = ''
}
// A change without a file, such as a cleared selection, passes nothing on.
function chosen() {
  const file = input.value!.files![0]
  if (file) emit('choose', file)
}
defineExpose({ focus: () => input.value!.focus() })
</script>

<template>
  <span class="picker">
    <input :id ref="input" type="file" :disabled @click="clear" @change="chosen" />
    <label :for="id" class="button secondary" :class="{ disabled }">Choose cache file…</label>
  </span>
</template>

<style scoped>
.picker {
  position: relative;
  display: inline-flex;
}
input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
label {
  margin: 0;
  color: var(--text);
  cursor: pointer;
}
label.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
input:focus-visible + label {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
