# HazardLink — Design System (MASTER)

> Source of truth for HazardLink's UI. Generated with the **ui-ux-pro-max** design
> intelligence skill, grounded in its `styles.csv` / `colors.csv` data. When
> building a page, follow this file; a `design-system/pages/<page>.md` (if present)
> overrides it.

## Product profile
- **Type:** B2B SaaS — multi-discipline facilities platform (Cleaning · Maintenance · Security).
- **Audience:** facilities managers, supervisors, field staff. Used on desktop dashboards *and* phones in the field.
- **Tone:** professional, trustworthy, calm, data-clear. Not playful, not flashy.
- **Theme:** light content on a soft-grey page; dark sidebar retained.

## Style — Minimalism & Swiss + Flat
Chosen from `styles.csv` #1 (Minimalism & Swiss — "best for: enterprise apps,
dashboards, SaaS platforms, professional tools"; Light ✓ Full; WCAG AAA) blended
with #12 (Flat Design — SaaS/dashboards). Implications:
- Generous white space, clear grid, strong type hierarchy.
- Subtle hover (150–250ms), restrained shadows, no gradients-for-decoration.
- One primary CTA per screen; secondary actions visually subordinate.
- SVG icons only — **no emoji as structural icons**.

## Color tokens — palette "SaaS (General)"
From `colors.csv` #1 ("Trust blue + orange CTA contrast"). Defined as CSS vars in
`web/src/index.css` and surfaced to Tailwind as `primary`, `accent`, `surface`, `ink`.

| Token | Hex | Use |
|-------|-----|-----|
| primary | `#2563EB` | primary actions, links, active nav, focus ring |
| primary-hover | `#1D4ED8` | primary hover |
| accent | `#EA580C` | sparing emphasis / urgent CTA (not everywhere) |
| surface (page) | `#F8FAFC` | app background (slate-50) |
| card | `#FFFFFF` | cards/surfaces — separate from page via border + shadow-sm |
| ink (foreground) | `#0F172A` | headings (slate-900); body slate-700; muted slate-500 |
| border | `#E2E8F0` | hairline borders (slate-200) |
| success | `#16A34A` · warning `#D97706` · danger `#DC2626` · info `#2563EB` | status, semantic — always paired with icon/text, never color alone |

**Discipline accents** (section identity only): Cleaning `#0891B2`, Maintenance
`#D97706`, Security `#4F46E5`.

## Typography
- **Family:** Inter (already loaded). Single family; hierarchy via size + weight.
- **Scale (px):** 12 · 14 · 16(base) · 18 · 20 · 24 · 30 · 36. Body line-height 1.5.
- **Weights:** 400 body, 500 labels/nav, 600 card titles, 700 page titles.
- **Numbers:** `tabular-nums` for KPIs, prices, counts, timers (prevents shift).

## Shape, elevation, spacing, motion
- **Radius:** inputs/buttons `rounded-lg` (8px); cards `rounded-xl` (12px); pills full.
- **Elevation:** slate-tinted `shadow-xs/sm/md/lg` (defined in tailwind.config). Cards rest at `shadow-sm`, hover `shadow-md`.
- **Spacing:** 4/8 rhythm. Page padding 16px mobile → 32px desktop; content max-width 6xl.
- **Motion:** 150–200ms ease-out; press scale 0.98; honor `prefers-reduced-motion`.

## Accessibility (non-negotiable)
- Visible **focus rings** on every interactive element (2px primary, 2px offset).
- Text contrast ≥4.5:1; status never conveyed by color alone.
- Touch targets ≥44px (buttons are `py-2.5` on mobile).
- Labels on inputs; inline errors near the field.

## Component contract (`web/src/index.css`)
Use these classes app-wide instead of ad-hoc utilities:
`.card` / `.card-hover` · `.btn` + `.btn-primary` / `.btn-accent` / `.btn-secondary` /
`.btn-ghost` / `.btn-danger` · `.input` · `.pill-{online,offline,alert,info,muted}` ·
`.section-title` · `.field-label` · `.stat-value` / `.stat-label` · `.table-wrap`.

## Rollout status
- ✅ Foundation (tokens, Tailwind theme, component layer) — applies to all pages.
- ✅ App shell (sidebar/topbar) and the Active-alerts dashboard.
- ⏳ Remaining pages: migrate ad-hoc `border/bg-white/shadow-sm` blocks to `.card`,
  raw buttons to `.btn-*`, and replace page-level emoji with SVG icons.
