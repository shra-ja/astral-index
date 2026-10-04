# Games

Known facts about each game's history sources, and how to research a new one.
Current support is in [STATUS](../status/STATUS.md); the shared import design is in
[imports](../architecture/imports.md).

| Game | Docs |
| --- | --- |
| Honkai: Star Rail | [API contract](hsr/api-contract.md) (accepted behaviour the app relies on) and [API research](hsr/api-research.md) (dated evidence behind it, including supported extraction sources) |
| Genshin Impact | Not researched yet; add `genshin/` when that work starts |

## Researching a new source

Before claiming support for a game, file format or local source:

- Identify official or format-owner documentation, the source version and the
  research date.
- Establish whether the data is actually local or needs a remote request.
- Verify path discovery and file access on each claimed OS, and support manual
  selection.
- Document the available fields, history limits, time zone, server and ordering
  semantics.
- Confirm IDs stay stable across overlapping exports and banner categories.
- Create synthetic fixtures for valid, empty, malformed, duplicate, overlapping,
  out-of-order and conflicting histories, including multiple accounts and servers.
- Define unknown-version handling and prove errors cannot corrupt existing data.

Never commit source credentials, token-bearing URLs, real logs or player
histories. Record research as dated evidence; record what the app relies on as a
contract, kept separate from the evidence.
