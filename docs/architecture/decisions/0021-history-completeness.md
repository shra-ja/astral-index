# 0021 — History completeness is the user's responsibility

Date: 2026-10-07
Status: Accepted

## Context

The product brief asked that missing historical coverage and uncertain
statistics be visibly identified, and milestone 9 asked for partial histories to
be marked as uncertain. Decision 0019 counts pity as though each pity group's
stored rolls were complete and left marking incomplete history to another
mechanism, such as a coverage notice.

HoYoverse gives no retention guarantee for its history endpoint, and nothing in
a response or a stored history shows whether older rolls existed. A history that
starts long after an account was created is complete if the account never
rolled before then, and one that looks continuous can still be missing rolls.

## Decision

The application treats stored history as the record of the account and does not
claim to know whether it is complete. Keeping a complete history, by retrieving
regularly or importing older files, is the user's responsibility. Statistics
are calculated from the stored rolls as decision 0019 describes, without marks
for possibly missing rolls.

Flagging patterns that suggest missing rolls, such as a long gap between stored
rolls, is a low-priority diagnostic in the backlog
([feature 0046](../../product/features/0046-history-gap-detection.md)), alongside
overlap anomaly detection ([feature 0042](../../product/features/0042-overlap-anomaly-detection.md)).
The user chose this on 2026-10-07.

## Alternatives and consequences

- **Coverage notices** (for example, before a category's first stored 5★):
  shown on almost every history, since few start at an account's first roll,
  so they would carry little information.
- **Marking uncertain counts** such as "23+": rejected in decision 0019.
- The brief's acceptance criterion changes accordingly, and milestone 9 no
  longer includes marking partial histories.
- Imports still never assume that a source holds complete history; this
  decision concerns what statistics show, not how imports reconcile records.

## Evidence

The [HSR API contract](../../games/hsr/api-contract.md) treats retained history
as a product assumption, not a verified retention guarantee; decision 0019
records the pity counting this builds on.
