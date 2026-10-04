# Import fixtures

Commit synthetic data only. Group fixtures by game and format/version, and
describe the scenario and expected result beside each set, as
[hsr-api/README.md](hsr-api/README.md) does for the HSR API responses. Include
valid, empty, malformed, overlapping, conflicting, and incomplete histories as
relevant.

Use fictional account IDs and neutral local paths. Never copy real auth tokens,
URLs containing credentials, logs, or player histories here. Name fixtures that
model a proposed internal format explicitly; do not imply external compatibility.

The raw `hsr-api/numeric-extensions-a.json` and `numeric-extensions-b.json` fixtures
contain adjacent integers above `u64::MAX` and distinct high-precision decimals.
They exercise exact round trips and immutable-record conflicts; do not regenerate
them through a floating-point JSON decoder.
