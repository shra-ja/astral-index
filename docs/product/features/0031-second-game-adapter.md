# 0031 — Second game adapter

Status: Planned · Milestone 12, Genshin Impact and item art

Genshin Impact support, independently verified.

## Tasks

- [ ] Add the second game's independently verified adapter, acquisition sources,
  response/file fixtures, and request mocks.
- [ ] Make restore count every game: `Store::contents`, which the restore
  confirmation shows and compares on confirming, and the rule that an empty
  history gets no safety copy, read Star Rail's accounts only. Once a second
  game is stored, a history holding only that game would be replaced without a
  safety copy ([0037](0037-backup-and-restore.md)).
- [ ] Remove the Genshin Impact feature toggle
  ([0051](0051-feature-toggles.md)), so release builds show Genshin Impact.
