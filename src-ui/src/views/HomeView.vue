<script setup lang="ts">
// The home screen: the collection for the chosen game and, for Honkai: Star Rail,
// retrieval. The retrieval flow's state comes from useRetrieval; this view wires
// it to the components and moves focus as the flow changes.
import { ref, useTemplateRef, watch } from 'vue';
import EmptyState from '../components/EmptyState.vue';
import GameSelect from '../components/GameSelect.vue';
import RetrievalStart from '../components/RetrievalStart.vue';
import ReviewPanel from '../components/ReviewPanel.vue';
import { useRetrieval } from '../composables/useRetrieval';
import { games, type Game } from '../format';

const game = ref<Game>('genshin-impact');
const { phase, source, status, review, cancelling, searchDevice, readFile, cancel, save, discard, done } = useRetrieval();
const start = useTemplateRef('start');
const cancelButton = useTemplateRef('cancelButton');

// Cancel takes focus while retrieval runs; the control that started it gets focus
// back when it ends. The review takes focus itself as it appears.
watch(phase, now => {
  if (now === 'acquiring') cancelButton.value!.focus();
  if (now === 'idle') start.value!.focus(source.value);
}, { flush: 'post' });
</script>

<template>
  <section class="intro" aria-labelledby="title">
    <p class="eyebrow">A little history. All yours.</p>
    <h1 id="title">Your rolls, kept local.</h1>
    <p class="lede">A home for your gacha history, right on your device.</p>
  </section>
  <section class="collection" aria-label="Roll history">
    <div class="toolbar">
      <GameSelect v-model="game" />
      <span class="collection-label">Your collection starts here</span>
    </div>
    <EmptyState :game="games[game]" />
    <div class="retrieval" :aria-busy="phase === 'acquiring' || phase === 'saving'" :hidden="game !== 'honkai-star-rail'">
      <RetrievalStart ref="start" :hidden="phase !== 'idle'" @search="searchDevice" @choose="readFile" />
      <p class="extraction-status" role="status" aria-live="polite" aria-atomic="true">{{ status }}</p>
      <button ref="cancelButton" type="button" class="cancel" :hidden="phase !== 'acquiring'"
        :disabled="cancelling" @click="cancel">Cancel</button>
      <ReviewPanel v-if="review" :review :busy="phase !== 'reviewing'"
        @save="save" @discard="discard" @done="done" />
    </div>
  </section>
</template>
