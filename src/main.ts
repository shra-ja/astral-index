import {
  cancelAcquisition, discardImport, extractAutomatically, extractFromFile, retrieveHistory,
  type Failure, type Kind, type Progress,
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
      <p>History retrieval is coming next.</p>
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

const plural = (count: number, noun: string) => `${count.toLocaleString('en')} ${noun}${count === 1 ? '' : 's'}`;

// Swap the start controls for Cancel while acquisition runs, so only one runs at a time,
// and return focus to the control that started it.
async function acquire(
  trigger: HTMLElement, searching: string, extract: () => Promise<Failure | undefined>,
  messages: Partial<Record<Kind, string>>,
) {
  cancelling = false;
  start.hidden = true;
  cancel.hidden = cancel.disabled = false;
  cancel.focus();
  retrieval.setAttribute('aria-busy', 'true');
  status.textContent = searching;
  status.textContent = await run(extract, messages);
  cancel.hidden = true;
  start.hidden = false;
  retrieval.setAttribute('aria-busy', 'false');
  trigger.focus();
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
  // Saving arrives with the review screen; until then, hold nothing natively.
  await discardImport();
  if (cancelling) return cancelled;
  return `Found ${plural(result.retrieved.summary.inserted, 'new roll')}. Saving is coming next.`;
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
