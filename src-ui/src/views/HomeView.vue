<script setup lang="ts">
import { nextTick, ref, useTemplateRef } from 'vue';
import {
  cancelAcquisition, discardImport, extractAutomatically, extractFromFile, retrieveHistory,
  commitImport, type Counts, type Failure, type Kind, type Progress, type Review,
} from '../commands';
import ReviewPanel from '../components/ReviewPanel.vue';
import { plural, warps } from '../format';

const games = { 'genshin-impact': 'Genshin Impact', 'honkai-star-rail': 'Honkai: Star Rail' };
const game = ref<keyof typeof games>('genshin-impact');

const cancelled = 'Retrieval cancelled. Nothing was saved.';
const retry = 'then try again, or choose the cache file below.';
const unexpected = 'Something went wrong. Please try again.';
// Validation reads the same whichever way the link was found.
const validationMessages: Partial<Record<Kind, string>> = {
  expired_key: 'Your warp history link has expired. Open your warp history in the game to refresh it, then try again.',
  rate_limited: 'HoYoverse is receiving too many requests. Wait a few minutes, then try again.',
  network: 'We couldn’t reach HoYoverse. Check your internet connection, then try again.',
  rejected: 'HoYoverse gave an unexpected response. Try again later.',
  invalid_response: 'HoYoverse sent a response we couldn’t read. Try again later.',
  internal: 'We couldn’t start the connection to HoYoverse. Nothing was sent. Please try again.',
  cancelled,
};
const retrievalMessages: Partial<Record<Kind, string>> = {
  ...validationMessages,
  history_too_large: 'Your history is larger than the 16 MiB we can retrieve at once. Nothing was saved.',
  mixed_accounts: 'HoYoverse returned history for more than one account, so nothing was kept. Try again.',
  missing_server: 'HoYoverse didn’t say which server this history belongs to, so nothing was kept.',
  storage: 'We couldn’t open the history saved on this device. Nothing was changed.',
  context_mismatch: 'Saved history for this account uses a different time zone than HoYoverse reports. Nothing was saved.',
  no_context: 'Nothing is waiting to be saved. Start retrieval again.',
};
const commitMessages: Partial<Record<Kind, string>> = {
  ...retrievalMessages,
  conflict: 'Some retrieved rolls differ from ones already saved. Nothing was saved.',
  stale_preview: 'Your saved history changed since this review. Start retrieval again.',
  no_preview: 'Nothing is waiting to be saved. Start retrieval again.',
};
const automaticMessages: Partial<Record<Kind, string>> = {
  ...validationMessages,
  unsupported_host: 'Automatic search needs Windows, or WSL with access to Windows. Choose the cache file below instead.',
  discovery_failed: `We couldn’t look up your Windows user folder. Try again, or choose the cache file below.`,
  no_game_data: `We couldn’t find Honkai: Star Rail’s game logs. Launch the game once, ${retry}`,
  no_cache: `We found the game, but not its web cache. Open your warp history in the game, ${retry}`,
  no_request: `We couldn’t find a warp history request. Open your warp history in the game, ${retry}`,
};
const fileMessages: Partial<Record<Kind, string>> = {
  ...validationMessages,
  no_request: 'That file doesn’t contain a warp history request. Check it’s the game’s data_2 file, and open your warp history in the game first.',
  file_too_large: 'That file is larger than 16 MiB, so it isn’t a supported cache file.',
  invalid_file: 'That file couldn’t be read. Try choosing it again.',
};

// Whether the start controls are hidden, and whether the retrieval is busy.
const started = ref(false);
const busy = ref(false);
const status = ref('');
const running = ref(false);
// Set while the user has asked to stop the running acquisition.
const cancelling = ref(false);
const shownReview = ref<Review>();
const reviewBusy = ref(false);
const find = useTemplateRef('find');
const cacheFile = useTemplateRef('cacheFile');
const cancel = useTemplateRef('cancel');
// The control that started the acquisition, which gets focus back when it ends.
let origin: HTMLElement | null = null;

// Swap the start controls for Cancel while acquisition runs, so only one runs at a
// time, then show the review or say how it ended.
async function acquire(
  trigger: HTMLElement, searching: string, extract: () => Promise<Failure | undefined>,
  messages: Partial<Record<Kind, string>>,
) {
  origin = trigger;
  cancelling.value = false;
  started.value = running.value = busy.value = true;
  status.value = searching;
  nextTick(() => cancel.value!.focus());
  const outcome = await run(extract, messages);
  if (typeof outcome === 'string') finish(outcome);
  else showReview(outcome);
}

// Return to the start controls with a message, focusing the control that started.
function finish(message: string) {
  running.value = false;
  shownReview.value = undefined;
  started.value = busy.value = false;
  status.value = message;
  nextTick(() => origin!.focus());
}

// Validate, then retrieve. A cancel that races a success still keeps nothing.
async function run(extract: () => Promise<Failure | undefined>, messages: Partial<Record<Kind, string>>) {
  const failure = await extract();
  if (failure) return describe(failure, messages);
  if (cancelling.value) return cancelled;
  status.value = 'Retrieving your warp history…';
  const result = await retrieveHistory(showProgress);
  if ('failure' in result) return locate(result.failure) + describe(result.failure, retrievalMessages);
  if (result.retrieved.kind === 'no_history') return 'HoYoverse returned no warp history for this account. Nothing was saved.';
  if (!cancelling.value) return result.retrieved;
  await discardImport();
  return cancelled;
}

// Show what saving would change; the panel takes focus as it appears.
function showReview(retrieved: Review) {
  running.value = busy.value = false;
  status.value = '';
  reviewBusy.value = false;
  shownReview.value = retrieved;
}

function saved({ inserted, duplicates }: Counts) {
  const already = duplicates === 0 ? ''
    : ` ${duplicates.toLocaleString('en')} ${duplicates === 1 ? 'was' : 'were'} already saved.`;
  return `Saved ${plural(inserted, 'new roll')} to this device.${already}`;
}

// Leave the review without saving; the native side drops the retrieved history.
async function leave(message: string) {
  reviewBusy.value = true;
  await discardImport();
  finish(message);
}

function showProgress(progress: Progress) {
  if (cancelling.value) return;
  status.value = progress.kind === 'requesting'
    ? `Retrieving ${warps[progress.gacha_type]}, page ${progress.page} · ${plural(progress.records, 'roll')} so far`
    : 'HoYoverse didn’t respond, so we’ll try again in a moment…';
}

// Say where retrieval stopped, unless the user stopped it.
function locate({ kind, location }: Failure) {
  return location && kind !== 'cancelled' ? `Retrieval stopped at ${warps[location.gacha_type]}, page ${location.page}. ` : '';
}

function describe(failure: Failure, messages: Partial<Record<Kind, string>>) {
  if (failure.kind === 'api_error') {
    return `HoYoverse didn’t accept your warp history link (error ${failure.code}). Open your warp history in the game, then try again.`;
  }
  return messages[failure.kind] ?? unexpected;
}

// Progress stops showing once the user asks to cancel; if the request cannot be
// sent, retrieval carries on and can be cancelled again.
async function stop() {
  cancelling.value = true;
  status.value = 'Cancelling…';
  if (await cancelAcquisition()) cancelling.value = false;
}

async function save() {
  reviewBusy.value = busy.value = true;
  status.value = 'Saving…';
  const result = await commitImport();
  finish('failure' in result ? describe(result.failure, commitMessages) : saved(result.summary));
}

function searchDevice() {
  acquire(find.value!, 'Searching this device, then checking with HoYoverse…', extractAutomatically, automaticMessages);
}

// Clear only as the dialog opens: the chosen file stays shown with its result,
// and choosing the same file again still fires a change.
function clearFile() {
  cacheFile.value!.value = '';
}

async function readFile() {
  const file = cacheFile.value!.files![0];
  if (!file) return;
  await acquire(cacheFile.value!, 'Reading the file, then checking with HoYoverse…', () => extractFromFile(file), fileMessages);
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
    <div class="retrieval" :aria-busy="busy" :hidden="game !== 'honkai-star-rail'">
      <div class="start" :hidden="started">
        <p>Retrieval starts with the warp history link the game saved on this device.
          The app finds it, then checks it with HoYoverse, so you need to be online.</p>
        <button ref="find" type="button" @click="searchDevice">Start retrieval</button>
        <div class="fallback">
          <label for="cache-file">Or choose the game’s <code>data_2</code> cache file</label>
          <p class="detail" id="cache-file-hint">It’s in the game’s <code>webCaches</code> folder,
            under <code>Cache\Cache_Data</code>.</p>
          <input ref="cacheFile" type="file" id="cache-file" aria-describedby="cache-file-hint"
            @click="clearFile" @change="readFile">
        </div>
      </div>
      <p class="extraction-status" role="status" aria-live="polite" aria-atomic="true">{{ status }}</p>
      <button ref="cancel" type="button" class="cancel" :hidden="!running" :disabled="cancelling"
        @click="stop">Cancel</button>
      <ReviewPanel v-if="shownReview" :review="shownReview" :busy="reviewBusy"
        @save="save" @discard="leave('Discarded the retrieved history. Nothing was saved.')"
        @done="leave('Your saved history is already up to date.')" />
    </div>
  </section>
</template>
