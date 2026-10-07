# Statistics

Status: partly implemented. Pity is counted on read as a 5★ count on every roll
([decision 0019](decisions/0019-pity-derived-on-read.md)) and coloured by soft
pity ([decision 0020](decisions/0020-soft-pity-colours.md)); banner metadata and
guarantees are not. See roadmap features
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

5★ pity is coloured by closeness to soft pity, from thresholds the Star Rail
adapter sends with each page ([decision 0020](decisions/0020-soft-pity-colours.md)).
Hard pity is official; the soft-pity starts are observed, not published.

Guarantees and 50/50 outcomes need verified banner metadata from a catalogue
folder ([decision 0022](decisions/0022-banner-catalogue-downloader.md)); until
one covers a roll's banner, the UI reports them as unavailable rather than
guessing. Statistics show no marks for possibly missing rolls
([decision 0021](decisions/0021-history-completeness.md)).

## Derived on read

Pity is counted in the history page read's one ordered pass over the category in
Rust ([storage](storage.md)), before filters apply, so filters, search and dates
never change it. Every roll shows how many rolls it is since the previous 5★,
counting itself; a 5★ shows the pity it came at. Nothing is stored.

Storing pity would make every import of older rolls rewrite all later rows in the
same transaction, and every change to pity-group or rule mappings a data
migration. Add a cache only if measured reads of large histories need one, and
treat it as disposable derived data.
