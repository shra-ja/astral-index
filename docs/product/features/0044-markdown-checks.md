# 0044 — Markdown checks

Status: In progress · Backlog
Decisions: [0012](../../architecture/decisions/0012-linting-and-formatting.md)

Check the Markdown docs in `npm run check`, as agents now maintain them: consistent
formatting, sound structure, and links an agent can follow from `AGENTS.md`.

## Tasks

- [ ] Add a docs gate to the repository tooling, unit-tested at 100%: every
  relative link and `#anchor` in tracked Markdown and Rust doc comments resolves,
  every Markdown file is reachable by links from `AGENTS.md` (with an explicit
  allowlist), and STATUS stays within its 150-line budget. Run it in
  `npm run check`, with a mutation probe proving it fails on a broken link.
- [ ] Format Markdown with Prettier, preserving hand-wrapped prose, and exclude
  the verbatim status history and decision records.
- [ ] Lint Markdown structure with markdownlint (heading increments, unique
  headings, fenced code languages, list style; no line-length rule), with the
  same exclusions. Record the choice as a decision.
- [ ] Apply both to the living docs in one mechanical commit, and document the
  checks in TESTING and DEVELOPMENT.
