import { extractAutomatically, extractFromFile, type Failure, type Kind } from './commands';

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
      <p>Retrieval starts with the warp history link the game saved on this device.
        The app finds it, then checks it with HoYoverse, so you need to be online.</p>
      <button type="button">Start retrieval</button>
      <div class="fallback">
        <label for="cache-file">Or choose the game’s <code>data_2</code> cache file</label>
        <p class="detail" id="cache-file-hint">It’s in the game’s <code>webCaches</code> folder,
          under <code>Cache\\Cache_Data</code>.</p>
        <input type="file" id="cache-file" aria-describedby="cache-file-hint">
      </div>
      <p class="extraction-status" role="status" aria-live="polite" aria-atomic="true"></p>
    </div>
  </section>
  <footer>Made for your collection. No cloud required.</footer>
`;

const game = document.querySelector<HTMLSelectElement>('#game')!;
const heading = document.querySelector('h2')!;
const retrieval = document.querySelector<HTMLElement>('.retrieval')!;
const find = retrieval.querySelector('button')!;
const cacheFile = retrieval.querySelector<HTMLInputElement>('#cache-file')!;
const status = retrieval.querySelector('.extraction-status')!;

const found = 'HoYoverse accepted your warp history link. Retrieving your history is coming next.';
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

// Disable both actions while one runs, so results cannot arrive out of order.
async function extract(progress: string, action: () => Promise<Failure | undefined>) {
  find.disabled = cacheFile.disabled = true;
  retrieval.setAttribute('aria-busy', 'true');
  status.textContent = progress;
  const failure = await action();
  find.disabled = cacheFile.disabled = false;
  retrieval.setAttribute('aria-busy', 'false');
  return failure;
}

function describe(failure: Failure | undefined, messages: Partial<Record<Kind, string>>) {
  if (!failure) return found;
  if (failure.kind === 'api_error') {
    return `HoYoverse didn’t accept your warp history link (error ${failure.code}). Open your warp history in the game, then try again.`;
  }
  return messages[failure.kind] ?? unexpected;
}

find.addEventListener('click', async () => {
  const failure = await extract('Searching this device, then checking with HoYoverse…', extractAutomatically);
  status.textContent = describe(failure, automaticMessages);
});

// Clear only as the dialog opens: the chosen file stays shown with its result,
// and choosing the same file again still fires a change.
cacheFile.addEventListener('click', () => { cacheFile.value = ''; });

cacheFile.addEventListener('change', async () => {
  const file = cacheFile.files![0];
  if (!file) return;
  const failure = await extract('Reading the file, then checking with HoYoverse…', () => extractFromFile(file));
  status.textContent = describe(failure, fileMessages);
});

game.addEventListener('change', updateGame);
updateGame();
