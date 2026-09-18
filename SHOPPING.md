# HazardLink prototype shopping list

Updated 2026-09-18

Everything needed to build 2 hangers + 1 gateway.

The order tables further down are the May plan with its estimated prices, about €198 in total once the UWB kits and their LiPo cells were taken out. Several parts changed between that plan and what was bought, so read "What has been bought" first. The prices actually paid are on the order confirmations and are not copied here.

> **Update:** UWB tags (Qorvo DWM3001CDK) dropped from v1. Mouser has a
> 26-week lead time globally due to the post-AirTag chip allocation
> squeeze. We now do "Find Sign" via BLE proximity, which the Heltec
> board already has built-in. UWB returns as an upgrade once supply
> recovers (est. mid-2027).

---

## What has been bought

The enclosures in `hardware/enclosures/v9` are sized for these parts. Nothing in that design is 21700.

| Part | Qty | Supplier | Notes |
|---|---|---|---|
| Heltec WiFi LoRa 32 V3, 868 MHz | 6 | TinyTronics, order 660112 | Delivered (packing slip photographed 2026-09-18) |
| Murata US18650VTC6 cell (18650, 3120 mAh) | 4 | TinyTronics, order 660112 | Delivered. One per hanger |
| BeiLaMoo BH18650-PC2 holder, sold as "1x 18650 Battery holder for PCB" | 4 | TinyTronics, order 660112 | Delivered. 77.7 x 20.9 x 21.3 mm, one solder pin at each end. One per hanger |
| XMP neodymium disc magnet, 6 x 2 mm, N52 | 14 | TinyTronics, order 660112 | Delivered. One goes in each sign, over the Hall sensor |
| PKCELL LiPo 350 mAh, LP552035 | 4 | TinyTronics, order 660112 | Delivered. Nothing in the v9 hanger or gateway enclosure is sized for this cell |
| TI DRV5032FALPG Hall sensor | 25 | DigiKey | Bought. This is the DRV5032FA in the bare flat 3-leg package (TO-92 style, body about 4.1 x 3.0 x 1.5 mm), which is the part the v9 hook bar is cut for. It is soldered straight to its three wires with no carrier board. It is omnipolar, so either pole of the magnet works |
| Gebildet 16 mm momentary push button with LED, waterproof | 6 | Amazon UK | Bought. For a cleaning-mode button underneath the hanger's base, above the hook bar, where the public will not see it. That is planned for a later enclosure revision. The current enclosure (v9.8) has no hole for it, so do not fit it yet |

Two things each hanger needs that are not on any order below:

- The sensor's two retaining pins are offcuts of the 2.85 mm printer filament, cut 6.0 to 6.5 mm long. Nothing to buy.
- An SMA bulkhead pigtail and a stubby SMA antenna (about 9.5 mm diameter and 47 mm long) go inside each hanger. Owen has these in hand, and the enclosure was sized from his ruler photo of them. The supplier and quantity are not recorded here, so check there is one set per hanger.

Also have some thin heat shrink on the bench for the three solder joints on the sensor's legs.

---

## Order #1: TinyTronics (Netherlands), delivered as order 660112

Best value for batteries + boards. Ships to Ireland in 3-5 days.

This table is the May plan. The last column says what came instead.

| Item in the May plan | Qty | Link | Estimated price | What was delivered |
|---|---|---|---|---|
| Heltec WiFi LoRa 32 V3 (868 MHz) | 3 | https://www.tinytronics.nl/en/development-boards/microcontroller-boards/with-lora/heltec-wifi-lora-32-esp32-s3-sx1262-with-0.96-inch-oled-display | €90 | 6 boards |
| Samsung INR21700-50E 5000mAh | 2 | do not order | €24 | Superseded. The v9 hanger takes an 18650: 4 x Murata US18650VTC6 were delivered |
| 21700 battery holder | 2 | do not order | €4 | Superseded. 4 x BeiLaMoo BH18650-PC2 holders (18650, solder pins) were delivered |
| Neodymium magnets 6 x 3 mm | 1 pack (10) | https://www.tinytronics.nl/en/mechanics-and-actuators/magnets | €3 | 14 x XMP 6 x 2 mm N52. The magnet datum in the v9 design is for the 6 x 2 mm disc |
| LiPo 500mAh with JST PH 2.0 (for UWB tags, rechargeable via USB-C on DWM3001CDK) | 3 | https://www.tinytronics.nl/en/power/batteries/lipo/lipo-battery-3.7v-500mah-jst-ph-connector | €21 | 4 x PKCELL LiPo 350 mAh LP552035 |
| Shipping to Ireland | | | €10 | |
| **Subtotal (May estimate)** | | | **€152** | |

## Order #2: DigiKey, bought

Hall sensors for the lift detection.

| Item | Qty | Link | Price |
|---|---|---|---|
| TI DRV5032FALPG Hall sensor (DRV5032FA, bare 3-leg TO-92 style package) | 25 | https://www.digikey.ie/en/products/result?keywords=DRV5032FALPG | on the order confirmation |

Order the part number ending in LPG. The DRV5032FADBZR that the May plan listed is the same sensor in the SOT-23 surface-mount package. It is far smaller than the nest in the v9 hook bar and would slip between the two retaining pins, so it cannot be used in these bars.

In May this slot was a Mouser Ireland order estimated at €175: 2 x Qorvo DWM3001CDK UWB dev kits (€160, dropped from v1, see the update above), 1 pack of 5 x TI DRV5032FADBZR (€5) and €10 shipping.

## Order #3: Rokland (US), about €22

Heltec-polarity JST cables. Don't substitute, because the wrong polarity fries the board.
US shipping to Ireland: 1-2 weeks. Place this order FIRST so it arrives in time.

| Item | Qty | Link | Price |
|---|---|---|---|
| JST 1.25mm 2-pin cable (Heltec polarity, 5-pack) | 1 | https://store.rokland.com/products/battery-connector-cables-battery-wires-jst-1-25-5pcs-for-lilygo-and-heltec | €7 |
| Shipping | | | €15 |
| **Subtotal** | | | **€22** |

## Order #4: Amazon UK, about €30 plus the buttons

Gateway antenna upgrade. Free delivery to Ireland, 1-3 days.

| Item | Qty | Link | Price |
|---|---|---|---|
| 868MHz 5dBi SMA antenna | 1 | https://www.amazon.co.uk/s?k=868mhz+5dbi+antenna+sma | €12 |
| IPEX (U.FL) to SMA pigtail | 1 | https://www.amazon.co.uk/s?k=ipex+ufl+to+sma+pigtail+cable+15cm | €8 |
| USB-C 5V power supply (gateway) | 1 | https://www.amazon.co.uk/s?k=anker+usb-c+charger+20w | €10 |
| **Subtotal** | | | **€30** |

Bought separately on Amazon UK, outside the May estimate:

| Item | Qty | Link | Price |
|---|---|---|---|
| Gebildet 16 mm momentary push button with LED, waterproof (cleaning-mode button, for a later enclosure revision) | 6 | https://www.amazon.co.uk/s?k=gebildet+16mm+momentary+push+button+led+waterproof | on the order confirmation |

---

## Timing strategy

Written in May, when Order 2 was the Mouser order. Order 1 has since been delivered, and the Hall sensors (now Order 2, DigiKey) and the push buttons have been bought.

To minimise dead time:

1. **TODAY**: Place Orders 2 + 3 (longest leads)
2. **TODAY**: Place Order 4 (arrives fastest)
3. **TOMORROW**: Place Order 1 (TinyTronics)

All parts arrive within 1 week, longest is Rokland at 2 weeks.

---

## What you'll build

After all 4 orders arrive:

- 2 × prototype hangers (Heltec + 18650 cell in its holder + Hall sensor + magnet)
- 1 × gateway (Heltec + antenna + USB-C plug)
- All cabling, plus spare sensors and magnets for future hangers (25 sensors and 14 magnets were bought)

Enough to demo the full system end-to-end. UWB tag prototypes are no longer part of these
orders (see the update at the top). `docs/UWB_PLAN.md` lists DWM3001CDK dev kits on a separate
DigiKey order, so check that document for where the UWB work stands.

---

## Optional later (not needed for prototype)

- 3D-printed enclosures: JLCPCB (~€8/enclosure)
  https://jlcpcb.com/3d-printing-service
- Anker 6-port USB-C charger (for charging dock): ~€40 on Amazon
- Spare Heltec boards (€18 each from Heltec AliExpress at qty 10+)
- Tile/Chipolo-style off-shelf BLE tags (skip, going custom with DWM3001)
