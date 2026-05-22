# Zero Slip Systems — Wet Floor Sign Hanger Notification System

**Status:** Draft requirements (v0.1)
**Last updated:** 2026-05-06

## 1. Problem and goal

Cleaning staff in large buildings frequently leave wet floor signs on the floor after a spill is cleaned, where the signs themselves become the next trip hazard. Zero Slip Systems is an IoT product that holds wet floor signs in dedicated wall-mounted hangers; when a sign is lifted, the system notifies cleaners (with floor and zone) via mobile and web apps, and only closes the alert when the sign is physically returned.

## 2. Scope

**In scope (v1):**
- Battery-powered, wall-mounted hangers, one per zone.
- Detection of sign lifted / sign returned.
- Push notifications to Android and iOS, plus a web dashboard.
- Floor-plan and named-zone display in the app.
- Acknowledgement, escalation, manual closure (damaged/missing), reporting.
- Admin / Supervisor / Cleaner roles.
- 24/7 operation with per-user on/off-duty toggle.

**Out of scope (v1):**
- Tracking the sign itself once it has been removed from the hanger.
- Sensors beyond the microswitch (e.g. spill detection on the floor).
- Multi-tenant SaaS for unrelated buildings (single-tenant for now).
- Integration with third-party building management systems.

## 3. Operating environment

- **Geography:** Ireland and the UK. LoRaWAN region: **EU868**.
- **Building:** up to 100 m × 100 m footprint, 2–10 floors, solid concrete with steel construction, basements without WiFi.
- **WiFi:** present in office areas only; not building-wide. No wired internet.
- **Initial deployment scale:** 12 zones, must extend to many more.

## 4. System architecture

```
   [Hanger node]  --LoRaWAN-->  [LoRaWAN Gateway]  --WiFi/4G-->  [Cloud]
   (×12+)                       (1, possibly 2)                  ├── LoRaWAN Network Server (TTS)
                                                                 ├── Application backend (API)
                                                                 ├── Postgres (events, users, config)
                                                                 ├── Push (FCM)
                                                                 ├── SMS provider (e.g. Twilio)
                                                                 └── Email (SMTP/SES)

   [Mobile app] (iOS + Android)  <--HTTPS/push-->  [Application backend]
   [Web dashboard]               <--HTTPS-->        [Application backend]
```

### 4.1 Why LoRaWAN

Sub-GHz LoRa penetrates concrete and steel reliably, where WiFi and cellular often fail (basements). It supports many years of battery life on event-driven nodes, has a mature ecosystem (LoRaWAN, The Things Stack), and one well-sited gateway typically covers a 100×100 m, 10-floor building. WiFi mesh, Zigbee/Thread, and per-node cellular were considered and rejected.

## 5. Hardware

### 5.1 Hanger node (prototype)

| Item | Choice | Notes |
|---|---|---|
| MCU + LoRa radio | **RAK Wisblock — RAK3172 / STM32WLE5 core** | Modular kit; same chipset is used in the production PCB later |
| Antenna | **Short external whip (3–5 cm)** | Internal antenna inside a wall-bolted box would hurt range significantly given concrete + steel |
| Sign-detection | **Microswitch** on the hanger arm | Wakes MCU on state change via GPIO interrupt |
| Status LED | RGB or 3-colour discrete LED | Off when idle (energy-driven), red on alert, green on test, amber blink for low battery |
| Test button | Momentary pushbutton, front face | Press → green LED 5 s confirms power |
| Audible alarm | Optional piezo buzzer | Configurable per-hanger on/off (some sites won't tolerate audio) |
| Battery | **2 × AA lithium (Energizer Ultimate Lithium)** | Months-to-years life given Class A LoRa duty cycle |
| Enclosure | Plastic, wall-mountable, prototype 3D-printed | Production: injection moulded |

### 5.2 Gateway

| Item | Choice | Notes |
|---|---|---|
| Gateway | **RAK7268 (or equivalent) with cellular module** | LoRaWAN concentrator, EU868 |
| Backhaul | **WiFi primary + 4G failover** | Gateway acts as backhaul client only — NOT a WiFi access point |
| Power | Mains, with **internal Li-ion UPS** | Survives short power outages; low-battery alert sent to app |
| Buffering | Local event buffer | If both WiFi and 4G drop, events are stored and replayed on reconnect; backend raises a "connectivity restored" alert when it resumes |
| Placement | Central location with WiFi (e.g. IT room, manager's office on a middle floor) | One gateway likely covers whole building; second added if RF survey shows dead spots |

### 5.3 Productisation path

Phase 1 prototype uses RAK Wisblock for speed. Production hangers will be a custom PCB built around the same STM32WLE5 SoC, with the same firmware, in an injection-moulded enclosure. No re-architecture between prototype and production.

## 6. Hanger firmware — state machine

| State | Trigger to enter | LED | Radio behaviour |
|---|---|---|---|
| **Idle** | Power-on, or sign returned (microswitch closed) | Off (green only on test button press, 5 s) | Deep sleep; wake on interrupt or 24 h timer |
| **Alert** | Microswitch opens (sign lifted) | Solid red | Send `lifted` uplink immediately; resend periodically until cleared (configurable, default every 5 min while alerting) |
| **Cleared** | Microswitch closes (sign returned) | Off | Send `returned` uplink, then transition to Idle |
| **Heartbeat** | 24 h timer | — | Send `heartbeat` uplink with battery % |
| **Low battery** | Battery below threshold | Amber blink on test press only | Battery % rides on every uplink; backend issues "low battery" alert when threshold crossed |

## 7. Connectivity — LoRaWAN payload

Compact binary payload to keep airtime within EU868 fair-use limits.

**Uplink (hanger → cloud):**

| Bytes | Field | Notes |
|---|---|---|
| 1 | `event_type` | `0x01` lifted, `0x02` returned, `0x03` heartbeat, `0x04` low_battery |
| 1 | `battery_pct` | 0–100 |
| 1 | `firmware_version` | minor.major packed |
| 1 | `flags` | bit 0 = test button pressed since last uplink, others reserved |

Hanger identity is the LoRaWAN DevEUI; zone/floor is mapped to DevEUI in the backend (set at onboarding via QR scan), so the device itself never needs to know its zone.

**Downlink (cloud → hanger), reserved for future:**
- Update resend interval, audible-alarm enable, firmware update trigger.

## 8. Backend

| Component | Choice | Why |
|---|---|---|
| LoRaWAN Network Server | **The Things Stack** (Community for prototype, self-hosted/paid for production) | Standard, free for prototype, EU-region |
| Application backend | **Node.js** (Fastify) or **Python** (FastAPI) — TBD | REST + WebSocket API for app/web; MQTT/webhook subscriber to TTS |
| Database | **Postgres** | Events, users, config, audit log; hosted in EU |
| Push notifications | **Firebase Cloud Messaging** | One integration covers iOS + Android |
| SMS | **Twilio** (or Vonage) | For escalation only |
| Email | **SES** or SMTP | For escalation and admin notifications |

### 8.1 Core data model (sketch)

- `building`, `floor`, `zone`
- `hanger` — DevEUI, current zone_id (nullable if decommissioned), state, battery_pct, last_seen_at, audible_alarm_enabled, status (active/decommissioned/out_of_service)
- `floor_plan` — image asset per floor, plus pin coordinates per zone
- `event` — hanger_id, event_type, battery_pct, received_at
- `alert` — hanger_id, opened_at, acknowledged_at, acknowledged_by, closed_at, closure_reason (`sign_returned`, `damaged`, `missing`, `manual`)
- `user` — id, email, name, role (admin / supervisor / cleaner), on_duty_now, created_by
- `notification_log` — alert_id, channel (push/sms/email), recipient_user_id, sent_at, kind (alert / re-broadcast / escalation)
- `audit_log` — actor_id, action, target, timestamp (for GDPR + accountability)

### 8.2 Alert and escalation flow

1. Hanger sends `lifted` uplink → backend opens `alert`, push-notifies all on-duty cleaners.
2. First cleaner taps **"I'm on it"** → `alert.acknowledged_by` set; other cleaners see "in progress".
3. If sign **not physically returned** within configurable timer (default **15 min**):
   - Re-broadcast push to all on-duty cleaners.
   - Escalate to all on-duty supervisors via push **and** SMS **and** email.
4. Closure modes:
   - **Sign returned** (microswitch closes) → `alert` closes, reason `sign_returned`.
   - Cleaner taps **"Sign damaged"** or **"Sign missing"** → spill alert closes with that reason; new alert opens to admins/supervisors: "Sign needs replacing — Floor X, Zone Y". Hanger goes `out_of_service` until an admin marks it back in service.
   - Admin/supervisor can **manually close** any alert with a typed reason (logged).

## 9. Mobile app (iOS + Android)

- Built once with **React Native** (or Flutter — to be decided in build phase).
- **Login** with admin-issued credentials (no self-signup).
- **Dashboard:** active alerts, sorted newest-first with oldest highlighted; per-floor tabs.
- **Floor plan view:** if uploaded, shows pins (green=idle, red=alert) on the plan; tap a pin to drill in.
- **Named zones fallback:** if no plan uploaded, list zones as text ("Floor 3 — Kitchen North").
- **Alert detail:** floor, zone, time of lift, time since, "I'm on it" button, "Sign damaged" / "Sign missing" buttons.
- **On/off-duty toggle.** Off-duty users receive nothing.
- **Settings:** notification preferences (within what the role allows), language.
- **Languages:** UK English default; downloadable language packs from a server-hosted library.

## 10. Web dashboard

- Same login as mobile.
- Same alert / floor-plan views.
- **Admin section** (admin role only):
  - User management (create, role assignment, deactivate, immediate data erasure for GDPR).
  - Hanger management: register (QR scan via webcam or manual DevEUI entry), assign to zone, decommission, recommission, relocate, toggle audible alarm.
  - Floor plan upload (PNG/JPG) and pin placement.
  - Resolution timer configuration.
  - Reporting (see §12).

## 11. User roles and auth

| Role | Can do |
|---|---|
| **Admin** (master) | Everything: create users, assign roles, manage hangers, upload floor plans, view all reports, GDPR erasure |
| **Supervisor** | Receive escalations; relocate hangers; view all reports; mark sign replaced; manual close |
| **Cleaner** | Receive alerts; acknowledge; mark damaged/missing; toggle own duty status |

Auth: email + password (admin-issued), bcrypt or argon2 hash. JWT access tokens with refresh. Optional TOTP 2FA for admins (post-v1).

## 12. Reporting

Available to admins and supervisors:
- Spill events per zone (count, time of day, day of week).
- Per-spill response time = (`acknowledged_at` − `opened_at`).
- Per-spill resolution time = (`closed_at` − `opened_at`).
- Escalation count and reasons.
- Hanger uptime / battery health / "out of service" history.
- Export as CSV.

## 13. GDPR and privacy

- **Hosting:** all data stored in EU-region infrastructure.
- **Retention:**
  - Event and alert history: 12 months, then auto-purge.
  - User accounts: 24 months after deactivation, then full delete.
- **Right to erasure:** admins can trigger immediate deletion of a specific user's PII; events stay (anonymised — actor recorded as `[deleted user]`).
- **Privacy notice:** in-app at first login, also in web dashboard footer.
- **Audit log:** records role changes, manual alert closures, decommissions, data exports, erasure events.
- **Minimum data:** we collect name, email, role, duty status, alerts acknowledged/closed. We do not collect location, biometrics, or device identifiers beyond what FCM requires.

## 14. Phasing

| Phase | Hardware | Scope | Goal |
|---|---|---|---|
| **1 — Prototype** | 1 gateway + 2 hangers (RAK Wisblock) | TTS Community + minimal backend + 1 mobile target | Prove range through concrete, end-to-end alert path, battery life curve |
| **2 — Pilot** | 1–2 gateways + 12 hangers | Full backend, both mobile platforms, web dashboard | Real install in target building; RF survey; refine timers and UX |
| **3 — Production** | Custom PCB, moulded enclosure, hardened backend | Self-hosted / paid network server, monitoring, 24/7 ops | Scale to additional buildings if successful |

## 15. Known unknowns / decisions to revisit

- Mobile framework: **React Native vs Flutter** — defer until build phase.
- Backend language: **Node.js (Fastify) vs Python (FastAPI)** — defer until build phase.
- Number of gateways: **1 vs 2** — RF survey at pilot will decide.
- Custom PCB vs Wisblock at production — depends on volume and unit-cost target.
- 2FA for admin accounts — post-v1.
- Multi-building / multi-tenant — post-v1.
