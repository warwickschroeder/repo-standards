# Repo Profile — Regression Runbooks

> **How to use:** Copy this file to `.claude/regression-runbooks/profile.md` in your repo
> and fill in every `{{PLACEHOLDER}}` section. Run the Profile phase (Phase 1) once;
> re-validate lightly whenever the stack, auth, or harness changes (see §12).
>
> Every subsequent area run reads this file — nothing here should be left implicit.

---

## 1. Stack

<!-- Read package.json to fill these in. The component library determines which
     selector patterns are reliable and which gotchas apply (see §10 + reference.md §8). -->

| Item | Value |
|------|-------|
| **FE framework** | `{{PLACEHOLDER — e.g. React 19, Vue 3, Angular 18, Svelte 5}}` |
| **Component library** | `{{PLACEHOLDER — e.g. MUI 7, shadcn/ui + Radix, Ant Design 5, Chakra UI, plain CSS}}` |
| **Form management** | `{{PLACEHOLDER — e.g. React Hook Form 7, Formik 4, Zod-driven submit handler, none}}` |
| **Language** | `{{PLACEHOLDER — e.g. TypeScript 5.9 (strict), JavaScript ESNext}}` |
| **Build tool** | `{{PLACEHOLDER — e.g. Vite 6, webpack 5, Turbopack, Next.js App Router}}` |
| **Major runtime deps** | `{{PLACEHOLDER — e.g. React Router v7, TanStack Query v5, Zustand 5}}` |

---

## 2. e2e Harness

<!-- Check for playwright.config.*, cypress.config.*, or similar in the root and package.json scripts.
     If none found, write "none yet — runbooks are manual-only" and note that Phase 5 (Automate)
     should stop at the manual tier until a harness is introduced. -->

- **Runner:** `{{PLACEHOLDER — e.g. Playwright 1.52, Cypress 13, none yet}}`
- **Config file:** `{{PLACEHOLDER — e.g. e2e/playwright.config.ts, cypress.config.ts}}`
- **Run command (single spec):** `{{PLACEHOLDER — e.g. npx playwright test e2e/tests/<area>.spec.ts, npm run test:e2e -- --spec cypress/e2e/<area>.cy.ts}}`
- **Run command (full suite):** `{{PLACEHOLDER — e.g. npm run test:e2e}}`
- **Test-file location pattern:** `{{PLACEHOLDER — e.g. e2e/tests/**/*.spec.ts, cypress/e2e/**/*.cy.ts}}`
- **Global setup / fixtures:** `{{PLACEHOLDER — e.g. e2e/globalSetup.ts, e2e/fixtures/index.ts — describe what it provides (auth, DB seed, etc.)}}`
- **Helper / page-object path(s):** `{{PLACEHOLDER — e.g. e2e/helpers.ts exports createProject(), loginAs(), etc.}}`

> **Manual-only note:** If runner is "none yet", skip Phase 5 (Automate) for every area runbook
> and append `<!-- manual-only: no e2e harness -->` to each spec slot.

---

## 3. Source-of-Truth for Fields and Enums

<!-- This is the single most important profile item. Record the canonical file(s) or package so
     every area's ledger can point "field source: <here>" unambiguously.
     Priority order: published schema/contract package → OpenAPI/Swagger spec → Zod module →
     TS types/interfaces → form components themselves.
     If multiple layers exist, record which layer is authoritative for which fact. -->

- **Primary source:** `{{PLACEHOLDER — e.g. @acme/api-schema npm package; Zod schemas in src/schemas/; OpenAPI spec at openapi.yaml; TypeScript interfaces in src/models/}}`
- **Authoritative for field list / column names:** `{{PLACEHOLDER — e.g. src/schemas/entities.ts — every entity's field list}}`
- **Authoritative for enum values:** `{{PLACEHOLDER — e.g. src/schemas/enums.ts — enumValues array is the canonical set; backend-seeded code lists are NOT here (see §10)}}`
- **Authoritative for required-field flags:** `{{PLACEHOLDER — e.g. requiredForInput: true in the schema; or the Zod .min(1) / .nonempty() in src/schemas/}}`
- **Authoritative for labels / display names:** `{{PLACEHOLDER — e.g. label property in schema ui-meta; or i18n keys in src/locales/en.json}}`
- **How to derive a field list for an entity** (exact import / code pattern):

  ```ts
  // {{PLACEHOLDER — paste the pattern used in this repo to get the canonical field list}}
  // Example (Zod):
  import { ProjectSchema } from '@acme/api-schema';
  const fields = Object.keys(ProjectSchema.shape); // ['name', 'status', 'description', …]

  // Example (OpenAPI):
  // Inspect openapi.yaml > components > schemas > Project > properties
  ```

- **Canonical vs. code-list distinction:**
  > `{{PLACEHOLDER — e.g. Enums in src/schemas/enums.ts are fixed sets (assert exact list in tests).
  > Options in the "Categories" / "Reference Data" / status code-list tables are backend-seeded and tenant-extensible
  > (assert the loaded set, not a hard-coded list).}}`

---

## 4. Verification Lanes

<!-- Runbooks prove persistence — this section says HOW.
     At least one automatable lane is required for Full-tier test cases.
     Matches reference.md §5 (tri-modal: in-app / datastore / automation). -->

| Lane | What you verify | Available? | Automatable? | Setup / How |
|------|----------------|-----------|--------------|-------------|
| **Lane 1 — In-app / observable** | Re-open the item in the form or list; inspect any app data-explorer view; check browser storage (IndexedDB / localStorage / OPFS) for offline-first apps | `{{yes / no}}` | Yes — Playwright / Cypress always | Navigate back to the edit form or data-explorer view; assert each field value; use `page.evaluate(() => indexedDB…)` or `window.__db__.exec('SELECT …')` for local-store assertions |
| **Lane 2 — Direct datastore query** | Server-side row values queried directly (SQL client, DB console, admin endpoint, or ORM helper) — human-operated | `{{yes / no}}` | No — human manual step (Profile A or C) | `{{PLACEHOLDER — e.g. connect via psql / SSMS / admin endpoint GET /internal/debug/entity/:id; record the connection string or tool in the profile}}` |
| **Lane 3 — Automation read-back** | Backend rows queried in-process from the e2e harness (API call, DB helper, or `sql`/`db` fixture) | `{{yes / no}}` | Yes — `page.evaluate(fetch(…))`, dedicated API helper, or the harness `sql`/`db` fixture | `{{PLACEHOLDER — e.g. GET /api/v1/projects/:id with Bearer token from storageState; or harness fixture: e2e/helpers/db.ts queryRow(sql, params); use expect.poll() for async writes}}` |

**Default lane per tier:**
- **Smoke:** Lane 1 (in-app / observable minimum)
- **Targeted:** Lane 1 + Lane 3 (automation read-back) where available
- **Full:** Lane 1 + Lane 2 + Lane 3 where available; Lane 1 browser-storage assertions when the write is local-first

> **Connection / credential details for Lane 2:**
> `{{PLACEHOLDER — e.g. Postgres: psql connection string in .env.test (DB_URL); MS SQL: SSMS or sqlcmd; or admin endpoint at /internal/debug — no direct DB access, use Lane 3}}`
>
> **Connection / credential details for Lane 3:**
> `{{PLACEHOLDER — e.g. base URL from env var VITE_API_BASE_URL; Bearer token from page.context().storageState(); or harness fixture: e2e/helpers/db.ts queryRow(sql, params); use expect.poll() because backend writes are async}}`

---

## 5. Auth / Login

<!-- Record as exact steps for manual profiles AND code references for the automated profile.
     Every area runbook references these by name rather than repeating them. -->

### 5a. Local dev (manual)

`{{PLACEHOLDER — e.g.:
1. Navigate to http://localhost:5173
2. Click "Sign in with Google" (or "Dev Login" if VITE_ENABLE_DEV_AUTH=true)
3. Auth bypassed in dev mode — lands on home page as the all-permissions dev/admin role (e.g. "Developer" or "Admin")
}}`

### 5b. Local dev (automated harness)

`{{PLACEHOLDER — e.g.:
- globalSetup.ts calls loginAs('developer') which injects auth cookies via storageState
- All specs inherit the stored auth via use: { storageState: 'e2e/.auth/user.json' }
- Helper: loginAs(role: 'admin' | 'editor' | 'viewer') in e2e/helpers/auth.ts
}}`

### 5c. Staging / second environment (manual)

`{{PLACEHOLDER — e.g.:
- URL: https://app-staging.example.com
- Auth: real Azure AD / Okta / Auth0 — use test account test-qa@example.com (password in 1Password "QA test account")
- Role: sign in as the role required for the area under test
}}`

### 5d. Staging / second environment (automated)

`{{PLACEHOLDER — e.g.:
- CI env var: E2E_STAGING_AUTH_TOKEN (service-account token)
- Harness uses playwright.staging.config.ts; run: npm run test:e2e:staging
- Or: no automated staging run yet — manual only
}}`

### Test roles available

| Role | Permissions | How to select |
|------|-------------|---------------|
| `{{PLACEHOLDER — e.g. Admin}}` | `{{PLACEHOLDER — e.g. full CRUD, user management}}` | `{{PLACEHOLDER — e.g. loginAs('admin')}}` |
| `{{PLACEHOLDER — e.g. Editor}}` | `{{PLACEHOLDER — e.g. create + edit, no delete}}` | `{{PLACEHOLDER — e.g. loginAs('editor')}}` |
| `{{PLACEHOLDER — e.g. Viewer}}` | `{{PLACEHOLDER — e.g. read-only}}` | `{{PLACEHOLDER — e.g. loginAs('viewer')}}` |

---

## 6. State Reset

<!-- How to reach a clean slate before each run. A test that depends on prior state is brittle. -->

### Manual reset (local)

`{{PLACEHOLDER — e.g.:
1. Open DevTools → Application → Storage → "Clear site data"
2. Or: use Settings > Developer Console > "Reset database"
3. Or: delete and recreate the local database file
}}`

### Automated reset (harness)

`{{PLACEHOLDER — e.g.:
- Per-spec: beforeEach calls page.evaluate(() => window.__db__.run('DELETE FROM …')) or clears IndexedDB
- Per-file: playwright config use: { storageState: undefined } + globalSetup truncates test-tenant rows
- Seed helper: e2e/helpers/seed.ts seedProject(page) creates the minimum viable parent row
- Teardown: afterEach calls deleteCreatedEntities(page, createdIds) via API
}}`

### Staging reset

`{{PLACEHOLDER — e.g.:
- No reset available — staging is shared; prefix test data with "TEST-" and clean up manually
- Or: admin panel at /admin/test-data-cleanup
- Or: CI pipeline seeds a fresh staging DB on each deploy
}}`

---

## 7. Area Inventory

<!-- Derived from the router config + nav component — NOT from docs that may be stale.
     Each row is a potential runbook. "Entities written" = read-only or none for non-mutating areas. -->

| Area | Nav label / path | Route(s) | Entities written | Permission gate |
|------|-----------------|----------|-----------------|----------------|
| `{{PLACEHOLDER — e.g. Projects}}` | `{{e.g. Sidebar > Projects}}` | `{{e.g. /projects, /projects/new, /projects/:id, /projects/:id/edit}}` | `{{e.g. projects}}` | `{{e.g. canManageProjects}}` |
| `{{PLACEHOLDER — e.g. Users}}` | `{{e.g. Sidebar > Admin > Users}}` | `{{e.g. /admin/users, /admin/users/:id}}` | `{{e.g. users}}` | `{{e.g. role: Admin}}` |
| `{{PLACEHOLDER — e.g. Dashboard}}` | `{{e.g. Sidebar > Dashboard}}` | `{{e.g. /dashboard}}` | `{{e.g. read-only}}` | `{{e.g. any authenticated user}}` |
| `{{PLACEHOLDER — add more rows}}` | | | | |

> **Router config location:** `{{PLACEHOLDER — e.g. src/router/index.tsx, app/routes.ts, pages/ directory}}`
> **Nav component location:** `{{PLACEHOLDER — e.g. src/components/Layout/Sidebar.tsx}}`

---

## 8. FK / Setup Order

<!-- The parent→child dependency graph. When a test creates an entity, all parent rows must exist first.
     Record the shared helper location so runbooks reference it by name. -->

### Dependency graph

```
{{PLACEHOLDER — paste the FK tree for this repo. Example:

Organisation (seeded; do not create in tests)
  └── Project
        ├── Task
        │     ├── Comment
        │     └── Attachment
        └── Report
}}
```

### Shared chain helpers

| Helper | File | Creates |
|--------|------|---------|
| `{{PLACEHOLDER — e.g. createProject(page)}}` | `{{e.g. e2e/helpers/seed.ts}}` | `{{e.g. Project row; returns { projectId }}}` |
| `{{PLACEHOLDER — e.g. createParentEntity(page, projectId)}}` | `{{e.g. e2e/helpers/seed.ts}}` | `{{e.g. parent row + returns its id}}` |
| `{{PLACEHOLDER — add more rows}}` | | |

> **Seeding rule:** Use the real UI or the real repository/service layer to create seed rows — never
> raw SQL inserts that bypass the write path. A raw INSERT hides bugs in the repo's write path.

---

## 9. Selector Conventions

<!-- Preferred query strategy for this repo + component-library quirks. -->

### Preferred query order

1. `getByRole(role, { name: 'Accessible Name' })` — always try this first.
2. `getByLabel('Label text')` — for inputs with `<label>` associations.
3. `getByText('Visible text')` — for non-interactive elements.
4. `data-testid` attribute — **last resort** when no stable accessible name exists; flag missing aria-labels as a testability gap in the app, not a workaround in the runbook.

### Component library → role / name mapping

<!-- Fill in the quirks specific to your component library. Generic entries live in reference.md §8. -->

| Component | Library | Role | Name source | Notes |
|-----------|---------|------|-------------|-------|
| `{{PLACEHOLDER — e.g. Select (dropdown)}}` | `{{e.g. MUI}}` | `{{e.g. combobox}}` | `{{e.g. requires inputLabel id + labelId prop}}` | `{{e.g. bare <Select> without labelId is unnamed — wires aria-labelledby}}` |
| `{{PLACEHOLDER — e.g. Switch}}` | `{{e.g. MUI}}` | `{{e.g. switch (MUI v7) / checkbox (MUI v6)}}` | `{{e.g. FormControlLabel label OR slotProps.input aria-label}}` | `{{e.g. bare <Switch inputProps> (no FormControlLabel) is unnamed in v7 — use slotProps.input}}` |
| `{{PLACEHOLDER — e.g. Button (icon only)}}` | `{{any}}` | `{{e.g. button}}` | `{{e.g. aria-label required; Tooltip alone is not enough}}` | `{{e.g. wrap in Tooltip + set aria-label on the button itself}}` |
| `{{PLACEHOLDER — add more rows}}` | | | | |

### Label-stability caveats

`{{PLACEHOLDER — e.g.:
- Labels come from the tenant field-label override provider; assert by canonical role+name, not text literal, where labels may change.
- Date picker inputs are named by the placeholder ("MM/DD/YYYY"), not the field label — use getByRole('textbox', { name: /date/i }) or getByLabel().
- Chip/tag inputs expose an inner <input> role=textbox with aria-label set by the component's label prop.
}}`

### Known testability gaps (app todos, not runbook workarounds)

`{{PLACEHOLDER — e.g.:
- [ ] Icon button "Delete row" in the sub-table has no aria-label — filed #123
- [ ] Filter dropdown on /reports has no label — filed #124
}}`

---

## 10. Runbooks Path

- **Runbooks directory:** `{{PLACEHOLDER — default: docs/runbooks/; change only if your repo uses a different path}}`
- **Runbook filename convention:** `{{PLACEHOLDER — e.g. docs/runbooks/<area>.md (kebab-case area name)}}`
- **e2e spec directory:** `{{PLACEHOLDER — e.g. e2e/tests/<area>.spec.ts, cypress/e2e/<area>.cy.ts}}`
- **Ledger dump directory (optional):** `{{PLACEHOLDER — e.g. .claude/regression-runbooks/ledgers/<area>.md — verbose discovery notes; the compact coverage map lives inside the runbook}}`

---

## 11. Repo-Specific Gotchas (repo gotcha log)

<!-- A running log of lessons learned in THIS repo — the repo twin of the generic catalogue in reference.md §8.
     Add an entry every time a run surfaces a non-obvious behaviour. Date each entry. -->

<!-- Format: ### YYYY-MM-DD — Short title
     One or two sentences describing the gotcha and the fix/workaround. -->

`{{PLACEHOLDER — add entries as you discover them. Examples below; replace with real ones.}}`

<!-- EXAMPLE (remove when real entries exist):
### 2026-01-15 — MUI v7 bare Switch is unnamed
The `<Switch>` element in MUI v7 without a `FormControlLabel` wrapper exposes no accessible name.
`getByRole('switch', { name: /enable/i })` hangs until timeout.
Fix: add `slotProps={{ input: { 'aria-label': 'Enable notifications' } }}` to the Switch.

### 2026-02-03 — Dialog open hides top-bar actions from Playwright
When a MUI Dialog is open, the `aria-hidden` attribute is set on the rest of the DOM.
Any interaction with elements outside the dialog (e.g. clicking Sync in the top bar) will fail silently.
Fix: close the dialog first, then interact with the top-bar element.
-->

---

## 12. Profile Maintenance

Re-validate this profile (lightly) whenever any of the following changes:

- [ ] Framework or component library **major version** bump (`package.json` diff)
- [ ] e2e runner or run command changes (config file rename, script rename)
- [ ] New routes added to the router → update the area inventory (§7)
- [ ] Auth mechanism changes (new SSO provider, new role, env-var rename)
- [ ] Source-of-truth renamed, replaced, or re-pathed (§3) — **critical**: a renamed source silently corrupts every ledger derived from it; re-run Discovery for affected areas
- [ ] New verification lane available (e.g. a DB helper added to globalSetup)
- [ ] New component library quirk discovered → add to §9 and to reference.md §8 if generalizable

**Last validated:** `{{PLACEHOLDER — e.g. 2026-06-19 by @you — initial profile}}`
**Next scheduled check:** `{{PLACEHOLDER — e.g. on next major dependency bump or quarterly}}`
