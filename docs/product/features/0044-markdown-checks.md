# 0044 — Markdown checks

Status: Done · Milestone 8, Project cleanup
Decisions: [0012](../../architecture/decisions/0012-linting-and-formatting.md), [0016](../../architecture/decisions/0016-markdown-checks.md)

Check the Markdown docs in `npm run check`, as agents now maintain them: consistent
formatting, sound structure, and links an agent can follow from `AGENTS.md`.

## Tasks

- [x] Add a docs gate to the repository tooling, unit-tested at 100%: every
  relative link and `#anchor` in tracked Markdown and Rust doc comments resolves,
  every Markdown file is reachable by links from `AGENTS.md` (with an explicit
  allowlist), and STATUS stays within its 150-line budget. Run it in
  `npm run check`, with a mutation probe proving it fails on a broken link.
- [x] Lint Markdown structure with markdownlint (heading increments, unique
  headings, fenced code languages, list style, compact tables; no line-length
  rule), skipping the verbatim status history and decision records, and fix what
  it finds. Prettier was tried and left off Markdown: it pads tables and
  re-indents task lists. Record the choice as a decision.
- [x] Document the checks in TESTING and DEVELOPMENT.
