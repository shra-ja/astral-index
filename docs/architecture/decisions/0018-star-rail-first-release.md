# 0018 — Star Rail first release

Date: 2026-10-05
Status: Accepted

## Context

The product brief's proposed first release covered both games, history-file
import, and a versioned backup with restore, as well as Star Rail retrieval,
browsing and pity. Star Rail retrieval, review and saved history work end to
end, but the History screen still shows only the account imported last, without
filters, statistics or pity. Genshin Impact, file import and backup each need
their own formats, fixtures and independent verification before they can ship.

## Decision

The first release covers Star Rail only: user-requested retrieval, review and
save, browsing with account, banner and date filters, totals and rarity
breakdowns, and pity where verified rules support it. Release readiness follows
directly after that work. Backup and restore, history-file import and the
Genshin Impact adapter move to later releases, in that order.

The user chose this order so that a complete Star Rail app ships first, rather
than waiting on a second game and two more file formats.

## Alternatives and consequences

- **Keep the original scope:** ships later, with both games and backup at once.
- **Prepare the release early but ship after backup and Genshin Impact:** keeps
  the scope but runs release verification twice.
- The first release ships without a backup format. Its database is a single
  SQLite file in the local data folder, or beside the executable in portable
  mode, which a player can copy while the app is closed.
- Once the first release ships, any schema change needs a versioned migration
  with data-preservation tests ([storage](../storage.md)). The current schema is
  already keyed by game, account and server, records each import's adapter and
  keeps each roll's fields as JSON, so file import, backup and the second game
  may not need one.
- Release verification checks the first release's workflows; backup and the
  second game add their own checks on each release OS when they arrive.

## Evidence

The user's choice of order on 2026-10-05; [ROADMAP](../../product/ROADMAP.md)
milestones 9 to 12 and the [product brief](../../product/PROJECT.md) record the
resulting sequence and scope.
