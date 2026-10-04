# 0043 — Braces audit follow-up

Status: Backlog · Backlog

Update the dev tooling once a patched `braces` exists.

## Tasks

- [ ] Recheck `npm audit` for a patched `braces` (advisory GHSA-vfj7-8cjw-p6xm,
  all versions up to 3.0.3), which the dev tooling pulls in through
  `@vue/eslint-config-typescript` and `fast-glob`, and `markdownlint-cli2`
  through `globby` and `micromatch`; update once a fix exists. Not
  `npm audit fix --force`, which downgrades the ESLint config to 14.0.1. The
  shipped app does not include it, and only our own lint globs reach it.
