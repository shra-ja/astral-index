<script setup lang="ts">
// Presentational: offers the automatic search and the cache file chooser, and
// reports which the user picked. The caller runs retrieval and hides this meanwhile.
import { useTemplateRef } from 'vue';
import type { Source } from '../composables/useRetrieval';

const emit = defineEmits<{ search: []; choose: [file: File] }>();
const searchButton = useTemplateRef('searchButton');
const fileInput = useTemplateRef('fileInput');

// Clear only as the dialog opens: the chosen file stays shown with its result,
// and choosing the same file again still fires a change.
function clear() {
  fileInput.value!.value = '';
}

// A change without a file, such as a cleared selection, passes nothing on.
function chosen() {
  const file = fileInput.value!.files![0];
  if (file) emit('choose', file);
}

defineExpose({
  /** Focus the control that started retrieval, once this is shown again. */
  focus: (source: Source) => (source === 'device' ? searchButton : fileInput).value!.focus(),
});
</script>

<template>
  <div class="start">
    <p>Retrieval starts with the warp history link the game saved on this device.
      The app finds it, then checks it with HoYoverse, so you need to be online.</p>
    <button ref="searchButton" type="button" @click="emit('search')">Start retrieval</button>
    <div class="fallback">
      <label for="cache-file">Or choose the game’s <code>data_2</code> cache file</label>
      <p class="detail" id="cache-file-hint">It’s in the game’s <code>webCaches</code> folder,
        under <code>Cache\Cache_Data</code>.</p>
      <input ref="fileInput" type="file" id="cache-file" aria-describedby="cache-file-hint"
        @click="clear" @change="chosen">
    </div>
  </div>
</template>

<style scoped>
.start > p { color: #c6cfc7; line-height: 1.5; margin: 0 auto 20px; max-width: 460px; }
.fallback { margin: 28px auto 0; max-width: 460px; text-align: left; }
.fallback .detail { color: #adb7af; font-size: 13px; line-height: 1.5; margin: 0 0 12px; }
input[type="file"] { font: inherit; color: #c6cfc7; max-width: 100%; }
</style>
