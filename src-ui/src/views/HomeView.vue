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
      <button ref="cancelButton" type="button" class="cancel secondary" :hidden="phase !== 'acquiring'"
        :disabled="cancelling" @click="cancel">Cancel</button>
      <ReviewPanel v-if="review" :review :busy="phase !== 'reviewing'"
        @save="save" @discard="discard" @done="done" />
    </div>
  </section>
</template>

<style scoped>
.intro { margin: 72px 0 36px; }
.eyebrow { color: #c6b780; font-size: 12px; letter-spacing: .13em; text-transform: uppercase; }
h1 { font-size: clamp(30px, 5vw, 48px); font-weight: 550; letter-spacing: -.04em; margin: 12px 0; }
.lede { color: #adb7af; line-height: 1.6; }
.collection { border: 1px solid #37433d; border-radius: 16px; background: #1b2420; overflow: hidden; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 24px; border-bottom: 1px solid #37433d; }
.collection-label { color: #adb7af; font-size: 13px; }
.retrieval { border-top: 1px solid #37433d; padding: 28px 24px 32px; text-align: center; }
.extraction-status { color: #c6cfc7; line-height: 1.5; margin: 20px auto 0; max-width: 460px; }
.extraction-status:empty { display: none; }
.cancel { margin-top: 16px; }
@media (max-width: 600px) {
  .intro { margin-top: 48px; }
  .toolbar { align-items: flex-start; flex-direction: column; gap: 16px; }
}
</style>
