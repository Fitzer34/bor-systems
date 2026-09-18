# HazardLink prototype shopping list

Updated 2026-09-18

The bought parts for 2 hangers + 1 gateway, followed by a short list of small things the build still needs that are on no order.

The order tables further down are the May plan with its estimated prices, about €198 in total once the UWB kits and their LiPo cells were taken out. Several parts changed between that plan and what was bought, so read "What has been bought" first. The prices actually paid are on the order confirmations and are not copied here.

> **Update:** UWB tags (Qorvo DWM3001CDK) are not part of the v1 hanger
> build, which does "Find Sign" over BLE proximity with the Heltec
> board's own radio. The DWM3001CDK kits were bought separately on a
> DigiKey order; see `docs/UWB_PLAN.md` for where that work stands.

---

## What has been bought

The enclosures in `hardware/enclosures/v9` are sized for these parts. Nothing in that design is 21700.

| Part | Qty | Supplier | Notes |
|---|---|---|---|
| Heltec WiFi LoRa 32 V3, 868 MHz | 6 | TinyTronics, order 660112 | Delivered (packing slip photographed 2026-09-18). A new board runs the maker's demo. It has to be flashed with the HazardLink firmware from the repository's `firmware` folder before the unit can report anything, see "Firmware on a new board" below |
| Murata US18650VTC6 cell (18650) | 4 | TinyTronics, order 660112 | Delivered. One per hanger |
| BeiLaMoo BH18650-PC2 holder, sold as "1x 18650 Battery holder for PCB" | 4 | TinyTronics, order 660112 | Delivered. 77.7 x 20.9 x 21.3 mm, one solder pin at each end. One per hanger. Its pins end up behind it, so the battery wires are soldered on BEFORE it is pressed into the box. Thread the two wires down through the bulkhead first, see Order #3 |
| XMP neodymium disc magnet, 6 x 2 mm, N52 | 14 | TinyTronics, order 660112 | Delivered. One goes in each sign, over the Hall sensor (the small magnetic sensor in the hook bar that tells the unit the sign has been lifted) |
| PKCELL LiPo 350 mAh, LP552035 | 4 | TinyTronics, order 660112 | Delivered. Nothing in the v9 hanger or gateway enclosure is sized for this cell |
| TI DRV5032FALPG Hall sensor | 25 | DigiKey | Bought. This is the DRV5032FA in the bare flat 3-leg package (TO-92 style, body about 4.1 x 3.0 x 1.5 mm), which is the part the v9 hook bar is cut for. It is soldered straight to its three wires with no carrier board. It is omnipolar, so either pole of the magnet works. Owen's sensors are marked 32FA. Which leg is which is confirmed, see Order #2 |
| Gebildet 16 mm momentary push button with LED, waterproof | 6 | Amazon UK | Bought, and now used. Since enclosure v9.9 this is the cleaning-mode button, one per hanger, so two are used here and four are spare. See "The cleaning-mode button" just below |

### The cleaning-mode button

The button goes UNDER the base of the hanger, through a 16.4 mm hole in the bottom wall of the hanger body, on the right-hand side behind the right latch arm. It points down, above the hook, where the public cannot see it from the front. A cleaner reaches under the box from the right-hand side and presses it upward. There is about 26.8 mm between the button's face and the hook for a finger.

What the part is, from Owen's caliper photos: M16 thread, a head 18.2 mm across and 3.2 mm high, 15 mm of threaded metal body behind the head, then a blue plug-in wire socket 25.6 mm long with five wires leaving its end. That makes 40.6 mm behind the head in all. It comes with its own nut.

To make room for that length under the battery, the hanger box grew downward by 41 mm in v9.9: the hanger body is now 171 mm tall (it was 130). The gateway did not change.

Fitting, in short: push the bare button up through the hole from below, put its nut on from inside and tighten it, then plug the blue socket onto the button's pins from inside. The socket will not pass through the hole, so it always goes on last. The full steps and the wire route are in the v9 README.

The five wires. Only TWO of them are used: the two switch wires. Find them on the bench with a meter set to continuity (the beep setting), by trying the wires in pairs until one pair beeps only while the button is held in. Go by the meter, because the wire colours are not recorded anywhere in this project. Those two go up to the board, one to GND and one to GPIO3, either way round. The other three are folded back, their bare ends covered with heat shrink or tape, and tucked down in the bay under the battery, connected to nothing. Deal with all five BEFORE the battery holder is pressed in: they leave the top of the socket pointing up at the place where the holder goes. Check that the two switch wires reach the join below the board, and lengthen them with hook-up wire if they do not.

The voltage of the button's LED is not recorded anywhere in this project. Leave the LED wires unconnected until it has been checked against the seller's listing.

Firmware status: `firmware/include/pinout.h` reserves `TEST_BUTTON_PIN = 3` (GPIO3) as the cleaning-mode trigger, and `firmware/src/hanger/hanger.cpp` sets that pin up as an input with a pull-up. The hanger's main loop does not act on a press yet, so the firmware support for the button is still to be written. Until it is, pressing the button changes nothing on the unit. The check for the wiring is a meter on continuity across the two switch wires where they come up through the bulkhead (the thick shelf across the inside of the box above the battery): it must beep only while the button under the box is pressed.

### Firmware on a new board

A Heltec board comes from the maker running the maker's own demo. Before a hanger or a gateway can report anything, its board has to be flashed with the HazardLink firmware from the repository's `firmware` folder, which is a PlatformIO project (`firmware/platformio.ini`) with a build for the hanger and one for the gateway. The flashing steps are in `firmware/README.md` under "Build + flash", and `firmware/flash.sh` is the helper script that goes with them. The commands are kept in those two files and are not copied here.

### Things the build needs that are not on any order below

Check each of these is in hand before starting, because none of them is on an order. The two marked Optional can be left out:

- Thin hook-up wire (thin, flexible, insulated wire) in three colours for the three sensor leads, which run from the hook bar up to the board. The same wire makes the short tails on the board, and it lengthens the cleaning-mode button's two switch wires if they turn out too short to reach the join below the board.
- One 0.1 uF capacitor per Hall sensor. TI's datasheet recommends one between the sensor's supply and its ground. It is a tiny electronic part that steadies the supply.
- One clear window pane, 36 x 19.5 x 1 mm (acrylic or PETG), for the gateway lid. The hanger lid takes no pane: its display sits behind a printed bezel.
- Wall fixings: 4 No.8 countersunk screws with wall plugs for each hanger backplate, and 2 No.8 pan head screws plus 1 more for the lower hole for the gateway.
- Thin heat shrink (plastic sleeve that shrinks tight when warmed) for the three solder joints on the sensor's legs, for every wire-to-wire join below the board, and for the bare ends of the button's three unused wires.
- One small cable tie per hanger, to tie the wire bundle to the saddle on the back wall of the box.
- Optional: small wire-to-wire plug and socket pairs (JST-PH or similar, a family of small connectors), a 3-way pair for the sensor lead and a 2-way pair for the two button wires, per hanger. They are on no order. All they do is keep the board removable without a soldering iron. Without them the joins below the board are soldered and sleeved with heat shrink, and the build works just the same (see the v9 README, HANGER).
- Optional: a spool of white 2.85 mm PLA for the white writing on the lids. The lid design assumes white over black (see `hardware/enclosures/v9/PRINT.md`). Without it the logo and names print as sunken lines in black.

Two more things each hanger needs, with nothing to buy:

- The sensor's two retaining pins are offcuts of the 2.85 mm printer filament, cut 6.0 to 6.5 mm long, never longer.
- An SMA bulkhead pigtail and a stubby SMA antenna (about 9.5 mm diameter and 47 mm long) go inside each hanger. The pigtail is the thin antenna cable with a tiny press-on plug (called U.FL or IPEX) at one end for the board and a threaded SMA jack at the other for the antenna. In the name of this part, "bulkhead" only means the jack is made to be clamped through a slot or hole with its own nut and washer. It has nothing to do with the bulkhead shelf inside the hanger box. Owen has these in hand, and the enclosure was sized from his ruler photo of them. The supplier and quantity are not recorded here, so check there is one set per hanger.

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

Which leg is which is confirmed. Owen's sensors are marked 32FA, and TI's datasheet SLVSDC7H lists 32FA as the part marking of the DRV5032FALPG. Figure 7-1 of that datasheet shows that the "top" of this package is its marked, bevelled front face. Figure 5-5 (the top view) together with Table 5-1 gives pin 1 = VCC (the supply, 1.65 to 5.5 V), pin 2 = GND and pin 3 = OUT (the output).

So hold the sensor with its MARKED face (32FA) toward you and its legs pointing DOWN:

- the LEFT leg is VCC, and goes to 3V3 on the board
- the MIDDLE leg is GND
- the RIGHT leg is OUT, and goes to GPIO6 on the board

Wire every sensor to that order. Do not try to find the legs by touching 3V3 to a bare sensor: 3V3 on the OUT leg is something TI's absolute maximum ratings do not allow. The safe check comes after the three wires are soldered on in the confirmed order. Power the sensor from the board and watch OUT with a meter while the magnet is brought near: OUT goes LOW with the magnet present and HIGH without it.

In May this slot was a Mouser Ireland order estimated at €175: 2 x Qorvo DWM3001CDK UWB dev kits (€160, not part of the v1 hanger build, see the update at the top), 1 pack of 5 x TI DRV5032FADBZR (€5) and €10 shipping.

## Order #3: Rokland (US), about €22

Battery leads: 2-pin JST 1.25 cables wired with Heltec polarity. One is used per hanger. Each cable is one small plug with two loose wire ends. The loose ends are soldered to the two pins of the battery holder, and the plug goes into the battery socket on the underside of the board. Don't substitute another make of cable, because the wrong polarity destroys the board.

The wires have to be threaded BEFORE they are soldered. Inside the hanger box the battery sits below the bulkhead (the thick shelf across the inside of the box) and the board sits above it. The bulkhead has a notch at each end for the battery wires, one wire through each. Each notch is a closed hole, because 12 mm of bulkhead closes its front, so a wire cannot be laid into it from the front. The two wires also share one plug, and that one plug cannot follow them down two notches at opposite ends of the box. So the order that works, with no cutting and no joins, is this:

1. Find the cable's + wire. With the USB cable unplugged and nothing touching the cable's loose ends, push its plug into the battery socket on the underside of the board. See which wire lines up with the + printed on the board beside the socket, mark that wire with tape, and pull the plug out again. Find the holder's + end from the + and - marks moulded into it.
2. BEFORE the holder goes in, feed the cable's two LOOSE ends DOWN through the bulkhead from the board side, one through each end notch, and leave the plug above the bulkhead. The taped wire goes down the notch at the end of the box where the holder's + end will sit.
3. With the holder still out of the box and resting in front of it, solder the taped wire to the SIDE of the pin at the holder's + end and the other wire to the SIDE of the other pin, with nothing standing beyond the pin tips. Then do the polarity check below.
4. Press the holder straight in until both of its arms click, drawing the slack in the two wires back up through the notches as it goes.

The polarity check: even with the right cable, check every lead with a meter before its plug ever goes into a board with a cell fitted. Do it at step 3, with the holder resting in front of the box. Put the cell in the holder, its + end at the holder's + mark. Set the meter to DC volts, and put the red probe on the pin that carries the taped wire and the black probe on the other pin. The reading must be positive, with no minus sign. A minus sign means the wires are the wrong way round: take the cell out, unsolder the two wires, swap them over (pull each one back up and feed it down the other notch) and measure again. Take the cell out again before the holder is pressed in, because the cell is the last part to go into the box. Go by the meter and the printed markings, never by the colour of the wires. The v9 README has the full steps.

US shipping to Ireland: 1-2 weeks. This is the slowest order, so if it is still open, place it before anything else.

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
| Gebildet 16 mm momentary push button with LED, waterproof (the cleaning-mode button, fitted under the hanger's base since enclosure v9.9) | 6 | https://www.amazon.co.uk/s?k=gebildet+16mm+momentary+push+button+led+waterproof | on the order confirmation |

---

## Timing strategy

Orders 1 and 2 are done: Order 1 (TinyTronics) has been delivered, and the Hall sensors (Order 2, DigiKey) and the push buttons have been bought.

If Order 3 (Rokland) is still open, place it first. It ships from the US and is the slowest, see the delivery time under Order #3. Order 4 (Amazon UK) is the quickest and can go last.

While waiting, gather the small things listed under "Things the build needs that are not on any order below".

---

## What you'll build

After all 4 orders arrive:

- 2 × prototype hangers (Heltec + 18650 cell in its holder + Hall sensor + magnet + cleaning-mode button under the base, which the firmware does not act on yet)
- 1 × gateway (Heltec + antenna + USB-C plug)
- Spare sensors, magnets and buttons for future hangers (25 sensors, 14 magnets and 6 buttons were bought)

The orders do not cover everything. The hook-up wire, the capacitors, the heat shrink, the cable ties, the gateway's window pane and the wall fixings are listed near the top under "Things the build needs that are not on any order below", along with the optional plug and socket pairs.

Enough to demo the full system end-to-end, once every board has been flashed (see "Firmware on a new board" near the top). UWB tag prototypes are not part of these
orders (see the update at the top). `docs/UWB_PLAN.md` lists DWM3001CDK dev kits on a separate
DigiKey order, so check that document for where the UWB work stands.

---

## Optional later (not needed for prototype)

- 3D-printed enclosures: JLCPCB (~€8/enclosure)
  https://jlcpcb.com/3d-printing-service
- Anker 6-port USB-C charger (for charging dock): ~€40 on Amazon
- Spare Heltec boards (€18 each from Heltec AliExpress at qty 10+)
- Tile/Chipolo-style off-shelf BLE tags (skip, going custom with DWM3001)
