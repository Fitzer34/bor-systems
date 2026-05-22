# HazardLink — Brand Guidelines

The minimum viable brand book. Update as the product matures.

---

## Name + spelling

**Always**: `HazardLink` — one word, capital H + capital L. Never
`Hazard Link`, `Hazardlink`, `hazardLink`, or `HAZARDLINK`.

Wordmark: in body text and headlines, write it as one capitalised
word with no special formatting.

## Tagline

**Primary** (one-liner): "Spills detected the second they happen."

**Compliance-led** (insurance / facility-manager audience):
"Insurance-ready proof of cleaning response."

**Tech-led** (CTO / startup audience):
"Smart wet-floor monitoring with cm-accurate find."

Use one tagline consistently per audience. Don't mix.

## Colours

| Role | Hex | Use |
|---|---|---|
| **Primary orange** | `#FF8800` | Brand accents, primary buttons, alerts |
| **Hazard red** | `#E53935` | Active spill alerts, urgent states |
| **Resolved green** | `#2E7D32` | Successful actions, "all clear", confirmed states |
| **Charcoal ink** | `#0F172A` | Body text, headings on light backgrounds |
| **Grey** | `#64748B` | Secondary text, hints |
| **Soft background** | `#F8FAFC` | Section backgrounds, cards |
| **Paper white** | `#FFFFFF` | Primary background |

These are the values already in `web/src/components/Layout.tsx`,
`ios/BORSystems/.../Theme.swift`, and
`android/app/.../ui/theme/Theme.kt`. Don't drift.

## Typography

- **iOS**: SF Pro (system default) — never override
- **Android**: Roboto / Google Sans (Material 3 default)
- **Web**: system stack — `-apple-system, BlinkMacSystemFont,
  "Segoe UI", Roboto, Helvetica, Arial, sans-serif`

Headings: 700 weight, -1px letter-spacing, generous line-height (1.1).
Body: 400, 1.5 line-height, 16px minimum on web / 17pt on iOS.

## Voice + tone

**Direct, calm, technical.** We don't shout urgency at customers —
the alerts do that for us.

- ✅ "Sign lifted at Building A, Floor 2"
- ❌ "🚨🚨 URGENT SPILL ALERT! ACT NOW! 🚨🚨"

- ✅ "Your response time improved 28% this month."
- ❌ "AMAZING NEWS! You're crushing it!! 🔥🔥"

When something fails:
- ✅ "Tag not in range. Check the sign is still nearby."
- ❌ "Oops! Something went wrong!"

Bias to noun-first sentences and active voice. Cut jargon — "DevEUI" is
fine in admin, but on a cleaner's screen say "sign ID".

## Logo

Until we have a designed logo, use the ⚠️ emoji as a placeholder
favicon (it's baked into the landing page already). Commission a
proper logo from a freelance designer once the brand is locked in:

- Fiverr: €50-200 (variable quality, fast turnaround)
- 99designs / Behance: €500-1500 (design competition, multiple concepts)
- Local Irish designer: €1000-3000 (slower but lasting relationship)

Logo brief:
- Wordmark + symbol option (e.g., a stylised "H" with a signal-wave element)
- Must work in monochrome (printed labels, embossed signage)
- Must work at 16×16 px (favicon, app icon corner)
- Square + horizontal variants
- SVG + PNG @ 1x/2x/3x

## App icon

iOS / Android home-screen icon needs to be readable at small size.

Provisional design until logo is finalised:
- Orange `#FF8800` rounded-square background
- White wordmark "HL" or simplified hazard symbol
- 1024×1024 px PNG for App Store; will be scaled to all required sizes

A designer should create this alongside the proper logo.

## Iconography

In-app icons: Material Icons (Android) + SF Symbols (iOS) — already
used throughout. Don't import a third-party icon library, the system
ones cover everything we need.

## Photography style (for marketing site, store screenshots)

Bright, clean commercial environments. NOT stock photos of literal
yellow signs in dramatic spill scenes. Show:
- Cleaners using the app on a phone in context
- The hanger mounted neatly on a wall
- A clean dashboard view on a laptop
- Real-feeling office / retail spaces, not staged

## Don'ts

- ❌ Comic Sans, Papyrus, or any decorative font
- ❌ Drop shadows on text
- ❌ Gradients (except subtle background washes)
- ❌ Emojis in headers (sparing use in body copy is OK — ⚠️, 📍, ✅)
- ❌ Mixing the brand orange with other accent colours like blue/purple
- ❌ Customer logos used without their written permission
- ❌ "Disrupting", "revolutionary", "leveraging" — overused buzzwords

## Versioning

This file is version-controlled in `BRAND.md`. When you commission a
proper logo / design system, update this doc + drop the asset files
under `assets/brand/`.
