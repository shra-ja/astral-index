<script setup lang="ts">
// Presentational: the rolls panel's item search. It reports each change as typed;
// the screen decides when to read.
import { Search } from '@lucide/vue'
import { useId } from 'vue'

defineProps<{ query: string }>()
const emit = defineEmits<{ search: [text: string] }>()

const id = useId()
</script>

<template>
  <div class="search">
    <label class="hidden" :for="id">Search items</label>
    <Search :size="15" class="icon" aria-hidden="true" />
    <input
      :id
      type="search"
      placeholder="Search items"
      autocomplete="off"
      spellcheck="false"
      :value="query"
      @input="emit('search', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>

<style scoped>
/* Flexes between 160px and 240px as the toolbar wraps (decision 0013). */
.search {
  position: relative;
  display: flex;
  flex: 1 1 160px;
  align-items: center;
  max-width: 240px;
}
.hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.icon {
  position: absolute;
  left: 10px;
  color: var(--text-muted);
  pointer-events: none;
}
input {
  width: 100%;
  height: 32px;
  padding: 0 10px 0 32px;
  border: 1px solid var(--rim);
  border-radius: 9px;
  background: var(--window);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}
input::placeholder {
  color: var(--text-muted);
}
</style>
