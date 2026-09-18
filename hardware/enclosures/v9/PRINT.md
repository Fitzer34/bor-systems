# Printing the v9 enclosures on the BCN3D Epsilon W50

This sheet matches design v9.8. It is the single source of truth for the print recipe, so if another document disagrees with it, follow this one.

Files: `print/*.stl` are already rotated into the print orientation (do not rotate them in Stratos). `print/ORIENTATION.txt` lists the footprint and height of each one.

Material: the spool on the printer is **Polymaker PolyLite PLA, 2.85 mm, black**, loaded on hotend 2. Slice it as PLA: in Stratos pick
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
| Printing temperature | PLA: 215 C. PET-G: profile default + 10 C (about 245 C) | layer bonding |
| Fan | PLA: 100 % after layer 2. PET-G: 30 % max | PLA needs the cooling, PET-G does not |
| Print speed | 35 mm/s, outer wall 25 mm/s | quality on the visible faces without starving the extruder |
| Enable bridge settings | on | the closed front of the bar channel in the body is a 27 to 34 mm bridge, and the roof of the sensor tunnel in the hook bar is an 8.6 mm bridge that has to come out flat |
| Adhesion | brim 5 mm | flat big faces |
| Supports | off for every part except the backplate, see per part | |

Dry the filament first if the spool has been open more than a couple of weeks: PLA 50 C, PET-G 65 C, 4 to 6 hours. Damp filament prints weak and stringy no matter what the slicer says.

## Per part

| Part | Orientation (already applied) | Support |
|---|---|---|
| hanger_lid, gateway_lid | outer face on the bed, hooks and hinge tabs pointing up | none. The catch face of each hook is a 1 mm overhang, so keep the part fan running |
| hanger_body, gateway_body | back face on the bed, open front up | none (channel end and hinge pockets are bridges) |
| hanger_body_coupon | the same way up as the body: cut face on the bed, open front up | none |
| hanger_backplate | back face on the bed, pegs pointing up | yes, touching buildplate only. The cavity behind the catch tongue is open to the back face on purpose, so support from the bed reaches the underside of the tongue. Pull it out afterwards. |
| hanger_bar | standing on the bar's bottom face, lip pointing up | none at all. A 45 degree gusset off the web carries the front of the dovetail plate, and the dovetail flanks and the spreaders are 45 degrees as well. Leave support switched off for this part: anything generated inside the sensor tunnel, the nest or the pin holes can never be cleaned out. |

If the bar shares a plate with the backplate, switch support on for the backplate model only.

IDEX: Duplication mode prints two lids or two bars in one job when making pairs. It needs the same filament loaded on both hotends, so with the one black spool on hotend 2, print singly. Do not use Mirror mode (the parts are not symmetric).

## Order

1. Print one hanger lid, one hook bar and `print/hanger_body_coupon.stl` first. The coupon is the front 14 mm ring of the hanger body: the rim, both latch arms, the hinge ribs and the USB-C opening. Print it whole, exactly as exported. Do not trim it or cut it down in the slicer, because its bottom edge carries the two latch arms it is there to test.
   - On the coupon, check that both lid hooks click into the arm windows, that the hinge tabs seat in the rib pockets, that the lid's lip sits inside the rim, and that the USB-C plug goes in with the lid on.
   - On the bar, check the pin holes and the sensor tunnel (see After printing).
   - The coupon holds only the first 8 mm of the dovetail channel, so the real check of the dovetail fit is on the first full hanger body.
2. Then hanger_body, hanger_backplate, gateway_body, gateway_lid.

## After printing

- Bodies and the coupon: push each latch arm tip down once with a screwdriver to break its small moulding tab (it is there so the arm prints cleanly). Do this before the first lid goes on.
- Hook bar, pin holes: the two holes in the saddle floor take the pins that keep the Hall lift sensor in its nest. The pins are offcuts of the same 2.85 mm filament, cut 6.0 to 6.5 mm long (never longer, or the sign rests on the pins instead of the saddle). The holes open through the tunnel roof in printed stages, so no drilling is needed. Test each hole with an offcut: it must drop in under its own weight and tip out again when the bar is turned over. If one is tight, twist a 3 mm drill down it by hand until it stops at the bottom of the hole, and go no further: the hole underneath is only 2 mm so that the pin cannot fall through. Shake the chips out of the tunnel from the back before the sensor goes in.
- Hook bar, underside: under each pin hole a 2 mm hole comes out through the bottom face of the bar. It lets a stuck pin be pushed out from below with a 1.5 mm rod, and it drains the cavity. Check that both are open once the brim is off.
- Hook bar, sensor tunnel: shine a torch into the tunnel from the back of the bar. It should be clean all the way to the nest, with no strings hanging from the roof. That roof is one flat surface from the back of the bar to the front of the nest, and the sensor slides in along it with the bar held upside down. If support ever got into the tunnel, the nest or the pin holes, reprint the bar with support off.
- Run the bar plate in and out of the channel a few times; if tight, a light pass with 400 grit on the plate flanks. Clearance is 0.45 mm per side.
- Gateway lid only: fit the 36 x 19.5 x 1 mm clear window insert from inside the lid under the two cleats. The hanger lid takes no insert and has no cleats: the display module sits in its pocket with the glass behind the 1.0 mm bezel.
- Wall screws: 4 x No.8 countersunk for the backplate, 2 x No.8 pan head plus 1 for the lower hole for the gateway.

## Two-colour logo (optional, uses the second hotend)

Load `print/hanger_lid.stl` and `print/hanger_lid_inlay.stl` together (same for the gateway lid). Use the copies in `print/`, which are
already rotated for printing and lined up with each other. Select both, right-click,
Merge models. Assign the lid to the hotend with the body colour (hotend 2 has the black PLA) and the inlay to the other hotend
(orange or yellow suits the brand). The badge, the HazardLink name and the PRG / RST names then print flush in the second colour
in the first three layers. Without the inlay file the same marks simply print as 0.6 mm sunken lines in one colour.

## Button pads

The two pads in each lid (PRG and RST) are flaps with a 0.8 mm hinge. On the hanger lid they run down the left edge. They print flat
on the bed, so they are strong in the direction they bend. Do not use a brim inside the 0.8 mm slots around them; if the first layer
closes a slot, run a blade along it. The 1.8 mm LED light hole should be open too; clear it with a pin if the first layer has closed it.
