# Printing the v9 enclosures on the BCN3D Epsilon W50

Files: `print/*.stl` are already rotated into the print orientation (do not rotate them in Stratos).
Material: PETG, 0.4 mm hotend. Slicer: BCN3D Stratos with its built-in BCN3D PETG profile for temperatures.

## Settings (Stratos, both extruders 0.4)

| Setting | Value | Why |
|---|---|---|
| Layer height | 0.15 mm (Fine) | best finish on the visible lids; strong enough layer bonds for the latches |
| Line width | 0.45 mm | the latch fingers are 1.35 mm = exactly 3 lines, no gap fill in the spring |
| Wall line count | 3 | the design assumes 3 perimeters everywhere |
| Top / bottom layers | 5 / 5 | solid skins on the 2.5 mm walls |
| Infill | 40 % gyroid | stiffness for the bodies, fine for the bar |
| Print speed | 40 mm/s, outer wall 25 mm/s | PETG quality; slow walls on the fingers and tabs |
| Fan | PETG profile default, cap at 40 % on the lids | layer bonding in the spring latches |
| Enable bridge settings | on | the closed front of the bar channel is a 27 to 34 mm bridge |
| Z seam | back / sharpest corner | keeps the seam off the visible lid face |
| Adhesion | brim 5 mm (lids and bodies), skirt (bar, backplate) | flat big faces on an enclosed printer |
| Supports | see per part | |

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
