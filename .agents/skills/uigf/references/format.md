# UIGF v4.2 fields and enums

Source: [UIGF-org specification and embedded JSON Schema](https://uigf.org/en/standards/uigf.html), checked 2026-09-21. Schema dialect: JSON Schema draft 2020-12. Wire constraints below are distinct from storage recommendations.

## Envelope

Root `info` is required. Optional sections contain account arrays: `hk4e` (Genshin), `hkrpg` (Star Rail), `nap` (Zenless Zone Zero), `hk4e_ugc` (Miliastra Wonderland; see defect below). A file can contain multiple games and accounts; do not expect a root roll list.

All `info` fields are required:

| Field | Type / meaning |
| --- | --- |
| `export_timestamp` | String or integer; export epoch seconds |
| `export_app` | String; producer name |
| `export_app_version` | String; producer version |
| `version` | String matching `^v\d+\.\d+$`; emit `v4.2` for this contract |

A version regex match is not proof of supported-version compatibility.

Each account requires `uid` (string or integer), `timezone` (integer offset), and `list` (array). `lang` is optional. Prefer string UIDs in output and internal keys; decode integer input losslessly. There is no schema UID prefix/length rule, server field, or timezone enum/range. Keep server evidence separately. The legacy Genshin documentation establishes offsets in hours, e.g. -5, 1, 8; preserve explicit offset evidence rather than the device timezone.

Exact account `lang` enum:

`de-de`, `en-us`, `es-es`, `fr-fr`, `id-id`, `it-it`, `ja-jp`, `ko-kr`, `pt-pt`, `ru-ru`, `th-th`, `tr-tr`, `vi-vn`, `zh-cn`, `zh-tw`.

## Regular roll fields

All record fields below are JSON strings, including numeric-looking values.

| Field | Meaning / constraint |
| --- | --- |
| `id` | Source record ID; 1–19 ASCII digits, `^[0-9]+$` |
| `item_id` | Game item ID; regular-game schema has no enum or digit pattern |
| `gacha_type` | Banner category; exact game enums below |
| `uigf_gacha_type` | Genshin pity-accounting group |
| `gacha_id` | Concrete pool ID, distinct from category and record ID |
| `time` | Source-local string; `^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$` |
| `count` | Quantity, commonly `"1"`; no schema numeric range |
| `name` | Source item label |
| `item_type` | Source category text; no schema enum |
| `rank_type` | Source rarity text; no schema enum |

| Section | Required record fields | Optional declared fields |
| --- | --- | --- |
| `hk4e` | `uigf_gacha_type`, `gacha_type`, `item_id`, `time`, `id` | `count`, `name`, `item_type`, `rank_type` |
| `hkrpg` | `gacha_type`, `gacha_id`, `time`, `item_id`, `id` | `count`, `name`, `item_type`, `rank_type` |
| `nap` | `gacha_type`, `item_id`, `time`, `id` | `gacha_id`, `count`, `name`, `item_type`, `rank_type` |

Optional absence differs from null; declared string fields do not accept null. ZZZ does not require `gacha_id`; Star Rail does. A timestamp regex checks shape, not calendar validity. Preserve captured time text, even when checking calendar validity or computing a separate UTC value.

## Exact banner enums

| Section / field | Allowed strings |
| --- | --- |
| `hk4e.gacha_type` | `"100"`, `"200"`, `"301"`, `"302"`, `"400"`, `"500"` |
| `hk4e.uigf_gacha_type` | `"100"`, `"200"`, `"301"`, `"302"`, `"500"` |
| `hkrpg.gacha_type` | `"1"`, `"2"`, `"11"`, `"12"`, `"21"`, `"22"` |
| `nap.gacha_type` | `"1"`, `"2"`, `"3"`, `"5"` |
| `hk4e_ugc.op_gacha_type` | `"1000"`, `"2000"`, `"20011"`, `"20012"`, `"20021"`, `"20022"` |

Namespaces are game-specific. Star Rail 21/22 were added in UIGF 4.1; a 4.0 whitelist is incomplete. The v4.2 schema enumerates values without human-readable labels or guarantee rules. Consult a verified game mapping before assigning labels or pity behavior; never coerce an unknown value to a familiar type.

Genshin `gacha_type` 400 maps to `uigf_gacha_type` 301; retain raw 400. Other listed raw types map to the same grouping value. See the [legacy Genshin mapping](https://uigf.org/en/standards/uigf-legacy-v3.0.html). Type 500 is Chronicled Wish. The v4.2 schema does not itself enforce cross-field consistency.

## Miliastra schema defect

The published `hk4e_ugc` declares `type: array` but places account `properties` and `required` directly there instead of under `items`. Object keywords do not constrain array elements, so a schema pass cannot establish their validity.

The apparent intended account fields are `uid`, `timezone`, `list`, optional `lang`. Listed required record fields are `id`, `schedule_id`, `item_type`, `item_id`, `item_name`, `rank_type`, `time`, `op_gacha_type`, all strings. `id` uses the 1–19 digit rule; `schedule_id`, `item_id`, `rank_type` require one or more decimal digits. Note `item_name` rather than `name`, and `op_gacha_type` rather than `gacha_type`.

Recheck upstream before implementation. If support is needed before clarification, document and independently test an application validation overlay; do not call a repaired schema the official schema. Roll Tracker can report this section as unsupported while importing explicitly selected supported sections.

## Schema limits

The schema does not close objects with `additionalProperties: false`, impose ordering or uniqueness, require a game section, or prescribe a storage engine. Valid structure can still contain duplicates, conflicts, impossible dates, or unsupported versions. Define semantic checks separately. Preserve or report unknown fields instead of silently dropping backup data.

## Synthetic minimal two-game archive

These account, item, pool, and record IDs are illustrative, not player data or catalog claims. Optional display fields are omitted intentionally.

```json
{
  "info": {
    "export_timestamp": "0",
    "export_app": "Synthetic Example",
    "export_app_version": "0.0.0",
    "version": "v4.2"
  },
  "hk4e": [{
    "uid": "100000001",
    "timezone": 8,
    "list": [{
      "gacha_type": "400",
      "uigf_gacha_type": "301",
      "item_id": "10000001",
      "time": "2026-01-01 12:00:00",
      "id": "9007199254740993"
    }]
  }],
  "hkrpg": [{
    "uid": "100000002",
    "timezone": 8,
    "list": [{
      "gacha_type": "11",
      "gacha_id": "1001",
      "item_id": "1001",
      "time": "2026-01-01 12:00:00",
      "id": "9007199254740994"
    }]
  }]
}
```
