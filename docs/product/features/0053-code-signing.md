# 0053 — Code signing

Status: Backlog · Backlog

Sign the release executable through the SignPath Foundation, which signs
open-source projects for free, so Windows names a publisher and antivirus
heuristics flag it less
([decision 0030](../../architecture/decisions/0030-tag-versioned-releases.md)).

## Tasks

- [ ] Apply once 1.0.0 is released, as SignPath accepts only released projects.
  Its terms ask for multi-factor authentication on GitHub and SignPath, a
  "Code signing policy" section on the project's page with its attribution
  line, the team's roles and a privacy statement, builds without caches from
  earlier builds, and the user's approval of every signing request in SignPath.
  Windows then names SignPath Foundation as the publisher.
- [ ] If accepted, add the signing step to the release workflow and the policy
  section to the README.
