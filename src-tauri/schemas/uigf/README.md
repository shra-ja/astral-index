# UIGF schema

`uigf.json` is UIGF v4.2's JSON Schema, served at
`https://uigf.org/schema/uigf.json` and identical to
`docs/.vuepress/public/schema/uigf.json` in
[UIGF-org/UIGF-org.github.io](https://github.com/UIGF-org/UIGF-org.github.io) at
commit `9570eeecd1bf4b60734274afbe72e82ff9c789d4` ("UIGF 4.2", 2026-01-24),
SHA-256 `94910b6f8442e22fadf608f1963e42de390c9d1bfdf182d978b4448fbf1f26c1`,
copied unchanged on 2026-11-02 under the MIT licence in `LICENSE`. The app
bundles it and validates every export against it
([decision 0035](../../../docs/architecture/decisions/0035-runtime-export-validation.md)),
and tests check UIGF files against it; nothing fetches it. The third-party notices list it
with that licence and its source.
