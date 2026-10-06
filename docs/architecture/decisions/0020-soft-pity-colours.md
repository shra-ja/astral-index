# 0020 — Soft-pity colours

Date: 2026-10-06
Status: Accepted

## Context

Decision 0013 colours 5★ pity by closeness to soft pity, with placeholder bands
of 1–49, 50–74 and 75+, and feature 0035 asks for thresholds per banner category
from verified rules with their evidence recorded. HoYoverse publishes each
warp's base rate and hard pity in the game's Warp details, but not soft pity,
the point where the 5★ rate starts to climb. Pity is counted per category
([decision 0019](0019-pity-derived-on-read.md)).

## Decision

5★ pity is coloured in three bands from each category's soft-pity start: green
before it, orange from 25 warps before it, and red from it.

| Categories | Hard pity (official) | Soft pity starts (observed) | Orange from | Red from |
| --- | --- | --- | --- | --- |
| Character Event, Stellar, Character Collab | 90 | 74 | 49 | 74 |
| Light Cone Event, Light Cone Collab | 80 | 65 | 40 | 65 |
| Departure | 50 | Not known | Uncoloured | Uncoloured |

The thresholds are game rules, so they belong to the Star Rail adapter, which
sends them with each history page; the webview only applies them. The colour is
a visual convenience: each pity cell reads only its count, since soft-pity
thresholds are well known enough that a band read aloud adds nothing. The user
chose this basis, grouping and reading on 2026-10-06.

## Alternatives and consequences

- **Official hard pity only:** bands as shares of 90 or 80 would use nothing
  unofficial, but would not line up with where the 5★ rate actually climbs.
- **No colours until soft pity is published:** the most cautious, but leaves the
  design's main pity cue out.
- The soft-pity figures are unofficial. If later evidence moves them, only the
  adapter's thresholds change; nothing is stored.
- Grouping is by hard pity, not by shared pity counters, which stay per category
  until banner metadata defines pity groups.

## Evidence

- **Hard pity and base rates:** the game's Warp details state a guaranteed 5★
  within 90 warps for character and Stellar warps (0.6% base rate), within 80
  for light cone warps (0.8%), and one 5★ character within Departure's 50.
- **Soft pity:** not published. Community pull-tracking over large samples, as
  reported on 2026-10-06, consistently puts the start at about warp 74 on
  90-pity warps and about 65–66 on 80-pity warps; some guides give 70 for light
  cones. The lower light cone figure was chosen so colour warns no later than the
  climb is observed to start.
