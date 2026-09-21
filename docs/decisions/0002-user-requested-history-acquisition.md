# 0002 — User-requested HoYoverse history acquisition

Date: 2026-09-19
Status: Accepted

## Context

The original brief assumed history could be recovered from game cache files,
including user-provided copies, without a network connection. HSR research found
cached request URLs and successfully retrieved records through HoYoverse's API.
For this verified acquisition path, cache extraction supplies request context;
it does not replace the API request. The user explicitly changed the product
scope to permit history fetching on request.

## Decision

Run the application on the user's machine and keep player data local. Permit
history requests directly to HoYoverse only when the user initiates acquisition.
That action may perform bounded validation and pagination, with cancellation.
Do not fetch on startup, poll in the background, or schedule synchronization.

Keep accounts with our service, telemetry, cloud storage, remote assets, and a
project-hosted backend out of scope. Stored-history operations and file import
remain local. Request authentication stays within the native acquisition boundary;
never expose arbitrary network requests to the webview or log credentials.

Use a Rust acquisition client behind typed commands and feed responses into the
shared validation, preview, and transactional import pipeline. Preserve current
webview network restrictions; no API implementation or permission expansion is
part of this scope update. This decision changes the product's connectivity
assumption, not the selected stack or the historical milestone-1 results.

## Consequences and verification

History acquisition needs connectivity and valid authentication. Handle network
failures, invalid/expired keys, cancellation, and incomplete responses without
losing stored records. Keep isolated tests for local functionality; add controlled
network-client tests when acquisition is implemented, using appropriate HTTP
mocks or isolated local test servers with synthetic responses. All automated
tests must remain local and self-contained; live API requests and real player
credentials are not allowed.

Cache-only acquisition is no longer a product requirement. Other game adapters
and local sources still require independent verification. Pagination termination,
HTTP library selection, retry policy, and credential retention remain open.

## Evidence

[HSR research](../HSR-API-RESEARCH.md) records the working nine-field query and
five-page cursor test, which reproduced the first 50 records of a larger response.
The user authorized the scope change on 2026-09-19.
