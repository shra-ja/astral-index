<script setup lang="ts">
// The home screen: the collection for the chosen game and, for Honkai: Star Rail,
// retrieval. The retrieval flow's state comes from useRetrieval; this view wires
// it to the page and moves focus as the flow changes.
import { ref, useTemplateRef, watch } from 'vue';
import ReviewPanel from '../components/ReviewPanel.vue';
import { useRetrieval } from '../composables/useRetrieval';

const games = { 'genshin-impact': 'Genshin Impact', 'honkai-star-rail': 'Honkai: Star Rail' };
const game = ref<keyof typeof games>('genshin-impact');

const { phase, source, status, review, cancelling, searchDevice, readFile, cancel, save, discard, done } = useRetrieval();
const find = useTemplateRef('find');
const cacheFile = useTemplateRef('cacheFile');
const cancelButton = useTemplateRef('cancelButton');

// Cancel takes focus while retrieval runs; the control that started it gets focus
// back when it ends. The review takes focus itself as it appears.
watch(phase, now => {
  if (now === 'acquiring') cancelButton.value!.focus();
  if (now === 'idle') (source.value === 'device' ? find : cacheFile).value!.focus();
}, { flush: 'post' });

// Clear only as the dialog opens: the chosen file stays shown with its result,
// and choosing the same file again still fires a change.
function clearFile() {
  cacheFile.value!.value = '';
}

function chooseFile() {
  const file = cacheFile.value!.files![0];
  if (file) readFile(file);
}
</script>

<template>
  <section class="intro" aria-labelledby="title">
    <p class="eyebrow">A little history. All yours.</p>
    <h1 id="title">Your rolls, kept local.</h1>
    <p class="lede">A home for your gacha history, right on your device.</p>
  </section>
  <section class="collection" aria-label="Roll history">
    <div class="toolbar">
      <div>
        <label for="game">Your game</label>
        <select id="game" v-model="game">
          <option v-for="(name, id) in games" :key="id" :value="id">{{ name }}</option>
        </select>
      </div>
      <span class="collection-label">Your collection starts here</span>
    </div>
    <div class="empty" role="status" aria-live="polite" aria-atomic="true">
      <span class="empty-icon" aria-hidden="true">✧</span>
      <h2>No {{ games[game] }} rolls yet</h2>
      <p>Showing saved history is coming next.</p>
      <p class="detail">Your history will stay on this device. No account needed.</p>
    </div>
    <div class="retrieval" :aria-busy="phase === 'acquiring' || phase === 'saving'" :hidden="game !== 'honkai-star-rail'">
      <div class="start" :hidden="phase !== 'idle'">
        <p>Retrieval starts with the warp history link the game saved on this device.
          The app finds it, then checks it with HoYoverse, so you need to be online.</p>
        <button ref="find" type="button" @click="searchDevice">Start retrieval</button>
        <div class="fallback">
          <label for="cache-file">Or choose the game’s <code>data_2</code> cache file</label>
          <p class="detail" id="cache-file-hint">It’s in the game’s <code>webCaches</code> folder,
            under <code>Cache\Cache_Data</code>.</p>
          <input ref="cacheFile" type="file" id="cache-file" aria-describedby="cache-file-hint"
            @click="clearFile" @change="chooseFile">
        </div>
      </div>
      <p class="extraction-status" role="status" aria-live="polite" aria-atomic="true">{{ status }}</p>
      <button ref="cancelButton" type="button" class="cancel" :hidden="phase !== 'acquiring'"
        :disabled="cancelling" @click="cancel">Cancel</button>
      <ReviewPanel v-if="review" :review :busy="phase !== 'reviewing'"
        @save="save" @discard="discard" @done="done" />
    </div>
  </section>
</template>
