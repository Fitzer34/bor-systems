# ZeroSlip — Full project cost breakdown

Updated 2026-05-21

All figures EUR unless marked otherwise. Quantity-pricing estimates assume
EU/Ireland sourcing for assembly + Chinese sourcing for raw components.

---

## Phase 1 — Prototype (right now, ~€350)

What you spend before you have anything sellable. One full set of hardware
end-to-end so you can demo + validate firmware.

| Item | Source | Cost |
|---|---|---|
| Heltec WiFi LoRa 32 V3 × 3 (2 hangers + 1 gateway) | TinyTronics | €90 |
| Samsung INR21700-50E 5000mAh × 2 | TinyTronics | €24 |
| 21700 battery holders × 2 | TinyTronics | €4 |
| JST 1.25mm cable pack (Heltec polarity) | Rokland | €7 |
| DRV5032FA Hall sensor (×5) | Mouser IE | €5 |
| Neodymium magnets 6×3mm (×10) | TinyTronics | €3 |
| 868MHz 5dBi SMA antenna + IPEX→SMA pigtail | Amazon UK | €17 |
| Qorvo DWM3001CDK dev kits × 2 (UWB) | Mouser IE | €160 |
| CR2032 cells + holders (×5) | TinyTronics | €10 |
| Plastic enclosure prototypes (3D-printed PETG) | DIY | €10 |
| Shipping to Ireland | — | ~€20 |
| **Total prototype** | | **~€350** |

---

## Phase 2 — Pilot (5 sites, ~€3,500)

5 friendly customer installs. No money changing hands yet — validates
product in real environments.

### Per-unit BOM at qty 100

| Item | Per hanger | Per sign tag | Per gateway |
|---|---|---|---|
| Board | €18 | €12 | €25 |
| Battery + holder | €8 | €1 | — |
| Sensor + magnet | €1 | €0.50 | — |
| Antenna | €2 | — | €15 |
| Power supply | — | — | €5 |
| Enclosure (3D printed) | €4 | €2 | €4 |
| Switches/LEDs/etc | €2 | — | — |
| **Per unit** | **€35** | **€15** | **€49** |

### Pilot total (5 sites × 10 hangers + 10 tags + 1 gateway each)

| | Per site | × 5 |
|---|---|---|
| Hangers | €350 | €1,750 |
| Sign tags | €150 | €750 |
| Gateway | €49 | €245 |
| Charging dock (Anker + cradle) | €60 | €300 |
| Install travel + spares | €100 | €500 |
| **Total pilot** | **€709** | **~€3,545** |

---

## Phase 3 — Production NRE (~€27,500 one-time)

Engineering investment before mass production. Pays for itself across
first batch of ~500 units.

| Item | Cost |
|---|---|
| Custom hanger PCB design (contract engineer) | €4,000 |
| Custom UWB tag PCB design | €4,000 |
| Hanger enclosure injection mould tooling | €8,000 |
| Sign tag enclosure injection mould tooling | €3,000 |
| Industrial design (CAD both enclosures) | €2,000 |
| Factory QC rig (jig + flashing station) | €1,500 |
| FCC + CE certifications (RF compliance) | €5,000 |
| **Total NRE** | **~€27,500** |

---

## Phase 4 — Production batch (500 hangers, ~€25,000)

First mass-produced batch. Real per-unit economics.

### Per-unit BOM at qty 1000

| Item | Per hanger | Per sign tag |
|---|---|---|
| Custom PCB | €12 | €8 |
| Battery | €6 | €0.30 |
| Sensor + magnet | €0.80 | €0.40 |
| Antenna | €1.50 | — |
| Enclosure (injection moulded ABS) | €3.50 | €1.20 |
| Misc components | €1.20 | — |
| Assembly + test | €4 | €1 |
| **Per unit** | **€29** | **€11** |

### First production batch

| Item | Qty | Cost |
|---|---|---|
| Hangers @ €29 | 500 | €14,500 |
| Sign tags @ €11 | 500 | €5,500 |
| Gateways @ €25 (at scale) | 50 | €1,250 |
| Labels + packaging | 500 | €750 |
| Logistics + warehousing | — | €3,000 |
| **Total first batch** | | **~€25,000** |

---

## Recurring software + cloud (~€50/mo)

| Service | Cost |
|---|---|
| Render web service (Starter, always-on) | €7/mo |
| Render Postgres (Basic 256MB) | €7/mo |
| Domain (.ie / .com) | €1/mo |
| Sentry error monitoring (Team) | €26/mo |
| Apple Developer Program (€99/yr) | €8/mo |
| Firebase FCM | €0 |
| APNs | €0 |
| GitHub (private repos free) | €0 |
| **Subtotal** | **~€50/mo** |

Google Play Developer: $25 one-off.

At 10k+ hangers, add ~€50/mo for Postgres Pro + read replicas.

---

## Legal + business one-offs (~€4-8k)

| Item | Cost | Timing |
|---|---|---|
| Terms of Service + Privacy Policy | €500-1,500 | Before first customer |
| Public liability insurance | €500-1,500/yr | Before first customer |
| Product liability insurance | €1,000-3,000/yr | Before production |
| Patent provisional (UK+IE via FRKelly) | €2,000-5,000 | BEFORE public demos |
| Patent full filing (year 2) | €8,000-15,000 | 12 months after provisional |
| Trademark "ZeroSlip" (UK+IE) | €500-1,000 | Before launch |
| Company incorporation | €50-300 | Before invoicing |
| Accountant | €600-1,500/yr | Year 1+ |
| **Pre-launch legal** | **~€4-8k** | |

---

## Launch + marketing (~€2-5k)

| Item | Cost |
|---|---|
| Marketing website (template + hosting) | €500-1,500 |
| App Store + Play Store assets | €500-1,000 |
| Logo + brand identity | €200-500 |
| Hanger labels (printed stickers) | €100-200 |
| Demo video for sales (or DIY) | €500-1,500 |
| **Subtotal** | **~€2-5k** |

---

## Grand total to ship at scale

| Phase | Investment |
|---|---|
| Prototype | ~€350 |
| Legal + patent (pre-demo) | €4,000-8,000 |
| Pilot phase (5 sites) | ~€3,500 |
| Marketing + launch | €2,000-5,000 |
| Production NRE | ~€27,500 |
| First production batch (500 units) | ~€25,000 |
| **TOTAL** | **~€63,000-70,000** |

Plus recurring ~€50/mo for cloud + Apple/Google fees.

---

## Unit economics for sales pricing

What you charge customers:

| Site size | BOM (your cost) | Install price | Recurring SaaS | Hardware margin |
|---|---|---|---|---|
| Small (10 hangers, 10 tags, 1 gw) | €510 | €1,500 | €30/mo | 66% |
| Medium (50 hangers, 50 tags, 2 gw) | €2,400 | €6,500 | €100/mo | 63% |
| Large (200 hangers, 200 tags, 5 gw) | €8,750 | €25,000 | €350/mo | 65% |

**Break-even**: ~15-20 medium customers OR 5-8 large ones recovers the
€63k investment. Realistic in year 1-2 with even modest sales effort.

---

## Cheapest viable path

If cash is tight, you can ship without UWB precision finding and skip
the €4k custom UWB PCB + €3k UWB enclosure tooling = **~€56k total**.
UWB becomes a premium v2 feature once base product is proven.
