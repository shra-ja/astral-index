# 0012 — Linting and formatting

Date: 2026-10-01
Status: Accepted

## Context

Rust had `cargo fmt` and Clippy with warnings denied, but the TypeScript and Vue
code relied on the compiler alone: nothing caught Vue template mistakes, unawaited
promises or untyped values, and formatting was kept by hand. The frontend follows
`create-vue` conventions (decision 0011), which offer ESLint with Prettier.

## Decision

- **ESLint 10** lints TypeScript and Vue with type information. Each workspace
  owns its configuration, as each owns its tests:
  - `src-ui/` uses `create-vue`'s setup with the stricter rule sets:
    `eslint-plugin-vue`'s `flat/recommended` and `@vue/eslint-config-typescript`'s
    `recommendedTypeChecked`, plus `@vitest/eslint-plugin` for tests and
    `eslint-config-prettier` to turn off rules that would fight Prettier.
  - The root lints `tooling/`, `tests/` and the root config files with
    `@eslint/js` and `typescript-eslint`'s `recommendedTypeChecked`, plus the
    Vitest rules. It ignores `src-ui/`, which lints itself.
  - Both allow `expect`'s optional failure message. The root counts `expect…`
    helpers as assertions and exempts only the backend stage runners, which are
    named steps that fail by throwing, from requiring assertions.
- **Prettier 3** formats everything else it understands, with `create-vue`'s
  settings: no semicolons, single quotes, 100-character lines, from one root
  `.prettierrc.json`. At the user's request it skips Markdown, which keeps its
  hand-written layout. It also skips the synthetic HSR API fixtures, whose exact
  bytes the parser tests depend on, and the agent skills.
- **Gates:** `npm run check` and CI run `format:check` and `lint:check` (warnings
  fail) before the build. `npm run format` and `npm run lint` fix what they can.
- **Coverage:** `eslint.config.ts` files are executable TypeScript that Vitest
  never measures, so, like the Vite and Vitest configs, each only delegates to a
  unit-tested module (`src-ui/build/eslint.ts`, `tooling/eslint-config.ts`), and
  the guard in `tests/coverage-reports.test.ts` pins both. Their tests lint small
  snippets in place of real files and check that the key rules fire.
- The one-time reformat is listed in `.git-blame-ignore-revs`; `.gitattributes`
  keeps LF line endings, and `.vscode/` recommends the ESLint and Prettier
  extensions with fix and format on save.

## Alternatives and consequences

- **`create-vue`'s default rule sets** (`flat/essential`, non-type-aware
  `recommended`) are faster and quieter, but miss unawaited promises and `any`
  leaking from `JSON.parse`; the stricter sets found both in existing tests.
- **Oxlint** and **oxfmt**, which `create-vue` also offers, are much faster but
  cover fewer rules; linting takes seconds here, so speed does not matter yet.
- **Keeping semicolons** would have made the reformat smaller; the user chose
  `create-vue`'s style.
- Type-aware rules only lint files a TypeScript project includes, so every linted
  file must belong to one; new config files join the Node projects.
- Stylelint (CSS), Ruff (the Python helper) and a stricter Clippy `[lints]` table
  are out of scope for now.
