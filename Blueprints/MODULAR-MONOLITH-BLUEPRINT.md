# Modular Monolith App Blueprint — moved

The blueprint now lives inside the **`modular-monolith` plugin**, split into one file per section:

### → [`plugins/modular-monolith/skills/modular-monolith/blueprint/`](../plugins/modular-monolith/skills/modular-monolith/blueprint/README.md)

This file is kept so existing links resolve. It is not the blueprint.

## Why it moved

A Claude Code plugin distributes only `plugins/<name>/<version>/`, so nothing under `Blueprints/` ever reached another machine. A repo consuming the blueprint had to hardcode a path that existed on one laptop, or pay a web fetch. Inside the plugin it installs, versions and updates with `/plugin` like everything else — and splitting it by section means an agent loads the 240-line rules digest rather than 140 KB of code samples.

## Where to go

| You want | Go to |
| --- | --- |
| The rules — R1–R35, the contract | [`01-rules-digest.md`](../plugins/modular-monolith/skills/modular-monolith/blueprint/01-rules-digest.md) |
| Any other section | [the index](../plugins/modular-monolith/skills/modular-monolith/blueprint/README.md), which says when to read each |
| To align an existing repo | [§16](../plugins/modular-monolith/skills/modular-monolith/blueprint/16-aligning-existing-project.md), or run `/blueprint-align` |
| Which rules bind in a given repo | That repo's `docs/ROADMAP.md` § *Blueprint adoption* — see the [plugin README](../plugins/modular-monolith/) |

## Installing it

```text
/plugin marketplace add warwickschroeder/repo-standards
/plugin install modular-monolith@repo-standards
```

The plugin adds `/blueprint-align`, `/blueprint-check` and `/blueprint-roadmap`, and scopes the blueprint's rules to whatever each repo actually adopted.
