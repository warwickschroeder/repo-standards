<!--
Copy to .claude/smoke-tests/profile.md in the target repo and fill it in. Once per repo, then reused.

FIRST: if .claude/regression-runbooks/profile.md exists, read it. It already carries personas, verification
lanes, auth, the area inventory and the repo's gotchas. Link to it here rather than copying it — this file
only adds what is release- and deploy-specific.
-->

# Smoke-Test Profile — <repo>

**Runbook profile:** <path, or "none — this repo has no regression runbooks">
**Runbooks:** <where they live, e.g. `docs/runbooks/<module>/<area>.md`; the index; the case-ID scheme>
**Smoke tests:** <where they live, e.g. `docs/smoke-tests/`>

## 1. Running it

| | |
| --- | --- |
| Start the app | <the command> |
| URL | <the app's local URL — the exact port, from its source of truth, not from memory> |
| Prerequisites | <Docker, a database, a container runtime, a seeded volume> |
| Shell | <the shell a tester pastes commands into — PowerShell, CMD, bash. Every command in a smoke test is written as one line for **this** shell.> |
| Sign in | <dev auth? a seeded account? a real identity provider?> |
| Switch roles | <the in-app persona switcher, or "sign out and back in as …"> |
| Personas available | <name → role, and which one each kind of step needs> |

## 2. Reaching what the browser can't

| | |
| --- | --- |
| Database | <connection string / GUI, and the schema or table layout> |
| API outside the browser | <base URL, and how to authenticate a raw call — a test-auth header set, a token, a session cookie> |
| Out-of-band writes | <how to simulate what one session can't produce: a concurrent change, a pre-existing row, an identity the roster doesn't offer> |
| Logs | <where they surface — a dashboard, a console, a file> |

## 3. What local dev cannot prove

<Anything only a deployed or production-mode build applies: security headers, a CSP, HSTS, a CDN, a real identity provider, a real external service. Name it and say which environment does prove it — those become second-environment steps, never silent assertions.>

## 4. Releases

| | |
| --- | --- |
| Tagging scheme | <e.g. `vMAJOR.MINOR.PATCH`; how to find the last one> |
| Release diff | <the exact command, including which paths are product code — e.g. `git diff <tag>..HEAD -- src/`> |
| Excluded from scope | <paths whose changes a tester cannot observe: tests, docs, CI, lockfiles> |
| How migrations run | <at app startup / a separate job / manually — and therefore whether a bad migration is a boot failure> |
| Environments | <the deploy targets, and which one a second-environment step means> |

## 5. Repo-specific gotchas

<Appended as they are learned. A stale label, a control that isn't what it looks like, a limit the client enforces before the server, an endpoint whose response shape changed. If the repo has a runbook profile, the general gotchas live there — keep only the release-specific ones here.>
