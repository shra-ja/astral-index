# Synthetic UIGF files

These invented files model UIGF history files as other tools export them; no
player's data is copied. See the [UIGF skill](../../../../.agents/skills/uigf/SKILL.md)
for the format and the [file research](../../../../docs/games/hsr/file-research.md)
for the shapes real exporters write.

- `v4.2-two-accounts.json`: UIGF v4.2 with a Genshin Impact section, which is
  left out, and two Star Rail accounts. The first has a language, a 19-digit
  roll ID, two rolls in the same second, a roll without a count and an unknown
  field with an exact decimal; the second has no language.
- `stardb-v4.1.json`: StarDB's shape: UIGF v4.1, the UID as an integer, and each
  roll's `gacha_id` repeating its category, in all six categories.
- `uigf-v3.0.json` and `srgf-v1.0.json`: the formats before UIGF v4.0, which are
  refused with what was found.

The unit tests in `src-tauri/src/uigf.rs` derive malformed, unsupported,
incomplete and invalid variants in memory, and check each account they would
import against UIGF's schema.

## Schema

`schema/uigf.json` is UIGF v4.2's JSON Schema, served at
`https://uigf.org/schema/uigf.json` and identical to
`docs/.vuepress/public/schema/uigf.json` in
[UIGF-org/UIGF-org.github.io](https://github.com/UIGF-org/UIGF-org.github.io) at
commit `9570eeecd1bf4b60734274afbe72e82ff9c789d4` ("UIGF 4.2", 2026-01-24),
SHA-256 `94910b6f8442e22fadf608f1963e42de390c9d1bfdf182d978b4448fbf1f26c1`,
copied unchanged on 2026-11-02 under the MIT licence in `schema/LICENSE`. Tests
only read it; the app never fetches or uses it.
