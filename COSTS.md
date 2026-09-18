# HazardLink: full project cost breakdown

Updated 2026-09-18 (the Phase 1 parts were checked against what was actually bought; every price in this file is still the estimate from 2026-05-21)

All figures EUR unless marked otherwise. Quantity-pricing estimates assume
EU/Ireland sourcing for assembly + Chinese sourcing for raw components.

---

## Phase 1: Prototype (May estimate, ~€350)

What you spend before you have anything sellable. One full set of hardware
end-to-end so you can demo + validate firmware.

The Item, Source and Cost columns are the May estimate, and the total is the sum of that Cost column. The last column
says what was bought in the end. Prices actually paid are on the order confirmations and are not copied here, so treat
~€350 as the plan and read the real spend off the confirmations. `SHOPPING.md` has the full list of what was bought.

| Item in the May estimate | Source | Cost | What was actually bought |
|---|---|---|---|
| Heltec WiFi LoRa 32 V3 × 3 (2 hangers + 1 gateway) | TinyTronics | €90 | 6 boards delivered |
| Samsung INR21700-50E 5000mAh × 2 | TinyTronics | €24 | Superseded. The hanger takes an 18650: 4 x Murata US18650VTC6 delivered |
| 21700 battery holders × 2 | TinyTronics | €4 | Superseded. 4 x BeiLaMoo BH18650-PC2 holders (18650, solder pins) delivered |
| JST 1.25mm cable pack (Heltec polarity) | Rokland | €7 | Not recorded as bought yet. One cable per hanger joins the battery holder to the board |
| DRV5032FA Hall sensor (×5) | Mouser IE | €5 | 25 x TI DRV5032FALPG from DigiKey. Same DRV5032FA sensor, in the bare flat 3-leg package the hook bar is cut for (the SOT-23 version does not fit) |
| Neodymium magnets 6×3mm (×10) | TinyTronics | €3 | 14 x XMP 6 x 2 mm N52 delivered |
| 868MHz 5dBi SMA antenna + IPEX→SMA pigtail | Amazon UK | €17 | |
| Qorvo DWM3001CDK dev kits × 2 (UWB) | Mouser IE | €160 | Not part of the v1 hanger build, which finds a sign over BLE with the Heltec board's own radio. The kits were bought separately on a DigiKey order, see `docs/UWB_PLAN.md` for where that work stands |
| CR2032 cells + holders (×5) | TinyTronics | €10 | `SHOPPING.md` later swapped these for LiPo cells. 4 x PKCELL LiPo 350 mAh were delivered |
| Plastic enclosure prototypes (3D-printed PETG) | DIY | €10 | Test parts are printed in PLA (Polymaker PolyLite). PET-G is for units that go on a wall |
| Shipping to Ireland | | ~€20 | |
| **Total prototype (May estimate)** | | **~€350** | |

Bought since, outside the May estimate: 6 x Gebildet 16 mm momentary push buttons (LED, waterproof) from Amazon UK. Since
enclosure v9.9 this is the cleaning-mode button. One is fitted under the base of each hanger, through a 16.4 mm hole in the
bottom wall of the hanger body, pointing down above the hook bar and out of sight from the front. Two are used for the two
prototype hangers and four are spare. Price on the order confirmation. The firmware reserves GPIO3 for this button
(`TEST_BUTTON_PIN = 3` in `firmware/include/pinout.h`) but does not act on a press yet, so that firmware work is still to
be done and is not costed here.

The button is long (40.6 mm behind its head with its plug-in wire socket on), so in v9.9 the hanger box grew downward by
41 mm to make room for it under the battery: the hanger body is now 171 mm tall (it was 130). The taller body, lid and
backplate use more filament than the €10 printing line above allowed for. That line has not been re-estimated.

Still to buy, with no price recorded: thin hook-up wire for the sensor lead and the board's tails, one 0.1 uF capacitor
per Hall sensor (TI's datasheet recommends it), thin heat shrink, one small cable tie per hanger, a clear 36 x 19.5 x 1 mm
pane for the gateway lid, and the wall screws and plugs. Two more things are optional: small wire-to-wire plug and socket
pairs (a 3-way pair for the sensor lead and a 2-way pair for the two button wires, per hanger), which only keep the board
removable, with soldered and sleeved joins as the fallback, and a spool of white PLA if the lids are to have white
writing. `SHOPPING.md` lists all of them under "Things the build needs that are not on any order below". None of these
is in the ~€350.

---

## Phase 2: Pilot (5 sites, ~€3,500)

5 friendly customer installs. No money changing hands yet. This phase validates
the product in real environments.

### Per-unit BOM at qty 100

| Item | Per hanger | Per sign tag | Per gateway |
|---|---|---|---|
| Board | €18 | €12 | €25 |
| Battery + holder | €8 | €1 | none |
| Sensor + magnet | €1 | €0.50 | none |
| Antenna | €2 | none | €15 |
| Power supply | none | none | €5 |
| Enclosure (3D printed) | €4 | €2 | €4 |
| Switches/LEDs/etc | €2 | none | none |
| **Per unit** | **€35** | **€15** | **€49** |

The per-hanger column was estimated in May, before the cleaning-mode button was added and before the hanger box grew to
171 mm tall. The button's price is on the Amazon order confirmation and has not been worked into the €35.

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

## Phase 3: Production NRE (~€27,500 one-time)

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

## Phase 4: Production batch (500 hangers, ~€25,000)

First mass-produced batch. Real per-unit economics.

### Per-unit BOM at qty 1000

| Item | Per hanger | Per sign tag |
|---|---|---|
| Custom PCB | €12 | €8 |
| Battery | €6 | €0.30 |
| Sensor + magnet | €0.80 | €0.40 |
| Antenna | €1.50 | none |
| Enclosure (injection moulded ABS) | €3.50 | €1.20 |
| Misc components | €1.20 | none |
| Assembly + test | €4 | €1 |
| **Per unit** | **€29** | **€11** |

### First production batch

| Item | Qty | Cost |
|---|---|---|
| Hangers @ €29 | 500 | €14,500 |
| Sign tags @ €11 | 500 | €5,500 |
| Gateways @ €25 (at scale) | 50 | €1,250 |
| Labels + packaging | 500 | €750 |
| Logistics + warehousing | | €3,000 |
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
| Trademark "HazardLink" (UK+IE) | €500-1,000 | Before launch |
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
