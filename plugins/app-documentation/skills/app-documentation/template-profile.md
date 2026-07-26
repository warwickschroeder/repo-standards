# Repo Profile — App Documentation

> **How to use:** copy this file to `.claude/app-documentation/profile.md` in the target repo and fill in every `{{PLACEHOLDER}}`. Run the Profile phase once; re-validate when the stack, the parts, the roles or the doc layout change (§10).
>
> **Read the sibling profiles first.** If `.claude/regression-runbooks/profile.md` or `.claude/smoke-tests/profile.md` exist, they already carry the personas, the route inventory, how to sign in and the repo's gotchas. Link to them from §4 and §5 rather than restating them — two copies of the persona table will disagree within a month.

---

## 1. What the app is

| Item | Value |
| --- | --- |
| **Product name** | `{{PLACEHOLDER — and note if the brand shown in the UI is configured per deployment}}` |
| **One-line purpose** | `{{PLACEHOLDER — what it does for whom}}` |
| **Primary users** | `{{PLACEHOLDER — e.g. staff of customer organisations translating documents}}` |
| **Other audiences** | `{{PLACEHOLDER — e.g. Forge operators; API consumers; none}}` |
| **Deployment model** | `{{PLACEHOLDER — e.g. single multi-tenant instance; one instance per customer; on-prem}}` |

---

## 2. Shape of the codebase → what a "part" is

<!-- The Phase 2 decision, recorded once so every future run partitions the same way.
     Decision table and worked examples: reference.md §1. -->

| Item | Value |
| --- | --- |
| **Architecture** | `{{PLACEHOLDER — modular monolith / microservices / layered monolith / monorepo / SPA + BFF / library}}` |
| **A part is** | `{{PLACEHOLDER — a module / a service / a bounded context / a package / a feature area}}` |
| **The visible boundary** | `{{PLACEHOLDER — e.g. own DB schema + DbContext, referencing only Core}}` |
| **Boundaries enforced by** | `{{PLACEHOLDER — e.g. project references + a build gate; or "documentation-only, not enforced"}}` |
| **Source root(s)** | `{{PLACEHOLDER — e.g. src/modules/*, src/services/*}}` |

### The parts

<!-- The index of what must have a doc. Keep this in sync with the docs index; §10 checks it. -->

| Part | Source path | Owns | Doc |
| --- | --- | --- | --- |
| `{{PLACEHOLDER}}` | `{{path}}` | `{{schema / tables / surface}}` | `{{docs/modules/<part>.md}}` |
| `{{PLACEHOLDER — cross-cutting foundation: shared kernel, host, auth}}` | `{{path}}` | `{{…}}` | `{{…}}` |

---

## 3. Where the docs live

| Item | Value |
| --- | --- |
| **Part docs directory** | `{{PLACEHOLDER — default docs/modules/}}` |
| **Part doc filename** | `{{PLACEHOLDER — e.g. docs/modules/<part>.md, kebab-case}}` |
| **Part docs index** | `{{PLACEHOLDER — e.g. docs/modules/README.md}}` |
| **Guides directory** | `{{PLACEHOLDER — default docs/guides/}}` |
| **Guides** | `{{PLACEHOLDER — e.g. user-guide.md (Uploader/Reviewer/Administrator), operator-guide.md (SuperUser)}}` |
| **Screenshots directory** | `{{PLACEHOLDER — e.g. docs/guides/screenshots/ + its README listing every key}}` |
| **Other doc sets not to duplicate** | `{{PLACEHOLDER — e.g. docs/infrastructure/, docs/authentication/, docs/runbooks/ — link, never restate}}` |

---

## 4. Audiences, roles and gates

<!-- Guide badges are derived from the AUTH GATES in code, not from what seems reasonable.
     Record where the policies are declared so every run re-derives rather than assumes. -->

| Role | What it adds | Where the gate is declared | Assigned how |
| --- | --- | --- | --- |
| `{{PLACEHOLDER — e.g. Uploader}}` | `{{…}}` | `{{e.g. Core/Auth/AuthPolicies.cs}}` | `{{e.g. default on first sign-in}}` |
| `{{PLACEHOLDER}}` | `{{…}}` | `{{…}}` | `{{…}}` |

- **Roles cumulative?** `{{PLACEHOLDER — yes: badge each task at the lowest role, "+" means and above / no: badge explicitly}}`
- **Badge convention:** `{{PLACEHOLDER — e.g. **[Reviewer+]**}}`
- **Guide per audience:** `{{PLACEHOLDER — e.g. user-guide.md for customer roles; operator-guide.md for operators; operator guide links to the user guide rather than repeating it}}`

---

## 5. Verifying against the running app

<!-- Control labels are quoted verbatim, never recalled. This section says how to reach them. -->

| Item | Value |
| --- | --- |
| **Run the stack** | `{{PLACEHOLDER — the one command}}` |
| **URL** | `{{PLACEHOLDER}}` |
| **Sign in / switch role** | `{{PLACEHOLDER — or "see .claude/regression-runbooks/profile.md §5"}}` |
| **UI source of truth for labels** | `{{PLACEHOLDER — e.g. src/…/Web/src/pages/*.tsx; or an i18n catalogue at …}}` |
| **Shared constants mirrored client↔server** | `{{PLACEHOLDER — e.g. scripts/check-shared-constants.mjs verifies these; quote from the authoritative side}}` |

---

## 6. Source-of-truth for facts

| Fact class | Authoritative source |
| --- | --- |
| Routes / entry points | `{{PLACEHOLDER — e.g. the *Endpoints.cs map calls; an OpenAPI document}}` |
| Data model | `{{PLACEHOLDER — e.g. EF entity configuration + migrations under …}}` |
| Statuses & constrained sets | `{{PLACEHOLDER — e.g. code constants + CHECK constraints; never a lookup table}}` |
| Limits & thresholds | `{{PLACEHOLDER — e.g. Core InputLimits + per-module constants}}` |
| Auth policies | `{{PLACEHOLDER}}` |
| Configuration keys | `{{PLACEHOLDER — e.g. appsettings.json + the options classes that bind them}}` |
| Events / messages | `{{PLACEHOLDER — e.g. Core/Events/Contracts/}}` |
| Control labels | `{{PLACEHOLDER — see §5}}` |

---

## 7. Diagram and prose conventions

| Item | Value |
| --- | --- |
| **Diagrams** | `{{PLACEHOLDER — e.g. mermaid in guides (rendered by the build); ASCII for event fan-out in part docs}}` |
| **Screenshot placeholder form** | `{{PLACEHOLDER — e.g. > 📸 **Screenshot `key`:** description}}` |
| **Prose width** | `{{PLACEHOLDER — full width, never hard-wrapped, is the org default}}` |
| **Existing doc shape to match** | `{{PLACEHOLDER — e.g. At a glance → What it does → How it works → Reference → Configuration → Extending & gotchas → Where to look in the code}}` |

---

## 8. Publishing toolchain

| Item | Value |
| --- | --- |
| **Built formats** | `{{PLACEHOLDER — e.g. .docx via Pandoc; none — Markdown only}}` |
| **Build location & command** | `{{PLACEHOLDER — e.g. cd docs/guides/build && npm run build}}` |
| **Branded template** | `{{PLACEHOLDER — e.g. reference2.docx hand-edited in Word; reference.docx generated from it}}` |
| **Version stamping** | `{{PLACEHOLDER — e.g. APP_VERSION env var stamps the cover page}}` |
| **Prerequisites** | `{{PLACEHOLDER — e.g. Pandoc, Node 20+, mermaid-cli (downloads Chromium)}}` |

---

## 9. Repo-specific gotchas

<!-- A dated running log — the repo twin of reference.md §9. Add an entry whenever a run surfaces
     something non-obvious about documenting THIS app. -->

`{{PLACEHOLDER — add entries as you find them}}`

<!-- Format:
### YYYY-MM-DD — Short title
What bit, and what to do about it.
-->

---

## 10. Profile maintenance

Re-validate when any of these change:

- [ ] A part is added, removed, merged or split → §2, the index, and the docs directory
- [ ] A role is added or a policy tightened → §4, and re-derive every guide badge
- [ ] The docs move, or a new doc set appears that these must link to rather than duplicate → §3
- [ ] The UI label source moves (i18n introduced, components restructured) → §5
- [ ] The publishing toolchain changes → §8

**Last validated:** `{{PLACEHOLDER — YYYY-MM-DD by whom, and what changed}}`
