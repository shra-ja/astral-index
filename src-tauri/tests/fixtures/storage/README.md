# Released databases

Each file is the database a released version wrote, from invented history, for the
migration tests in [released_databases.rs](../../released_databases.rs)
([decision 0029](../../../../docs/architecture/decisions/0029-automated-release-verification.md)).
A file is frozen once committed: its test pins its SHA-256, and a later version
must never regenerate it, as it stands for what that release wrote. Each
migration's tests open a copy, never the file itself.

- `history-1.0.0.sqlite`: schema version 2, written by 1.0.0's `Store` through
  four imports of synthetic HSR API pages:
  1. UID `100000002` on `prod_official_asia` (offset +8): ten Character Event
     rolls, a 4★ fifth and a 5★ tenth, and three Light Cone Event rolls.
  2. The same UID on `prod_official_usa` (offset −5): three Departure rolls.
  3. The first account again: all twelve Character Event rolls, ten already
     saved, and two Stellar rolls, one with an unknown `synthetic_extension`
     field.
  4. UID `100000003` on `prod_official_asia`, with no time zone in its pages:
     two Character Collab rolls.

The globally ignored `*.sqlite` pattern is lifted for this folder only, so no
other database can be committed.
