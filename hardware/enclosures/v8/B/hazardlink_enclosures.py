#!/usr/bin/env python
"""
HazardLink v8 enclosures, Designer B (fast to print and assemble).

Two units, both built around the Heltec WiFi LoRa 32 V3 (no mounting holes):

  HANGER   body + lid + backplate + bolt-on J-hook (4 printed parts)
  GATEWAY  body + lid (2 printed parts)

Frame used everywhere ("body frame"): X = width (left to right as seen from
the room), Y = height (up), Z = depth away from the wall. The body's back
face is Z = 0, the wall side. The lid sits on the body's open front.

Every number lives in PARAMS below with a source tag:
  datasheet   from a manufacturer document or the Heltec STEP/DWG
  research    from the research pack (community sources, computed fields)
  v7          carried over from hanger.scad v7 intent
  assumed     nobody published it, measure before freezing

Run:  cadenv/bin/python hazardlink_enclosures.py
Outputs (same folder): <part>.step, <part>.stl (print orientation),
<unit>_assembly.step, <part>_drawing.dxf (2D sections + dimensions),
<part>.png / <unit>_exploded.png previews, ref_*.step component envelopes,
and autocad/<part>.sat + -3dsolid.dxf via to_autocad.py (the six printed
parts are copied into hazardlink_B_parts/ and only those are converted; the
assemblies and ref_* envelopes are left out because their tessellation takes
minutes and AutoCAD gets every part on its own layer in the -all file anyway).
Set HZ_SKIP_AUTOCAD=1 to skip that stage while iterating on geometry.

BOARD MOUNT (both units): the two 18-pin headers that ship loose in the
Heltec kit are soldered pins DOWN. The board drops into a cradle of two
bars with a 2.0 mm wide, 7 mm deep groove each; the pin rows sit in the
grooves (locating X and Y), the header plastic rests on the bar tops
(locating Z), a flexible finger at the antenna tip clips over the PCB and
the lid carries pads that limit lift. No screws touch the board. Lift the
board straight out after unplugging the U.FL and the battery lead.

SERVICE SEQUENCE, HANGER (on the wall, nothing unmounted):
  1. Pin-Torx driver: remove the two M3 x 14 hook screws, lift the hook off
     (the Hall carrier slides out of the hook tunnel on its 3 wires).
  2. Push a flat blade into each of the two slots in the bottom face to
     release the snap tabs, swing the lid out from the bottom, unhook its
     two top tabs from the top wall pockets.
  3. Cell: lift the 21700 out of the holder by hand (holder stays put).
  4. Board: unplug the U.FL and the battery plug, lift the board out of the
     cradle (flex the tip clip finger).
  5. Reverse. The body only leaves the wall after the internal M3 screw
     at (50, 49) into the backplate insert is removed and the body is
     lifted 14 mm off the four pegs.
SERVICE SEQUENCE, GATEWAY: four M3 x 10 lid screws, lid off, USB-C plug
out, cable tie off the tie-down bar, U.FL off, board out of the cradle.

OLED WINDOW: 30 x 16 aperture aligned on the 128x64 active area (board
X 31.3, Y +0.5), with a 34 x 20 x 1.2 pocket on the lid's inner face for
an optional 1 mm clear insert (glue in with 4 dots of silicone). PRG is a
printed 10 x 16 x 0.6 mm membrane button with a pusher peg; RST is a 2 mm
pinhole; the LEDs show through a 2.4 mm hole.

MAGNET DATUM (hanger): the sign handle bar rests in the saddle in the hook
arm, 18 mm out from the hook's mounting face, centred on the hook width.
Put the 6 x 3 magnet on the underside of the bar (or the tag's bottom
face), pole axis vertical, centred on the bar width, so that its face is
1.0 to 1.5 mm inside the bar surface. Saddle floor to sensor package top
is 1.5 mm of print; total gap 3.5 to 4.5 mm gives 46 to 70 mT, 10x the
DRV5032FA worst-case operate point, and the sign is more than 30 mm away
once lifted off the hook.

No em-dashes anywhere in this file.
"""
import functools
import math
import os
import shutil
import subprocess
import sys
import time

import cadquery as cq
from cadquery import exporters
from cadquery.occ_impl.exporters.dxf import DxfDocument

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = HERE
OPENSCAD = "/Applications/OpenSCAD-2021.01.app/Contents/MacOS/OpenSCAD"
TO_AUTOCAD = os.path.normpath(os.path.join(HERE, "..", "..", "to_autocad.py"))

# ---------------------------------------------------------------------------
# PARAMS (mm). Tag in the comment: datasheet / research / v7 / assumed
# ---------------------------------------------------------------------------
P = {
    # --- FDM and fastener rules ------------------------------------------
    "WALL": 2.5,              # research: 2.4 min for an electronics box
    "LID_T": 3.0,             # research: 3.0 lid, it carries the hook
    "BP_T": 8.0,              # assumed: v7 had 9; pockets moved into the body so 8 holds the insert
    "CORNER_R": 5.0,          # v7
    "LIP_T": 1.8,             # research: 1.6 to 2.0
    "LIP_H": 4.0,             # research: 3 to 4
    "LIP_CLR": 0.25,          # research: 0.25 per side for PETG
    "INSERT_HOLE_D": 4.0,     # datasheet: ruthex RX-M3x5.7
    "INSERT_HOLE_DEPTH": 6.7, # datasheet: insert 5.7 + 1
    "BOSS_D": 8.0,            # research: 8 mm boss for a 4.6 insert
    "M3_CLR_D": 3.4,          # assumed: M3 clearance
    "M3_HEAD_D": 6.5,         # assumed: counterbore for a 5.7 button head
    "M3_HEAD_H": 2.5,         # assumed
    "WALLSCREW_D": 4.5,       # v7: No.8 / 4 mm wall screw clearance
    "WALLSCREW_CSK_D": 9.5,   # research: No.8 pan/csk head 8.2 + clearance
    "SNAP_W": 10.0,           # research: cantilever width >= 5, use 10
    "SNAP_L": 15.5,           # research: length 15
    "SNAP_ROOT": 1.6,         # research
    "SNAP_TIP": 0.8,          # research
    "SNAP_HOOK": 1.0,         # research: 1.5 to 2 for XY builds, 1.0 for a Z-built arm
    "PEG_STEM_D": 4.5,        # v7
    "PEG_STEM_L": 3.0,        # v7
    "PEG_CONE_H": 2.25,       # assumed: 45 deg cone under the head so the peg prints without support
    "PEG_HEAD_D": 9.0,        # v7
    "PEG_HEAD_T": 1.5,        # assumed (v7 2.5, cone takes the rest)
    "PEG_SLIDE": 14.0,        # v7: keyhole slide
    "POCKET_FLANGE": 2.5,     # assumed: slot flange the stem passes through
    "POCKET_SLOT_W": 5.5,     # research: stem + 0.5 per side
    "POCKET_HEAD_W": 10.0,    # research: head + 0.5 per side
    "POCKET_ROOF": 2.75,      # assumed: material over the head chamber
    "PEG_SPACING_X": 50.0,    # v7
    "PEG_Y_LOW": 25.0,        # v7 (final peg position in the body frame)
    "PEG_Y_HIGH": 80.0,       # v7

    # --- Heltec WiFi LoRa 32 V3 (board frame: X from USB end, Y to the PRG side, Z from PCB top)
    "HB_L": 51.69,            # datasheet (Heltec STEP, both models)
    "HB_W": 25.40,            # datasheet
    "HB_T": 1.6,              # datasheet (DWG side view)
    "HB_CLR": 0.3,            # research: per side
    "HDR_PITCH": 2.54,        # datasheet
    "HDR_N": 18,              # datasheet
    "HDR_ROW_Y": 11.43,       # datasheet: rows 22.86 apart
    "HDR_PIN1_X": 3.43,       # datasheet (STEP)
    "HDR_BODY_H": 2.5,        # assumed: standard 2.54 header plastic
    "HDR_PIN_LEN": 6.0,       # assumed: standard header pin below the plastic
    "HDR_PIN_SQ": 0.64,       # assumed: standard square pin
    "GROOVE_W": 2.0,          # assumed: pin 0.64 + FDM slot shrink allowance
    "GROOVE_DEPTH": 7.0,      # assumed: pin 6 + 1
    "GROOVE_END_CLR": 0.4,    # assumed: X play of the pin row in the groove
    "BAR_W": 5.0,             # assumed: cradle bar width
    "OLED_X0": 14.9,          # datasheet: OLED carrier envelope
    "OLED_X1": 47.9,          # datasheet
    "OLED_W": 18.56,          # datasheet
    "OLED_H": 5.0,            # datasheet: above PCB top
    "WIN_CX": 31.3,           # research: active area centre X
    "WIN_CY": 0.5,            # research: conservative window centre Y (active area is ~+1.0)
    "WIN_W": 30.0,            # research: conservative window
    "WIN_H": 16.0,            # research
    "INSERT_W": 34.0,         # assumed: pocket for a 33.5 x 19.5 x 1.0 clear insert
    "INSERT_H": 20.0,         # assumed
    "INSERT_T": 1.2,          # assumed: 1.0 insert + 0.2
    "USB_W": 8.94,            # datasheet
    "USB_H": 3.5,             # datasheet: shell top above PCB top
    "USB_X0": -0.56,          # datasheet
    "USB_X1": 7.7,            # datasheet
    "USB_CZ": 1.7,            # datasheet: opening centre above PCB top
    "USB_OPEN_W": 13.5,       # research: passes the 12.35 overmould
    "USB_OPEN_H": 8.0,        # research: passes the 6.5 overmould
    "PRG_X": 3.4,             # datasheet (STEP)
    "PRG_Y": 7.9,             # datasheet
    "BTN_H": 2.0,             # datasheet: tactile switch height above PCB top
    "BTN_L": 4.0,             # datasheet
    "BTN_W": 3.0,             # datasheet
    "IPEX_X": 50.4,           # datasheet
    "IPEX_L": 3.1,            # datasheet
    "IPEX_W": 3.0,            # datasheet
    "IPEX_H": 1.26,           # datasheet
    "UFL_PLUG_H": 2.5,        # assumed: U.FL plug above the socket
    "BAT_X0": 2.8,            # datasheet: SH1.25-2 socket on the underside
    "BAT_X1": 6.9,            # datasheet
    "BAT_W": 4.6,             # datasheet
    "BAT_H": 3.6,             # datasheet: below PCB bottom
    "LED_X": 8.1,             # datasheet: user LED and charge LED
    "LED_Y": -7.9,            # datasheet: -7.2 and -8.6, use the middle
    "LED_HOLE_D": 2.4,        # assumed: covers both LEDs
    "BLE_KEEPOUT": 15.0,      # research: last 10 mm of board + 5 beyond, no metal on top
    "RST_HOLE_D": 2.0,        # assumed: paperclip pinhole (prints ~1.7)
    "MEMBRANE_W": 10.0,       # assumed: printed PRG button, across X
    "MEMBRANE_L": 16.0,       # assumed: along Y
    "MEMBRANE_T": 0.6,        # assumed: 3 layers at 0.2
    "MARKER_DEPTH": 0.4,      # assumed: recessed ring on the outer face that shows where PRG is
    "PEG_PUSH_D": 4.0,        # assumed: pusher peg on the membrane
    "PEG_PUSH_GAP": 0.4,      # assumed: gap to the switch actuator at rest
    "PAD_LIFT": 2.5,          # assumed: lid pads sit 2.5 above the PCB top (over the pin stubs)
    "CLIP_T_HANGER": 1.6,     # assumed: tip clip finger thickness (0.6 % strain at 1 mm hook)
    "CLIP_T_GATEWAY": 1.4,    # assumed
    "CLIP_W": 5.0,            # assumed
    "CLIP_HOOK": 1.0,         # assumed

    # --- Cell and holder ------------------------------------------------
    "CELL_D": 21.25,          # datasheet: INR21700-50E max with sleeve
    "CELL_L": 70.8,           # datasheet
    "HOLDER_L": 80.0,         # assumed: generic leads holder, verify on the part (Keystone 1121 is 82.2)
    "HOLDER_W": 25.0,         # assumed
    "HOLDER_H": 21.0,         # assumed
    "BAY_CLR": 0.25,          # assumed: per side
    "BAY_LIP_H": 14.0,        # assumed: end wall height above the bay floor

    # --- Hall sensor carrier and magnet ---------------------------------
    "HALL_CARRIER": 8.0,      # assumed: 8 x 8 carrier PCB with the SOT-23 on top
    "HALL_CARRIER_T": 1.6,    # assumed
    "SOT23_H": 1.12,          # datasheet: DRV5032 DBZ max height
    "TUNNEL_W": 9.0,          # assumed: carrier + 0.5 per side
    "TUNNEL_H": 4.0,          # assumed: carrier 1.6 + SOT 1.12 + clearance
    "TUNNEL_L": 30.0,         # assumed: from the flange back face into the arm
    "SADDLE_OUT": 18.0,       # assumed: saddle centre from the hook mounting face
    "SADDLE_FLOOR_W": 10.0,   # assumed: handle bar 3 to 6 thick (assumed) seats here
    "SADDLE_TOP_W": 16.0,     # assumed
    "SADDLE_DEPTH": 2.0,      # assumed
    "SENSOR_WALL": 1.5,       # research: hanger wall 1.2 to 1.6 at the sensor
    "MAGNET_D": 6.0,          # datasheet
    "MAGNET_T": 3.0,          # datasheet

    # --- Hanger shell and layout ---------------------------------------
    "HG_W": 100.0,            # v7
    "HG_H": 130.0,            # v7
    "HG_D": 35.0,             # v7
    "HG_BP_W": 90.0,          # v7
    "HG_BP_H": 110.0,         # v7
    "HG_BP_SCREW_INSET": 10.0,# v7
    "HG_XU": 93.7,            # assumed: board USB end X (3.8 in from the right wall inner face)
    "HG_YC": 105.0,           # assumed: board centreline Y
    "HG_ZT": 27.0,            # assumed: PCB top Z (OLED top at 32, lid inner face at 35)
    "HG_BAY_X0": 8.5,         # assumed: holder bay
    "HG_BAY_Y0": 5.0,         # assumed
    "HG_BAY_Z0": 10.0,        # assumed: bay floor = keyhole boss tops
    "HG_PILLAR_X": 50.0,      # assumed: hook bolt pillars on the centreline
    "HG_HOOK_Y": 50.0,        # assumed: hook root height (v7 45, moved up 5 to clear the cell bay)
    "HG_SEC_SCREW": (50.0, 49.0),  # assumed: internal M3 body-to-backplate screw
    "HG_SNAP_X": (30.0, 70.0),     # assumed: bottom snap tabs
    "HG_HINGE_X": (30.0, 70.0),    # assumed: top hinge tabs
    "HG_SNAP_Z": 21.8,        # assumed: hook bearing face Z on the body's bottom wall slot
    "HG_SLOT_H": 2.6,         # assumed: release slot height in the bottom wall
    "HG_ANT_L": 60.0,         # assumed: kit spring antenna sleeve length, measure
    "HG_ANT_D": 6.0,          # assumed: kit spring antenna sleeve diameter, measure
    "HG_ANT_Y": 122.3,        # assumed: antenna channel centreline
    "HG_ANT_X": (12.0, 32.0), # assumed: antenna cradle positions
    "HG_LABEL": (30.0, 71.0, 40.0, 22.0),  # assumed: flat label area x, y, w, h

    # --- Hook ------------------------------------------------------------
    "HOOK_W": 22.0,           # v7
    "HOOK_ARM": 45.0,         # research: >= 45 for a folded sign (v7 32), measure the sign
    "HOOK_LIP": 22.0,         # v7
    "HOOK_T": 9.0,            # v7
    "HOOK_FLANGE_T": 5.0,     # assumed
    "HOOK_FLANGE_UP": 18.0,   # assumed: flange above the arm top
    "HOOK_FLANGE_DOWN": 20.0, # assumed: flange below the arm top
    "HOOK_BOLT_UP": 12.0,     # assumed: upper bolt above the arm top
    "HOOK_BOLT_DOWN": 14.0,   # assumed: lower bolt below the arm top

    # --- Gateway shell and layout --------------------------------------
    "GW_W": 101.0,            # assumed: 96 internal fits board + plug + cable clamp
    "GW_H": 63.0,             # assumed
    "GW_D": 26.5,             # assumed: OLED top 2.9 under the lid
    "GW_XU": 60.0,            # assumed: board USB end X
    "GW_YC": 26.0,            # assumed: board centreline Y
    "GW_ZT": 18.6,            # assumed: PCB top Z
    "GW_BOSS_INSET": 6.5,     # assumed
    "GW_KEYHOLE_X": (30.0, 70.0),  # assumed
    "GW_KEYHOLE_Y": 47.0,     # assumed: head hole centre, slot runs up 8
    "GW_KEYHOLE_SLIDE": 8.0,  # assumed
    "GW_KEYHOLE_HEAD_D": 10.0,# research: No.8 pan head 8.2 + clearance
    "GW_KEYHOLE_SLOT_W": 5.0, # research
    "GW_SMA_X": 78.0,         # assumed: top wall, nut pad 8 mm clear of the corner boss, 13 mm whip base clear of the lid screws
    "GW_SMA_Z": 14.0,         # assumed: mid depth
    "GW_SMA_D": 6.5,          # datasheet: SMA bulkhead D-hole
    "GW_SMA_FLAT": 6.0,       # datasheet: across the flat
    "GW_CABLE_Y": 26.0,       # derived: = GW_YC, the plug axis is on the board centreline (its Z is PCB top + 1.7)
    "GW_CABLE_D": 6.0,        # assumed: notch for a 3.5 to 5 mm cable
    "GW_TIE_X": 91.5,         # assumed: cable tie-down bar
    "GW_VENT_BOTTOM": (14.0, 26.0, 38.0, 50.0),  # assumed: slot start X, 8 long, 2 tall
    "GW_VENT_TOP": (56.0, 68.0),                 # assumed
    "GW_POSTS": ((45.0, 52.0), (60.0, 52.0)),    # assumed: pigtail slack posts
}

PETG_DENSITY = 1.27  # g/cm3, research


# ---------------------------------------------------------------------------
# Small geometry helpers
# ---------------------------------------------------------------------------
def box(x0, y0, z0, x1, y1, z1):
    return cq.Workplane("XY", origin=(min(x0, x1), min(y0, y1), min(z0, z1))).box(
        abs(x1 - x0), abs(y1 - y0), abs(z1 - z0), centered=False)


def rbox(x0, y0, z0, x1, y1, z1, r):
    return box(x0, y0, z0, x1, y1, z1).edges("|Z").fillet(r)


def cyl(x, y, z0, z1, d):
    return cq.Workplane("XY", origin=(x, y, min(z0, z1))).circle(d / 2).extrude(abs(z1 - z0))


def cyl_x(x0, x1, y, z, d):
    return cq.Workplane("YZ", origin=(min(x0, x1), 0, 0)).center(y, z).circle(d / 2).extrude(abs(x1 - x0))


def cyl_y(y0, y1, x, z, d):
    # XZ plane normal is -Y, so start at the high Y and extrude toward -Y
    return cq.Workplane("XZ", origin=(0, max(y0, y1), 0)).center(x, z).circle(d / 2).extrude(abs(y1 - y0))


def cone(x, y, z0, h, d0, d1):
    return cq.Workplane("XY").add(cq.Solid.makeCone(d0 / 2, d1 / 2, h, cq.Vector(x, y, z0), cq.Vector(0, 0, 1)))


def slot_z(x, y, z0, z1, cc_len, w, angle=0):
    """Stadium (slot) extruded along Z, centred at (x, y); cc_len is centre to centre."""
    return cq.Workplane("XY", origin=(x, y, min(z0, z1))).slot2D(cc_len + w, w, angle).extrude(abs(z1 - z0))


def poly_yz(pts, x0, dx):
    """Polygon in the YZ plane extruded along +X from x0."""
    return cq.Workplane("YZ", origin=(x0, 0, 0)).polyline(pts).close().extrude(dx)


def poly_xz(pts, y0, dy):
    """Polygon in the XZ plane, covering y0 .. y0+dy."""
    return cq.Workplane("XZ", origin=(0, y0 + dy, 0)).polyline(pts).close().extrude(dy)


def union_all(shapes):
    return functools.reduce(lambda a, b: a.union(b), shapes)


def bbox_str(wp):
    bb = wp.val().BoundingBox()
    return (f"{bb.xlen:.2f} x {bb.ylen:.2f} x {bb.zlen:.2f}  "
            f"[X {bb.xmin:.2f}..{bb.xmax:.2f}  Y {bb.ymin:.2f}..{bb.ymax:.2f}  Z {bb.zmin:.2f}..{bb.zmax:.2f}]")


def volume_cm3(wp):
    return wp.val().Volume() / 1000.0


# ---------------------------------------------------------------------------
# Heltec envelope (board frame) and its placement
# ---------------------------------------------------------------------------
def heltec_envelope():
    """Reference solid: PCB outline, OLED, USB-C, buttons, IPEX + plug, battery
    socket, headers pins down (V3.2 block antenna included). Board frame."""
    L = P["HB_L"]
    outline = [(0, 5.27), (0, 10.54), (2.16, 12.70), (47.88, 12.70), (47.88, 8.89),
               (L, 5.08), (L, -5.08), (47.88, -8.89), (47.88, -12.70), (2.16, -12.70),
               (0, -10.54), (0, -5.27), (1.27, -4.0), (1.27, 4.0)]
    pcb = cq.Workplane("XY", origin=(0, 0, -P["HB_T"])).polyline(outline).close().extrude(P["HB_T"])
    parts = [pcb]
    parts.append(box(P["OLED_X0"], -P["OLED_W"] / 2, 0, P["OLED_X1"], P["OLED_W"] / 2, P["OLED_H"]))
    parts.append(box(P["USB_X0"], -P["USB_W"] / 2, 0, P["USB_X1"], P["USB_W"] / 2, P["USB_H"]))
    for sy in (1, -1):
        parts.append(box(P["PRG_X"] - P["BTN_L"] / 2, sy * P["PRG_Y"] - P["BTN_W"] / 2, 0,
                         P["PRG_X"] + P["BTN_L"] / 2, sy * P["PRG_Y"] + P["BTN_W"] / 2, P["BTN_H"]))
    ipx0 = P["IPEX_X"] - P["IPEX_L"] / 2
    parts.append(box(ipx0, -P["IPEX_W"] / 2, 0, min(L, ipx0 + P["IPEX_L"]), P["IPEX_W"] / 2,
                     P["IPEX_H"] + P["UFL_PLUG_H"]))
    parts.append(box(P["BAT_X0"], -P["BAT_W"] / 2, -P["HB_T"] - P["BAT_H"], P["BAT_X1"], P["BAT_W"] / 2, -P["HB_T"]))
    hx0 = P["HDR_PIN1_X"] - P["HDR_PITCH"] / 2
    hx1 = P["HDR_PIN1_X"] + (P["HDR_N"] - 0.5) * P["HDR_PITCH"]
    px0 = P["HDR_PIN1_X"] - P["HDR_PIN_SQ"] / 2
    px1 = P["HDR_PIN1_X"] + (P["HDR_N"] - 1) * P["HDR_PITCH"] + P["HDR_PIN_SQ"] / 2
    zb = -P["HB_T"] - P["HDR_BODY_H"]
    for sy in (1, -1):
        ry = sy * P["HDR_ROW_Y"]
        parts.append(box(hx0, ry - P["HDR_PITCH"] / 2, zb, hx1, ry + P["HDR_PITCH"] / 2, -P["HB_T"]))
        parts.append(box(px0, ry - P["HDR_PIN_SQ"] / 2, zb - P["HDR_PIN_LEN"], px1, ry + P["HDR_PIN_SQ"] / 2, zb))
        # pin stubs above the PCB (soldered short ends), 1.5 assumed
        parts.append(box(px0, ry - P["HDR_PIN_SQ"] / 2, 0, px1, ry + P["HDR_PIN_SQ"] / 2, 1.5))
    # V3.2 SMD block antenna at the +Y corner of the antenna end (assumed size)
    parts.append(box(46.0, 8.0, 0, L, 12.7, 1.6))
    return union_all(parts)


def place_board(wp, xu, yc, zt):
    """Board frame -> body frame: USB end at X=xu (board X runs toward -X),
    board +Y runs toward -Y (right handed), PCB top at Z=zt."""
    return wp.rotate((0, 0, 0), (0, 0, 1), 180).translate((xu, yc, zt))


def bx(xu, board_x):
    return xu - board_x


def by(yc, board_y):
    return yc - board_y


# ---------------------------------------------------------------------------
# Shared board cradle (body frame)
# ---------------------------------------------------------------------------
def cradle(xu, yc, zt, floor_z, x_bar_end, clip_t, clip_z0):
    """Two grooved bars under the header rows + a flexible clip finger at the
    antenna tip. Returns (adds, cuts)."""
    adds, cuts = [], []
    bar_top = zt - P["HB_T"] - P["HDR_BODY_H"]
    g0 = bx(xu, P["HDR_PIN1_X"] + (P["HDR_N"] - 1) * P["HDR_PITCH"] + P["HDR_PIN_SQ"] / 2 + P["GROOVE_END_CLR"])
    g1 = bx(xu, P["HDR_PIN1_X"] - P["HDR_PIN_SQ"] / 2 - P["GROOVE_END_CLR"])
    for sy in (1, -1):
        ry = by(yc, sy * P["HDR_ROW_Y"])
        adds.append(box(g0 - 2.0, ry - P["BAR_W"] / 2, floor_z - 0.5, x_bar_end, ry + P["BAR_W"] / 2, bar_top))
        cuts.append(box(g0, ry - P["GROOVE_W"] / 2, bar_top - P["GROOVE_DEPTH"], g1, ry + P["GROOVE_W"] / 2, bar_top + 1))
    # tip clip finger on the RST side (away from the V3.2 block antenna corner)
    x_tip = bx(xu, P["HB_L"])
    xf1 = x_tip - P["HB_CLR"]
    xf0 = xf1 - clip_t
    yf = by(yc, -4.25)  # board -Y side = body +Y side
    hk = P["CLIP_HOOK"]
    prof = [(xf0, clip_z0), (xf1, clip_z0), (xf1, zt + 0.2), (xf1 + P["HB_CLR"] + hk, zt + 0.2),
            (xf1 + P["HB_CLR"] + hk, zt + 0.8), (xf1, zt + 0.8 + P["HB_CLR"] + hk + 0.3), (xf0, zt + 0.8 + P["HB_CLR"] + hk + 0.3)]
    adds.append(poly_xz(prof, yf - P["CLIP_W"] / 2, P["CLIP_W"]))
    if clip_z0 > floor_z + 0.1:
        adds.append(box(xf0 - 2.0, yf - P["CLIP_W"] / 2 - 1.5, floor_z - 0.5, xf1, yf + P["CLIP_W"] / 2 + 1.5, clip_z0 + 0.1))
    return adds, cuts


def lid_board_features(xu, yc, zt, z_in, z_out):
    """Lid features over the board: OLED aperture + insert pocket + frame rib,
    PRG membrane + pusher, RST pinhole, LED hole, hold-down pads. (adds, cuts)"""
    adds, cuts = [], []
    wx, wy = bx(xu, P["WIN_CX"]), by(yc, P["WIN_CY"])
    cuts.append(box(wx - P["WIN_W"] / 2, wy - P["WIN_H"] / 2, z_in - 1, wx + P["WIN_W"] / 2, wy + P["WIN_H"] / 2, z_out + 1))
    cuts.append(box(wx - P["INSERT_W"] / 2, wy - P["INSERT_H"] / 2, z_in - 0.1,
                    wx + P["INSERT_W"] / 2, wy + P["INSERT_H"] / 2, z_in + P["INSERT_T"]))
    # frame rib around the OLED carrier, 1.5 wide, inner opening clears the insert
    ro_w, ro_h = P["INSERT_W"] + 4.5, P["INSERT_H"] + 4.0
    ri_w, ri_h = P["INSERT_W"] + 1.5, P["INSERT_H"] + 1.0
    oled_top = zt + P["OLED_H"]
    rib_z0 = oled_top + 1.5
    rib = (rbox(wx - ro_w / 2, wy - ro_h / 2, rib_z0, wx + ro_w / 2, wy + ro_h / 2, z_in + 0.1, 2.0)
           .cut(box(wx - ri_w / 2, wy - ri_h / 2, rib_z0 - 1, wx + ri_w / 2, wy + ri_h / 2, z_in + 1)))
    adds.append(rib)
    # PRG membrane button
    px, py = bx(xu, P["PRG_X"]), by(yc, P["PRG_Y"])
    cuts.append(box(px - P["MEMBRANE_W"] / 2, py - P["MEMBRANE_L"] / 2, z_in - 0.1,
                    px + P["MEMBRANE_W"] / 2, py + P["MEMBRANE_L"] / 2, z_out - P["MEMBRANE_T"]))
    peg_z0 = zt + P["BTN_H"] + P["PEG_PUSH_GAP"]
    adds.append(cyl(px, py, peg_z0, z_out - P["MEMBRANE_T"] + 0.1, P["PEG_PUSH_D"]))
    # recessed marker ring around the membrane so the installer can find the button
    mw, ml = P["MEMBRANE_W"], P["MEMBRANE_L"]
    ring = (rbox(px - mw / 2 - 2.0, py - ml / 2 - 2.0, z_out - P["MARKER_DEPTH"], px + mw / 2 + 2.0, py + ml / 2 + 2.0, z_out + 1, 2.5)
            .cut(rbox(px - mw / 2 - 1.0, py - ml / 2 - 1.0, z_out - P["MARKER_DEPTH"] - 1, px + mw / 2 + 1.0, py + ml / 2 + 1.0, z_out + 2, 1.5)))
    cuts.append(ring)
    # RST pinhole
    rx, ry_ = bx(xu, P["PRG_X"]), by(yc, -P["PRG_Y"])
    cuts.append(cyl(rx, ry_, z_in - 1, z_out + 1, P["RST_HOLE_D"]))
    # LED window
    cuts.append(cyl(bx(xu, P["LED_X"]), by(yc, P["LED_Y"]), z_in - 1, z_out + 1, P["LED_HOLE_D"]))
    # hold-down pads over the header rows, two per row, 1.6 wide, 6 long
    pad_z0 = zt + P["PAD_LIFT"]
    for sy in (1, -1):
        ry = by(yc, sy * P["HDR_ROW_Y"])
        for bxo in (41.0, 23.0):
            x = bx(xu, bxo)
            adds.append(box(x - 3, ry - 0.8, pad_z0, x + 3, ry + 0.8, z_in + 0.1))
    return adds, cuts


def lip_ring(x0, y0, x1, y1, z0, z1, cavity_r):
    """Lid lip: ring inside the body cavity (x0..x1, y0..y1 is the cavity)."""
    c = P["LIP_CLR"]
    t = P["LIP_T"]
    outer = rbox(x0 + c, y0 + c, z0, x1 - c, y1 - c, z1, max(cavity_r - c, 0.5))
    inner = rbox(x0 + c + t, y0 + c + t, z0 - 1, x1 - c - t, y1 - c - t, z1 + 1, 0.5)
    return outer.cut(inner)


# ---------------------------------------------------------------------------
# HANGER
# ---------------------------------------------------------------------------
def hanger_derived():
    d = {}
    W, H, D, WALL = P["HG_W"], P["HG_H"], P["HG_D"], P["WALL"]
    d["bay_x1"] = P["HG_BAY_X0"] + P["HOLDER_L"] + 2 * P["BAY_CLR"] + 2.5
    d["bay_y1"] = P["HG_BAY_Y0"] + P["HOLDER_W"] + 2 * P["BAY_CLR"]
    d["bay_z1"] = P["HG_BAY_Z0"] + P["HOLDER_H"] + 0.5
    d["peg_x"] = (W / 2 - P["PEG_SPACING_X"] / 2, W / 2 + P["PEG_SPACING_X"] / 2)
    d["peg_y"] = (P["PEG_Y_LOW"], P["PEG_Y_HIGH"])
    d["peg_len"] = P["PEG_STEM_L"] + P["PEG_CONE_H"] + P["PEG_HEAD_T"]
    d["chamber_z0"] = P["POCKET_FLANGE"]
    d["chamber_z1"] = d["peg_len"] + 0.5
    d["boss_t"] = d["chamber_z1"] + P["POCKET_ROOF"]
    d["pillar_y"] = (P["HG_HOOK_Y"] - P["HOOK_BOLT_DOWN"], P["HG_HOOK_Y"] + P["HOOK_BOLT_UP"])
    d["z_lid_in"] = D
    d["z_lid_out"] = D + P["LID_T"]
    d["bp_x0"] = (W - P["HG_BP_W"]) / 2
    d["bp_y0"] = (H - P["HG_BP_H"]) / 2
    d["hall_hole"] = (P["HG_PILLAR_X"], P["HG_HOOK_Y"] - (P["HOOK_T"] - P["SADDLE_DEPTH"] - P["SENSOR_WALL"]) + P["TUNNEL_H"] / 2 * 0)
    # tunnel centre in hook frame: Yh from -(saddle depth + wall) down by tunnel H
    tun_top = -(P["SADDLE_DEPTH"] + P["SENSOR_WALL"])
    d["tunnel_y"] = (tun_top - P["TUNNEL_H"], tun_top)
    d["hall_hole"] = (P["HG_PILLAR_X"], P["HG_HOOK_Y"] + (tun_top - P["TUNNEL_H"] / 2))
    return d


def build_hanger_body():
    W, H, D, WALL = P["HG_W"], P["HG_H"], P["HG_D"], P["WALL"]
    R = P["CORNER_R"]
    d = hanger_derived()
    xu, yc, zt = P["HG_XU"], P["HG_YC"], P["HG_ZT"]
    shell = rbox(0, 0, 0, W, H, D, R).cut(rbox(WALL, WALL, WALL, W - WALL, H - WALL, D + 1, R - WALL))
    adds, cuts = [], []

    # keyhole bosses on the back wall (pockets open on the back face, pegs come from the backplate)
    for px in d["peg_x"]:
        for py in d["peg_y"]:
            yh = py - P["PEG_SLIDE"]          # head enters here, body then drops 14 mm
            y0 = max(WALL, yh - 7.0)
            y1 = yh + P["PEG_SLIDE"] + 7.0
            adds.append(box(px - 8, y0, 0, px + 8, y1, d["boss_t"]))
            # flange layer: head hole + stem slot
            cuts.append(cyl(px, yh, -1, d["chamber_z0"], P["POCKET_HEAD_W"]))
            cuts.append(slot_z(px, yh + P["PEG_SLIDE"] / 2, -1, d["chamber_z0"], P["PEG_SLIDE"], P["POCKET_SLOT_W"], 90))
            # head chamber
            cuts.append(slot_z(px, yh + P["PEG_SLIDE"] / 2, d["chamber_z0"] - 0.01, d["chamber_z1"], P["PEG_SLIDE"], P["POCKET_HEAD_W"], 90))

    # cell holder bay: floor = lower boss tops + a centre rib, end walls, side strips
    bx0, by0, bz0 = P["HG_BAY_X0"], P["HG_BAY_Y0"], P["HG_BAY_Z0"]
    bx1, by1, bz1 = d["bay_x1"], d["bay_y1"], d["bay_z1"]
    adds.append(box(W / 2 - 3, by0, WALL - 0.5, W / 2 + 3, by1, bz0))                        # centre floor rib
    adds.append(box(bx0 - 2.0, by0, WALL - 0.5, bx0, by1, bz0 + P["BAY_LIP_H"]))           # left end wall
    adds.append(box(bx1, by0, WALL - 0.5, bx1 + 2.0, by1, bz0 + P["BAY_LIP_H"]))           # right end wall
    adds.append(box(bx0 + 3.5, WALL - 0.5, bz0, bx1 - 3.5, by0, 19.0))                     # bottom side strip
    for (sx0, sx1) in ((bx0 + 3.5, W / 2 - 6.0), (W / 2 + 6.0, bx1 - 3.5)):
        adds.append(box(sx0, by1, bz0, sx1, by1 + 2.0, 22.0))                               # top side strip (gap for the pillar)
    cuts.append(box(bx1 - 0.5, by0 + 9.0, bz0 + 6.0, bx1 + 2.5, by0 + 15.0, bz0 + P["BAY_LIP_H"] + 1))  # lead notch

    # board cradle + tip clip
    c_adds, c_cuts = cradle(xu, yc, zt, WALL, W - WALL + 1.0, P["CLIP_T_HANGER"], 8.0)
    adds += c_adds
    cuts += c_cuts

    # hook bolt pillars with heat-set inserts, tops flush with the rim
    for py in d["pillar_y"]:
        adds.append(cyl(P["HG_PILLAR_X"], py, WALL - 0.5, D, P["BOSS_D"]))
        cuts.append(cyl(P["HG_PILLAR_X"], py, D - P["INSERT_HOLE_DEPTH"], D + 1, P["INSERT_HOLE_D"]))

    # internal body-to-backplate security screw (M3 clearance through the back wall)
    sx, sy = P["HG_SEC_SCREW"]
    cuts.append(cyl(sx, sy, -1, WALL + 1, P["M3_CLR_D"]))

    # USB-C opening in the right wall, 13.5 x 8, centred 1.7 above the PCB top
    uz = zt + P["USB_CZ"]
    usb = (cq.Workplane("YZ", origin=(W - WALL - 1.0, 0, 0)).center(yc, uz)
           .rect(P["USB_OPEN_W"], P["USB_OPEN_H"]).extrude(WALL + 2.0).edges("|X").fillet(2.0))
    cuts.append(usb)

    # snap-tab release slots through the bottom wall (also the catch)
    for sx_ in P["HG_SNAP_X"]:
        cuts.append(box(sx_ - 6, -1, P["HG_SNAP_Z"] - P["HG_SLOT_H"] + 0.2, sx_ + 6, WALL + 1, P["HG_SNAP_Z"] + 0.2))

    # hinge-tab pads and pockets on the top wall
    for hx in P["HG_HINGE_X"]:
        adds.append(box(hx - 6, H - WALL - 2.0, WALL - 0.5, hx + 6, H - WALL + 0.5, D - P["LIP_H"] - 1.8))
        cuts.append(box(hx - 6, H - WALL - 2.0 - 0.1, D - P["LIP_H"] - 1.8 - 2.6, hx + 6, H - WALL - 0.2, D - P["LIP_H"] - 1.8 + 1))

    # antenna cradles along the top wall (U with 0.4 lips)
    ay, ad = P["HG_ANT_Y"], P["HG_ANT_D"]
    az = WALL + 1.5 + ad / 2 + 0.2
    for ax in P["HG_ANT_X"]:
        blk = box(ax - 2.5, ay - ad / 2 - 2.0, WALL - 0.5, ax + 2.5, ay + ad / 2 + 2.0, az + ad / 2 + 1.0)
        blk = blk.cut(cyl_x(ax - 3, ax + 3, ay, az, ad + 0.4))
        blk = blk.cut(box(ax - 3, ay - ad / 2 + 0.2, az, ax + 3, ay + ad / 2 - 0.2, az + ad + 2))
        adds.append(blk)

    body = shell.union(union_all(adds)).cut(union_all(cuts))
    return body


def build_hanger_lid():
    W, H, D, WALL = P["HG_W"], P["HG_H"], P["HG_D"], P["WALL"]
    R = P["CORNER_R"]
    d = hanger_derived()
    xu, yc, zt = P["HG_XU"], P["HG_YC"], P["HG_ZT"]
    z_in, z_out = d["z_lid_in"], d["z_lid_out"]
    plate = rbox(0, 0, z_in, W, H, z_out, R)
    adds, cuts = lid_board_features(xu, yc, zt, z_in, z_out)

    # lip, notched at the USB-C port and at the two bottom snap tabs
    lip = lip_ring(WALL, WALL, W - WALL, H - WALL, z_in - P["LIP_H"], z_in + 0.1, R - WALL)
    lip = lip.cut(box(W - WALL - 4, yc - P["USB_OPEN_W"] / 2 - 1.5, z_in - P["LIP_H"] - 1, W, yc + P["USB_OPEN_W"] / 2 + 1.5, z_in))
    for sx_ in P["HG_SNAP_X"]:
        lip = lip.cut(box(sx_ - 6.5, 0, z_in - P["LIP_H"] - 1, sx_ + 6.5, WALL + 3, z_in))
    adds.append(lip)

    # bottom snap tabs: tapered cantilever, 30 deg lead-in, hook into the wall slot
    yo = WALL + P["LIP_CLR"]
    zh = P["HG_SNAP_Z"]
    tip_z = zh - 2.3
    hk = P["SNAP_HOOK"]
    pts = [(yo, z_in + 0.1), (yo + P["SNAP_ROOT"] + 1.0, z_in + 0.1), (yo + P["SNAP_ROOT"], z_in - 1.0),
           (yo + P["SNAP_TIP"], tip_z), (yo, tip_z), (yo - hk, tip_z + hk * 1.73), (yo - hk, zh), (yo, zh)]
    for sx_ in P["HG_SNAP_X"]:
        adds.append(poly_yz(pts, sx_ - P["SNAP_W"] / 2, P["SNAP_W"]))

    # top hinge tabs: L shaped feet into the top wall pockets
    y_pad = H - WALL - 2.0            # pad inner face
    leg_o = y_pad - P["LIP_CLR"]
    foot_z1 = D - P["LIP_H"] - 1.8 - 0.2
    foot_z0 = foot_z1 - 2.2
    hpts = [(leg_o - 2.0, z_in + 0.1), (leg_o, z_in + 0.1), (leg_o, foot_z1), (y_pad + 1.55, foot_z1),
            (y_pad + 1.55, foot_z0), (leg_o - 2.0, foot_z0)]
    for hx in P["HG_HINGE_X"]:
        adds.append(poly_yz(hpts, hx - 5.0, 10.0))

    # hook bolt clearance holes and the Hall wire hole (all under the hook flange)
    for py in d["pillar_y"]:
        cuts.append(cyl(P["HG_PILLAR_X"], py, z_in - 1, z_out + 1, P["M3_CLR_D"]))
    hx_, hy_ = d["hall_hole"]
    cuts.append(cyl(hx_, hy_, z_in - 1, z_out + 1, 6.0))

    lid = plate.cut(union_all(cuts)).union(union_all(adds))
    return lid


def build_hanger_backplate():
    W, H = P["HG_W"], P["HG_H"]
    d = hanger_derived()
    T = P["BP_T"]
    x0, y0 = d["bp_x0"], d["bp_y0"]
    x1, y1 = x0 + P["HG_BP_W"], y0 + P["HG_BP_H"]
    plate = rbox(x0, y0, -T, x1, y1, 0, P["CORNER_R"])
    adds, cuts = [], []
    ins = P["HG_BP_SCREW_INSET"]
    for x in (x0 + ins, x1 - ins):
        for y in (y0 + ins, y1 - ins):
            cuts.append(cyl(x, y, -T - 1, 1, P["WALLSCREW_D"]))
            csk_h = (P["WALLSCREW_CSK_D"] - P["WALLSCREW_D"]) / 2
            cuts.append(cone(x, y, -csk_h, csk_h + 0.01, P["WALLSCREW_D"], P["WALLSCREW_CSK_D"] + 0.02))
    # pegs (print vertical on the front face): stem, 45 deg cone, head
    for px in d["peg_x"]:
        for py in d["peg_y"]:
            adds.append(cyl(px, py, -0.5, P["PEG_STEM_L"], P["PEG_STEM_D"]))
            adds.append(cone(px, py, P["PEG_STEM_L"] - 0.01, P["PEG_CONE_H"] + 0.01, P["PEG_STEM_D"], P["PEG_HEAD_D"]))
            adds.append(cyl(px, py, P["PEG_STEM_L"] + P["PEG_CONE_H"] - 0.01, d["peg_len"], P["PEG_HEAD_D"]))
    # heat-set insert for the internal security screw
    sx, sy = P["HG_SEC_SCREW"]
    cuts.append(cyl(sx, sy, -P["INSERT_HOLE_DEPTH"], 1, P["INSERT_HOLE_D"]))
    return plate.union(union_all(adds)).cut(union_all(cuts))


def build_hook():
    """Hook in its own frame: Xh width (0 centred), Yh up (0 = arm top at the
    root), Zh out from the mounting face (0 = face on the lid). Body frame
    placement is a pure translation (50, HG_HOOK_Y, lid outer face)."""
    hw = P["HOOK_W"]
    ft, fu, fd = P["HOOK_FLANGE_T"], P["HOOK_FLANGE_UP"], P["HOOK_FLANGE_DOWN"]
    arm, lip, t = P["HOOK_ARM"], P["HOOK_LIP"], P["HOOK_T"]
    z_end = ft + arm
    prof = [(-fd, 0), (fu, 0), (fu, ft), (0, ft), (0, z_end - t), (lip, z_end - t), (lip, z_end),
            (-t, z_end), (-t, ft), (-fd, ft)]
    hook = poly_yz(prof, -hw / 2, hw)
    cuts = []
    # saddle in the arm top
    sc = ft + P["SADDLE_OUT"]
    sfw, stw, sd = P["SADDLE_FLOOR_W"], P["SADDLE_TOP_W"], P["SADDLE_DEPTH"]
    spts = [(0.5, sc - stw / 2 - 0.5), (-sd, sc - sfw / 2), (-sd, sc + sfw / 2), (0.5, sc + stw / 2 + 0.5)]
    cuts.append(poly_yz(spts, -hw / 2 - 1, hw + 2))
    # Hall carrier tunnel from the mounting face into the arm, under the saddle
    ty0 = -(sd + P["SENSOR_WALL"]) - P["TUNNEL_H"]
    ty1 = -(sd + P["SENSOR_WALL"])
    cuts.append(box(-P["TUNNEL_W"] / 2, ty0, -1, P["TUNNEL_W"] / 2, ty1, P["TUNNEL_L"]))
    # two M3 bolts with counterbores from the front
    for yb in (P["HOOK_BOLT_UP"], -P["HOOK_BOLT_DOWN"]):
        cuts.append(cyl(0, yb, -1, ft + 1, P["M3_CLR_D"]))
        cuts.append(cyl(0, yb, ft - P["M3_HEAD_H"], ft + 1, P["M3_HEAD_D"]))
    return hook.cut(union_all(cuts))


def hanger_reference_envelopes():
    d = hanger_derived()
    heltec = place_board(heltec_envelope(), P["HG_XU"], P["HG_YC"], P["HG_ZT"])
    hx0 = P["HG_BAY_X0"] + P["BAY_CLR"] + 1.25
    hy0 = P["HG_BAY_Y0"] + P["BAY_CLR"]
    holder = box(hx0, hy0, P["HG_BAY_Z0"], hx0 + P["HOLDER_L"], hy0 + P["HOLDER_W"], P["HG_BAY_Z0"] + P["HOLDER_H"])
    az = P["WALL"] + 1.5 + P["HG_ANT_D"] / 2 + 0.2
    antenna = cyl_x(5.0, 5.0 + P["HG_ANT_L"], P["HG_ANT_Y"], az, P["HG_ANT_D"])
    # Hall carrier in the hook tunnel (body frame)
    hz0 = d["z_lid_out"] + P["HOOK_FLANGE_T"] + P["SADDLE_OUT"] - P["HALL_CARRIER"] / 2
    ty0, ty1 = d["tunnel_y"]
    hall = box(50 - P["HALL_CARRIER"] / 2, P["HG_HOOK_Y"] + ty0 + 0.2, hz0, 50 + P["HALL_CARRIER"] / 2,
               P["HG_HOOK_Y"] + ty0 + 0.2 + P["HALL_CARRIER_T"] + P["SOT23_H"], hz0 + P["HALL_CARRIER"])
    return {"ref_heltec_hanger": heltec, "ref_cell_holder": holder, "ref_stub_antenna": antenna, "ref_hall_carrier": hall}


# ---------------------------------------------------------------------------
# GATEWAY
# ---------------------------------------------------------------------------
def build_gateway_body():
    W, H, D, WALL = P["GW_W"], P["GW_H"], P["GW_D"], P["WALL"]
    R = P["CORNER_R"]
    xu, yc, zt = P["GW_XU"], P["GW_YC"], P["GW_ZT"]
    shell = rbox(0, 0, 0, W, H, D, R).cut(rbox(WALL, WALL, WALL, W - WALL, H - WALL, D + 1, R - WALL))
    adds, cuts = [], []
    # corner bosses with heat-set inserts
    ins = P["GW_BOSS_INSET"]
    for x in (ins, W - ins):
        for y in (ins, H - ins):
            adds.append(cyl(x, y, WALL - 0.5, D, P["BOSS_D"]))
            cuts.append(cyl(x, y, D - P["INSERT_HOLE_DEPTH"], D + 1, P["INSERT_HOLE_D"]))
    # board cradle
    g_end = bx(xu, P["HDR_PIN1_X"] - P["HDR_PIN_SQ"] / 2 - P["GROOVE_END_CLR"]) + 2.0
    c_adds, c_cuts = cradle(xu, yc, zt, WALL, g_end, P["CLIP_T_GATEWAY"], WALL - 0.5)
    adds += c_adds
    cuts += c_cuts
    # keyholes through the back wall with raised pads inside
    ky = P["GW_KEYHOLE_Y"]
    for kx in P["GW_KEYHOLE_X"]:
        adds.append(box(kx - 7, ky - 6.5, WALL - 0.5, kx + 7, ky + P["GW_KEYHOLE_SLIDE"] + 6.0, WALL + 1.5))
        cuts.append(cyl(kx, ky, -1, WALL + 2.5, P["GW_KEYHOLE_HEAD_D"]))
        cuts.append(slot_z(kx, ky + P["GW_KEYHOLE_SLIDE"] / 2, -1, WALL + 2.5, P["GW_KEYHOLE_SLIDE"], P["GW_KEYHOLE_SLOT_W"], 90))
    # SMA bulkhead D-hole through the top wall
    sx, sz = P["GW_SMA_X"], P["GW_SMA_Z"]
    sma = cyl_y(H - WALL - 1.0, H + 1.0, sx, sz, P["GW_SMA_D"])
    flat = box(sx - P["GW_SMA_D"], H - WALL - 2, sz - 6, sx + (P["GW_SMA_FLAT"] - P["GW_SMA_D"] / 2), H + 2, sz + 6)
    cuts.append(sma.intersect(flat))
    # USB-C cable notch in the right wall, closed by the lid
    cy_ = P["GW_CABLE_Y"]
    notch = (cq.Workplane("YZ", origin=(W - WALL - 1.0, 0, 0)).center(cy_, D + 2.0)
             .slot2D(2 * (D + 2.0 - (zt + P["USB_CZ"])) + P["GW_CABLE_D"], P["GW_CABLE_D"], 90).extrude(WALL + 2.0))
    cuts.append(notch)
    # cable tie-down bar (bridge) between the plug and the wall
    tx = P["GW_TIE_X"]
    adds.append(box(tx, cy_ - 5.5, 12.0, tx + 3.0, cy_ + 5.5, 15.0))
    adds.append(box(tx, cy_ - 5.5, WALL - 0.5, tx + 3.0, cy_ - 4.0, 15.0))
    adds.append(box(tx, cy_ + 4.0, WALL - 0.5, tx + 3.0, cy_ + 5.5, 15.0))
    # pigtail slack posts
    for (px_, py_) in P["GW_POSTS"]:
        adds.append(cyl(px_, py_, WALL - 0.5, 14.0, 4.0))
    # vents: intake in the bottom wall, exhaust in the top wall, 8 x 2 slots
    for vx in P["GW_VENT_BOTTOM"]:
        cuts.append(box(vx, -1, 5.0, vx + 8.0, WALL + 1, 7.0))
    for vx in P["GW_VENT_TOP"]:
        cuts.append(box(vx, H - WALL - 1, 5.0, vx + 8.0, H + 1, 7.0))
    return shell.union(union_all(adds)).cut(union_all(cuts))


def build_gateway_lid():
    W, H, D, WALL = P["GW_W"], P["GW_H"], P["GW_D"], P["WALL"]
    R = P["CORNER_R"]
    xu, yc, zt = P["GW_XU"], P["GW_YC"], P["GW_ZT"]
    z_in, z_out = D, D + P["LID_T"]
    plate = rbox(0, 0, z_in, W, H, z_out, R)
    adds, cuts = lid_board_features(xu, yc, zt, z_in, z_out)
    lip = lip_ring(WALL, WALL, W - WALL, H - WALL, z_in - P["LIP_H"], z_in + 0.1, R - WALL)
    ins = P["GW_BOSS_INSET"]
    for x in (ins, W - ins):
        for y in (ins, H - ins):
            lip = lip.cut(cyl(x, y, z_in - P["LIP_H"] - 1, z_in + 1, P["BOSS_D"] + 2 * P["LIP_CLR"]))  # clear the bosses
    cy_ = P["GW_CABLE_Y"]
    lip = lip.cut(box(W - WALL - 4, cy_ - P["GW_CABLE_D"] / 2 - 1.0, z_in - P["LIP_H"] - 1, W, cy_ + P["GW_CABLE_D"] / 2 + 1.0, z_in))
    adds.append(lip)
    ins = P["GW_BOSS_INSET"]
    for x in (ins, W - ins):
        for y in (ins, H - ins):
            cuts.append(cyl(x, y, z_in - 1, z_out + 1, P["M3_CLR_D"]))
            cuts.append(cyl(x, y, z_out - 1.5, z_out + 1, P["M3_HEAD_D"]))
    return plate.cut(union_all(cuts)).union(union_all(adds))


def gateway_reference_envelopes():
    heltec = place_board(heltec_envelope(), P["GW_XU"], P["GW_YC"], P["GW_ZT"])
    # USB-C plug + overmould (USB-IF max 12.35 x 6.5, overmould length 25 assumed)
    uz = P["GW_ZT"] + P["USB_CZ"]
    plug = box(P["GW_XU"] + 0.6, P["GW_YC"] - 6.2, uz - 3.25, P["GW_XU"] + 26.0, P["GW_YC"] + 6.2, uz + 3.25)
    cable = cyl_x(P["GW_XU"] + 26.0, P["GW_W"] + 20.0, P["GW_YC"], uz, 5.0)
    return {"ref_heltec_gateway": heltec, "ref_usb_plug": plug.union(cable)}


# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------
def export_part(name, wp, print_xform=None):
    """STEP in the assembly frame, STL in print orientation."""
    step = os.path.join(OUT, name + ".step")
    stl = os.path.join(OUT, name + ".stl")
    exporters.export(wp, step)
    pw = print_xform(wp) if print_xform else wp
    exporters.export(pw, stl, tolerance=0.02, angularTolerance=0.08)
    print(f"  {name:22s} {bbox_str(wp)}  vol {volume_cm3(wp):.1f} cm3  ~{volume_cm3(wp) * PETG_DENSITY:.0f} g PETG")
    print(f"  {'':22s} print orientation bbox {bbox_str(pw)}")
    return step, stl


def section_wp(wp, plane, offset):
    return cq.Workplane(plane).add(wp.val()).section(offset)


def write_drawing(fname, sections, dims=(), notes=()):
    """sections: list of (layer, section_workplane, color, (dx, dy) shift in sheet coords).
    dims: (p1, p2, base, angle). notes: strings placed top-left of the sheet."""
    doc = DxfDocument(setup=True)
    doc.document.header["$INSUNITS"] = 4  # millimetres
    doc.add_layer("DIM", color=3)
    doc.add_layer("NOTES", color=4)
    for layer, sec, color, shift in sections:
        if layer not in doc.document.layers:
            doc.add_layer(layer, color=color)
        s = sec
        if shift != (0, 0):
            # shift inside the sheet plane: for XY use (dx, dy, 0); XZ (dx, 0, dy); YZ (0, dx, dy)
            zdir = sec.plane.zDir
            if abs(zdir.z) > 0.5:
                s = sec.translate((shift[0], shift[1], 0))
            elif abs(zdir.y) > 0.5:
                s = sec.translate((shift[0], 0, shift[1]))
            else:
                s = sec.translate((0, shift[0], shift[1]))
        doc.add_shape(s, layer)
    msp = doc.msp
    for (p1, p2, base, angle) in dims:
        dim = msp.add_linear_dim(base=base, p1=p1, p2=p2, angle=angle, dimstyle="EZDXF",
                                 dxfattribs={"layer": "DIM"}, override={"dimtxt": 2.5, "dimasz": 1.5})
        dim.render()
    x0, y0 = -5, -12
    for i, n in enumerate(notes):
        msp.add_text(n, height=2.5, dxfattribs={"layer": "NOTES"}).set_placement((x0, y0 - 4.0 * i))
    doc.document.saveas(fname)
    print("  wrote", os.path.basename(fname))


def render_png(png, scad_body, camera=None):
    scad = png[:-4] + ".scad"
    with open(scad, "w") as fh:
        fh.write(scad_body)
    cmd = [OPENSCAD, "-o", png, "--autocenter", "--viewall", "--projection=o",
           "--imgsize=1200,900", "--colorscheme=Tomorrow"]
    if camera:
        cmd.append("--camera=" + camera)
    cmd.append(scad)
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        ok = r.returncode == 0 and os.path.exists(png)
        print("  png", os.path.basename(png), "ok" if ok else f"FAILED rc={r.returncode} {r.stderr[-300:]}")
        return ok
    except Exception as e:  # noqa
        print("  png", os.path.basename(png), "FAILED", e)
        return False


def check_clash(label, a, b, allow=0.05):
    try:
        v = a.val().intersect(b.val()).Volume()
    except Exception as e:  # noqa
        v = -1
    flag = "ok" if 0 <= v <= allow else "CLASH"
    print(f"  clash {label:40s} {v:8.3f} mm3  {flag}")
    return v


def functional_checks(hg_body, hg_lid, hg_bp, hook_placed, gw_body, gw_lid):
    """Probe solids swept along the paths a plug, a pin, a screw or a sightline
    must take. 0 mm3 = the path is clear (or, where noted, > 0 = feature present)."""
    d = hanger_derived()
    xu, yc, zt = P["HG_XU"], P["HG_YC"], P["HG_ZT"]
    W, H, D = P["HG_W"], P["HG_H"], P["HG_D"]
    uz = zt + P["USB_CZ"]
    bad = 0

    def vol(a, b):
        try:
            return a.val().intersect(b.val()).Volume()
        except Exception:  # noqa
            return -1.0

    def chk(label, v, want_zero=True):
        nonlocal bad
        ok = (0 <= v < 0.01) if want_zero else (v > 0.01)
        bad += 0 if ok else 1
        print(f"  {'ok ' if ok else 'BAD'} {label:60s} {v:9.3f} mm3")

    chk("hanger: USB-C plug shell path (8.25 x 2.4 + 0.5)", vol(hg_body, box(xu - 1.0, yc - 4.4, uz - 1.5, W + 5, yc + 4.4, uz + 1.5)))
    chk("hanger: plug overmould 12.35 x 6.5 seats within 6.5 of the port", vol(hg_body, box(xu + 0.6 + 6.5, yc - 6.2, uz - 3.3, W + 5, yc + 6.2, uz + 3.3)))
    rx, ry = bx(xu, P["PRG_X"]), by(yc, -P["PRG_Y"])
    chk("hanger: RST paperclip 1.5 path", vol(hg_lid, cyl(rx, ry, zt + P["BTN_H"], D + P["LID_T"] + 5, 1.5)))
    px, py = bx(xu, P["PRG_X"]), by(yc, P["PRG_Y"])
    chk("hanger: PRG pusher present over the actuator (> 0)", vol(hg_lid, cyl(px, py, zt + P["BTN_H"] + 0.5, zt + P["BTN_H"] + 3.0, 1.7)), want_zero=False)
    chk("hanger: PRG pusher rest gap", vol(hg_lid, cyl(px, py, zt, zt + P["BTN_H"] + P["PEG_PUSH_GAP"] - 0.05, 1.7)))
    ax, ay = bx(xu, 31.3), by(yc, 1.0)
    chk("hanger: OLED active area 21.7 x 10.9 sightline", vol(hg_lid, box(ax - 10.85, ay - 5.45, zt + P["OLED_H"], ax + 10.85, ay + 5.45, D + P["LID_T"] + 2)))
    chk("hanger: LED sightline 1.8", vol(hg_lid, cyl(bx(xu, P["LED_X"]), by(yc, P["LED_Y"]), zt + 1, D + 5, 1.8)))
    hx, hy = d["hall_hole"]
    chk("hanger: Hall wire path through the lid", vol(hg_lid, cyl(hx, hy, D - 1, D + P["LID_T"] + 1, 3.0)))
    chk("hanger: Hall tunnel open at the hook face", vol(hook_placed, box(50 - 4, P["HG_HOOK_Y"] + d["tunnel_y"][0] + 0.2, D + P["LID_T"] - 1, 50 + 4, P["HG_HOOK_Y"] + d["tunnel_y"][1] - 0.2, D + P["LID_T"] + P["TUNNEL_L"] - 0.5)))
    stack = hook_placed.union(hg_lid).union(hg_body)
    for yb in d["pillar_y"]:
        chk(f"hanger: M3 hook bolt path at Y={yb:.0f} (hook, lid, body)", vol(stack, cyl(50, yb, D - P["INSERT_HOLE_DEPTH"] + 0.3, D + P["LID_T"] + P["HOOK_FLANGE_T"] + 2, 2.9)))
    sx, sy = P["HG_SEC_SCREW"]
    chk("hanger: security screw path body to backplate insert", vol(hg_body.union(hg_bp), cyl(sx, sy, -P["INSERT_HOLE_DEPTH"] + 0.3, P["WALL"] + 3, 2.9)))
    chk("hanger: driver access to the security screw (6 mm)", vol(hg_body, cyl(sx, sy, P["WALL"] + 0.05, D + 1, 6.0)))
    chk("hanger: pegs pass the flange holes with the body lifted 14", vol(hg_body.translate((0, P["PEG_SLIDE"], 0)), hg_bp))
    chk("hanger: body flush on the plate at rest", vol(hg_body, hg_bp))
    chk("hanger: peg heads retained when pulled 1.5 off the wall (> 0)", vol(hg_body.translate((0, 0, 1.5)), hg_bp), want_zero=False)
    cx0 = P["HG_BAY_X0"] + 1.5 + 4.5
    chk("hanger: cell 21.25 x 70.8 clear in the holder", vol(hg_body, cyl_x(cx0, cx0 + 70.8, P["HG_BAY_Y0"] + 12.75, P["HG_BAY_Z0"] + 11.0, 21.25)))
    chk("hanger: cell lifts straight out to the lid plane", vol(hg_body, box(cx0, P["HG_BAY_Y0"] + 2, P["HG_BAY_Z0"] + 11.0, cx0 + 70.8, P["HG_BAY_Y0"] + 23.5, D + 1)))
    gxu, gyc, gzt = P["GW_XU"], P["GW_YC"], P["GW_ZT"]
    GW, GH, GD = P["GW_W"], P["GW_H"], P["GW_D"]
    chk("gateway: RST paperclip 1.5 path", vol(gw_lid, cyl(bx(gxu, P["PRG_X"]), by(gyc, -P["PRG_Y"]), gzt + 2, GD + 8, 1.5)))
    gax, gay = bx(gxu, 31.3), by(gyc, 1.0)
    chk("gateway: OLED active area sightline", vol(gw_lid, box(gax - 10.85, gay - 5.45, gzt + 5, gax + 10.85, gay + 5.45, GD + 5)))
    sx_, sz_ = P["GW_SMA_X"], P["GW_SMA_Z"]
    dhole = cyl_y(GH - 5, GH + 2, sx_, sz_, 6.3).intersect(box(sx_ - 3.2, GH - 6, sz_ - 4, sx_ + 2.7, GH + 3, sz_ + 4))
    chk("gateway: SMA jack 6.3 dia / 5.9 flat passes the D-hole", vol(gw_body, dhole))
    chk("gateway: SMA nut 9.2 across corners, 9 deep inside", vol(gw_body, cyl_y(GH - P["WALL"] - 9, GH - P["WALL"] - 0.05, sx_, sz_, 9.4)))
    chk("gateway: whip base 13 dia over the jack outside", vol(gw_body, cyl_y(GH + 0.05, GH + 12, sx_, sz_, 13.0)))
    for x in (P["GW_BOSS_INSET"], GW - P["GW_BOSS_INSET"]):
        for y in (P["GW_BOSS_INSET"], GH - P["GW_BOSS_INSET"]):
            chk(f"gateway: lid screw path at ({x:.1f}, {y:.1f})", vol(gw_body.union(gw_lid), cyl(x, y, GD - P["INSERT_HOLE_DEPTH"] + 0.3, GD + P["LID_T"] + 1, 2.9)))
    for kx in P["GW_KEYHOLE_X"]:
        ky = P["GW_KEYHOLE_Y"]
        chk(f"gateway: No.8 head 8.4 passes the keyhole at X={kx:.0f}", vol(gw_body, cyl(kx, ky, -1, P["WALL"] + 1, 8.4)))
        chk(f"gateway: shank 4.4 slides up the slot at X={kx:.0f}", vol(gw_body, cq.Workplane("XY", origin=(kx, ky + 4, -1)).slot2D(8 + 4.4, 4.4, 90).extrude(P["WALL"] + 2)))
    print(f"  functional checks: {bad} problem(s)")
    return bad


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join(OUT, "autocad"), exist_ok=True)
    W, H, D = P["HG_W"], P["HG_H"], P["HG_D"]
    d = hanger_derived()

    print("== building hanger")
    hg_body = build_hanger_body()
    hg_lid = build_hanger_lid()
    hg_bp = build_hanger_backplate()
    hook = build_hook()
    hook_placed = hook.translate((P["HG_PILLAR_X"], P["HG_HOOK_Y"], d["z_lid_out"]))
    hg_refs = hanger_reference_envelopes()

    print("== building gateway")
    gw_body = build_gateway_body()
    gw_lid = build_gateway_lid()
    gw_refs = gateway_reference_envelopes()

    print("== interference checks (0 = no overlap; touching faces count as 0)")
    check_clash("hanger body vs heltec", hg_body, hg_refs["ref_heltec_hanger"])
    check_clash("hanger lid vs heltec", hg_lid, hg_refs["ref_heltec_hanger"])
    check_clash("hanger body vs cell holder", hg_body, hg_refs["ref_cell_holder"])
    check_clash("hanger lid vs cell holder", hg_lid, hg_refs["ref_cell_holder"])
    check_clash("hanger body vs stub antenna", hg_body, hg_refs["ref_stub_antenna"])
    check_clash("hanger body vs lid", hg_body, hg_lid)
    check_clash("hanger body vs backplate+pegs", hg_body, hg_bp)
    check_clash("hanger lid vs hook", hg_lid, hook_placed)
    check_clash("hook vs hall carrier", hook_placed, hg_refs["ref_hall_carrier"])
    check_clash("gateway body vs heltec", gw_body, gw_refs["ref_heltec_gateway"])
    check_clash("gateway lid vs heltec", gw_lid, gw_refs["ref_heltec_gateway"])
    check_clash("gateway body vs lid", gw_body, gw_lid)
    check_clash("gateway body vs usb plug", gw_body, gw_refs["ref_usb_plug"])
    check_clash("gateway lid vs usb plug", gw_lid, gw_refs["ref_usb_plug"])

    print("== functional checks (plug, pin, screw and sightline paths)")
    functional_checks(hg_body, hg_lid, hg_bp, hook_placed, gw_body, gw_lid)

    print("== exporting parts (STEP assembly frame, STL print orientation)")
    files = {}
    files["hanger_body"] = export_part("hanger_body", hg_body)
    files["hanger_lid"] = export_part(
        "hanger_lid", hg_lid, lambda w: w.rotate((0, 0, 0), (1, 0, 0), 180).translate((0, H, d["z_lid_out"])))
    files["hanger_backplate"] = export_part("hanger_backplate", hg_bp, lambda w: w.translate((0, 0, P["BP_T"])))
    files["hanger_hook"] = export_part(
        "hanger_hook", hook, lambda w: w.rotate((0, 0, 0), (0, 1, 0), 90).translate((0, P["HOOK_FLANGE_DOWN"], P["HOOK_W"] / 2)))
    files["gateway_body"] = export_part("gateway_body", gw_body)
    files["gateway_lid"] = export_part(
        "gateway_lid", gw_lid, lambda w: w.rotate((0, 0, 0), (1, 0, 0), 180).translate((0, P["GW_H"], P["GW_D"] + P["LID_T"])))
    for name, wp in list(hg_refs.items()) + list(gw_refs.items()):
        exporters.export(wp, os.path.join(OUT, name + ".step"))
        exporters.export(wp, os.path.join(OUT, name + ".stl"), tolerance=0.05, angularTolerance=0.2)
        print(f"  {name:22s} {bbox_str(wp)}")

    print("== assemblies")
    hg = cq.Assembly(name="hanger")
    hg.add(hg_bp, name="hanger_backplate", color=cq.Color(0.55, 0.55, 0.6))
    hg.add(hg_body, name="hanger_body", color=cq.Color(0.95, 0.8, 0.2))
    hg.add(hg_lid, name="hanger_lid", color=cq.Color(0.95, 0.85, 0.35))
    hg.add(hook_placed, name="hanger_hook", color=cq.Color(0.2, 0.2, 0.25))
    hg.add(hg_refs["ref_heltec_hanger"], name="ref_heltec", color=cq.Color(0.1, 0.5, 0.2))
    hg.add(hg_refs["ref_cell_holder"], name="ref_cell_holder", color=cq.Color(0.3, 0.3, 0.3))
    hg.add(hg_refs["ref_stub_antenna"], name="ref_stub_antenna", color=cq.Color(0.1, 0.1, 0.1))
    hg.add(hg_refs["ref_hall_carrier"], name="ref_hall_carrier", color=cq.Color(0.6, 0.1, 0.1))
    hg.save(os.path.join(OUT, "hanger_assembly.step"))
    gw = cq.Assembly(name="gateway")
    gw.add(gw_body, name="gateway_body", color=cq.Color(0.85, 0.85, 0.9))
    gw.add(gw_lid, name="gateway_lid", color=cq.Color(0.75, 0.75, 0.8))
    gw.add(gw_refs["ref_heltec_gateway"], name="ref_heltec", color=cq.Color(0.1, 0.5, 0.2))
    gw.add(gw_refs["ref_usb_plug"], name="ref_usb_plug", color=cq.Color(0.1, 0.1, 0.1))
    gw.save(os.path.join(OUT, "gateway_assembly.step"))
    print("  wrote hanger_assembly.step, gateway_assembly.step")

    print("== 2D drawings (DXF sections + dimensions)")
    xu, yc, zt = P["HG_XU"], P["HG_YC"], P["HG_ZT"]
    wx, wy = bx(xu, P["WIN_CX"]), by(yc, P["WIN_CY"])
    write_drawing(
        os.path.join(OUT, "hanger_body_drawing.dxf"),
        [("SEC_Z5_KEYHOLES", section_wp(hg_body, "XY", 5.0), 1, (0, 0)),
         ("SEC_Z20_INTERNALS", section_wp(hg_body, "XY", 20.0), 2, (0, 0)),
         ("SEC_Z33_RIM", section_wp(hg_body, "XY", 33.0), 5, (0, 0)),
         ("SEC_Y105_BOARD_XZ", section_wp(hg_body, "XZ", -yc), 6, (0, -60)),
         ("SEC_Y17_CELL_XZ", section_wp(hg_body, "XZ", -17.0), 6, (0, -110)),
         ("SEC_X50_YZ", section_wp(hg_body, "YZ", 50.0), 1, (120, 0))],
        dims=[((0, 0), (W, 0), (0, -8), 0), ((0, 0), (0, H), (-10, 0), 90),
              ((d["peg_x"][0], P["PEG_Y_LOW"]), (d["peg_x"][1], P["PEG_Y_LOW"]), (0, -16), 0),
              ((d["peg_x"][0], P["PEG_Y_LOW"]), (d["peg_x"][0], P["PEG_Y_HIGH"]), (-18, 0), 90),
              ((0, yc), (W, yc), (0, H + 8), 0),
              ((0, zt), (0, D), (-26, 0), 90)],
        notes=["HANGER BODY, Designer B. Body frame X width, Y up, Z from the wall. Walls 2.5, back-face down print.",
               f"Heltec V3 headers pins down in 2.0 x 7 grooves; PCB top Z={zt}, USB end X={xu}, centreline Y={yc}.",
               f"OLED window centre ({wx:.1f}, {wy:.1f}) 30 x 16. USB-C opening 13.5 x 8 in the right wall, centre Z={zt + P['USB_CZ']:.1f}.",
               f"Pegs (on the backplate) rest at X {d['peg_x'][0]:.0f}/{d['peg_x'][1]:.0f}, Y {P['PEG_Y_LOW']:.0f}/{P['PEG_Y_HIGH']:.0f}; head pockets 14 lower; 14 mm lift to remove.",
               f"Hook bolt pillars at (50, {d['pillar_y'][0]:.0f}) and (50, {d['pillar_y'][1]:.0f}), M3 heat-set inserts; security screw hole (50, 49) through the back wall.",
               "Cell bay X 8.5..92, Y 5..30.5, Z 10..31.5 for an 80 x 25 x 21 holder (ASSUMED, measure). Antenna cradles Y 122.3 (ASSUMED stub 60 x 6)."])
    write_drawing(
        os.path.join(OUT, "hanger_lid_drawing.dxf"),
        [("SEC_PLATE", section_wp(hg_lid, "XY", d["z_lid_out"] - 1.0), 1, (0, 0)),
         ("SEC_Z33_LIP_TABS", section_wp(hg_lid, "XY", 33.0), 2, (0, 0)),
         ("SEC_Z25_TABS", section_wp(hg_lid, "XY", 25.0), 5, (0, 0)),
         ("SEC_Y104_OLED_XZ", section_wp(hg_lid, "XZ", -wy), 6, (0, -40)),
         ("SEC_X30_TABS_YZ", section_wp(hg_lid, "YZ", 30.0), 1, (120, 0))],
        dims=[((0, 0), (W, 0), (0, -8), 0), ((0, 0), (0, H), (-10, 0), 90),
              ((wx - P["WIN_W"] / 2, wy), (wx + P["WIN_W"] / 2, wy), (0, H + 8), 0),
              ((0, wy - P["WIN_H"] / 2), (0, wy + P["WIN_H"] / 2), (-18, 0), 90),
              ((wx, 0), (wx, wy), (W + 8, 0), 90),
              ((0, P["HG_HOOK_Y"]), (0, wy), (-26, 0), 90)],
        notes=["HANGER LID, Designer B. Printed outer face down. Lip 1.8 x 4 with 0.25 clearance.",
               f"OLED aperture 30 x 16 at ({wx:.1f}, {wy:.1f}); insert pocket 34 x 20 x 1.2 on the inner face (optional 1 mm clear pane, glue).",
               f"PRG membrane button 10 x 16 x 0.6 at ({bx(xu, P['PRG_X']):.1f}, {by(yc, P['PRG_Y']):.1f}); RST pinhole 2.0 at ({bx(xu, P['PRG_X']):.1f}, {by(yc, -P['PRG_Y']):.1f}); LED hole 2.4 at ({bx(xu, P['LED_X']):.1f}, {by(yc, P['LED_Y']):.1f}).",
               f"Hook bolts M3 at (50, {d['pillar_y'][0]:.0f}) and (50, {d['pillar_y'][1]:.0f}); Hall wire hole 6 at ({d['hall_hole'][0]:.0f}, {d['hall_hole'][1]:.1f}). Label area 40 x 22 at X 30..70, Y 71..93 (flat).",
               "Two bottom snap tabs at X 30/70 (release slots in the body's bottom face); two top hinge tabs at X 30/70 (tilt the lid in top first)."])
    write_drawing(
        os.path.join(OUT, "hanger_backplate_drawing.dxf"),
        [("SEC_PLATE", section_wp(hg_bp, "XY", -4.0), 1, (0, 0)),
         ("SEC_PEGS", section_wp(hg_bp, "XY", 4.0), 2, (0, 0)),
         ("SEC_Y25_XZ", section_wp(hg_bp, "XZ", -P["PEG_Y_LOW"]), 6, (0, -30))],
        dims=[((d["bp_x0"], d["bp_y0"]), (d["bp_x0"] + P["HG_BP_W"], d["bp_y0"]), (0, d["bp_y0"] - 8), 0),
              ((d["bp_x0"], d["bp_y0"]), (d["bp_x0"], d["bp_y0"] + P["HG_BP_H"]), (d["bp_x0"] - 10, 0), 90),
              ((d["peg_x"][0], P["PEG_Y_LOW"]), (d["peg_x"][1], P["PEG_Y_LOW"]), (0, d["bp_y0"] - 16), 0),
              ((d["peg_x"][0], P["PEG_Y_LOW"]), (d["peg_x"][0], P["PEG_Y_HIGH"]), (d["bp_x0"] - 18, 0), 90)],
        notes=["HANGER BACKPLATE 90 x 110 x 8 (v7 had 9), printed wall face down, pegs vertical.",
               "Four countersunk 4.5 wall screw holes inset 10; four mushroom pegs 4.5 stem / 9 head with a 45 deg cone; M3 insert at (50, 49).",
               "Coordinates are in the hanger body frame (plate spans X 5..95, Y 10..120)."])
    write_drawing(
        os.path.join(OUT, "hanger_hook_drawing.dxf"),
        [("PROFILE_YZ_X0", section_wp(hook, "YZ", 0.0), 1, (0, 0)),
         ("SEC_FLANGE_Z2.5", section_wp(hook, "XY", 2.5), 2, (40, 0)),
         ("SEC_ARM_Z23", section_wp(hook, "XY", P["HOOK_FLANGE_T"] + P["SADDLE_OUT"]), 5, (40, 0))],
        dims=[((-P["HOOK_FLANGE_DOWN"], 0), (P["HOOK_FLANGE_UP"], 0), (0, -6), 0),
              ((0, 0), (0, P["HOOK_FLANGE_T"] + P["HOOK_ARM"]), (P["HOOK_LIP"] + 6, 0), 90),
              ((0, P["HOOK_FLANGE_T"]), (0, P["HOOK_FLANGE_T"] + P["SADDLE_OUT"]), (P["HOOK_LIP"] + 14, 0), 90),
              ((-P["HOOK_BOLT_DOWN"], 0), (P["HOOK_BOLT_UP"], 0), (0, -12), 0)],
        notes=["HOOK, own frame: horizontal = Yh (up on the wall), vertical = Zh (out from the lid face). Print lying on its side (22 mm tall).",
               f"Arm {P['HOOK_ARM']:.0f} (ASSUMED, v7 32) x 22 wide x 9 thick, lip 22 up. Saddle centre {P['SADDLE_OUT']:.0f} out, floor 10 wide, 2 deep: the sign bar seats here.",
               "Hall tunnel 9 x 4 from the mounting face 30 deep under the saddle; 1.5 mm print between saddle floor and sensor.",
               "Two M3 x 14 pin-Torx bolts at Yh +12 and -14 through 6.5 counterbores into the body pillars via the lid."])
    gxu, gyc, gzt = P["GW_XU"], P["GW_YC"], P["GW_ZT"]
    gwx, gwy = bx(gxu, P["WIN_CX"]), by(gyc, P["WIN_CY"])
    GW, GH, GD = P["GW_W"], P["GW_H"], P["GW_D"]
    write_drawing(
        os.path.join(OUT, "gateway_body_drawing.dxf"),
        [("SEC_Z3_KEYHOLES", section_wp(gw_body, "XY", 3.2), 1, (0, 0)),
         ("SEC_Z12_INTERNALS", section_wp(gw_body, "XY", 12.0), 2, (0, 0)),
         ("SEC_Z24_RIM", section_wp(gw_body, "XY", 24.0), 5, (0, 0)),
         ("SEC_Y26_BOARD_XZ", section_wp(gw_body, "XZ", -gyc), 6, (0, -45)),
         ("SEC_X90_SMA_YZ", section_wp(gw_body, "YZ", P["GW_SMA_X"]), 1, (120, 0))],
        dims=[((0, 0), (GW, 0), (0, -8), 0), ((0, 0), (0, GH), (-10, 0), 90),
              ((P["GW_KEYHOLE_X"][0], P["GW_KEYHOLE_Y"]), (P["GW_KEYHOLE_X"][1], P["GW_KEYHOLE_Y"]), (0, GH + 8), 0),
              ((0, 0), (0, P["GW_KEYHOLE_Y"]), (-18, 0), 90),
              ((0, 0), (P["GW_SMA_X"], 0), (0, GH + 16), 0),
              ((gxu, 0), (GW, 0), (0, -16), 0)],
        notes=["GATEWAY BODY 101 x 63 x 26.5, walls 2.5, printed back face down. Four M3 insert bosses at the corners.",
               f"Heltec V3 pins down in grooves, PCB top Z={gzt}, USB end X={gxu}, centreline Y={gyc}; OLED window centre ({gwx:.1f}, {gwy:.1f}).",
               f"SMA bulkhead D-hole 6.5/6.0 flat through the top wall at X={P['GW_SMA_X']:.0f}, Z={P['GW_SMA_Z']:.0f}; use the 11 mm thread pigtail.",
               f"USB-C cable notch 6 wide in the right wall at Y={P['GW_CABLE_Y']:.1f}, closed by the lid; cable tie bar at X {P['GW_TIE_X']:.1f}.",
               "Keyholes through the back wall at X 30/70, head hole Y 47, slot up 8; vents 8 x 2 in the bottom and top walls."])
    write_drawing(
        os.path.join(OUT, "gateway_lid_drawing.dxf"),
        [("SEC_PLATE", section_wp(gw_lid, "XY", GD + 2.0), 1, (0, 0)),
         ("SEC_Z24_LIP", section_wp(gw_lid, "XY", 24.0), 2, (0, 0)),
         ("SEC_Y25_OLED_XZ", section_wp(gw_lid, "XZ", -gwy), 6, (0, -30))],
        dims=[((0, 0), (GW, 0), (0, -8), 0), ((0, 0), (0, GH), (-10, 0), 90),
              ((gwx - P["WIN_W"] / 2, gwy), (gwx + P["WIN_W"] / 2, gwy), (0, GH + 8), 0),
              ((0, gwy - P["WIN_H"] / 2), (0, gwy + P["WIN_H"] / 2), (-18, 0), 90),
              ((P["GW_BOSS_INSET"], P["GW_BOSS_INSET"]), (GW - P["GW_BOSS_INSET"], P["GW_BOSS_INSET"]), (0, -16), 0)],
        notes=["GATEWAY LID 101 x 63 x 3, printed outer face down; four M3 x 10 screws with 6.5 counterbores.",
               f"OLED aperture 30 x 16 at ({gwx:.1f}, {gwy:.1f}); PRG membrane at ({bx(gxu, P['PRG_X']):.1f}, {by(gyc, P['PRG_Y']):.1f}); RST pinhole at ({bx(gxu, P['PRG_X']):.1f}, {by(gyc, -P['PRG_Y']):.1f}); LED hole at ({bx(gxu, P['LED_X']):.1f}, {by(gyc, P['LED_Y']):.1f})."])

    print("== PNG previews via OpenSCAD")
    for name in ["hanger_body", "hanger_lid", "hanger_backplate", "hanger_hook", "gateway_body", "gateway_lid"]:
        render_png(os.path.join(OUT, name + ".png"), f'import("{os.path.join(OUT, name + ".stl")}");\n')
    # lid outer faces (assembly orientation) are worth a look too
    render_png(os.path.join(OUT, "hanger_lid_outer_face.png"),
               f'rotate([180,0,0]) import("{os.path.join(OUT, "hanger_lid.stl")}");\n', camera="0,0,0,0,0,0,300")
    render_png(os.path.join(OUT, "gateway_lid_outer_face.png"),
               f'rotate([180,0,0]) import("{os.path.join(OUT, "gateway_lid.stl")}");\n', camera="0,0,0,0,0,0,300")
    # exploded hanger: STLs are in print orientation, so rebuild assembly orientation in OpenSCAD
    s = os.path.join(OUT, "")
    hanger_exploded = f"""
// HazardLink hanger, exploded (Designer B). Parts placed back into the body frame.
color("slategray") translate([0,0,-{P['BP_T']}-45]) import("{s}hanger_backplate.stl");
color("gold") import("{s}hanger_body.stl");
color("khaki") translate([0,0,45]) translate([0,{H},{d['z_lid_out']}]) rotate([180,0,0]) import("{s}hanger_lid.stl");
color("dimgray") translate([0,0,100]) translate([{P['HG_PILLAR_X']},{P['HG_HOOK_Y']},{d['z_lid_out']}]) rotate([0,-90,0]) translate([0,-{P['HOOK_FLANGE_DOWN']},-{P['HOOK_W']/2}]) import("{s}hanger_hook.stl");
color("darkgreen") translate([0,0,20]) import("{s}ref_heltec_hanger.stl");
color("gray") translate([0,0,20]) import("{s}ref_cell_holder.stl");
color("black") translate([0,0,20]) import("{s}ref_stub_antenna.stl");
color("firebrick") translate([0,0,100]) import("{s}ref_hall_carrier.stl");
"""
    render_png(os.path.join(OUT, "hanger_exploded.png"), hanger_exploded, camera="0,0,0,60,0,30,500")
    hanger_assembled = hanger_exploded.replace("translate([0,0,45])", "").replace("translate([0,0,100])", "").replace(
        "translate([0,0,20])", "").replace(f"translate([0,0,-{P['BP_T']}-45])", "")
    render_png(os.path.join(OUT, "hanger_assembled.png"), hanger_assembled, camera="0,0,0,70,0,35,500")
    # front = as seen from the room (looking at the lid, down -Z); side = hook profile
    render_png(os.path.join(OUT, "hanger_assembled_front.png"), hanger_assembled, camera="0,0,0,0,0,0,500")
    render_png(os.path.join(OUT, "hanger_assembled_side.png"), hanger_assembled, camera="0,0,0,90,0,90,500")
    gateway_exploded = f"""
color("lightsteelblue") import("{s}gateway_body.stl");
color("lightgray") translate([0,0,35]) translate([0,{GH},{GD + P['LID_T']}]) rotate([180,0,0]) import("{s}gateway_lid.stl");
color("darkgreen") translate([0,0,15]) import("{s}ref_heltec_gateway.stl");
color("black") translate([0,0,15]) import("{s}ref_usb_plug.stl");
"""
    render_png(os.path.join(OUT, "gateway_exploded.png"), gateway_exploded, camera="0,0,0,60,0,30,400")
    gateway_assembled = gateway_exploded.replace("translate([0,0,35])", "").replace("translate([0,0,15])", "")
    render_png(os.path.join(OUT, "gateway_assembled.png"), gateway_assembled, camera="0,0,0,70,0,35,400")
    render_png(os.path.join(OUT, "gateway_assembled_front.png"), gateway_assembled, camera="0,0,0,0,0,0,400")

    print("== AutoCAD for Mac: .sat + 3DSOLID .dxf via to_autocad.py")
    ac_out = os.path.join(OUT, "autocad")
    ac_src = os.path.join(OUT, "hazardlink_B_parts")
    os.makedirs(ac_src, exist_ok=True)
    for f in os.listdir(ac_src):
        if f.endswith(".step"):
            os.remove(os.path.join(ac_src, f))
    for f in os.listdir(ac_out):
        if f.endswith(".sat") or f.endswith(".dxf"):
            os.remove(os.path.join(ac_out, f))
    for name in files:
        shutil.copyfile(files[name][0], os.path.join(ac_src, name + ".step"))
    if os.environ.get("HZ_SKIP_AUTOCAD"):
        print("  skipped (HZ_SKIP_AUTOCAD set); run:", sys.executable, TO_AUTOCAD, ac_src, ac_out)
    else:
        t1 = time.time()
        r = subprocess.run([sys.executable, TO_AUTOCAD, ac_src, ac_out], capture_output=True, text=True)
        print(r.stdout[-2000:])
        if r.returncode != 0:
            print("to_autocad FAILED:", r.stderr[-2000:])
        print(f"  to_autocad took {time.time() - t1:.0f} s")

    print("== outer dimensions")
    hook_bb = hook_placed.val().BoundingBox()
    print(f"  hanger body {W:.0f} x {H:.0f} x {D:.0f}; with lid {D + P['LID_T']:.0f}; with backplate {P['BP_T'] + D + P['LID_T']:.0f} off the wall;"
          f" hook reaches Z={hook_bb.zmax:.0f} ({hook_bb.zmax + P['BP_T']:.0f} off the wall)")
    print(f"  gateway body {GW:.0f} x {GH:.0f} x {GD:.0f}; with lid {GD + P['LID_T']:.1f}")
    print("== produced files")
    for f in sorted(os.listdir(OUT)):
        p = os.path.join(OUT, f)
        if os.path.isfile(p):
            print(f"  {f:40s} {os.path.getsize(p) / 1024:8.0f} kB")
    for f in sorted(os.listdir(os.path.join(OUT, "autocad"))):
        p = os.path.join(OUT, "autocad", f)
        print(f"  autocad/{f:32s} {os.path.getsize(p) / 1024:8.0f} kB")
    print(f"done in {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
