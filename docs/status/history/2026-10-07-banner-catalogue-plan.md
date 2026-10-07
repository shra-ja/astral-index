

## Banner catalogue plan (2026-10-07)

Integrated through PR #82.
On `docs/banner-catalogue-plan`, docs only. Decision 0022: a separate,
standalone downloader writes a catalogue folder of banner metadata and art that
the app loads; the app never fetches either. Features 0034 and 0036 move to
milestone 12. Decision 0021: history completeness is the user's responsibility;
the partial-history clause leaves milestone 9 for backlog feature 0046. Evidence:
`npm run docs:check` and markdownlint pass.
