// The retrieval flow: validate the saved warp history link, retrieve history with
// progress, then save or discard it after review. Components render its state and
// call its actions; only this flow makes the native calls.
import { readonly, ref, shallowReadonly, shallowRef } from 'vue'
import {
  cancelAcquisition,
  commitImport,
  discardImport,
  extractAutomatically,
  extractFromFile,
  retrieveHistory,
  type Counts,
  type Failure,
  type Progress,
  type Review,
} from '../commands'
import {
  automaticMessages,
  cancelled,
  commitMessages,
  describe,
  fileMessages,
  progressText,
  retrievalFailure,
  titleOf,
  type Messages,
} from '../messages'

/**
 * `acquiring` runs from validation until the review; `saving` and `leaving` keep
 * the review shown while its choice is carried out.
 */
export type Phase = 'idle' | 'acquiring' | 'reviewing' | 'saving' | 'leaving'
/** How the warp history link was found: by searching this device, or from a chosen file. */
export type Source = 'device' | 'file'
/** While acquiring: still finding and checking the link, or downloading history. */
export type Stage = 'finding' | 'downloading'
/**
 * Where the download has got to: the category and page being requested, the last
 * page requested in each category so far, the rolls received and whether a retry is
 * due.
 */
export interface Download {
  category: string
  page: number
  pages: Partial<Record<string, number>>
  records: number
  retrying: boolean
}
/** How the last retrieval ended: saved, failed, or a note such as a cancel. */
export type Outcome =
  | {
      kind: 'saved'
      summary: Counts
      fiveStar: number
      fourStar: number
      uid: string
      server: string
    }
  | { kind: 'failed'; title: string; message: string }
  | { kind: 'note'; message: string }

const note = (message: string): Outcome => ({ kind: 'note', message })
// A cancel is the user's choice, so it ends with a note rather than a failure.
function failed(failure: Failure, message: string): Outcome {
  return failure.kind === 'cancelled'
    ? note(cancelled)
    : { kind: 'failed', title: titleOf(failure), message }
}

export function useRetrieval() {
  const phase = ref<Phase>('idle')
  const source = ref<Source>('device')
  const stage = ref<Stage>('finding')
  const status = ref('')
  // Unset until the first page is requested.
  const download = shallowRef<Download>()
  const review = ref<Review>()
  const outcome = ref<Outcome>()
  // Set while the user has asked to stop the running acquisition.
  const cancelling = ref(false)

  // Only one acquisition runs at a time: callers offer these only while idle.
  async function acquire(
    from: Source,
    searching: string,
    extract: () => Promise<Failure | undefined>,
    messages: Messages,
  ) {
    source.value = from
    cancelling.value = false
    outcome.value = undefined
    stage.value = 'finding'
    phase.value = 'acquiring'
    status.value = searching
    download.value = undefined
    const result = await run(extract, messages)
    if (!('review' in result)) return finish(result)
    phase.value = 'reviewing'
    status.value = ''
    review.value = result.review
  }

  // Validate, then retrieve. A cancel that races a success still keeps nothing.
  async function run(
    extract: () => Promise<Failure | undefined>,
    messages: Messages,
  ): Promise<Outcome | { review: Review }> {
    const failure = await extract()
    if (failure) return failed(failure, describe(failure, messages))
    if (cancelling.value) return note(cancelled)
    stage.value = 'downloading'
    status.value = 'Retrieving your warp history…'
    const result = await retrieveHistory((progress) => {
      if (!cancelling.value) status.value = progressText(progress)
      track(progress)
    })
    if ('failure' in result) return failed(result.failure, retrievalFailure(result.failure))
    if (result.retrieved.kind === 'no_history')
      return note('HoYoverse returned no warp history for this account. Nothing was saved.')
    if (!cancelling.value) return { review: result.retrieved }
    await discardImport()
    return note(cancelled)
  }

  // Keep each category's last page; a retry waits on the current page.
  function track(progress: Progress) {
    const before = download.value
    if (progress.kind === 'requesting') {
      const { gacha_type, page, records } = progress
      const pages = { ...before?.pages, [gacha_type]: page }
      download.value = { category: gacha_type, page, pages, records, retrying: false }
    } else if (before) {
      download.value = { ...before, retrying: true }
    }
  }

  function finish(ending: Outcome) {
    review.value = undefined
    phase.value = 'idle'
    status.value = ''
    outcome.value = ending
  }

  // Leave the review without saving; the native side drops the retrieved history.
  async function leave(ending: Outcome) {
    phase.value = 'leaving'
    await discardImport()
    finish(ending)
  }

  return {
    phase: readonly(phase),
    source: readonly(source),
    stage: readonly(stage),
    status: readonly(status),
    download: shallowReadonly(download),
    review: shallowReadonly(review),
    outcome: shallowReadonly(outcome),
    cancelling: readonly(cancelling),
    searchDevice: () =>
      acquire(
        'device',
        'Searching this device, then checking with HoYoverse…',
        extractAutomatically,
        automaticMessages,
      ),
    readFile: (file: File) =>
      acquire(
        'file',
        'Reading the file, then checking with HoYoverse…',
        () => extractFromFile(file),
        fileMessages,
      ),
    // Progress stops showing once the user asks to cancel; if the request cannot be
    // sent, retrieval carries on and can be cancelled again.
    cancel: async () => {
      cancelling.value = true
      status.value = 'Cancelling…'
      if (await cancelAcquisition()) cancelling.value = false
    },
    save: async () => {
      const { uid, server, new_five_star, new_four_star } = review.value!
      phase.value = 'saving'
      status.value = 'Saving…'
      const result = await commitImport()
      finish(
        'failure' in result
          ? failed(result.failure, describe(result.failure, commitMessages))
          : {
              kind: 'saved',
              summary: result.summary,
              fiveStar: new_five_star,
              fourStar: new_four_star,
              uid,
              server,
            },
      )
    },
    discard: () => leave(note('Discarded the retrieved history. Nothing was saved.')),
    done: () => leave(note('Your saved history is already up to date.')),
    /** Leave the saved or failed screen for the start. */
    dismiss: () => {
      outcome.value = undefined
    },
  }
}
