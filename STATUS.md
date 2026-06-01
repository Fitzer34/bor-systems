# HazardLink — build status

_Last updated: 2026-05-31_

## ✅ END-TO-END PROVEN ON REAL HARDWARE

The complete product works, verified with a physical sensor trigger:

```
Sign sensor (GPIO6) → Hanger → LoRa (HMAC-signed) → Gateway
   → HTTPS → Cloud → openAlertForHanger() → Active alerts + floor-plan pin
```

Confirmed: jumper/reed on GPIO6 → OLED flips Sign ON/LIFTED → lift fires a
real alert that lands in the dashboard's Active alerts and lights the zone
pin on the uploaded floor plan.

## Live deployments

| Piece | URL / location | State |
|---|---|---|
| Web dashboard | https://app.hazardlink.ie | Live (Cloudflare Worker `hazardlink-app`; deploy: `cd web && npm run build && npx wrangler deploy`) |
| Marketing site | https://hazardlink.ie | Live (Cloudflare Worker `hazardlink-marketing`; deploy: `cd marketing/landing && npx wrangler deploy`) |
| Backend API | https://bor-systems-backend.onrender.com | Live (v0.1.7-suffix-match + later) |
| iOS app | iPhone 16 Pro Max | Installed (older build — needs rebuild for newest screens) |

## Real devices (clean dashboard)

- **Gateway** `Main gateway` (BOR3C0F02EADB342, MAC db:34) — wall adapter, Online
- **Hanger** `BOR3C0F02EADBF8E` (MAC db:f8) — battery, registered to owens house / ground / toilet

## Hardware wiring (Heltec V3 hanger)

- **Sign sensor → GPIO6** (NOT GPIO7 — GPIO7 isn't broken out on the V3).
  GPIO6 = bottom row, far-left near the buttons.
  - LOW (pulled to GND) = sign present → no alert
  - HIGH (floating, internal pull-up) = sign lifted → alert
- **DRV5032FA (TO-92)**: flat face toward you, legs down → **VCC · GND · OUT** (left→right).
  VCC→3V3, GND→GND, OUT→GPIO6. (Reed switch is simpler: 2 wires, GPIO6 + GND.)
- Battery: single-cell LiPo / 21700 on the JST 1.25mm (Rokland Heltec-polarity cable).

## Firmware notes

- Build with `firmware/flash.sh <gateway|hanger> [port]` — it sources
  `firmware/.env.local` (BOR_WEBHOOK_SECRET + BOR_LORA_HMAC_KEY) and refuses
  to flash if the 64-char HMAC key is missing. **Both gateway + hanger MUST
  share the same BOR_LORA_HMAC_KEY** or the gateway drops every packet.
- Hanger defaults to always-awake + OLED on (BOR_HANGER_DEEP_SLEEP flag off)
  because bare V3 boards misread VBUS sense. Flip it on for battery-deploy.
- Gateway OLED: "HazardLink Gateway / N devices connected / WiFi |||| -XX dBm".

## Known follow-ups (none blocking)

- [ ] **R2 storage for floor plans** — currently local disk on Render
      (ephemeral; plans vanish on redeploy). Wire Cloudflare R2 for durability.
- [ ] **Rebuild iOS app** — push newest screens (gateway/hanger detail, edit,
      location picker, register flow) to the iPhone via Xcode.
- [ ] **Hanger OTA** — hanger has no over-the-air update path; needs USB to
      reflash. Gateway already has OTA.
- [ ] **Hall sensor (TO-92) re-solder** — the soldered DRV5032 didn't switch
      (cold joint / magnet pole). Jumper + reed work fine; revisit with better
      light/tools or use a reed switch in production.
- [ ] **Firebase + FCM** (push notifications), **Google Play Console** signup.

## Major bugs fixed this build (firmware)

1. HMAC key mismatch — every device generated its own random key → gateway
   dropped all packets. Now a shared baked-in key via flash.sh.
2. V3.2 battery read — ADC_Ctrl polarity flipped between revisions; now reads
   both polarities and keeps the real one.
3. Hall sensor debounce — floating pin spammed ~1 pkt/sec; now 40ms stable.
4. forwardToCloud / heartbeat HTTPS — no timeouts → loop hung 120s on TLS;
   now setHandshakeTimeout(5) + connect/read timeouts.
5. **JSON shape** — gateway sent flat {dev_eui,…}; webhook wanted TTN shape
   (end_device_ids + base64 frm_payload). Was 400-ing every real packet.
6. Radio re-arm -705 — startReceive() after sleep needs standby() first.
7. Radio/WiFi contention — sleep the SX1262 around the HTTPS forward.
8. GPIO7 → GPIO6 — GPIO7 not exposed on the V3 header.

## Major bugs fixed this build (cloud/web)

- Webhook matches DevEUI by **suffix** (LoRa truncates to last 8 chars).
- Gateway registration skips the seed/demo orgs → lands in the real org.
- Pre-existing tsc errors were silently failing every Render deploy.
- SPA routing 404 on Workers → wrangler.toml not_found_handling=SPA.
- Floor-plan upload + `<img src>` used dev-only `/api` path → now apiUrl()
  + planSrc() prefix the Render origin in prod.
