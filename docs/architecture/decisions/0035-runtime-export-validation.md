# 0035 — Runtime export validation

Date: 2026-11-25
Status: Accepted

## Context

A UIGF export must be a file other tools accept
([feature 0055](../../product/features/0055-uigf-export.md)). The writer's
tests check every output they make against UIGF v4.2's published schema, but
an export is made from the saved history, which earlier versions, imports from
other tools and HoYoverse changes have shaped. A stored roll the tests did not
foresee could still give a document the schema refuses, and the file would
fail only later, in another tool. The app must stay local: nothing may be
fetched to check a file.

## Decision

- **Validate every export before it becomes a file.** `file_export` checks the
  writer's document against UIGF's schema and refuses the export when the
  schema does, naming nothing from the history. The schema is passed in, so a
  test can hand it a stricter one to reach the refusal.
- **The pinned, published schema, bundled.** `uigf::schema()` compiles the copy
  in `src-tauri/schemas/uigf/`, unchanged from UIGF's repository at a pinned
  commit, and the third-party notices list it under its MIT licence
  ([decision 0025](0025-third-party-notices.md)).
- **`jsonschema` as a runtime dependency,** pinned at 0.59.0 with its default
  features off, so it cannot resolve a reference over the network or from the
  filesystem; the schema has no external references. Its `arbitrary-precision`
  feature matches the app's `serde_json`, which keeps numbers exactly as
  written.

## Alternatives and consequences

- **Validate only in tests:** no new runtime crates, but an export made from a
  history the tests did not foresee would leave the app unchecked.
- **A hand-written check of the schema's rules:** no new crates, but it would
  repeat the schema and drift from it as UIGF changes.
- **Fetching the schema from uigf.org:** always current, but a network request
  the user did not ask for, which the app never makes.
- The release ships 30 more crates, `jsonschema`'s dependencies, none of them
  for networking; the notices grew from 359 to 389 crates.
- Validation adds about a fifth to an export's time: for 100,000 rolls, writing
  the document took 0.49 s and validating it 0.10 s, with optimisations, and
  compiling the schema under 1 ms.
- A refusal means the writer has a bug; it says nothing a user can fix, so the
  message should say so and point to the issues page.

## Evidence

- `file_export`'s unit tests: an export reads back through `uigf::read`; a
  stricter schema refuses the document; the writer's tests check each output
  against the bundled schema.
- `cargo tree -e normal -p jsonschema@0.59.0` lists no HTTP or networking
  crate.
- The timing comes from a one-off test exporting 100,000 synthetic rolls (a
  23 MB file), built with `opt-level = 3`, on 2026-11-25.
