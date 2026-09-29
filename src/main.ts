import {
  cancelAcquisition, discardImport, extractAutomatically, extractFromFile, retrieveHistory,
  commitImport, type Counts, type Failure, type Kind, type Progress, type Review,
} from './commands';

document.querySelector('main')!.innerHTML = `
  <header>
    <a class="wordmark" href="#">ROLL TRACKER</a>
    <span class="local-app"><span aria-hidden="true">●</span> Local app</span>
  </header>
  <section class="intro" aria-labelledby="title">
    <p class="eyebrow">A little history. All yours.</p>
    <h1 id="title">Your rolls, kept local.</h1>
    <p class="lede">A home for your gacha history, right on your device.</p>
  </section>
  <section class="collection" aria-label="Roll history">
    <div class="toolbar">
      <div>
        <label for="game">Your game</label>
        <select id="game">
          <option value="genshin-impact">Genshin Impact</option>
          <option value="honkai-star-rail">Honkai: Star Rail</option>
        </select>
      </div>
      <span class="collection-label">Your collection starts here</span>
    </div>
    <div class="empty" role="status" aria-live="polite" aria-atomic="true">
      <span class="empty-icon" aria-hidden="true">✧</span>
      <h2></h2>
      <p>Showing saved history is coming next.</p>
      <p class="detail">Your history will stay on this device. No account needed.</p>
    </div>
    <div class="retrieval" aria-busy="false" hidden>
      <div class="start">
        <p>Retrieval starts with the warp history link the game saved on this device.
          The app finds it, then checks it with HoYoverse, so you need to be online.</p>
        <button type="button">Start retrieval</button>
        <div class="fallback">
          <label for="cache-file">Or choose the game’s <code>data_2</code> cache file</label>
          <p class="detail" id="cache-file-hint">It’s in the game’s <code>webCaches</code> folder,
            under <code>Cache\\Cache_Data</code>.</p>
          <input type="file" id="cache-file" aria-describedby="cache-file-hint">
        </div>
      </div>
      <p class="extraction-status" role="status" aria-live="polite" aria-atomic="true"></p>
      <button type="button" class="cancel" hidden>Cancel</button>
      <section class="review" aria-labelledby="review-heading" hidden>
        <h3 id="review-heading" tabindex="-1"></h3>
        <p class="detail"></p>
        <table>
          <thead>
            <tr><th scope="col">Warp</th><th scope="col">New</th><th scope="col">Already saved</th><th scope="col">Conflicts</th></tr>
          </thead>
          <tbody></tbody>
        </table>
        <div class="conflicts" hidden>
          <p id="conflicts-note">These retrieved rolls differ from saved rolls with the same ID, so nothing can be saved.
            Discarding them leaves this device unchanged.</p>
          <ul></ul>
        </div>
        <div class="actions">
          <button type="button">Save to this device</button>
          <button type="button" class="secondary">Discard</button>
          <button type="button">Done</button>
        </div>
      </section>
    </div>
  </section>
  <footer>Made for your collection. No cloud required.</footer>
`;

const game = document.querySelector<HTMLSelectElement>('#game')!;
const heading = document.querySelector('h2')!;
const retrieval = document.querySelector<HTMLElement>('.retrieval')!;
const start = retrieval.querySelector<HTMLElement>('.start')!;
const find = start.querySelector('button')!;
const cacheFile = start.querySelector<HTMLInputElement>('#cache-file')!;
const status = retrieval.querySelector('.extraction-status')!;
const cancel = retrieval.querySelector<HTMLButtonElement>('.cancel')!;
const review = retrieval.querySelector<HTMLElement>('.review')!;
const reviewHeading = review.querySelector('h3')!;
const account = review.querySelector('.detail')!;
const categoryRows = review.querySelector('tbody')!;
const conflictsBox = review.querySelector<HTMLElement>('.conflicts')!;
const conflictList = conflictsBox.querySelector('ul')!;
const [save, discard, done] = review.querySelectorAll<HTMLButtonElement>('.actions button');

/** Warp names by `gacha_type`, as the game shows them. */
const warps: Record<string, string> = {
  1: 'Stellar Warp', 2: 'Departure Warp', 11: 'Character Event Warp', 12: 'Light Cone Event Warp',
  21: 'Character Collaboration Warp', 22: 'Light Cone Collaboration Warp',
};
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

// Keep the empty-state heading aligned with the selected game, including on first render.
function updateGame() {
  heading.textContent = `No ${game.selectedOptions[0].textContent} rolls yet`;
  retrieval.hidden = game.value !== 'honkai-star-rail';
}

// Set while the user has asked to stop the running acquisition.
let cancelling = false;
// The control that started the acquisition, which gets focus back when it ends.
let origin: HTMLElement = find;

const plural = (count: number, noun: string) => `${count.toLocaleString('en')} ${noun}${count === 1 ? '' : 's'}`;

// Swap the start controls for Cancel while acquisition runs, so only one runs at a
// time, then show the review or say how it ended.
async function acquire(
  trigger: HTMLElement, searching: string, extract: () => Promise<Failure | undefined>,
  messages: Partial<Record<Kind, string>>,
) {
  origin = trigger;
  cancelling = false;
  start.hidden = true;
  cancel.hidden = cancel.disabled = false;
  cancel.focus();
  retrieval.setAttribute('aria-busy', 'true');
  status.textContent = searching;
  const outcome = await run(extract, messages);
  if (typeof outcome === 'string') finish(outcome);
  else showReview(outcome);
}

// Return to the start controls with a message, focusing the control that started.
function finish(message: string) {
  cancel.hidden = review.hidden = true;
  start.hidden = false;
  retrieval.setAttribute('aria-busy', 'false');
  status.textContent = message;
  origin.focus();
}

// Validate, then retrieve. A cancel that races a success still keeps nothing.
async function run(extract: () => Promise<Failure | undefined>, messages: Partial<Record<Kind, string>>) {
  const failure = await extract();
  if (failure) return describe(failure, messages);
  if (cancelling) return cancelled;
  status.textContent = 'Retrieving your warp history…';
  const result = await retrieveHistory(showProgress);
  if ('failure' in result) return locate(result.failure) + describe(result.failure, retrievalMessages);
  if (result.retrieved.kind === 'no_history') return 'HoYoverse returned no warp history for this account. Nothing was saved.';
  if (!cancelling) return result.retrieved;
  await discardImport();
  return cancelled;
}

// Show what saving would change. Save is offered only when something is new, and
// stays disabled while any roll conflicts, since the native side refuses to commit it.
function showReview(retrieved: Review) {
  const { inserted, conflicts } = retrieved.summary;
  const nothingNew = inserted === 0 && conflicts === 0;
  cancel.hidden = true;
  retrieval.setAttribute('aria-busy', 'false');
  status.textContent = '';
  reviewHeading.textContent = conflicts ? 'Some rolls conflict with your saved history'
    : nothingNew ? 'Everything here is already saved' : `Ready to save ${plural(inserted, 'new roll')}`;
  account.textContent = `UID ${retrieved.uid} · ${retrieved.server} · `
    + `${retrieved.earliest.slice(0, 10)} to ${retrieved.latest.slice(0, 10)} (server time)`;
  categoryRows.replaceChildren(...retrieved.categories.map(category => {
    const row = document.createElement('tr');
    const name = document.createElement('th');
    name.scope = 'row';
    name.textContent = warps[category.gacha_type];
    row.append(name, ...[category.inserted, category.duplicates, category.conflicts].map(count => {
      const cell = document.createElement('td');
      cell.textContent = count.toLocaleString('en');
      return cell;
    }));
    return row;
  }));
  conflictList.replaceChildren(...retrieved.conflicts.map(({ id, gacha_type, time }) => {
    const item = document.createElement('li');
    item.textContent = `${warps[gacha_type]} · ${time} · ID ${id}`;
    return item;
  }));
  conflictsBox.hidden = !conflicts;
  if (conflicts) save.setAttribute('aria-describedby', 'conflicts-note');
  else save.removeAttribute('aria-describedby');
  save.hidden = discard.hidden = nothingNew;
  done.hidden = !nothingNew;
  save.disabled = conflicts > 0;
  discard.disabled = done.disabled = false;
  review.hidden = false;
  reviewHeading.focus();
}

function saved({ inserted, duplicates }: Counts) {
  const already = duplicates === 0 ? ''
    : ` ${duplicates.toLocaleString('en')} ${duplicates === 1 ? 'was' : 'were'} already saved.`;
  return `Saved ${plural(inserted, 'new roll')} to this device.${already}`;
}

// Leave the review without saving; the native side drops the retrieved history.
async function leave(message: string) {
  save.disabled = discard.disabled = done.disabled = true;
  await discardImport();
  finish(message);
}

function showProgress(progress: Progress) {
  if (cancelling) return;
  status.textContent = progress.kind === 'requesting'
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
cancel.addEventListener('click', async () => {
  cancelling = cancel.disabled = true;
  status.textContent = 'Cancelling…';
  if (await cancelAcquisition()) cancelling = cancel.disabled = false;
});

save.addEventListener('click', async () => {
  save.disabled = discard.disabled = true;
  retrieval.setAttribute('aria-busy', 'true');
  status.textContent = 'Saving…';
  const result = await commitImport();
  finish('failure' in result ? describe(result.failure, commitMessages) : saved(result.summary));
});
discard.addEventListener('click', () => leave('Discarded the retrieved history. Nothing was saved.'));
done.addEventListener('click', () => leave('Your saved history is already up to date.'));

find.addEventListener('click', () =>
  acquire(find, 'Searching this device, then checking with HoYoverse…', extractAutomatically, automaticMessages));

// Clear only as the dialog opens: the chosen file stays shown with its result,
// and choosing the same file again still fires a change.
cacheFile.addEventListener('click', () => { cacheFile.value = ''; });

cacheFile.addEventListener('change', async () => {
  const file = cacheFile.files![0];
  if (!file) return;
  await acquire(cacheFile, 'Reading the file, then checking with HoYoverse…', () => extractFromFile(file), fileMessages);
});

game.addEventListener('change', updateGame);
updateGame();
