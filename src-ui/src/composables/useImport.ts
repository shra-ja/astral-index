// The import flow: validate the saved warp history link and retrieve history with
// progress, or read a history file and pick one of its accounts, then save or discard
// it after review. Components render its state and call its actions; only this flow
// makes the native calls.
import { computed, readonly, ref, shallowReadonly, shallowRef } from 'vue'
import {
  cancelAcquisition,
  commitImport,
  discardImport,
  extractAutomatically,
  chooseCacheFile,
  chooseHistoryFile,
  extractFromFile,
  previewFileAccount,
  readHistoryFile,
  retrieveHistory,
  type Counts,
  type Failure,
  type FileContents,
  type Mode,
  type Progress,
  type Review,
} from '../commands'
import {
  automaticMessages,
  cancelled,
  describe,
  cacheFileMessages,
  historyFileFailure,
  importCopy,
  noStarRailHistory,
  noStarRailTitle,
  progressText,
  retrievalFailure,
  titleOf,
  type Messages,
  type Origin,
} from '../messages'
import { forgetAccountChoice } from './useHistory'

/**
 * `acquiring` runs from validation until the review; `picking` shows a history file's
 * accounts, and `previewing` runs while one is previewed; `saving` and `leaving` keep
 * the review or the accounts shown while their choice is carried out.
 */
export type Phase =
  'idle' | 'acquiring' | 'picking' | 'previewing' | 'reviewing' | 'saving' | 'leaving'
/** Where the rolls come from: retrieval with the link found by searching this device or
 * in a chosen cache file, or a chosen history file. */
export type Source = 'device' | 'cache' | 'file'
/** While acquiring: still finding and checking the link, or downloading history. */
export type Stage = 'finding' | 'downloading'
/**
 * Where the download has got to: the category and page being requested, the last
 * page requested in each category so far, the rolls received, whether a retry is
 * due, and the categories a quick refresh ended at rolls already saved.
 */
export interface Download {
  category: string
  page: number
  pages: Partial<Record<string, number>>
  records: number
  retrying: boolean
  upToDate: string[]
}
/** How the last import ended: saved, failed, or a note such as a cancel. */
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
export function useImport() {
  const phase = ref<Phase>('idle')
  const source = ref<Source>('device')
  // Whether the rolls are retrieved or read from a history file, for the wording.
  const origin = computed<Origin>(() => (source.value === 'file' ? 'file' : 'retrieval'))
  const copy = () => importCopy[origin.value]
  // A cancel is the user's choice, so it ends with a note rather than a failure.
  const failed = (failure: Failure, message: string): Outcome =>
    failure.kind === 'cancelled'
      ? note(copy().cancelled)
      : { kind: 'failed', title: titleOf(failure), message }
  const fileFailed = (failure: Failure) => failed(failure, historyFileFailure(failure))
  // New rolls only unless the user asks for the full history (decision 0015).
  const mode = ref<Mode>('new')
  const stage = ref<Stage>('finding')
  const status = ref('')
  // Unset until the first page is requested.
  const download = shallowRef<Download>()
  const review = ref<Review>()
  const outcome = ref<Outcome>()
  // Set while the user has asked to stop the running acquisition.
  const cancelling = ref(false)
  // Set while a file's native dialog is open, or a history file is read and its lone
  // account previewed, when no other import starts.
  const busy = ref(false)
  // The history file chosen last, by name, for its accounts and review.
  const fileName = ref<string>()
  // The history file's accounts, while one is to be picked.
  const accounts = shallowRef<FileContents>()

  // Only one acquisition runs at a time: callers offer these only while idle.
  async function acquire(
    from: Source,
    searching: string,
    extract: () => Promise<Failure | undefined>,
    messages: Messages,
  ) {
    source.value = from
    fileName.value = undefined
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
    const result = await retrieveHistory(mode.value, (progress) => {
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

  // Keep each category's last page and whether it ended up to date; a retry waits
  // on the current page.
  function track(progress: Progress) {
    const before = download.value
    if (progress.kind === 'requesting') {
      const { gacha_type, page, records } = progress
      const pages = { ...before?.pages, [gacha_type]: page }
      const upToDate = before?.upToDate ?? []
      download.value = { category: gacha_type, page, pages, records, retrying: false, upToDate }
    } else if (!before) {
      return
    } else if (progress.kind === 'up_to_date') {
      download.value = { ...before, upToDate: [...before.upToDate, progress.gacha_type] }
    } else {
      download.value = { ...before, retrying: true }
    }
  }

  // Preview one of the file's accounts for the review; the file is then used up.
  async function preview(uid: string) {
    phase.value = 'previewing'
    const result = await previewFileAccount(uid)
    accounts.value = undefined
    if ('failure' in result) return finish(fileFailed(result.failure))
    phase.value = 'reviewing'
    review.value = result.review
  }

  // Choose the history file and read it natively, then review its only account or
  // show its accounts; a closed dialog changes nothing.
  async function openFile() {
    const choice = await chooseHistoryFile()
    if ('cancelled' in choice) return
    source.value = 'file'
    outcome.value = undefined
    if ('failure' in choice) return finish(fileFailed(choice.failure))
    fileName.value = choice.chosen
    const read = await readHistoryFile()
    if ('failure' in read) return finish(fileFailed(read.failure))
    const { contents } = read
    const [only, ...others] = contents.accounts
    if (!only)
      return finish({
        kind: 'failed',
        title: noStarRailTitle,
        message: noStarRailHistory(contents),
      })
    // A lone account that can be imported, with nothing left out, has nothing to
    // choose or explain, so it is reviewed at once.
    if (
      only.kind === 'importable' &&
      others.length === 0 &&
      contents.malformed_uids === 0 &&
      contents.other_games.length === 0
    )
      return preview(only.uid)
    accounts.value = contents
    phase.value = 'picking'
  }

  function finish(ending: Outcome) {
    review.value = undefined
    accounts.value = undefined
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
    origin,
    stage: readonly(stage),
    status: readonly(status),
    mode: readonly(mode),
    download: shallowReadonly(download),
    review: shallowReadonly(review),
    outcome: shallowReadonly(outcome),
    cancelling: readonly(cancelling),
    busy: readonly(busy),
    fileName: readonly(fileName),
    accounts: shallowReadonly(accounts),
    searchDevice: async () => {
      if (busy.value) return
      await acquire(
        'device',
        'Searching this device, then checking with HoYoverse…',
        extractAutomatically,
        automaticMessages,
      )
    },
    // The native side opens the dialog and holds the file; nothing shows until one
    // is chosen, and a closed dialog changes nothing.
    chooseCache: async () => {
      if (busy.value) return
      busy.value = true
      const choice = await chooseCacheFile()
      busy.value = false
      if ('cancelled' in choice) return
      if ('failure' in choice) {
        source.value = 'cache'
        return finish(failed(choice.failure, describe(choice.failure, cacheFileMessages)))
      }
      await acquire(
        'cache',
        'Reading the file, then checking with HoYoverse…',
        extractFromFile,
        cacheFileMessages,
      )
    },
    importFile: async () => {
      if (busy.value) return
      busy.value = true
      await openFile()
      busy.value = false
    },
    /** Preview the file's account picked for review. */
    reviewAccount: preview,
    /** Leave the file's accounts without importing; the native side drops them. */
    closeFile: () => leave(note('Nothing was imported from the file.')),
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
      // History then shows the account just saved into, whichever was chosen before.
      // Retrieval is Star Rail's alone until another game has an adapter.
      if ('summary' in result) forgetAccountChoice('honkai-star-rail')
      finish(
        'failure' in result
          ? failed(result.failure, describe(result.failure, copy().commit))
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
    discard: () => leave(note(copy().discarded)),
    done: () => leave(note('Your saved history is already up to date.')),
    /** Leave the saved or failed screen for the start. */
    dismiss: () => {
      outcome.value = undefined
    },
    /** What the next retrieval asks for: new rolls only, or the full history. */
    chooseMode: (next: Mode) => {
      mode.value = next
    },
  }
}
