

## Milestone 9 tasks (2026-10-05)

Integrated through PR #73. Work was on `docs/milestone-9-tasks`, docs only.
Milestone 9's features are broken into one-PR tasks: 0032 switches accounts,
then adds the summary strip and rarity, name and date-range filters, all applied natively to the whole category; 0035's
Pity column and soft-pity colouring come before 0034's banner metadata, which
now also holds 50/50 colouring; 0033 adds the styled tooltip, then the layouts.
The date-range filter is new: decision 0013 now describes its toolbar button and
popover, chosen from three mockups.
Evidence: `npm run docs:check` and markdownlint pass.
