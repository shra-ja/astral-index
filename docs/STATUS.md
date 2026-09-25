# Project status

Updated: 2026-09-25

Milestones 1 and 2 provide the local Tauri shell, HSR response parser, immutable
import previews and transactional SQLite history storage. Repeated imports retain
unique rolls, first-import provenance and compact batch summaries. The
[HSR API contract](HSR-API-CONTRACT.md) contains the settled acquisition assumptions
and retry policy. The shell does not yet acquire, import or display history.

## Milestone 2 review remediation

Work is on `feat/hsr-response-foundations`. Parser fixes preserve precise JSON
numbers, reject duplicate members and enforce the exact timestamp shape. History
reads verify stored identity and domain invariants. A shared library root separates
HSR and storage modules. Test discovery now covers additional frontend/tooling
suites; native CSP verification checks a policy violation and has a permissive-policy
mutation probe. The shell copy reflects the acquisition-first roadmap.

`npm run check` passed: 46 Rust tests, 17 frontend/tooling tests, native offline
integration, five failure/discovery probes, source/report validation, TypeScript,
formatting and Clippy. All required coverage metrics are 100% per source file.
The regression tests reproduced the four data issues before fixes; the new-suite
probe confirmed the old command omitted tests. See [testing](TESTING.md) for
red/green and mutation evidence. `npm run tauri -- build --no-bundle` also passed for Linux.
Review fixes are ready for integration; no changes have been pushed or published.
The existing branch history is preserved; subsequent service work should use
smaller reviewed increments and the same-day integration target in CONTRIBUTING.

## Next

Integrate the reviewed milestone when authorized. Milestone
3 connects explicit user-requested acquisition to preview, commit and local history
browsing. Its review DTO and safe indexed diagnostics are planned in the
[roadmap](ROADMAP.md); account/server verification remains a closing requirement.
No startup/background requests or new native capabilities have been added.

Earlier implementation details, dated measurements and superseded next steps are
in the [historical status log](STATUS-HISTORY.md).
