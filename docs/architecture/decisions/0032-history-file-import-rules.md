# 0032 — History-file import rules

Date: 2026-10-16
Status: Accepted

## Context

History files from other tools reach the same import pipeline as retrieval
([imports](../imports.md)), but carry less than HoYoverse's responses. UIGF v4
has no server field and makes a roll's name, item type and rarity optional.
StarDB's UIGF export writes each roll's category code as its pool ID, as its
source shows, since it keeps no pool IDs. Star Rail Station's backups hold no
account, server or time zone, and give times in UTC and items only by ID. Saved
rolls conflict today when their stored records differ at all, and any conflict
blocks the whole import, so a file in another language could not be imported
over retrieved history. The evidence is in the
[file research](../../games/hsr/file-research.md).

## Decision

- **A roll's facts decide duplicates.** An imported roll is a duplicate of a saved
  one when they share the roll ID within the game, account and server, and agree
  on banner category, item ID, time and rarity. Names, item type text, language,
  pool ID and absent optional fields are not compared, and the saved record is
  kept unchanged. A disagreement in the facts is a conflict, which blocks the
  import and names the roll.
- **A pool ID equal to its category code is dropped.** It is not the source's
  pool, so the roll is saved without one rather than with a value HoYoverse did
  not give. A later source with the real pool ID fills it in, and so does
  [pool ID completion](../../product/features/0057-pool-id-completion.md):
  automatically where the banner catalogue shows one pool open, otherwise by the
  user's choice among the pools it shows. Completion writes the pool ID into the
  record, so history matches what HoYoverse would return, and a log of
  completions allows undoing one and lets a real source replace it. Until then,
  rolls without a pool ID stay out of UIGF export, which requires one.
- **Servers come from a per-game rule.** Each game supplies the rule that turns a
  UID into its server and the server's time-zone offset; Honkai: Star Rail's
  reads the digits before the UID's last eight. An account whose UID is malformed
  or has no server in the rule cannot be imported. Correcting a wrongly inferred
  server can come later as its own feature.
- **Records keep their source's text; screens prefer item metadata.** A roll's
  record keeps the name, item type and language its source gave. Once the banner
  catalogue's item metadata exists
  ([0034](../../product/features/0034-banner-metadata.md)), the screens show
  names and types from it in one language, falling back to the record's text.
  Until then, a roll without a name, item type or rarity blocks the import,
  saying how many; afterwards only an item the catalogue does not know does.
- **Times are kept as the server's local time.** Each source's adapter declares
  whether its times are server-local or UTC; a format that leaves this unclear
  is not supported. A source with local time keeps its text, and a source in UTC
  is converted with the server's offset from the game's rule, so a Europe roll
  at `2023-04-26T03:11:38Z` is saved as `2023-04-26 04:11:38`. A saved time
  pairs with its account's offset, which together give the exact moment; an
  account whose offset is unknown keeps it unknown.

## Alternatives and consequences

- **The strict rule, any difference a conflict:** files in another language, or
  from tools that omit optional fields, could never be imported over saved
  history.
- **Pool ID among the facts:** every StarDB file would conflict with history
  retrieved from HoYoverse. Inference cannot restore it for every roll, as a
  roll made while two pools of its category ran at once stays ambiguous, so it
  could never be a fact for all rolls; the roll ID already identifies the roll.
- **The user choosing each server:** nothing inferred, but a step on every import
  of a file. Servers and offsets inferred from UIDs rest on community
  observation and a player's own files, not on published rules; the file
  research records the sources.
- **Placeholders for missing names and rarities:** more files accepted, but
  rarity counts and pity would silently leave rolls out.
- **Names moved out of the records:** one language everywhere, but the records
  would no longer match their sources, it would take a schema migration, and
  before the catalogue the record's name is the only one there is.
- **Inferred pool IDs kept apart from the record:** the record would hold only
  what its source gave, but completed history would not match HoYoverse's.
