# 0022 — Banner catalogue from a standalone downloader

Date: 2026-10-07
Status: Accepted

## Context

Banner names, banner dates, 50/50 outcomes, item icons and banner art all need
data the application does not hold: which pool or time window each roll
belongs to, each banner's featured items and rate-up rule, and images.

The original plan shipped banner metadata with the application, so nothing was
fetched at runtime. Two findings make that insufficient:

- Outcomes need each banner's featured items. A list of standard items is not
  enough: Star Rail's 50/50 loss pool has come to include formerly limited
  characters, which could be featured again, and Genshin Impact has featured
  standard characters as the rate-up.
- No single source is complete. Datamined game data has pool IDs and names but
  no dates or featured items; community wikis have dates, featured items and
  official notice links but no IDs; official endpoints cover current banners
  only. Building a catalogue means joining and cross-checking several sources,
  which changes about every three weeks per game.

Item icons and banner art are HoYoverse's copyright and cannot be committed to
this MIT-licensed repository or redistributed by the project.

## Decision

A separate, standalone downloader, in its own repository, builds the catalogue.
When its user runs it, it fetches from the sources, joins and cross-checks them,
and writes a local output folder holding both the banner and item metadata and
the item icons and banner art, with a manifest tying images to item and banner
IDs. The metadata and the assets stay together, since the mapping between them
is part of the metadata.

Astral Index never fetches metadata or art. It reads a catalogue folder the user
selects, validates it as untrusted input, like any file import, and shows banner
names, outcomes and art only where the catalogue's verified entries support
them. Without a catalogue, banners show as unknown, outcomes as unavailable and
art as placeholders. The catalogue folder's format is the contract between the
two projects; its versioning and the application's reader are settled under
[feature 0034](../../product/features/0034-banner-metadata.md).

The downloader's CI runs it on a schedule as a canary for source changes.
Publishing its metadata, without art, as releases is a possible later extension.
The user chose this on 2026-10-07.

## Alternatives and consequences

- **Metadata shipped with each application release:** stale within weeks of a
  release, and still needs a data pipeline.
- **A standard-item list instead of per-banner metadata:** fails when formerly
  limited characters join the loss pool or standard characters are featured.
- **The application fetching on request,** from a project-owned release or from
  the sources directly: puts scraping, extra hosts and their failures into the
  application, and fetching art would relax the local-only rule.
- **The downloader as a Git submodule, a linked crate or a bundled sidecar:**
  couples the repositories by code rather than by a file format. A bundled
  sidecar remains possible once the format is stable.
- Without a catalogue the application is fully usable; banners, outcomes and
  art are the only things that depend on it.
- Each user's downloader contacts its sources directly, and its output can
  differ between runs, so the format records each entry's sources and
  verification.
- Features 0034 and 0036 move to milestone 12, after the first release.

## Evidence

Source research from 2026-10-07 is kept with the downloader project, outside this
repository, and moves into its repository when created.
