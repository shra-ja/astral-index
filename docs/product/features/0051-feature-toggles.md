# 0051 — Feature toggles

Status: Done · Milestone 10, Release readiness

Hide unfinished features from release builds while they stay in the code and
under test. The first release covers Honkai: Star Rail only
([decision 0018](../../architecture/decisions/0018-star-rail-first-release.md)),
yet the sidebar offers Genshin Impact, whose screens say retrieval is coming
soon. A release should show only what works; development builds keep the
Genshin Impact screens so [0031](0031-second-game-adapter.md) can continue
from them.

## Tasks

One PR, test first.

- [x] Add build-time feature toggles and turn off Genshin Impact in release
  builds.
  - Toggles are set at build time through Vite's environment files, following
    Vite's conventions: on in `.env.development`, off in `.env.production`.
    They are not user settings and no runtime configuration file can change
    them. Release builds and the mock debug binary are production builds, so
    the end-to-end tests see what a release shows.
  - One typed module reads the toggles and lists the games shown. A value
    other than `true` or `false` fails the build rather than falling back to
    a default.
  - With Genshin Impact off, the sidebar lists Honkai: Star Rail alone under
    "Game", and a Genshin Impact address returns to Star Rail's History, as
    unknown addresses do. Nothing else in the app names Genshin Impact.
  - Unit tests cover both states of the toggle; the end-to-end tests check
    that the release build shows no Genshin Impact link and that its address
    redirects.
  - Record a decision: toggles exist only for unfinished work, each one names
    the feature that removes it, and none gates the native side, which has no
    Genshin Impact code. Document the toggles in DEVELOPMENT.
  - Done as `VITE_FEATURE_GENSHIN_IMPACT`, read by `src-ui/src/features.ts`
    and checked by the Vite configuration
    ([decision 0026](../../architecture/decisions/0026-feature-toggles.md)).
    Vitest runs in its own mode, so `.env.test` turns the toggle on, as in
    development, and release-state tests turn it off.

[0031](0031-second-game-adapter.md) removes the Genshin Impact toggle once
Genshin Impact works end to end.
