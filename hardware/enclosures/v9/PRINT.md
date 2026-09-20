# Printing the v9 enclosures on the BCN3D Epsilon W50

This sheet matches design v9.10. It is the single source of truth for the print recipe, so if another document disagrees with it, follow this one.

Files: `print/*.stl` are already rotated into the print orientation (do not rotate them in Stratos). `print/ORIENTATION.txt` lists the footprint and height of each one.

## What changed in v9.10

Every size in the design now comes from the makers' own drawings, 3D models and listings. "Where the sizes come from", further down, says which document gave which number. Nothing in this sheet asks for a measurement or a photo. The proof on the real parts is one small test print, the window gauge, which is the first job under Order.

- **The hanger box is 174 mm tall.** Gebildet's own drawing of the cleaning-mode button gives 46 mm overall with its plug-in wire socket on, which is 44.5 mm behind the head. The bay under the battery is 44 mm, so the hanger body is 174 mm tall (it was 171 in v9.9, and 130 before the button was added). The hanger lid is 100 x 174 and the backplate is 90 x 168. Everything inside keeps its place measured from the TOP of the box, so the display, the pads and the logo have not moved down the face.
- **The screen window sits over the picture.** The panel maker's drawing shows that the lit picture is 2.1 mm from the edge of the glass on the PRG side and 6.3 mm from the edge on the side where the display's ribbon leaves. The window is centred on that picture: 31.4 mm from the board's USB end and 1.8 mm toward the PRG button from the board's centreline. It is 24.0 x 13.1 mm, and it flares outward at 45 degrees through the 1.0 mm bezel (the thin front skin round the window), so the edge rows of the picture stay in view when the screen is seen from an angle.
- **The coil antenna has its own relief in the lid.** The coil antenna is the small spring that stands on the board between the USB end and the screen. Heltec's detailed 3D model gives its place. Over it the lid has a round relief 6.5 mm across under a 0.6 mm face skin, with air left above even a worst-case coil. Nothing may touch or squash the coil: Heltec say a squashed spring antenna causes resets. The coil is the tallest thing on the board, so it now sets how far back the board sits. The top face of the board is 4.4 mm behind the rim of the body, and the glass of a nominal 5.1 mm display sits 2.3 mm below the face of the lid.
- **The pads stop short of the coil.** The PRG and RST pads are 8.0 x 17.5 mm each. Their names run up the left side of each pad. The hanger lid has no LED light hole.
- **The display's ribbon is left alone.** The display's flat ribbon (its flex tail) folds over the lower long edge of the board, the RST side, between 23.6 and 39.2 mm from the board's USB end. The ledge the board rests on, the rib inside the lid, the board catch and the notch for the wires all keep clear of that stretch, and the lid and the pocket wall are relieved there. Never press on that fold when handling the board. The display's clear carrier is held by three small screws whose heads stand proud under the board. The board rests on its two long edges only, so those heads touch nothing. Do not pack anything under the board.
- **The hook bar is narrower, lower and longer.** The bar is 88 mm wide (it was 95) and hangs 46 mm below the body (it was 30). It reaches 86 mm out from the wall face. The seat is the shallow dip in the top of the bar that the sign's handle rests in (the README and the drawing labels call it the saddle). It is 42 mm wide, for a folded sign up to 38 mm thick. The small braces at the root of the lip are gone, so a folded sign can fill the seat right up to the lip. The Hall lift sensor sits under the middle of the seat. As printed the bar is 59.1 mm tall (it was 43.1).
- **The battery holder is drawn from its maker's figures.** The BeiLaMoo BH18650-PC2 is a copy of the MPD BH-18650-PC, and MPD's drawing gives the pins. The holder still stands 5.0 mm off the back wall, so nothing changes in how it prints or fits.
- **Colours.** The box is black, and the hook bar and the lettering are white. See Colours.

Print every part from the v9.10 files. A hanger body, lid, backplate, hook bar or test piece from an earlier version will not go with these. The gateway keeps its outside size, but its lid window and its board pocket follow the same makers' figures, so print both gateway parts from these files as well.

Part sizes, from `manifest.txt` and `print/ORIENTATION.txt`:

| Part | Size of the part | Footprint on the bed | Height as printed |
|---|---|---|---|
| hanger_body | 100 wide x 35 deep x 174 tall | 100 x 175 mm | 35.0 mm |
| hanger_lid | 100 x 174 | 100 x 174 mm | 17.1 mm |
| hanger_backplate | 90 x 168 | 90 x 168 mm | 17.0 mm |
| hanger_bar | 88 wide | 88 x 76 mm | 59.1 mm |
| hanger_body_coupon | front 14 mm of the body | 100 x 175 mm | 14.0 mm |
| hanger_window_gauge | the lid round the screen window and pads, with fences for the board | 61 x 43 mm | 9.8 mm |
| gateway_body | 120 x 30 x 80 | 120 x 81 mm | 30.0 mm |
| gateway_lid | 120 x 80 | 120 x 80 mm | 17.0 mm |

Each body takes about 1 mm more of the bed than its own size (175 against 174 for the hanger, 81 against 80 for the gateway) because the two pull lips under its latch arms stand 1.2 mm proud of the bottom wall. A latch arm is one of the two springy strips cut into the bottom wall that the lid's hooks click into.

## Material

Two spools of 2.85 mm PLA are loaded:

- **Nozzle 1: white PLA.** It prints the hook bar and the lettering on the lids.
- **Nozzle 2: black PLA (Polymaker PolyLite).** It prints everything else.

Slice both as PLA: in Stratos pick Generic > PLA (or BCN3D Filaments > PLA) for each nozzle, nozzle 215 C, bed 60 C, fan 100 % after the first two layers. Polymaker's own range for PolyLite PLA is 190 to 230 C nozzle, 25 to 60 C bed. If the label on the white spool gives a different range, stay inside it.

PLA is fine for the first test parts. For units that go on a wall long term use PET-G, which takes heat and repeated flexing of the latches better. The colour rule stays the same: white on nozzle 1, black on nozzle 2.

## Settings (Stratos, 0.4 hotend): strength first

The first print (Fine 0.15, 3 walls, 40 % infill) came out thin and poorly bonded. Use this instead:

| Setting | Value | Why |
|---|---|---|
| Layer height | 0.2 mm (Standard), first layer 0.2 mm as well | layers bond far better at 0.2, and it is about a third faster. The design counts on it too: the 0.6 mm face marks, the 0.6 mm skin over the coil antenna, the 1.0 mm display bezel, the 1.4 mm lid skin over the USB plug and every level of the sensor cavity in the hook bar are whole numbers of 0.2 mm layers |
| Wall line count | 4 (1.6 mm) | thin features come out as solid wall lines with nothing sparse inside them: the 2.0 mm latch arms and battery holder snap arms, the 2.5 mm box walls, the 3.0 mm lid hooks |
| Top / bottom thickness | 1.6 mm each | the 3 mm lid becomes a solid plate instead of two skins over sponge |
| Infill | 100 % for lids, the window gauge and the bar; 60 % gyroid for bodies, coupon and backplate | the bar carries the sign and the lid is handled; both must be solid. The gauge is a piece of the lid, so it prints like the lid |
| Printing temperature | PLA: 215 C. PET-G: the Stratos PET-G profile's own default plus 10 C | layer bonding |
| Fan | PLA: 100 % after layer 2. PET-G: 30 % max | PLA needs the cooling, PET-G does not |
| Print speed | 35 mm/s, outer wall 25 mm/s | quality on the visible faces without starving the extruder |
| Enable bridge settings | on | a bridge is a span the printer lays across open air. The closed front of the bar channel in the body is a 27 to 34 mm bridge, and the roof of the sensor tunnel in the hook bar is an 8.6 mm bridge that has to come out flat |
| Adhesion | brim 5 mm, with Brim Only on Outside ticked | a brim is a thin flat skirt printed round the part so that big flat faces stay stuck to the bed. It peels off afterwards. Brim Only on Outside keeps the brim off the inside of every hole, so none is laid in the pad slots, the window or the button hole. Stratos is built on Cura, where this setting sits under Build Plate Adhesion. If it is not in the list, type "brim" into the settings search box to show it |
| Supports | off for every part except the backplate, see per part | |

Dry the filament first if a spool has been open more than a couple of weeks: PLA 50 C, PET-G 65 C, 4 to 6 hours. Damp filament prints weak and stringy no matter what the slicer says.

## Per part

| Part | Orientation (already applied) | Support |
|---|---|---|
| hanger_lid, gateway_lid | outer face on the bed, hooks and hinge tabs pointing up | none. The catch face of each hook is a 1 mm overhang (an overhang is a piece of the print that sticks out sideways over open air), so keep the part fan running. On the hanger lid the display pocket and the round relief over the coil antenna are open toward the top of the print, and the flare round the window is a 45 degree slope, so none of them needs support |
| hanger_body, gateway_body | back face on the bed, open front up | none (channel end and hinge pockets are bridges). On the hanger body the 16.4 mm button hole goes through the bottom wall, which stands upright during the print, so the hole prints lying on its side as a round arch. It needs no support |
| hanger_body_coupon | the same way up as the body: cut face on the bed, open front up | none |
| hanger_window_gauge | outer face down, like the lid | none |
| hanger_backplate | back face on the bed, pegs pointing up | yes, touching buildplate only. The catch tongue is the springy strip in the face of the backplate that locks the body on. The cavity behind it is open to the back face on purpose, so support from the bed reaches the underside of the tongue. Pull the support out afterwards. |
| hanger_bar | standing on the bar's bottom face, lip pointing up | none at all. Every sloping underside on the bar is cut at 45 degrees, which a printer can build over open air without support. That covers the two sloping sides of the sliding tongue on top of the bar, the two triangular braces beside the narrow upright neck, and the brace under the front of the tongue. Leave support switched off for this part: anything generated inside the sensor tunnel, the nest or the pin holes can never be cleaned out. |

If the bar ever shares a plate with the backplate, switch support on for the backplate model only. With the colours below they are separate jobs anyway, because the bar is white and the backplate is black.

IDEX (the printer's two separate hotends): Duplication mode prints two copies of a part in one job, one from each hotend. It needs the same filament on both hotends, so with white on nozzle 1 and black on nozzle 2, print singly. Do not use Mirror mode (the parts are not symmetric).

## Colours: which part goes on which nozzle

Owen's choice: the box is black, and the hook under it, the logo and the button names are white. Nozzle 1 has the WHITE PLA and nozzle 2 has the BLACK PLA. Stratos calls nozzle 1 the left extruder (its print mode is Single 1) and nozzle 2 the right extruder (Single 2). The print mode is picked with the IDEX button on the left side of the Stratos window, which shows once a model on the plate has been clicked.

| Part | Colour | Nozzle | Stratos print mode |
|---|---|---|---|
| hanger_body, hanger_backplate, gateway_body | black | 2 | Single 2 |
| hanger_body_coupon, hanger_window_gauge (the two test pieces) | black | 2 | Single 2 |
| hanger_bar | white, the whole part | 1 | Single 1 |
| hanger_lid with hanger_lid_inlay | black lid, white lettering | lid on 2, inlay on 1 | Dual |
| gateway_lid with gateway_lid_inlay | black lid, white lettering | lid on 2, inlay on 1 | Dual |

### A black part

1. Open the STL from `print/`.
2. Click the part, click the IDEX button and choose **Single 2**. Only nozzle 2 works in this mode, so the part and its brim are all black.
3. Slice. In the preview every line, the brim included, should be drawn in the colour of extruder 2. Then send it.

### The hook bar, wholly white

1. Open `print/hanger_bar.stl`.
2. Click the bar, click the IDEX button and choose **Single 1**. Only nozzle 1 works in this mode, so no line of the bar comes from the black nozzle, and its brim is white as well.
3. Support off, infill 100 %, as in the tables above. Slice, check the preview, send.

### A lid: black with white lettering

The badge, the HazardLink name and the PRG and RST names are sunk 0.6 mm into the face of the lid. `print/hanger_lid_inlay.stl` is the same set of marks as a solid of its own, 0.6 mm thick, which fills them flush in white. The lid prints face down, so the white is laid in the first three layers, side by side with the black face, and black then prints over the back of it. Three layers keep the white solid white against the black behind it.

1. Open `print/hanger_lid.stl` and `print/hanger_lid_inlay.stl` in the same Stratos window. Use the copies in `print/`: they are already turned the right way up and they share one origin, which is what lets Stratos line them up.
2. Click either model, click the IDEX button and choose **Dual**, so that both nozzles work.
3. Give each model its nozzle BEFORE merging, because after merging a click picks up the pair. Stratos loads every model on the left extruder, so the lid is the one to change. Click the LID on its own and assign it to extruder 2 (black), with the extruder buttons that show on the left when a model is selected, or by right-clicking the model. Click the INLAY on its own, the thin set of letters and badge lines, and see that it is on extruder 1 (white).
4. Select both models (Cmd+A), right-click on them and choose **Merge Models**. The lettering drops into the sunken marks in the face of the lid. If it lands anywhere else, one of the files did not come from `print/`: clear the plate and load them again.
5. From here on move the merged pair as one. Do not move, turn or scale the lid or the inlay by itself.
6. Make the brim black. Find the setting that chooses which nozzle prints the brim (Cura calls it Build Plate Adhesion Extruder; type "adhesion" into the settings search box) and set it to extruder 2. A white brim round a black lid leaves white flecks along the edge when it is peeled off.
7. Slice and look at the preview layer by layer. Layers 1 to 3, the first 0.6 mm, show the badge, HazardLink, PRG and RST in white with black all round them. From layer 4 up everything is black. Then send it.

The gateway lid is done the same way with `print/gateway_lid.stl` and `print/gateway_lid_inlay.stl`.

The white lettering only lands square in its black surround if the printer's two hotends are calibrated to each other. Owen's printer is calibrated. The first lid in Order step 2 shows it on a real part.

If the white spool ever runs out, a lid printed alone in black still works: the same marks simply print as 0.6 mm sunken lines.

## Order: what to print first

No part waits for a measurement. The order below puts the cheapest proof first, so that any problem shows up on a small, quick print.

1. **`print/hanger_window_gauge.stl` FIRST.** Black, Single 2, the lid's settings, no support. It is the piece of the lid round the screen window and the two pads, with low fences on the inside that hold the board exactly where the body will hold it. Lay the board in it face down with its USB end against the two short stops, and push it flat with a finger on each bare end of the board. Keep fingers off the ribbon fold on the RST-side long edge and off the coil. Three checks:
   - The board lies FLAT on the two long ribs and does not rock. That proves the screen and the coil antenna fit under the lid.
   - Turn it over with the screen switched on. The WHOLE picture shows inside the window with a dark border all round, about the same left and right.
   - Press the PRG pad and the RST pad from the front. Each clicks its switch.

   If all three pass, the hanger lid and the hanger body are proven against the real board. If one fails, stop before the lid and the body and say which check failed. For the picture, say which edge it touches. Nothing needs measuring: the design is corrected from that answer.
2. **`print/hanger_body_coupon.stl` (black) and one hanger lid (black with white lettering, the Dual job above).** The coupon is the front 14 mm ring of the hanger body: the rim, both latch arms, the hinge ribs and the USB-C opening. It is a throwaway test piece. Print it whole, exactly as exported. Do not trim it or cut it down in the slicer, because its bottom edge carries the two latch arms it is there to test.
   - With the lid and the coupon, check that both lid hooks click into the arm windows, that the hinge tabs seat in the rib pockets, that the lid's lip sits inside the rim, and that the USB-C plug goes in with the lid on.
   - This is also the first two-colour print, so look at the lettering: white, flush with the face, and square in its black surround.
   - The coupon holds only the first 8 mm of the dovetail channel (the slot with sloping sides in the bottom wall of the body that the tongue on top of the hook bar slides into), so the real check of the dovetail fit is on the first full hanger body.
   - The button hole starts 13.1 mm back from the rim, so the coupon carries only a shallow scoop of it (about 0.9 mm) in the bed-side edge of its bottom wall, toward the right. That scoop is meant to be there. The real check of the button hole is on the first full hanger body.
3. **The hook bar (white, Single 1).** Check the pin holes and the sensor tunnel (see After printing).
4. **hanger_body and hanger_backplate (black, Single 2).**
5. **gateway_body (black) and gateway_lid (black with white lettering).**

## After printing

- Bodies and the coupon: push each latch arm tip OUTWARD once with a screwdriver, away from the inside of the box, which is the same way the pull lip under it moves. This breaks the arm's small breakaway tab. The tab is there so the arm prints cleanly. Do this before the first lid goes on.
- Hanger lid, inside: the round relief at the USB end of the display pocket leaves only a 0.6 mm skin at the face, and the bezel round the window is 1.0 mm. Do not scrape or poke either one when cleaning the lid up.
- Hanger body, button hole: take one of the Gebildet buttons with its blue plug-in wire socket unplugged and its nut taken off, and push the bare button up through the 16.4 mm hole from below (from outside the box). The socket will not pass through the hole, so it always goes on from inside afterwards. Its M16 thread should pass freely and its head should sit flat against the underside of the box. The side of the hole nearest the open front was the top of the arch during the print, so that is where it is most likely to have sagged. If the thread will not pass, ease the hole with a round file, a little at a time all the way round, and try the button again. Stop as soon as the thread goes through: the head is 18.8 mm across by Gebildet's drawing, so it only overlaps the wall by about 1.2 mm all round, and an oversize hole leaves it little to sit on. Only 1.4 mm of wall stands between the hole and the slot round the right latch arm, so file gently and never lever against that strip. Then check from inside that the button's nut spins on and turns freely between the side wall, the back wall and the channel strip (the raised strip in the floor of the box that the hook bar slides into).
- Hook bar, pin holes: the two holes in the floor of the seat take the pins that keep the Hall lift sensor in its nest. The Hall lift sensor is the small magnetic sensor that tells the unit the sign has been lifted, and the nest is the pocket at the end of the tunnel that it sits in. The pins are offcuts of 2.85 mm filament, cut 6.0 to 6.5 mm long (never longer, or the sign rests on the pins instead of the seat). White offcuts match the bar. The holes open through the tunnel roof in printed stages, so no drilling is needed. Try both pins in their holes now, BEFORE the sensor ever goes in: each offcut must drop in under its own weight and tip out again when the bar is turned over. If one is tight, ease it with a 3 mm drill, and set the depth before you start, because the bottom of the hole cannot be judged by feel. Each pin hole is 6.6 mm deep, and the ledge under it that the pin stands on is only 1.4 mm thick. A drill that goes through that ledge lets the pin fall straight through, and the only cure is a new bar. So wrap a flag of tape round the drill 6 mm from its tip. Twist the drill by hand only. Never put it in a power drill, because a spinning drill pulls itself down into plastic. Stop when the tape reaches the floor of the seat. Then try the pin again: it must drop in under its own weight and finish below the floor of the seat. Shake the chips out of the tunnel from the back before the sensor goes in, and never put a drill down a pin hole with the sensor in the bar.
- Hook bar, underside: under each pin hole a 2 mm hole comes out through the bottom face of the bar. It lets a stuck pin be pushed out from below with a 1.5 mm rod, and it drains the cavity. Check that both are open once the brim is off. A 2 mm hole printed straight off the bed often closes in the first layer. If one is closed, open it from below with a 2 mm drill twisted by hand, just until it breaks through.
- Hook bar, sensor tunnel: shine a torch into the tunnel from the back of the bar. It should be clean all the way to the nest, with no strings hanging from the roof. That roof is flat from the back of the bar to the front of the nest, and the sensor slides in along it with the bar held upside down. The only break in the roof is a shallow slot, one 0.2 mm layer deep, where the two pin holes open through just short of the nest. It is meant to be there. If support ever got into the tunnel, the nest or the pin holes, reprint the bar with support off.
- Hook bar, sliding fit: slide the tongue on top of the bar (its dovetail plate) into the channel in the bottom wall of the hanger body from the back of the body, and out again, a few times. If it is tight, give the two sloping sides of the tongue a light pass with 400 grit paper. The clearance is 0.45 mm per side.
- Gateway lid only: fit the 36 x 19.5 x 1 mm clear window insert from inside the lid under the two cleats (the two small ledges that hold it in). The pane is not on any order, see `SHOPPING.md`. The hanger lid takes no insert and has no cleats: the display module sits in its pocket with the glass behind the 1.0 mm bezel.
- Wall screws: 4 x No.8 countersunk with wall plugs for the backplate, 2 x No.8 pan head plus 1 for the lower hole for the gateway.

## Where the sizes come from

Every size below was taken from the maker's own document. Owen is not asked to measure or photograph anything. Positions on the board are given from the board's USB end (along it) and from its centreline (across it).

| Part | Maker's document | What it gave |
|---|---|---|
| Heltec WiFi LoRa 32 V3 board | Heltec's own 3D models (STEP files) of the board | the board outline, 51.7 x 25.4 mm, and where the USB-C port, the PRG and RST switches, the antenna socket and the display carrier sit. Display top 5.0 mm above the board |
| Display panel | Heltec's panel specification QG-2864KSWEG01, which matches Univision's drawing of the UG-2864HSWEG01 | the picture (active area) is 21.744 x 10.864 mm and the maker's view area is 23.744 x 12.864 mm. The picture sits 2.1 mm from the PRG-side glass edge and 6.3 mm from the ribbon side. With the glass position from Heltec's 3D model, the centre of the picture is 31.4 mm along the board and 1.8 mm toward PRG. The window is drawn 24.0 x 13.1 because printed holes close up a little. The panel maker's worst-case glass top is 5.25 mm above the board, and the floor of the lid's pocket is 6.4 mm above the board |
| Display ribbon fold | Heltec's 3D model and photos | the ribbon folds over the RST-side board edge between 23.6 and 39.2 mm along the board. The design keeps clear of it with 1 mm added at each end |
| Display carrier screws | Heltec's photo of the underside and the holes in its 3D model | three small screws, heads proud under the board |
| Coil antenna, position | Heltec's detailed 3D model | its leg hole is 13.08 mm along the board and 7.24 mm from the centreline on the PRG side |
| Battery holder, BeiLaMoo BH18650-PC2 | BeiLaMoo's listing for the body, 77.7 x 20.9 x 21.31 mm. It is a copy of the MPD BH-18650-PC, and MPD's drawing gives the rest | pins 3.30 mm long, 2.40 mm in from each end, flat tab 1.52 x 0.38 mm. MPD's tolerance is 0.5 mm, so the pocket keeps 0.5 mm a side. The holder stands 5.0 mm off the back wall, which clears a 4.8 mm allowance for the pin and the wire soldered to it |
| Cell, Murata US18650VTC6 | Murata's datasheet, maximum size | 18.5 mm across, 65.2 mm long |
| Cleaning-mode button, Gebildet 16 mm | Gebildet's own listing drawing, with the APIELE AP16B datasheet for the same family of button | M16 x 1 thread in a 16 mm hole (printed 16.4), head 18.8 mm across, 46 mm overall with the socket on. 46 less the 1.6 mm head is 44.5 mm behind the head, plus 6.0 mm for the wires to turn. The listing also says the LED is a 12 to 24 V type |
| Hall lift sensor, TI DRV5032FA | TI's datasheet SLVSDC7H | the package size and which leg is which |
| Magnet | the packing slip: XMP 6 x 2 mm N52 disc | its size |

The few numbers that no maker publishes, how each was worked out, and the margin added:

- **The height of the coil antenna.** Heltec do not publish it. Heltec's drawing puts the top of the display 5.0 mm above the board and the coil stands about 1 mm above the display, which makes 6.0 mm. The design treats that as 6.0 give or take 0.5. Margin: the lid keeps 0.3 mm of air over a 6.5 mm coil, which is 0.8 mm over a 6.0 mm one, under its 0.6 mm face skin. The coil's body is about 2.9 mm across, scaled from Heltec's photo of the board, and the clear circle round it is 6.5 mm.
- **The hand hole of the sign.** No sign maker publishes the size of the hand hole. The widths were scaled from the makers' own product photos against the overall sizes they do publish. The narrowest common one is the Rubbermaid FG6112xx at about 105 mm, which on the least favourable reading of the photo could be 92. Carlisle is about 111 and the generic UK and Irish 620 x 300 moulding is about 120. The bar is 88 mm wide, so it enters every one of them, with 4 mm in hand even at 92. A wider 108 mm bar for the generic moulding alone is one parameter in the design (BAR_W).
- **How thick a folded sign is, and how far it stands above its hand hole.** Rubbermaid publish a closed depth of 38 mm, the thickest of the common signs, so the seat is 38 plus 4, which is 42 mm. Scaled from the same photos, a sign stands 36 to 42 mm above the top of its hand hole. The bar hangs 46 mm below the body, so the top of a sign that stands the full 42 mm still clears the underside of the box by 5 mm. The 86 mm reach lets a folded sign 38 mm thick hang wholly in front of the hook's brace and of the button under the base.

A few sizes were taken from Owen's own parts in earlier rounds and are kept as they are: the plug of his USB-C lead, which set the 14.0 x 8.0 mm opening, the stub antenna with its jack, and the 25.6 mm blue socket of the button. Nothing more is needed for any of them.

## Button pads

The two pads in each lid (PRG and RST) are flaps with a 0.8 mm hinge. On the hanger lid they run down the left edge, PRG above the USB port and RST below it, 8.0 x 17.5 mm each, and they stop short of the coil antenna. Their names run up the left side of each pad and print in white with the inlay. The pads print flat on the bed, so they are strong in the direction they bend. No brim may be laid inside the 0.8 mm slots around them, which is what Brim Only on Outside in the settings table is for. If the first layer closes a slot anyway, run a blade along it. The hanger lid has no LED light hole. The gateway lid has one (1.8 mm); clear it with a pin if the first layer has closed it.

These two pads are the board's own PRG and RST buttons. They have nothing to do with the cleaning-mode button under the base.

## Seeing the design in AutoCAD and Fusion

The AutoCAD and Fusion views of the assembly refresh with no clicking. Two small start-up files do the work, and the whole refresh is a few lines typed in the `v9` folder. They are in `../autoload/README.md`.
