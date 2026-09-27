# Development conventions

These requirements apply to humans and coding agents. TDD, 100% code coverage,
and trunk-based development are project requirements, not optional targets.

## Test-driven development

For each behavior change:

1. Write a focused test that describes the required observable behavior.
2. Run it before implementation and confirm it fails for the expected reason.
   A syntax error, missing dependency, or broken test environment is not evidence
   that the behavior test is red.
3. Implement the smallest change that makes it pass.
4. Refactor while keeping tests green, then run the full test and coverage gates.

Bug fixes start with a regression test reproducing the bug. Refactors start with
green tests and add characterization tests first where behavior is not covered.
Documentation-only edits require document checks, not artificial unit tests.
For initial scaffolding, establish the test harness before adding app behavior;
prove a behavior assertion fails before implementing that behavior.

Use unit tests as the primary coverage layer for all backend functionality. Mock
filesystem and database APIs in unit tests; do not substitute real temporary files
or in-memory SQLite for those mocks. Keep real I/O/database checks in integration
tests. A unit test must assert observable results or boundary interactions, not
merely execute code to reach a coverage threshold.

Use unit tests for rules and parsing, integration tests for database transactions,
migrations and native boundaries, and UI/end-to-end tests for user workflows.
Automated tests must remain local and self-contained. When adding request
functionality, use appropriate HTTP mocks or isolated local test servers with
synthetic responses for success, pagination, errors, and cancellation. Never call
live HoYoverse endpoints or use real player credentials in automated tests.
Mock OS/network boundaries where useful, but verify real file and database behavior
using isolated temporary resources. Coverage does not replace meaningful assertions.
Use synthetic fixtures and deterministic clocks/data; never real player histories.

## Test layout

Keep tests with the layer they exercise:

- `src/tests/`: frontend tests and frontend-only fixtures/helpers.
- Rust backend unit tests: use `#[cfg(test)] mod tests` beside the implementation
  in `src-tauri/src/`, following Rust conventions. Keep private implementation
  tests here; do not expose internals just for testing.
- `src-tauri/tests/`: Cargo integration tests exercising the backend public API,
  with backend-only fixtures/helpers. Use Cargo's automatic test discovery.
  Keep helpers in subdirectories so they do not become empty test targets.
- `scripts/tests/unit/`: development-tooling unit tests, discovered together with
  `src/tests/` by both `npm test` and `npm run coverage`.
- `scripts/tests/`: explicit coverage-report and mutation-probe suites; keep these
  outside unit discovery to avoid recursive test runs.
- Root `tests/`: application end-to-end tests spanning the frontend and backend,
  with their fixtures/helpers. Do not place layer-specific tests here.

Update test discovery, imports, fixture paths and the coverage source inventory
when moving tests. Test-only directory exclusions must not hide production code.

## Intent-focused comments

Add short descriptive comments to functions and structs when their intent is not
immediately apparent. Explain why they exist, what they aim to achieve, or which
invariant they protect; avoid narrating implementation steps or repeating names.
Use Rust doc comments for useful API documentation. Apply the same principle to
frontend/tooling functions and test helpers. Straightforward accessors, wrappers
and clearly named tests need no redundant comment. Keep comments accurate as code
changes; treat this as the default review practice.

## Pre-release database schemas

While the application is unreleased, breaking schema changes are allowed. Keep
one current initial schema instead of maintaining migrations between development
versions. Reject incompatible existing databases without modifying them; recreate
development databases explicitly when needed. Retain initialization, persistence,
constraint and rollback tests. After release, use versioned migrations with data
preservation and recovery tests for changes to persisted data.

## Coverage is a blocking gate

Rust backend source must meet 100% coverage from `cargo test --lib` **alone**.
Generate and retain its isolated report before running any integration or native
tests; their execution must never fill unit-test gaps. Use test doubles for
filesystem and SQLite APIs while running the same service implementation.

The only exceptions are `src-tauri/src/main.rs` and `src-tauri/build.rs`, currently
minimal delegates to Tauri runtime/build tooling. `main.rs` passes the builder
through unit-tested registration; `build.rs` declares the shared command list
(see [decision 0006](docs/decisions/0006-desktop-extraction-commands.md)).
They retain their own 100% native boundary gate. This is an explicit, user-approved exception, not a general
exception for I/O, databases, new commands or platform code. The report gate pins
both wrappers' current bodies: adding logic fails a guard and requires review of
this exception. Move new functionality into unit-tested code rather than silently
expanding the boundary-only coverage scope. `scripts/tests/reports.test.ts` is the
single enforcement point for that allowlist and guard.

- Require exactly 100% of executable lines, statements, functions, and branches
  for every first-party source file where those metrics apply. Enforce frontend
  and Rust coverage independently, and include executable project tooling.
- Include files that tests never import or execute. Changed-code coverage alone
  is insufficient; a high aggregate cannot conceal an uncovered file or package.
- Choose and pin instrumentation that supports the required metrics. If a chosen
  tool cannot measure a required metric, add suitable instrumentation or change
  tools; do not present unavailable branch coverage as complete coverage.
- Account for OS-specific code with native test jobs on supported platforms and
  an explicit report inventory. Only merge compatible reports from the same
  revision. Keep required per-platform behavior tests even when coverage is merged.
- Exclude only non-executable assets/docs, tests/fixtures themselves, third-party
  dependencies, and mechanically generated code not maintained by this project.
  Document every exclusion and its rationale in the coverage configuration.
  Handwritten Tauri commands, startup glue, UI code, error paths, and build scripts
  are first-party code and cannot be excluded simply because they are hard to test.
- Do not reduce thresholds, round percentages up to 100%, use coverage-ignore
  directives to bypass missed code, skip tests to pass CI, or replace assertions
  with execution-only tests. Remove truly unreachable code or make it testable.
- Generate reports afresh from a clean report directory. Missing reports, missing
  expected source files, zero instrumented executable code when source exists,
  stale results, failed tests, and any uncovered units must fail the gate.

With the first executable code, add documented local test/coverage commands and
CI that runs them on pull requests and `main`. Retain human-readable and
machine-readable reports as CI artifacts. Validate enforcement by temporarily
introducing an uncovered file/branch and observing failure, then remove the probe.
Also verify missing-report handling. Do not merge application scaffolding before
these gates exist and pass.

Run `npm run check` before handoff. It creates fresh V8/LLVM reports, validates
per-file metrics against a source inventory, and probes gate failures. See
[testing details](docs/TESTING.md) and [setup](README.md). CI runs the same command;
make its **Tests and 100% coverage** job a required check.

## Trunk-based development

`main` is the sole integration trunk and must remain releasable once an app exists.
All code changes, including tests, executable scripts, and build/CI configuration,
take place on separate short-lived branches. Prefer this workflow for docs too.

1. Inspect status and preserve any existing work. Start from up-to-date `main`;
   when a remote exists, fetch and fast-forward the local trunk first.
2. Create a descriptive branch such as `feat/import-preview`,
   `fix/duplicate-rolls`, or `chore/test-tooling` before editing code.
3. Keep the scope small enough to integrate the same working day where practical.
   Split larger work into independently passing increments; use tested feature
   flags only when needed to keep unfinished behavior out of the user flow.
4. Follow TDD and run the full tests, coverage, lint/type checks, and applicable
   builds. Record red/green evidence and coverage results in the change description.
5. Integrate through a reviewed pull request when hosting is available, only after
   required checks pass against the current trunk. Resolve divergence on the task
   branch and rerun checks. A local-only integration must satisfy the same gates.
6. Delete the branch after successful integration. Never use a persistent `develop`
   branch or keep a large feature branch alive across multiple milestones.

Do not create commits, merge, push, or publish unless the user has authorized those
actions. Branch creation for an authorized coding task is expected. Do not force
push shared history or discard unrelated working-tree changes.

### Commit messages

Prefer small, atomic commits made frequently as each coherent increment passes
its relevant checks. Each commit should express one reviewable purpose and leave
the branch working; keep unrelated changes in separate commits. Use TDD within
each increment, pairing the regression/behavior tests with their implementation
rather than committing a deliberately failing intermediate state. Avoid saving
an entire milestone for one large commit. This preference does not authorize
committing: obtain user authorization as required above; otherwise keep the
work reviewable and report the proposed commit boundaries at handoff.

Use Conventional Commits for every commit, including squash and merge commit
messages: `type(optional-scope): description`. Choose a meaningful type such as
`feat`, `fix`, `docs`, `test`, `refactor`, `build`, `ci`, or `chore`, and write a
concise description. For example, `feat(import): preview validated roll history`
or `chore: initialize project scaffold`. Mark breaking changes with `!` before
the colon and explain them in a `BREAKING CHANGE:` footer.

### Bootstrap and hosting

The initial commit establishes the documentation scaffold on `main`. This
docs-only initialization is the bootstrap exception, not permission to write
application code directly on the trunk. Create a task branch before introducing
any executable code.

The Git remote `origin` is `git@github.com:shra-ja/roll-tracker.git`.

The user has enabled branch protection. Keep `main` protected: require pull requests, passing test
and 100% coverage checks, checks against current trunk, and block direct/force
pushes and deletion. Configure these in the chosen host; a tracked file alone
does not enable server-side protection. Local hooks may supplement CI but are
bypassable and are not a substitute for protected-branch checks.

## Handoff checklist

- Task branch and scope identified; no code authored directly on `main`.
- Expected test failure observed before implementation; regression tests included.
- Full test suite and all applicable 100% coverage gates passed on the final code.
- Coverage exclusions unchanged or justified within the allowed categories.
- Documentation and `docs/STATUS.md` updated with real commands/results.
- Remaining platform or tooling limitations stated; unrun checks never reported
  as passing, and incomplete gates never treated as approval to integrate.
