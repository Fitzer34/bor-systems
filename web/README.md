# HazardLink — Web Dashboard

Vite + React + TypeScript + Tailwind. Talks to the backend over HTTPS.

## Planned views

- Login (admin-issued credentials).
- Active alerts (newest first, oldest highlighted).
- Floor plan view: uploaded plan per floor with green/red pins per zone.
- Named-zone list (fallback when no plan uploaded).
- Alert detail with "I'm on it", "Sign damaged", "Sign missing", manual close.
- Admin section: user management, hanger management (register via QR or manual DevEUI, decommission/recommission, relocate, audible alarm toggle), floor plan upload + pin placement, resolution timer config, reporting (CSV export).

## Status

Not scaffolded yet. Next turn: `npm create vite@latest .` → React + TypeScript, add Tailwind, generate API client from the backend's Zod schemas.
