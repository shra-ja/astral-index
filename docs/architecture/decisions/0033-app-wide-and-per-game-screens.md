# 0033 — App-wide and per-game screens

Date: 2026-10-18
Status: Accepted

## Context

The sidebar's View group follows the selected game: each game has its History
and Import screens, at `/:game/history` and `/:game/import`. The Backup &
Restore screen joined that group at `/:game/backup`, though a backup holds every
game's history: all games share one `history.sqlite`
([decision 0031](0031-sqlite-snapshot-backups.md)). UIGF export was planned on
the same screen, yet it exports one game's history
([0055](../../product/features/0055-uigf-export.md)), although a UIGF v4 file can
hold several games.

## Decision

- **Screens about one game stay in the View group.** History, Import and Export
  follow the selected game, under `/:game/…`.
- **Screens about all history are app-wide.** Backup & Restore moves to its own
  group in the sidebar, above About, at `/backup`, with no game in its route.
  While it is open, the game switcher marks no game as current, and choosing a
  game opens that game's History.
- **Export gets its own screen per game.** UIGF export is a View-group screen,
  after Import, at `/:game/export`, listing that game's accounts only.

## Alternatives and consequences

- **Leaving Backup & Restore under the game:** no sidebar change, but the
  screen's place says it belongs to one game when it covers all of them.
- **Export beside Import, on one Import & Export screen:** files in and out in
  one place, but a busier Import screen and a less obvious way to find export.
- **App-wide export of every game into one UIGF file:** possible with UIGF v4,
  but it needs a game-and-account selector beside the per-game choice export
  already makes.
- The sidebar gains a group. While an app-wide screen is open, the View group's
  links keep pointing to the game shown last.
