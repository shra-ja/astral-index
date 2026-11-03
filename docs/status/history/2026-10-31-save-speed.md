# 2026-10-31: save speed (archived 2026-10-31)

Archived from [current status](../STATUS.md). Statements and “Next” items
below describe their historical context, not current priorities.

## Save speed (2026-10-31)

Integrated through PR #157.

`fix/save-speed`: #156 moved serializing each roll from retrieval into saving, where `json!` built a value tree per roll, and main's large-history test exceeded its 600 ms save bound in CI. Saving now serializes each roll straight to text. Red: CI run 41197683613 failed the save bound, and main's save took 468 ms locally; green: 291, 265 and 316 ms. The save bound is now 950 ms, three times the slowest run, as the other bounds are; the work it times includes what retrieval did before #156.

## Server rule (2026-10-31)

Integrated through PR #158.

`feat/uid-server-rule`, 0030's second task: `hsr::server_of` gives a UID's server and offset from the digits before its last eight, as the file research's community mapping gives them, or says the UID is malformed or has no server in the rule. A function in the game's module is the per-game interface until a second game's rule shapes a shared one; retrieval keeps the server HoYoverse names. Red: both rule tests failed against a stub that found no server; green: all 279 unit tests pass.
