# 0013 — Visual design

Date: 2026-10-01
Status: Accepted

## Context

The shell's screens were placeholders. Before building the stored-history
display, the whole visual design was redone from scratch and reviewed as
interactive mockups with synthetic data. The mockups are kept outside the
repository; this record holds what the implementation must follow.

## Decision

### Look

- **Dark theme only**, for now. Colours, as design tokens:

  | Role                         | Value                                           |
  | ---------------------------- | ----------------------------------------------- |
  | Window background            | `#101318`                                       |
  | Sidebar                      | `#0B0D11`                                       |
  | Panel / list background      | `#171B21` / `#13171C`                           |
  | Selected or raised surface   | `#1A1E25`, controls `#1F242C`                   |
  | Dividers, panel, control rim | `#1E232B`, `#232831`, `#2A303A`                 |
  | Text: primary, secondary     | `#E8EAEE`, `#A7AEBA`                            |
  | Text: soft, muted, faint     | `#C4C9D2`, `#868E9B`, `#5F6773`                 |
  | Accent (actions, selection)  | `#74D3C0` on ink `#08201B`; tint `#15302B`      |
  | Error                        | `#FF9B8A` on `#3A1F1C`                          |
  | Rarity 5★, 4★, 3★            | `#F5B94E`, `#B79CFF`, `#7C9CBF` (muted blue)    |
  | Pity bands                   | green `#6CCB8F`, orange `#F0A35E`, red `#F07A6E` |
  | Tooltip                      | `#232831` with a `#343B46` border               |

  Rarity badges use the rarity colour on a 16% tint; 5★ rows and tiles add a 6%
  tint. Item names take the 5★ and 4★ colours; 3★ names stay neutral.
- **Type:** Hanken Grotesk (400–700), bundled with the app; no remote fonts.
  Numbers, UIDs and times use its tabular figures, not a monospaced font, whose
  wide commas read poorly. Page titles 22px, section titles 18–20px, body
  14–15px, labels 12–13px. Headings use Title Case; buttons, labels and body text
  use sentence case.
- **Shapes:** controls have 8–9px corners, panels 12px and cards 14px. Item
  icons use 8px on 30px (about 0.27 of their size) and other rounded squares keep
  that ratio. Badges are full pills.
- **Tooltips** are styled in the app's theme, appear after a short delay, and
  also show on keyboard focus; browser `title` tooltips are not used.
- Icons are Lucide stroke icons (`@lucide/vue`, ISC licence, bundled per
  icon and decorative), with a custom brand mark; no emoji. (Amended
  2026-10-03: the first icons were hand-drawn inline SVGs.) Item icons and
  banner art are placeholders (rarity-tinted initials and colour bars) until a
  source is decided.

### Screens

- **Shell:** a sidebar with the game switcher (Genshin Impact, Honkai: Star Rail),
  the two screens (Warp/Wish History and Import), and a "stored on this device"
  note. Each game has its own history and import screens.
- **History:** a header with the account switcher (UID and server); banner
  category tabs with counts; a summary strip (rolls stored, 5★ and 4★ counts with
  rates, stored period); and the rolls panel. The panel's toolbar holds rarity
  filters (5★, 4★, 3★), item search, an icons-and-banner-art button (list layout
  only, on by default), a 50/50 colouring button, and a List, Grid and Icons
  layout switch. The list shows #, item with icon, Pity, banner art, rarity,
  type and time (server time, offset in the header), newest first, paged at
  20, 50 or 100 rows. Grid tiles show icon, name, type, roll number, rarity,
  pity and date; Icons tiles show the icon with its pity in the corner. The
  summary strip covers the whole category; filters and search only hide rows
  and change the "Showing … of N" count. An empty state links to Import.
- **Pity column:** 5★ pity is coloured by closeness to soft pity, with
  thresholds per banner category (placeholders 1–49, 50–74, 75+), or, with the
  50/50 button on, by outcome: won (green), lost (red), guaranteed (orange).
  The button stays disabled, with a tooltip saying banner details are not
  available yet, until banner metadata exists. 4★ and 3★ pity stays uncoloured.
- **Import:** choose a source: retrieve from HoYoverse (with "Choose cache
  file…" for a manually selected `data_2` file) or import from a file (shown
  disabled as "Coming soon" for now). Then a progress screen (link found in the
  game files or the provided file, link checked, per-category download, prepare
  review) with Cancel; a review screen (account, new/skipped/conflict counts,
  retrieved period, per-category breakdown, paged preview of new rolls with an
  icons button off by default) with Discard and Save; a saved screen; and
  failure screens for an expired link and for game files that cannot be found.

### Layout

Layouts are fluid ([AGENTS.md](../../AGENTS.md)): components are placed
relative to each other and scale with the window. Mockup breakpoints are
starting points; prefer container queries on the content area over window
widths, and detect overflow where content length varies.

- **Minimum window:** 480×560. It excludes phones in either orientation; mobile
  is out of scope, and the minimum can be lowered if that changes. Content that
  does not fit scrolls rather than squashes.
- **Shell:** the sidebar is 232px and collapses to a 72px icon rail at a 900px
  app width. Headers wrap; side padding scales from 32px down to 16px.
- **Tabs** never scroll out of reach: counts drop first, then the tabs become a
  "Banner category" dropdown. Switch when the tabs stop fitting, measured in
  code, rather than at fixed widths per game.
- **Summary strips** are one row of four, or two by two when the content area is
  760px or narrower, never three and one. Items are a fixed 78px tall. The period
  column is never narrower than the full date range, and the range only breaks
  at its dash. Strips never shrink to make room for the list.
- **Rolls panel:** the toolbar wraps and search flexes between 160px and 240px.
  List columns have stable widths except Item, which takes the spare space; as
  space shrinks, Type drops out (1180px), then Banner (980px, or when art is
  off), then Time (760px). Rows, grid tiles (at least 190px, as many per row as
  fit) and icon tiles (64px) scroll inside the panel, with the list header fixed.
- **Review:** the two panels sit side by side, each scrolling with a fixed
  header, and stack at 1100px, where the whole screen scrolls instead. The footer
  actions stay fixed. Centred panels (progress, saved, failures) have a maximum
  width and shrink below it.

### Accessibility

Real buttons, inputs and labels throughout, with `aria-pressed` toggles and a
2px accent focus outline. Disabled-for-now controls use `aria-disabled` so they
stay focusable and their tooltip readable. Text meets 4.5:1 contrast, and rarity
is shown as text as well as colour.

## Alternatives and consequences

- **Fixed-size screens** were the first mockups; they did not scale, and fluid
  layouts became a project rule.
- **Monospaced numbers** were dropped for tabular figures because of their wide
  commas. IBM Plex Sans, Manrope, DM Sans and Figtree were compared against
  Hanken Grotesk, which was kept.
- **A 320px minimum** (phones and WCAG reflow at 400% zoom) was considered and
  deferred with mobile; heavily zoomed desktop windows scroll instead of
  reflowing.
- **Storing pity** was rejected; it is derived on read
  ([architecture](../ARCHITECTURE.md#statistics)).
- A light theme, real item art and the history-file import flow are deferred;
  the roadmap tracks them. The Import screen's "Last import" line comes from the
  `last_import` command (added 2026-10-03).
