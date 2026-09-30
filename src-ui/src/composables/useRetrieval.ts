// The retrieval flow: validate the saved warp history link, retrieve history with
// progress, then save or discard it after review. Components render its state and
// call its actions; only this flow makes the native calls.
import { readonly, ref, shallowReadonly } from 'vue';
import {
  cancelAcquisition, commitImport, discardImport, extractAutomatically, extractFromFile, retrieveHistory,
  type Failure, type Review,
} from '../commands';
import {
  automaticMessages, cancelled, commitMessages, describe, fileMessages, progressText, retrievalFailure, savedText,
  type Messages,
} from '../messages';

/**
 * `acquiring` runs from validation until the review; `saving` and `leaving` keep
 * the review shown while its choice is carried out.
 */
export type Phase = 'idle' | 'acquiring' | 'reviewing' | 'saving' | 'leaving';
/** How the warp history link was found: by searching this device, or from a chosen file. */
export type Source = 'device' | 'file';

export function useRetrieval() {
  const phase = ref<Phase>('idle');
  const source = ref<Source>('device');
  const status = ref('');
  const review = ref<Review>();
  // Set while the user has asked to stop the running acquisition.
  const cancelling = ref(false);

  // Only one acquisition runs at a time: callers offer these only while idle.
  async function acquire(from: Source, searching: string, extract: () => Promise<Failure | undefined>, messages: Messages) {
    source.value = from;
    cancelling.value = false;
    phase.value = 'acquiring';
    status.value = searching;
    const outcome = await run(extract, messages);
    if (typeof outcome === 'string') return finish(outcome);
    phase.value = 'reviewing';
    status.value = '';
    review.value = outcome;
  }

  // Validate, then retrieve. A cancel that races a success still keeps nothing.
  async function run(extract: () => Promise<Failure | undefined>, messages: Messages) {
    const failure = await extract();
    if (failure) return describe(failure, messages);
    if (cancelling.value) return cancelled;
    status.value = 'Retrieving your warp history…';
    const result = await retrieveHistory(progress => {
      if (!cancelling.value) status.value = progressText(progress);
    });
    if ('failure' in result) return retrievalFailure(result.failure);
    if (result.retrieved.kind === 'no_history') return 'HoYoverse returned no warp history for this account. Nothing was saved.';
    if (!cancelling.value) return result.retrieved;
    await discardImport();
    return cancelled;
  }

  function finish(message: string) {
    review.value = undefined;
    phase.value = 'idle';
    status.value = message;
  }

  // Leave the review without saving; the native side drops the retrieved history.
  async function leave(message: string) {
    phase.value = 'leaving';
    await discardImport();
    finish(message);
  }

  return {
    phase: readonly(phase),
    source: readonly(source),
    status: readonly(status),
    review: shallowReadonly(review),
    cancelling: readonly(cancelling),
    searchDevice: () => acquire('device', 'Searching this device, then checking with HoYoverse…',
      extractAutomatically, automaticMessages),
    readFile: (file: File) => acquire('file', 'Reading the file, then checking with HoYoverse…',
      () => extractFromFile(file), fileMessages),
    // Progress stops showing once the user asks to cancel; if the request cannot be
    // sent, retrieval carries on and can be cancelled again.
    async cancel() {
      cancelling.value = true;
      status.value = 'Cancelling…';
      if (await cancelAcquisition()) cancelling.value = false;
    },
    async save() {
      phase.value = 'saving';
      status.value = 'Saving…';
      const result = await commitImport();
      finish('failure' in result ? describe(result.failure, commitMessages) : savedText(result.summary));
    },
    discard: () => leave('Discarded the retrieved history. Nothing was saved.'),
    done: () => leave('Your saved history is already up to date.'),
  };
}
