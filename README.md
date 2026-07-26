# Repository Standards

Shared standards for my repositories — personal (`warwickschroeder/*`) and Forge
(`ForgeSoftwareAU/*`).

## Renovate preset

The canonical, cross-cutting [Renovate](https://docs.renovatebot.com/) configuration
lives in [`default.json`](./default.json). Each repo consumes it and adds only its own
dependency groups and version pins.

### Usage

In a repo's `renovate.json`:

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["github>warwickschroeder/repo-standards"],
  "packageRules": [
    /* only this repo's groups + allowedVersions pins */
  ]
}
```

`github>warwickschroeder/repo-standards` resolves to `default.json` on the default
branch. To pin a version, reference a tag: `github>warwickschroeder/repo-standards#v1`.

### What the preset sets

- Base: `config:best-practices` + `:semanticCommitTypeAll(chore)`
- Schedule: weekly, `before 6am on Monday`, `Australia/Perth`
- `minimumReleaseAge: 3 days`, `internalChecksFilter: strict`
- `platformAutomerge: true`, PRs labelled `dependencies`
- Security: `osvVulnerabilityAlerts` + `vulnerabilityAlerts` that bypass the weekly
  window (`schedule: at any time`, extra `security` label)
- `lockFileMaintenance` enabled + automerged
- Automerge: all `minor`/`patch`/`pin`/`digest`; `major` held for Dependency
  Dashboard approval

> **Keep this repo public** so the Mend Renovate app can resolve the preset from the
> `ForgeSoftwareAU` org repos as well as the personal ones. It contains no secrets.
> The Mend app does **not** need to be installed on this repo (public preset
> resolution doesn't require it), and `default.json` is not a filename Renovate
> auto-detects as a repo's own config — so this repo won't self-manage.

### What stays in each consuming repo

- Dependency **groups** (e.g. Radix, EF Core, MUI, Azure, ESLint).
- **`allowedVersions`** pins (holding a major back until the ecosystem catches up).
- Any per-repo override (e.g. `prHourlyLimit: 0` to flush the whole weekly batch).

## Claude Code plugins

This repo doubles as a plugin marketplace. Add it once, then install what a repo needs:

```
/plugin marketplace add warwickschroeder/repo-standards
```

| Plugin | What it does |
| --- | --- |
| [`modular-monolith`](./plugins/modular-monolith/) | The modular-monolith blueprint, installable. Audits a repo against it, lets you adopt or decline each area, and records the decisions in `docs/ROADMAP.md` so agents enforce exactly what was chosen — and never re-litigate what was declined. |
| [`app-documentation`](./plugins/app-documentation/) | Document how an application works: a grounded technical reference doc per part of the system, then end-user and operator guides derived from them and verified against the real UI. Audits existing docs for drift. |
| [`regression-runbooks`](./plugins/regression-runbooks/) | Exhaustively explore a web-app area and author tiered regression runbooks that drive both manual and automated testing. The **standing** coverage. |
| [`smoke-tests`](./plugins/smoke-tests/) | Write short manual test scripts for one change, or for everything since the last release so a tester can target only what changed. The **delta** — cites runbook cases rather than restating them. |

## Blueprints

The **modular-monolith blueprint** — the org-wide architecture spec — now ships inside the [`modular-monolith` plugin](./plugins/modular-monolith/), split into [one file per section](./plugins/modular-monolith/skills/modular-monolith/blueprint/README.md). It moved there because the plugin mechanism only distributes `plugins/<name>/`, so a copy under `Blueprints/` could never reach another machine.

For an **existing** repo the blueprint is a menu, not a mandate: `/blueprint-align` audits the repo, you adopt or decline each of the 17 areas, and the decisions land in that repo's `docs/ROADMAP.md` as a standing register. Everything downstream — reviews, checks, future agents — is scoped by that register.

[`Blueprints/MODULAR-MONOLITH-BLUEPRINT.md`](./Blueprints/MODULAR-MONOLITH-BLUEPRINT.md) is a redirect kept so existing links resolve.
