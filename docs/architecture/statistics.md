# Statistics

Status: tentative. Nothing here is implemented yet; see roadmap features
[0034 — Banner metadata](../product/features/0034-banner-metadata.md) and
[0035 — Pity](../product/features/0035-pity.md).

## Rules

Pity and guarantee rules belong to each game adapter and may vary by banner and
rule version. Record the evidence for every rule mapping. Preserve banner identity
even when several banners share a pity group.

Pity is calculated as though each pity group's stored rolls were complete: the
oldest stored roll starts the count. Otherwise an account's first rolls would
never show pity, even when its history is known to be complete. Importing older
rolls therefore changes the pity of every later roll in that group. Until verified
metadata defines pity groups, each banner category keeps its own count.

Guarantees and 50/50 outcomes need verified banner metadata; until it exists the
UI reports them as unavailable rather than guessing.

## Proposal: derived on read

Not decided: when and how pity is calculated is settled when the pity work
starts. The proposal is to derive pity when history is read, not store it. The
history page read already makes one ordered pass over the category in Rust
([storage](storage.md)), where pity could be counted before filters apply. One ordered pass over a pity
group's rolls (by time, then source ID, with the order verified per game) is O(n);
even tens of thousands of rolls take well under a millisecond in Rust. A page of
history still needs that pass, because each roll's pity depends on the rolls
before it, not only the rows shown.

Storing pity would make every import of older rolls rewrite all later rows in the
same transaction, and every change to pity-group or rule mappings a data
migration. Add a cache only if measured reads of large histories need one, and
treat it as disposable derived data.
