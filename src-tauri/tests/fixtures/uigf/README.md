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
import against [UIGF's schema](../../../schemas/uigf/README.md).
