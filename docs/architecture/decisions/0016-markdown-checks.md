# 0016 — Markdown checks

Date: 2026-10-04
Status: Accepted

## Context

Coding agents now maintain the documentation, and `AGENTS.md` routes them to the
right documents by links. Nothing checked the Markdown: Prettier ignored it, so
broken links, unreachable documents, inconsistent structure and an oversized
STATUS could only be caught by review. Moving and splitting documents by hand
broke links and anchors that only an ad-hoc script found.

## Decision

- **A docs gate** in the repository tooling (`tooling/docs.ts`, run by
  `tests/docs.test.ts` as `npm run docs:check` within `npm run check`) fails when a
  relative link or `#anchor` in Markdown or Rust doc comments does not resolve,
  when a Markdown file cannot be reached by links from `AGENTS.md` (the consumer
  README is allowlisted), or when STATUS exceeds 150 lines. It is unit-tested at
  100% like other tooling, and a mutation probe proves it fails on a broken link
  and an unreachable document.
- **markdownlint** (`markdownlint-cli2`, pinned) checks structure in `lint` and
  `lint:check`: the default rules, without line length, with dash lists, 2-space
  nesting and compact tables. Archived status history, decision records and agent
  skills are skipped, since they are kept as written.
- **Prose keeps its hand wrapping.** Nothing reflows paragraphs.

## Alternatives and consequences

- **Prettier for Markdown** was tried and rejected: it pads tables to column
  width and re-indents task-list continuations, which grew the Markdown by 14%
  (12% for `AGENTS.md`, which every session reads) and makes one edited table
  cell rewrite the whole table in diffs. Prettier has no option to leave tables
  alone. markdownlint keeps the docs consistent without padding.
- **Off-the-shelf link checkers** (lychee, markdown-link-check) cover links but
  not reachability from `AGENTS.md` or the STATUS budget, and add dependencies.
- markdownlint-cli2 adds about 70 development packages. It brings the existing
  dev-only `braces` advisory in through `globby` and `micromatch` as well
  (feature 0043); the shipped app includes none of them.

## Evidence

The docs gate's unit tests failed against a stub, then passed at 100% coverage.
With a probe document holding a broken link, `npm run docs:check` reported both
the missing target and the unreachable file. markdownlint flagged a skipped
heading level, a code block without a language, an asterisk list and a padded
table in a probe document, and found one real issue in the living docs.
