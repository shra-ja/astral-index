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
- **A pool ID equal to its category code is unknown.** The source's text is kept,
  but nothing treats it as a pool: banner lookups and pity rules ignore it, and
  UIGF export writes it back as given.
- **Servers come from a per-game rule.** Each game supplies the rule that turns a
  UID into its server and the server's time-zone offset; Honkai: Star Rail's
  reads the UID's first digit. A UID the rule does not recognise blocks its
  account. Correcting a wrongly inferred server can come later as its own
  feature.
- **Records the screens cannot show are refused.** A roll without a name, item
  type or rarity blocks the import, saying how many, until item metadata can
  supply them ([0034](../../product/features/0034-banner-metadata.md)).
- **Times are kept as the server's local time.** A source in UTC is converted
  with the server's offset from the game's rule; a source with local time keeps
  its text.

## Alternatives and consequences

- **The strict rule, any difference a conflict:** files in another language, or
  from tools that omit optional fields, could never be imported over saved
  history.
- **Pool ID among the facts:** every StarDB file would conflict with history
  retrieved from HoYoverse.
- **The user choosing each server:** nothing inferred, but a step on every import
  of a file. Servers and offsets inferred from UIDs rest on community
  observation and a player's own files, not on published rules, so each server
  the rule claims is verified first.
- **Placeholders for missing names and rarities:** more files accepted, but
  rarity counts and pity would silently leave rolls out.
