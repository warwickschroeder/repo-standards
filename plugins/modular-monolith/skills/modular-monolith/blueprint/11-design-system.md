> **Modular Monolith Blueprint — §11.** [Index](README.md) · [Rules Digest](01-rules-digest.md)

## 11. Design System Contract (design-first)

**The design comes first, in Claude Design.** Before any UI is built, the
visual/interaction design is produced **upstream in Claude Design** (Anthropic's
prompt-to-prototype tool). When it's ready you **hand it off**: in Claude Design,
*Export → Handoff to Claude Code* gives you (a) a **copied prompt/command** and
(b) a downloadable **handoff bundle (zip)**. That bundle — not a hand-written
spec — is the **design input** to this app. The build does **not** invent a
look; it **realises** the handed-off design from the bundle's structured
metadata (it is *not* reverse-engineering a screenshot).

### 11.1 What the handoff bundle contains

A Claude Design → Claude Code handoff bundle is **machine-readable**, not just
pictures. Expect:

- **Component structure spec** — the components and their hierarchy as a
  structured spec (not pixels).
- **Design tokens actually used on the canvas** — colors, type, spacing, radii,
  elevation as token values.
- **Layout hierarchy + responsive breakpoints + interaction states** (hover,
  focus, active, disabled, empty, loading, error).
- **Referenced assets** — logos, icons, images.
- **Design files** — HTML/CSS/JS the tool produced.
- **Per-state screenshots** — the visual ground truth for each state.
- **A README** — naming the target stack and conventions to follow.
- **Design conversation history / rationale** — *why* decisions were made, so
  intent (not just appearance) carries through.

> Claude Design can also **import this repo** (GitHub or local dir) so it applies
> the app's existing design system and you can reference components by name. Once
> the app exists, prefer this loop: design *with* the codebase's tokens so the
> next handoff stays consistent rather than divergent.

### 11.2 The pipeline (ingest the bundle → build)

```
Claude Design (upstream)  ──Export→Handoff──►  bundle.zip + copied prompt  ──ingest──►  token-home tokens  ──build──►  UI on the chosen client stack
  (prototype: screens,        (component spec, tokens,                       (single token home;             (components derive
   states, tokens,             breakpoints, states, assets,                   stack reconciled)               strictly from tokens)
   rationale)                  screenshots, README, rationale)
```

1. **Receive & commit the bundle.** Unzip the handoff under
   `docs/design-handoff/<date>-<surface>/` and commit it — bundle + the copied
   prompt + screenshots are the traceable design source of record.
2. **Reconcile the target stack.** The bundle's README/design files may target a
   different stack (often plain HTML/CSS or Next.js). **The app's client stack
   is the one decided with the user (§3)** — the bundle does not get to change
   it. Translate, don't adopt — map the bundle into the chosen stack; never
   swap the stack to match the bundle (a stack change is a user decision, not a
   design-handoff side effect). State the mapping you used in the
   design-handoff folder's notes.
3. **Tokenise → the single token home.** Lift the bundle's **design tokens**
   into the client's one token home **once** (reference stack:
   `src/<App>.Web/src/styles/globals.css` via Tailwind `@theme inline`,
   hex/size direct) and map the component library's variables (reference stack:
   shadcn's `--color-*` / `--radius`) onto them. The token home is the
   canonical machine-readable encoding — **never re-list hexes in component
   code or in this blueprint.**
4. **Build from tokens + spec.** Realise the component-structure spec on the
   chosen component library's primitives (reference stack: shadcn/Radix),
   deriving every value from the tokens, and implement **every interaction
   state and breakpoint** the bundle specifies. Use the per-state screenshots
   as the acceptance reference and the rationale to resolve judgement calls.
5. **(Optional) `DESIGN.md` as a distilled human contract.** You *may* distill
   the bundle into a short `DESIGN.md` (north star + token map + component
   recipes + Do/Don't) as a readable in-repo summary. It is **not required** and
   it is **not** the source of truth — the committed bundle + `globals.css` are.
   If you keep one, it must be *derived from* the bundle, never a parallel
   hand-maintained truth that can drift.

### 11.3 Structural rules (hold regardless of the visual design)

These are **mechanism**, not aesthetics — they apply to *any* design the
upstream step produces:

- **Single token home.** Tokens live **once** in the client's token home
  (reference stack: `globals.css`). A rename/retune happens in one place and
  propagates. The committed handoff bundle is the upstream source; the token
  home is the in-app canonical encoding.
- **Derive, don't duplicate.** Components, the shadcn variable map, any optional
  `DESIGN.md`, and client TS types all derive from the canonical token/spec — no
  parallel hand-kept copies.
- **Realise, don't reinterpret.** Build the handed-off design faithfully,
  including its interaction states and breakpoints. If a state or edge case
  isn't in the bundle (spec, screenshots, or rationale), **ask — don't invent**
  a look (R26).
- **Respect the chosen primitives.** The component library chosen in §3
  (reference stack: shadcn/ui + Radix) is the substrate; retune it to the
  tokens rather than fighting it or hand-rolling parallel widgets. Where a
  treatment isn't a stock variant (e.g. a signature CTA), add a **named custom
  variant** wired to a token, not one-off inline styles.
- **Theme policy comes from the bundle.** Dark-only, light-only, or themeable —
  and whether there's a switcher — is whatever the handoff specifies; structure
  the token layer to match (single theme vs. light/dark token sets).

### 11.4 Worked example — an illustrative token system

> Illustrative only — one possible resolved design system, to show the *shape* a
> distilled token system takes. **Your tokens come from your Claude Design
> handoff bundle, not from here.**

- **Dark-only, "blueprint at midnight":** deep cool navy, **never pure black or
  pure grey** — cool-tinted surface tokens; no theme switcher.
- **No-Line Rule:** never use 1px solid borders for sectioning;
  `--color-border` is `transparent`. Define boundaries with **surface tonal
  shifts** (higher tone = closer to viewer). Dashed affordances on genuine drop
  targets are the only sanctioned exception.
- **No dividers** in cards/lists — separate with vertical whitespace and tonal
  hover.
- **Surface hierarchy:** overlay base `surface-container-lowest` → `surface`
  (app bg) → `surface-container-low` → `surface-container` (cards) →
  `surface-container-high` (overlays/inputs) → `surface-container-highest`.
- **Radius hierarchy:** `sm` (0.125rem) for data cells; `xl` (0.75rem) for
  dashboard containers. Don't default everything to 0.25rem.
- **Typography:** a display/headline family (Manrope) + a body/label family
  (Inter) + a mono family (JetBrains Mono) for identifiers/numbers/`kbd` hints.
  **Tabular lining for all numbers.**
- **Primary CTAs:** a signature 135° gradient as a custom `variant="gradient"`
  (shadcn's default solid fill doesn't cover it). Cards are transparent-bordered
  surfaces that lift via background color only. Overlays sit on
  `--color-popover` with a deep diffuse shadow.
- **shadcn ↔ tokens:** `background`=surface, `card`=surface-container,
  `popover`=surface-container-high, `primary`=accent,
  `secondary`=surface-container-highest, `muted`=surface-container-low.
