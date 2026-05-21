# BOR Systems — Prototype shopping list

Updated 2026-05-21

Everything needed to build 2 hangers + 1 gateway + 2 UWB tag prototypes.
**Total: ~€363** across 4 suppliers.

---

## Order #1 — TinyTronics (Netherlands) — ~€136

Best value for batteries + boards. Ships to Ireland in 3-5 days.

| Item | Qty | Link | Price |
|---|---|---|---|
| Heltec WiFi LoRa 32 V3 (868 MHz) | 3 | https://www.tinytronics.nl/en/development-boards/microcontroller-boards/with-lora/heltec-wifi-lora-32-esp32-s3-sx1262-with-0.96-inch-oled-display | €90 |
| Samsung INR21700-50E 5000mAh | 2 | https://www.tinytronics.nl/en/power/batteries/21700/samsung-inr21700-50e-5000mah-9.8a | €24 |
| 21700 battery holder | 2 | https://www.tinytronics.nl/en/power/battery-holders | €4 |
| Neodymium magnets 6×3mm | 1 pack (10) | https://www.tinytronics.nl/en/mechanics-and-actuators/magnets | €3 |
| LiPo 500mAh with JST PH 2.0 (for UWB tags — rechargeable via USB-C on DWM3001CDK) | 3 | https://www.tinytronics.nl/en/power/batteries/lipo/lipo-battery-3.7v-500mah-jst-ph-connector | €21 |
| Shipping to Ireland | — | — | €10 |
| **Subtotal** | | | **€152** |

## Order #2 — Mouser Ireland — ~€175

UWB dev kits + Hall sensor. 3-5 day delivery.

| Item | Qty | Link | Price |
|---|---|---|---|
| Qorvo DWM3001CDK dev kit (UWB) | 2 | https://www.mouser.ie/c/?q=DWM3001CDK | €160 |
| TI DRV5032FADBZR Hall sensor | 1 pack (5) | https://www.mouser.ie/ProductDetail/Texas-Instruments/DRV5032FADBZR | €5 |
| Shipping | — | — | €10 |
| **Subtotal** | | | **€175** |

## Order #3 — Rokland (US) — ~€22

Heltec-polarity JST cables. Don't substitute — wrong polarity fries the board.
US shipping to Ireland: 1-2 weeks. Place this order FIRST so it arrives in time.

| Item | Qty | Link | Price |
|---|---|---|---|
| JST 1.25mm 2-pin cable (Heltec polarity, 5-pack) | 1 | https://store.rokland.com/products/battery-connector-cables-battery-wires-jst-1-25-5pcs-for-lilygo-and-heltec | €7 |
| Shipping | — | — | €15 |
| **Subtotal** | | | **€22** |

## Order #4 — Amazon UK — ~€30

Gateway antenna upgrade. Free delivery to Ireland, 1-3 days.

| Item | Qty | Link | Price |
|---|---|---|---|
| 868MHz 5dBi SMA antenna | 1 | https://www.amazon.co.uk/s?k=868mhz+5dbi+antenna+sma | €12 |
| IPEX (U.FL) to SMA pigtail | 1 | https://www.amazon.co.uk/s?k=ipex+ufl+to+sma+pigtail+cable+15cm | €8 |
| USB-C 5V power supply (gateway) | 1 | https://www.amazon.co.uk/s?k=anker+usb-c+charger+20w | €10 |
| **Subtotal** | | | **€30** |

---

## Timing strategy

To minimise dead time:

1. **TODAY**: Place Orders 2 + 3 (longest leads)
2. **TODAY**: Place Order 4 (arrives fastest)
3. **TOMORROW**: Place Order 1 (TinyTronics)

All parts arrive within 1 week, longest is Rokland at 2 weeks.

---

## What you'll build

After all 4 orders arrive:

- 2 × prototype hangers (Heltec + battery + Hall + magnets)
- 1 × gateway (Heltec + antenna + USB-C plug)
- 2 × UWB tag prototypes (DWM3001 dev kits)
- All cabling + spares + 5 future hangers' worth of sensors/magnets

Enough to demo the full system end-to-end including AirTag-style
precision finding.

---

## Optional later (not needed for prototype)

- 3D-printed enclosures: JLCPCB (~€8/enclosure)
  https://jlcpcb.com/3d-printing-service
- Anker 6-port USB-C charger (for charging dock): ~€40 on Amazon
- Spare Heltec boards (€18 each from Heltec AliExpress at qty 10+)
- Tile/Chipolo-style off-shelf BLE tags (skip — going custom with DWM3001)
