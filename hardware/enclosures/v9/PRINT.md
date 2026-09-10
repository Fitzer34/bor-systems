# Printing the v9 enclosures on the BCN3D Epsilon W50

Files: `print/*.stl` are already rotated into the print orientation (do not rotate them in Stratos).
Material: PETG, 0.4 mm hotend. Slicer: BCN3D Stratos with its built-in BCN3D PETG profile for temperatures.

## Settings (Stratos, 0.4 hotend) - STRENGTH FIRST

The first print (Fine 0.15, 3 walls, 40 % infill) came out thin and poorly bonded. Use this instead:

| Setting | Value | Why |
|---|---|---|
| Layer height | 0.2 mm (Standard) | PETG bonds far better at 0.2; also about a third faster |
| Wall line count | 4 (1.6 mm) | the latch fingers are 1.6 mm = 4 lines at 0.4, no gap fill |
| Top / bottom thickness | 1.6 mm each | the 3 mm lid becomes a solid plate instead of two skins over sponge |
| Infill | 100 % for lid and bar; 60 % gyroid for bodies and backplate | the bar carries the sign and the lid is handled; both must be solid |
| Printing temperature | profile default + 10 C (about 245 C) | layer bonding in PETG |
| Fan | 30 % max, off for the first 3 layers | bonding; PETG does not need much cooling |
| Print speed | 35 mm/s, outer wall 25 mm/s | quality on the visible faces without starving the extruder |
| Enable bridge settings | on | the closed front of the bar channel is a 27 to 34 mm bridge |
| Adhesion | brim 5 mm | flat big faces |
| Supports | touching buildplate only, see per part | |

Dry the filament first if the spool has been open more than a couple of weeks: 65 C for 4 to 6 hours. Damp PETG prints weak and stringy no matter what the slicer says.

## Per part

| Part | Orientation (already applied) | Support |
|---|---|---|
| hanger_lid, gateway_lid | outer face on the bed, fingers and tabs pointing up | none |
| hanger_body, gateway_body | back face on the bed, open front up | none (channel end and hinge pockets are bridges) |
| hanger_backplate | back face on the bed, pegs pointing up | yes, touching buildplate only: it reaches the catch tongue through the window in the back face. Pull it out afterwards. |
| hanger_bar | standing on the bar's bottom face, lip pointing up | yes, touching buildplate: only under the front of the dovetail plate (it overhangs the bar). Use the second extruder with BVOH or PVA if loaded; otherwise PETG with 0.2 mm Z distance and break it off. |

IDEX: use Duplication mode to print two lids or two bars in one job when making pairs. Do not use Mirror mode (the parts are not symmetric).

## Order

1. Print one lid and one bar first. Check the latch click on a body coupon (the first 25 mm of hanger_body sliced with a Z cut) and the dovetail fit before committing to the full bodies.
2. Then hanger_body, backplate, gateway_body, gateway_lid.

## After printing

- Clean the 2.2 mm release holes with a 2 mm drill by hand.
- Run the bar plate in and out of the channel a few times; if tight, a light pass with 400 grit on the plate flanks. Clearance is 0.45 mm per side.
- Fit the 36 x 19.5 x 1 mm clear window insert from inside the lid under the two cleats.
- Wall screws: 4 x No.8 countersunk for the backplate, 2 x No.8 pan head plus 1 for the lower hole for the gateway.
