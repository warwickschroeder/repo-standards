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
