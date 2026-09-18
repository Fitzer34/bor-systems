# Printing the v9 enclosures on the BCN3D Epsilon W50

This sheet matches design v9.9. It is the single source of truth for the print recipe, so if another document disagrees with it, follow this one.

Files: `print/*.stl` are already rotated into the print orientation (do not rotate them in Stratos). `print/ORIENTATION.txt` lists the footprint and height of each one.

## What changed in v9.9

- A cleaning-mode push button is now fitted under the base of the hanger. It is Owen's Gebildet 16 mm button, and it goes through a new 16.4 mm round hole in the BOTTOM wall of the hanger body, toward the right-hand end as you look at the front of the box. The hole sits behind the right latch arm (a latch arm is one of the two springy strips cut into the bottom wall that the lid's hooks click into) and clear of the channel strip (the raised strip in the floor of the box that the hook bar slides into). The button points down, above the hook, where it cannot be seen from the front.
- To make room for the button and its wires under the battery, the hanger box grew DOWNWARD by 41 mm. The hanger body is now 171 mm tall (it was 130), the hanger lid is 100 x 171 and the backplate is 90 x 165 (it was 90 x 124). Everything inside keeps its place measured from the TOP of the box, so the display, the pads and the logo have not moved on the face.
- A hanger body, lid or backplate printed from an earlier version will not go with these. Print all three, and the test coupon, from the v9.9 files. The hook bar and both gateway parts are the same size as before. Read Order further down before printing anything: the hook bar, the hanger lid and the hanger body each wait for a measurement.

Part sizes, from `manifest.txt` and `print/ORIENTATION.txt`:

| Part | Size of the part | Footprint on the bed | Height as printed |
|---|---|---|---|
| hanger_body | 100 wide x 35 deep x 171 tall | 100 x 172 mm | 35.0 mm |
| hanger_lid | 100 x 171 | 100 x 171 mm | 17.1 mm |
| hanger_backplate | 90 x 165 | 90 x 165 mm | 17.0 mm |
| hanger_bar | 95 wide | 95 x 60 mm | 43.1 mm |
| hanger_body_coupon | front 14 mm of the body | 100 x 172 mm | 14.0 mm |
| gateway_body | 120 x 30 x 80 | 120 x 81 mm | 30.0 mm |
| gateway_lid | 120 x 80 | 120 x 80 mm | 17.0 mm |

Each body takes about 1 mm more of the bed than its own size (172 against 171 for the hanger, 81 against 80 for the gateway) because the two pull lips under its latch arms stand 1.2 mm proud of the bottom wall.

## Material

The spool on the printer is **Polymaker PolyLite PLA, 2.85 mm, black**, loaded on hotend 2. Slice it as PLA: in Stratos pick
Generic > PLA (or BCN3D Filaments > PLA), nozzle 215 C, bed 60 C, fan 100 % after the first two layers. PLA is fine for
the first test parts. For units that go on a wall long term use PET-G, which takes heat and repeated flexing of the latches better.
Polymaker's own range for PolyLite PLA is 190 to 230 C nozzle, 25 to 60 C bed.

## Settings (Stratos, 0.4 hotend): strength first

The first print (Fine 0.15, 3 walls, 40 % infill) came out thin and poorly bonded. Use this instead:

| Setting | Value | Why |
|---|---|---|
| Layer height | 0.2 mm (Standard), first layer 0.2 mm as well | layers bond far better at 0.2, and it is about a third faster. The design counts on it too: the 0.6 mm face marks, the 1.0 mm display bezel, the 1.4 mm lid skin over the USB plug and every level of the sensor cavity in the hook bar are whole numbers of 0.2 mm layers |
| Wall line count | 4 (1.6 mm) | thin features come out as solid wall lines with nothing sparse inside them: the 2.0 mm latch arms and battery holder snap arms, the 2.5 mm box walls, the 3.0 mm lid hooks |
| Top / bottom thickness | 1.6 mm each | the 3 mm lid becomes a solid plate instead of two skins over sponge |
| Infill | 100 % for lids and bar; 60 % gyroid for bodies, coupon and backplate | the bar carries the sign and the lid is handled; both must be solid |
| Printing temperature | PLA: 215 C. PET-G: the Stratos PET-G profile's own default plus 10 C | layer bonding |
| Fan | PLA: 100 % after layer 2. PET-G: 30 % max | PLA needs the cooling, PET-G does not |
| Print speed | 35 mm/s, outer wall 25 mm/s | quality on the visible faces without starving the extruder |
| Enable bridge settings | on | a bridge is a span the printer lays across open air. The closed front of the bar channel in the body is a 27 to 34 mm bridge, and the roof of the sensor tunnel in the hook bar is an 8.6 mm bridge that has to come out flat |
| Adhesion | brim 5 mm, with Brim Only on Outside ticked | a brim is a thin flat skirt printed round the part so that big flat faces stay stuck to the bed. It peels off afterwards. Brim Only on Outside keeps the brim off the inside of every hole, so none is laid in the pad slots, the window or the button hole. Stratos is built on Cura, where this setting sits under Build Plate Adhesion. If it is not in the list, type "brim" into the settings search box to show it |
| Supports | off for every part except the backplate, see per part | |

Dry the filament first if the spool has been open more than a couple of weeks: PLA 50 C, PET-G 65 C, 4 to 6 hours. Damp filament prints weak and stringy no matter what the slicer says.

## Per part

| Part | Orientation (already applied) | Support |
|---|---|---|
| hanger_lid, gateway_lid | outer face on the bed, hooks and hinge tabs pointing up | none. The catch face of each hook is a 1 mm overhang (an overhang is a piece of the print that sticks out sideways over open air), so keep the part fan running |
| hanger_body, gateway_body | back face on the bed, open front up | none (channel end and hinge pockets are bridges). On the hanger body the 16.4 mm button hole goes through the bottom wall, which stands upright during the print, so the hole prints lying on its side as a round arch. It needs no support |
| hanger_body_coupon | the same way up as the body: cut face on the bed, open front up | none |
| hanger_backplate | back face on the bed, pegs pointing up | yes, touching buildplate only. The catch tongue is the springy strip in the face of the backplate that locks the body on. The cavity behind it is open to the back face on purpose, so support from the bed reaches the underside of the tongue. Pull the support out afterwards. |
| hanger_bar | standing on the bar's bottom face, lip pointing up | none at all. Every sloping underside on the bar is cut at 45 degrees, which a printer can build over open air without support. That covers the two sloping sides of the sliding tongue on top of the bar, the two triangular braces beside the narrow upright neck, and the brace under the front of the tongue. Leave support switched off for this part: anything generated inside the sensor tunnel, the nest or the pin holes can never be cleaned out. |

If the bar shares a plate with the backplate, switch support on for the backplate model only.

IDEX (the printer's two separate hotends): Duplication mode prints two lids or two bars in one job when making pairs. It needs the same filament loaded on both hotends, so with the one black spool on hotend 2, print singly. Do not use Mirror mode (the parts are not symmetric).

## Order

Two values in this design still rest on estimates, so some parts are safe to print today and some should wait for a measurement. The measurements are listed in the README under MEASURE BEFORE FREEZING. Take them before anything in step 2 or step 3 is printed.

- **The sign's hand hole.** The hook bar is 95 mm wide (BAR_W in PARAMS). That width is provisional. It is meant to be the width of the hand hole minus 5 mm, so 95 mm suits a hole 100 mm wide, and nobody has measured the hole on the real sign yet. Measure its width. If the hole is narrower than 100 mm, the sign may not go over the bar. If it is wider, the sign can slide sideways along the bar, away from the sensor. Either way, set BAR_W to the measured width minus 5, rebuild the files and print the bar from the new ones. Only the hook bar depends on this value.
- **The display and the coil antenna on the board.** The pocket inside the hanger lid allows 6.0 mm above the board (OLED_H_MAX in PARAMS). The two heights it has to clear, about 5.6 mm for the display and about 5.9 mm for the coil antenna beside it, were read off a photo, give or take 0.4 mm. Close the caliper jaws over the top of each one and the back of the board, then take off the thickness of the board. Both must come to 6.0 mm or less. If either is taller, raise OLED_H_MAX and rebuild the files. The same value sets how deep the board sits in the hanger body, so the hanger lid and the hanger body both depend on it. A lid printed too shallow would be clicked shut onto the coil antenna.

1. Safe to print now, whatever the two measurements turn out to be: `print/hanger_body_coupon.stl`, hanger_backplate, gateway_body and gateway_lid. The coupon is the front 14 mm ring of the hanger body: the rim, both latch arms, the hinge ribs and the USB-C opening. It is a throwaway test piece. Print it whole, exactly as exported. Do not trim it or cut it down in the slicer, because its bottom edge carries the two latch arms it is there to test.
2. Once the display and the coil antenna have been measured, print one hanger lid. Once the hand hole has been measured, print one hook bar.
   - With the lid and the coupon, check that both lid hooks click into the arm windows, that the hinge tabs seat in the rib pockets, that the lid's lip sits inside the rim, and that the USB-C plug goes in with the lid on.
   - On the bar, check the pin holes and the sensor tunnel (see After printing).
   - The coupon holds only the first 8 mm of the dovetail channel (the slot with sloping sides in the bottom wall of the body that the tongue on top of the hook bar slides into), so the real check of the dovetail fit is on the first full hanger body.
   - The button hole starts 13.1 mm back from the rim, so the coupon carries only a shallow scoop of it (about 0.9 mm) in the bed-side edge of its bottom wall, toward the right. That scoop is meant to be there. The real check of the button hole is on the first full hanger body.
3. Then hanger_body, which waits for the display and coil antenna measurement as well, and anything from step 1 that has not been printed yet.

## After printing

- Bodies and the coupon: push each latch arm tip OUTWARD once with a screwdriver, away from the inside of the box, which is the same way the pull lip under it moves. This breaks the arm's small breakaway tab. The tab is there so the arm prints cleanly. Do this before the first lid goes on.
- Hanger body, button hole: take one of the Gebildet buttons with its blue plug-in wire socket unplugged and its nut taken off, and push the bare button up through the 16.4 mm hole from below (from outside the box). The socket will not pass through the hole, so it always goes on from inside afterwards. Its M16 thread should pass freely and its 18.2 mm head should sit flat against the underside of the box. The side of the hole nearest the open front was the top of the arch during the print, so that is where it is most likely to have sagged. If the thread will not pass, ease the hole with a round file, a little at a time all the way round, and try the button again. Stop as soon as the thread goes through: the head only overlaps the wall by about 0.9 mm all round, so an oversize hole leaves it little to sit on. Only 1.4 mm of wall stands between the hole and the slot round the right latch arm, so file gently and never lever against that strip. Then check from inside that the button's nut spins on and turns freely between the side wall, the back wall and the channel strip.
- Hook bar, pin holes: the two holes in the saddle floor (the saddle is the shallow dip in the top of the bar where the sign's handle rests) take the pins that keep the Hall lift sensor in its nest. The Hall lift sensor is the small magnetic sensor that tells the unit the sign has been lifted, and the nest is the pocket at the end of the tunnel that it sits in. The pins are offcuts of the same 2.85 mm filament, cut 6.0 to 6.5 mm long (never longer, or the sign rests on the pins instead of the saddle). The holes open through the tunnel roof in printed stages, so no drilling is needed. Try both pins in their holes now, BEFORE the sensor ever goes in: each offcut must drop in under its own weight and tip out again when the bar is turned over. If one is tight, ease it with a 3 mm drill, and set the depth before you start, because the bottom of the hole cannot be judged by feel. Each pin hole is 6.6 mm deep, and the ledge under it that the pin stands on is only 1.4 mm thick. A drill that goes through that ledge lets the pin fall straight through, and the only cure is a new bar. So wrap a flag of tape round the drill 6 mm from its tip. Twist the drill by hand only. Never put it in a power drill, because a spinning drill pulls itself down into plastic. Stop when the tape reaches the saddle floor. Then try the pin again: it must drop in under its own weight and finish below the saddle floor. Shake the chips out of the tunnel from the back before the sensor goes in, and never put a drill down a pin hole with the sensor in the bar.
- Hook bar, underside: under each pin hole a 2 mm hole comes out through the bottom face of the bar. It lets a stuck pin be pushed out from below with a 1.5 mm rod, and it drains the cavity. Check that both are open once the brim is off. A 2 mm hole printed straight off the bed often closes in the first layer. If one is closed, open it from below with a 2 mm drill twisted by hand, just until it breaks through.
- Hook bar, sensor tunnel: shine a torch into the tunnel from the back of the bar. It should be clean all the way to the nest, with no strings hanging from the roof. That roof is flat from the back of the bar to the front of the nest, and the sensor slides in along it with the bar held upside down. The only break in the roof is a shallow slot, one 0.2 mm layer deep, where the two pin holes open through just short of the nest. It is meant to be there. If support ever got into the tunnel, the nest or the pin holes, reprint the bar with support off.
- Hook bar, sliding fit: slide the tongue on top of the bar (its dovetail plate) into the channel in the bottom wall of the hanger body from the back of the body, and out again, a few times. If it is tight, give the two sloping sides of the tongue a light pass with 400 grit paper. The clearance is 0.45 mm per side.
- Gateway lid only: fit the 36 x 19.5 x 1 mm clear window insert from inside the lid under the two cleats (the two small ledges that hold it in). The pane is not on any order, see `SHOPPING.md`. The hanger lid takes no insert and has no cleats: the display module sits in its pocket with the glass behind the 1.0 mm bezel.
- Wall screws: 4 x No.8 countersunk with wall plugs for the backplate, 2 x No.8 pan head plus 1 for the lower hole for the gateway.

## Two-colour lid: white writing over black (optional, uses the second hotend)

Load `print/hanger_lid.stl` and `print/hanger_lid_inlay.stl` together (same for the gateway lid with `print/gateway_lid_inlay.stl`). Use the copies in `print/`, which are
already rotated for printing and lined up with each other. Select both, right-click,
Merge models. Assign the lid to the hotend with the body colour (hotend 2 has the black PLA) and the inlay to the other hotend,
loaded with WHITE PLA. The design assumes white: the marks are 0.6 mm deep, three layers, so that the white stays solid white
over the black. The badge, the HazardLink name and the PRG / RST names then print flush in white
in the first three layers. Without the inlay file the same marks simply print as 0.6 mm sunken lines in black.

This needs a spool of white 2.85 mm PLA on the other hotend. It is not on any order in `SHOPPING.md`.

## Button pads

The two pads in each lid (PRG and RST) are flaps with a 0.8 mm hinge. On the hanger lid they run down the left edge. They print flat
on the bed, so they are strong in the direction they bend. No brim may be laid inside the 0.8 mm slots around them, which is what Brim Only on Outside in the settings table is for. If the first layer
closes a slot anyway, run a blade along it. The 1.8 mm LED light hole should be open too; clear it with a pin if the first layer has closed it.

These two pads are the board's own PRG and RST buttons. They have nothing to do with the cleaning-mode button under the base.
