#!/usr/bin/env python
"""HazardLink v8 enclosures, Designer A (robust and serviceable).

Two printed enclosures built around the Heltec WiFi LoRa 32 V3:
  HANGER  : battery wall hanger = body + lid + backplate + bolt-on J-hook (carries the Hall sensor)
  GATEWAY : mains wall box      = body + lid (SMA bulkhead on top, USB-C entry with strain relief)

Run with the CadQuery venv:
  cadenv/bin/python hazardlink_enclosures.py [out_dir] [--quick] [--no-autocad] [--check]
  --quick skips the PNG previews, --no-autocad skips the SAT/DXF conversion, --check prints
  part-to-part and part-to-reference intersection volumes instead of exporting.

Per part: <part>.step, <part>.stl (fine), <part>.png, <part>_drawing.dxf (three sections with dimensions).
Per unit: <unit>_assembly.step (named, coloured, with reference solids), <unit>_exploded.png,
<unit>_assembled.png, <unit>_section.dxf (assembly stack-up section through the board).
Reference solids (board, cell, holder, Hall carrier, magnet, antenna, plug) go to ref/.
AutoCAD for Mac deliverables (.sat + 3DSOLID .dxf) are produced by ../../to_autocad.py, which
this script runs at the end into <out_dir>/autocad.

FRAME (both units): X to the viewer's right when facing the unit, Z up, Y is depth measured from
the body's front face INTO the wall (right-handed). Body occupies Y 0..D, lid sits at Y -LID_T..0,
backplate at Y D..D+BP_T, hook at Y < -LID_T. Print orientation is a slicer choice (see notes).

Board frame -> world: Xb (along the board from the USB-end corner points) -> +X,
Zb (up from the PCB top, toward the OLED) -> -Y (toward the lid), Yb (+ toward PRG/J3) -> +Z.
So the OLED faces the lid, the USB-C is at the left wall, PRG is above the board centreline and
RST below it.

Every dimension lives in PARAMS with a tag:
  datasheet : from a vendor drawing or STEP (Heltec, Samsung, TI, ruthex, USB-IF, TE)
  research  : computed or measured in the research pass (field tables, community practice)
  v7        : kept from the v7 OpenSCAD sketch (design intent, not a measured requirement)
  assumed   : chosen here, must be measured or confirmed before the CAD is frozen
No em-dashes anywhere in this file, on purpose.
"""
import os, sys, math, subprocess, glob, time
import cadquery as cq

# --------------------------------------------------------------------------------------
# PARAMS
# --------------------------------------------------------------------------------------
P = dict(
    # ---- Heltec WiFi LoRa 32 V3 -------------------------------------------------------
    BRD_L=51.7,             # datasheet (STEP outline, USB corners to antenna tip)
    BRD_W=25.4,             # datasheet
    BRD_T=1.8,              # datasheet 1.6 + 0.2 allowance
    BRD_CLR=0.3,            # assumed: pocket clearance per side (PETG slip fit)
    USB_NOSE=0.65,          # datasheet: USB-C nose proud of the corner points
    USB_SETBACK=1.0,        # assumed: corner points to the wall inner face (nose 0.35 inside)
    OLED_X0=14.9, OLED_X1=47.9, OLED_HALF_W=9.28, OLED_H=5.0,    # datasheet envelope
    OLED_ACT_CX=31.3, OLED_ACT_CY=0.5,       # research: window centre (active area ~1 mm toward +Yb)
    WIN_W=30.0, WIN_H=16.0,                  # research: conservative window showing the whole picture
    INSERT_W=36.0, INSERT_H=19.5, INSERT_T=1.0, INSERT_POCKET=1.3,   # assumed 1 mm acrylic or PETG pane
    INSERT_CLEAT=0.6,                        # assumed: retaining cleat overhang into the pocket
    PRG=(3.4, 7.9), RST=(3.4, -7.9), BTN_H=2.0,   # datasheet (STEP)
    LED=(8.1, -8.0),                              # datasheet (STEP, two 0603 LEDs)
    IPEX=(50.4, 0.0), IPEX_H=1.26, UFL_PLUG_H=2.5,   # datasheet socket / assumed plug height
    USB_SHELL_W=8.94, USB_SHELL_H=3.5, USB_OPEN_CY=1.7,   # datasheet
    USB_SLOT_W=13.5, USB_SLOT_H=8.0,   # research: passes a 12.35 x 6.5 overmold (USB-IF max)
    BAT_SOCK=(2.8, 6.9, 2.3, 3.6),     # datasheet: Xb0, Xb1, half width, height below the PCB
    BAT_CHAN=(7.0, 20.0, 4.0, 5.0),    # research: plug + cable channel Xb0, Xb1, half W, depth
    HDR_ROW_Y=11.43, HDR_PITCH=2.54, HDR_X1=3.43,   # datasheet: pin 1 X, row Y, pitch
    WIRE_PINS_J3=(1, 2, 3, 14, 17),    # datasheet pinmap: GND, 3V3, 3V3, GPIO3, GPIO6 (wire pads)
    RAIL_W=1.1,                        # assumed: ledge under each long edge (board rests on it)
    RAIL_LIP_ABOVE=4.5,                # assumed: pocket side wall height above the PCB top
    POCKET_WALL_T=2.0,                 # assumed
    LID_RIB_W=1.9, LID_RIB_CLR=0.3,    # assumed: lid rib on the header pad strip
    LEAD_NOTCH=(20.5, 28.5),           # assumed: Xb span of the lead notch in the J2 pocket wall
    WIFI_KEEPOUT=15.0,                 # research: last 10 mm of board + 5 beyond, no metal

    # ---- FDM rules --------------------------------------------------------------------
    WALL=2.5,                # research: 3 perimeters, 2.4 min for an electronics box
    LID_T=3.0,               # research: 3.0 for a handled face
    CORNER_R=5.0,            # v7
    TONGUE_T=2.0, TONGUE_H=4.0, TONGUE_CLR=0.25,   # research: lip 2 x 4, 0.25 per side
    INSERT_M3_D=4.0, INSERT_M3_DEPTH=6.7, BOSS_D=8.0,   # datasheet ruthex RX-M3x5.7
    SCREW_M3_CLR=3.5,        # assumed: 3.4 nominal + 0.1 for vertical-hole shrinkage
    CSK_M3_D=6.4, CSK_M3_DEPTH=1.7,   # assumed: ISO 10642 M3 head 6.0 + clearance
    CB_M3_D=6.4, CB_M3_DEPTH=3.5,     # assumed: ISO 7380 button head 5.7 + clearance
    PINHOLE_D=2.0,           # assumed: RST paperclip hole
    LED_WIN_D=3.0, LED_SKIN=0.5,      # assumed: sealed translucent window over the LEDs
    PRG_TAB=(6.0, 10.0, 1.0, 0.8, 0.4),   # assumed: width, length, thickness, groove, outer skin
    PUSHER_D=2.5,            # assumed: pusher pin over the 1.76 mm actuator
    PEG_STEM_D=5.5, PEG_STEM_L=3.5, PEG_HEAD_D=10.0, PEG_HEAD_L=3.5, PEG_CHAMFER=1.0,  # assumed
    PEG_DROP=14.0,           # v7: engagement slide
    PEG_SLOT_CLR=0.35, PEG_HEAD_CLR=0.75, PEG_POCKET_BACK=2.5,   # assumed clearances / roof
    KEY_HEAD_D=10.0, KEY_SLOT_W=5.0, KEY_SLOT_L=10.0,   # research: No.8 pan head keyhole (slot 10 here)
    KNOCKOUT_SKIN=0.8,       # assumed: membrane left in knock-outs

    # ---- Hanger -----------------------------------------------------------------------
    H_W=100.0, H_H=130.0, H_D=35.0,   # v7
    H_BRD_ZC=104.0,          # assumed: board centreline height (window as high as the bosses allow)
    H_PCB_TOP_Y=7.5,         # assumed: OLED glass 2.5 mm behind the lid inner face
    H_BOSSES=((5.5, 5.5), (94.5, 5.5), (5.5, 124.5), (94.5, 124.5)),   # assumed lid screw positions
    HOLDER_L=80.0, HOLDER_W=25.0, HOLDER_H=21.0, HOLDER_CLR=0.5,   # assumed: TinyTronics leads holder
    HOLDER_X0=10.0, HOLDER_Z0=6.0,    # assumed placement (bottom of the body, 0.5 mm from each corner boss)
    HOLDER_RIB_T=3.0, HOLDER_RIB_H=8.0, HOLDER_LEAD_GAP=8.0,   # assumed
    CELL_D=21.25, CELL_L=70.8,        # datasheet Samsung INR21700-50E max
    BULK_Z=(34.0, 46.0),              # assumed: bulkhead between bay and board, carries hook inserts (screw line z=40)
    HOOK_ZC=49.0,            # assumed: arm centreline (v7 45; raised for the bulkhead)
    HOOK_W=26.0,             # assumed (v7 22; widened so two screws fit side by side)
    HOOK_ARM=45.0,           # research: >= 45 for a folded pair (v7 32)
    HOOK_LIP=22.0,           # v7: lip height above the arm bottom
    HOOK_LIP_T=9.0,          # v7
    HOOK_T=10.0,             # assumed (v7 9; +1 for the sensor slot)
    HOOK_SLOPE=3.0,          # assumed: arm top rises 3 mm over the arm so the handle seats at the root
    HOOK_BASE_T=6.0, HOOK_BASE_H=32.0, HOOK_SCREW_DX=7.5, HOOK_RECESS=1.0,   # assumed
    HOOK_GUSSET=10.0, HOOK_GUSSET_W=2.0,   # assumed: two 45 deg side gussets under the arm root, 2 mm wide each
    HALL_CARRIER=(8.0, 8.0, 1.6),     # assumed carrier PCB
    HALL_SLOT_CLR=0.3, HALL_SLOT_H=3.0, HALL_SKIN=1.5, HALL_WIRE_H=4.5,   # assumed
    HALL_Y_FROM_BASE=8.0,    # assumed: sensor centre 8 mm out from the hook base front face
    SOT23=(2.9, 1.3, 1.12),  # datasheet TI DBZ package
    MAGNET_D=6.0, MAGNET_T=3.0,       # datasheet 6 x 3 N35
    TAG_WALL=1.2, TAG_CLR=1.0,        # research: tag wall and running clearance (assumed values)
    BP_W=90.0, BP_H=110.0, BP_T=10.0,   # v7 90 x 110; thickness 10 (v7 9) assumed
    BP_SCREW_D=4.5, BP_SCREW_CSK_D=9.0, BP_SCREW_INSET=10.0,   # v7 / research No.8 csk
    PEG_XS=(30.0, 70.0), PEG_ZS=(45.0, 95.0),   # assumed peg positions (engaged)
    SEC_SCREW=(50.0, 62.0),  # assumed: internal M3 body-to-plate screw
    ANT_X=86.0, ANT_ZS=(70.0, 110.0), ANT_D=6.0, ANT_L=60.0, ANT_Y=22.0,   # assumed stub antenna
    SMA_KO=(84.0, 17.5),     # assumed optional SMA knock-out on the top wall
    CLEAN_BTN_KO=(50.0, 17.5, 16.5),  # v7 button, kept as a knock-out
    LABEL=(56.0, 90.0, 92.0, 118.0, 0.5),   # assumed label recess x0, x1, z0, z1, depth
    SADDLES=((30.0, 74.0), (86.0, 55.0)),   # assumed cable tie saddles (leads, pigtail)

    # ---- Gateway ----------------------------------------------------------------------
    G_W=120.0, G_H=80.0, G_D=30.0,    # assumed
    G_BRD_X0=46.0, G_BRD_ZC=42.0, G_PCB_TOP_Y=7.5,   # assumed
    G_BOSSES=((5.5, 5.5), (114.5, 5.5), (5.5, 74.5), (114.5, 74.5), (60.0, 5.5), (60.0, 74.5)),
    G_SMA=(104.0, 15.0), SMA_HOLE_D=6.5, SMA_FLAT=6.0, SMA_PAD_D=14.0, SMA_WALL=3.0,   # datasheet D-hole
    G_CABLE_ZC=42.0, G_CABLE_D=4.5, G_CABLE_NOTCH_W=7.0,   # assumed cable
    G_SADDLE=(4.5, 14.0, 9.5),        # assumed tie saddle x0, x1, front face Y (behind the plug overmold)
    G_KEYHOLES=((25.0, 62.0), (95.0, 62.0)), G_LOWER_SCREW=(60.0, 16.0),   # assumed (screw positions)
    G_VENT=dict(len=8.0, w=2.0, pitch=8.0, n=5, bot_x0=72.0, top_x0=16.0, ys=(13.0, 18.0, 23.0)),
    G_BTN_KO=(25.0, 15.0, 12.5),      # assumed knock-out for a 12 mm panel button on GPIO3
    G_LABEL=(66.0, 108.0, 6.0, 26.0, 0.5),   # assumed label recess
    WHIP_D=13.0, WHIP_L=195.0,        # research: 868 MHz 5 dBi whip
)
EPS = 0.01
EX = 45.0    # exploded view offset

# --------------------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------------------
def box(x0, x1, y0, y1, z0, z1):
    return cq.Workplane("XY").box(x1 - x0, y1 - y0, z1 - z0, centered=False).translate((x0, y0, z0))

def rbox_y(x0, x1, y0, y1, z0, z1, r):
    """Box with the four edges parallel to Y rounded (front-view corners)."""
    return box(x0, x1, y0, y1, z0, z1).edges("|Y").fillet(r)

def cyl_y(cx, cz, d, y0, y1):
    """Cylinder along Y from y0 to y1 (y1 > y0)."""
    return cq.Workplane("XY").add(cq.Solid.makeCylinder(d / 2, y1 - y0, cq.Vector(cx, y0, cz), cq.Vector(0, 1, 0)))

def cyl_z(cx, cy, d, z0, z1):
    return cq.Workplane("XY").add(cq.Solid.makeCylinder(d / 2, z1 - z0, cq.Vector(cx, cy, z0), cq.Vector(0, 0, 1)))

def cyl_x(cy, cz, d, x0, x1):
    return cq.Workplane("XY").add(cq.Solid.makeCylinder(d / 2, x1 - x0, cq.Vector(x0, cy, cz), cq.Vector(1, 0, 0)))

def cone_y(cx, cz, d0, d1, y0, y1):
    """Cone along +Y: diameter d0 at y0, d1 at y1."""
    return cq.Workplane("XY").add(cq.Solid.makeCone(d0 / 2, d1 / 2, y1 - y0, cq.Vector(cx, y0, cz), cq.Vector(0, 1, 0)))

def slot_y(cx, cz, length, width, y0, y1, angle=90):
    """Stadium slot in the XZ plane (length along Z when angle=90), extruded along Y."""
    return cq.Workplane("XZ", origin=(0, y1, 0)).center(cx, cz).slot2D(length, width, angle).extrude(y1 - y0)

def keyhole_y(cx, cz_head, head_d, slot_w, slot_len, y0, y1):
    """Keyhole along Y: head circle at cz_head, slot running DOWN by slot_len."""
    k = cyl_y(cx, cz_head, head_d, y0, y1)
    k = k.union(box(cx - slot_w / 2, cx + slot_w / 2, y0, y1, cz_head - slot_len, cz_head))
    return k.union(cyl_y(cx, cz_head - slot_len, slot_w, y0, y1))   # rounded slot end centred on the peg

def prism_yz(pts, x0, x1):
    """Polygon in the YZ plane (list of (y, z)) extruded from x0 to x1."""
    return cq.Workplane("YZ", origin=(x0, 0, 0)).polyline(pts).close().extrude(x1 - x0)

def csk_hole_y(cx, cz, y_face, y_end, d, csk_d, csk_depth):
    """Countersunk through hole, head opening on the face at y_face (which faces -Y), hole to y_end."""
    h = cyl_y(cx, cz, d, y_face - 1, y_end + 1)
    c = cone_y(cx, cz, csk_d, d, y_face, y_face + csk_depth)
    c2 = cyl_y(cx, cz, csk_d, y_face - 1, y_face + EPS)
    return h.union(c).union(c2)

def cb_hole_y(cx, cz, y_face, y_end, d, cb_d, cb_depth):
    """Counterbored through hole, head opening on the face at y_face (which faces -Y)."""
    return cyl_y(cx, cz, d, y_face - 1, y_end + 1).union(cyl_y(cx, cz, cb_d, y_face - 1, y_face + cb_depth))

def bbox(wp):
    return wp.val().BoundingBox()

def bbox_str(wp):
    bb = bbox(wp)
    return "X %.1f..%.1f  Y %.1f..%.1f  Z %.1f..%.1f  (%.1f x %.1f x %.1f mm)" % (
        bb.xmin, bb.xmax, bb.ymin, bb.ymax, bb.zmin, bb.zmax, bb.xlen, bb.ylen, bb.zlen)

def union_all(shapes):
    out = None
    for s in shapes:
        out = s if out is None else out.union(s)
    return out

def hdr_x(pin):
    """Xb of header pin n (1..18)."""
    return P["HDR_X1"] + (pin - 1) * P["HDR_PITCH"]

# --------------------------------------------------------------------------------------
# Heltec WiFi LoRa 32 V3: reference model and the shared board cradle
# --------------------------------------------------------------------------------------
def b2w(shape, x0, zc, pcb_top_y):
    """Board frame (Xb, Yb, Zb) -> world (x0 + Xb, pcb_top_y - Zb, zc + Yb)."""
    return shape.rotate((0, 0, 0), (1, 0, 0), 90).translate((x0, pcb_top_y, zc))

def heltec_ref(x0, zc, pcb_top_y):
    """Simplified Heltec V3 envelope (PCB outline, OLED, USB-C, buttons, IPEX socket + U.FL plug,
    battery socket, ESP32 module, V3.2 block antenna) as one reference solid in world coordinates."""
    t = P["BRD_T"]
    outline = [(0, 5.27), (1.27, 4.0), (1.27, -4.0), (0, -5.27), (0, -10.54), (2.16, -12.7),
               (47.88, -12.7), (51.69, -8.89), (51.69, 8.89), (47.88, 12.7), (2.16, 12.7), (0, 10.54)]
    parts = [cq.Workplane("XY").polyline(outline).close().extrude(-t)]     # Zb -t..0
    parts.append(box(P["OLED_X0"], P["OLED_X1"], -P["OLED_HALF_W"], P["OLED_HALF_W"], 0, P["OLED_H"]))
    parts.append(box(-P["USB_NOSE"], 7.7, -P["USB_SHELL_W"] / 2, P["USB_SHELL_W"] / 2, -1.08, P["USB_SHELL_H"]))
    for (bx, by) in (P["PRG"], P["RST"]):
        parts.append(box(bx - 2.0, bx + 2.0, by - 1.5, by + 1.5, 0, P["BTN_H"]))
    ix, iy = P["IPEX"]
    parts.append(box(ix - 1.55, ix + 1.55, iy - 1.5, iy + 1.5, 0, P["IPEX_H"] + P["UFL_PLUG_H"]))
    sx0, sx1, shw, sh = P["BAT_SOCK"]
    parts.append(box(sx0, sx1, -shw, shw, -t - sh, -t))
    parts.append(box(20.4, 27.4, -3.5, 3.5, -t - 0.8, -t))
    parts.append(box(45.0, 51.0, 8.0, 12.7, 0, 1.6))    # V3.2 block antenna (approx)
    return b2w(union_all(parts), x0, zc, pcb_top_y)

def board_cradle(x0, zc, pcb_top_y, y_back, x_wall_inner):
    """Screwless cradle for the Heltec V3: a ledge under each long edge (the board rests on it),
    pocket side walls, an end stop at the antenna tip, corner stops at the USB end. The J3 (+Z, PRG)
    ledge has gaps at the wire pads (GND, 3V3, GPIO3, GPIO6). A notch in the J2 (-Z) wall lets the
    battery lead and the Hall wires out from under the board."""
    L, clr = P["BRD_L"], P["BRD_CLR"]
    hw = P["BRD_W"] / 2 + clr                     # pocket half height (Z)
    pcb_bot = pcb_top_y + P["BRD_T"]
    y_lip = pcb_top_y - P["RAIL_LIP_ABOVE"]       # pocket walls rise above the PCB top
    wt = P["POCKET_WALL_T"]
    x_start = max(x0 - P["USB_SETBACK"], x_wall_inner + P["TONGUE_T"] + P["TONGUE_CLR"] + 0.3)
    x_end = x0 + L + clr + 2.0
    parts = []
    # J2 side (-Z): continuous ledge and wall
    parts.append(box(x0 + 1.5, x0 + L - 3.0, pcb_bot, y_back + EPS, zc - hw, zc - hw + P["RAIL_W"]))
    parts.append(box(x_start, x_end, y_lip, y_back + EPS, zc - hw - wt, zc - hw))
    # J3 side (+Z): ledge segments avoiding the wire pads
    gaps = [(hdr_x(p) - 2.2, hdr_x(p) + 2.2) for p in P["WIRE_PINS_J3"]]
    xs = 1.5
    segs = []
    for (g0, g1) in sorted(gaps):
        if g0 > xs + 1.0:
            segs.append((xs, g0))
        xs = max(xs, g1)
    if xs < L - 3.0:
        segs.append((xs, L - 3.0))
    for (s0, s1) in segs:
        parts.append(box(x0 + s0, x0 + s1, pcb_bot, y_back + EPS, zc + hw - P["RAIL_W"], zc + hw))
    parts.append(box(x_start, x_end, y_lip, y_back + EPS, zc + hw, zc + hw + wt))
    # end stop at the antenna tip, below the PCB top so the U.FL plug and cable pass over it
    parts.append(box(x0 + L + clr, x_end, pcb_top_y, y_back + EPS, zc - 5.0, zc + 5.0))
    # USB-end corner stops (outside the button footprint, below the PCB top plane)
    xs0 = max(x_wall_inner - EPS, x0 - 3.0)
    for s in (-1, 1):
        z0, z1 = sorted((zc + s * 10.0, zc + s * hw))
        parts.append(box(xs0, x0 - clr, pcb_top_y, y_back + EPS, z0, z1))
    cradle = union_all(parts)
    # lead notch through the J2 wall + ledge, leaving the front part of the wall as a bridge
    n0, n1 = P["LEAD_NOTCH"]
    cradle = cradle.cut(box(x0 + n0, x0 + n1, pcb_bot + 5.0, y_back + 1, zc - hw - wt - 1, zc - hw + P["RAIL_W"] + 1))
    return cradle

def lid_header_ribs(x0, zc, pcb_top_y):
    """Ribs on the lid inner face bearing on the header pad strips (no headers fitted). The J3 rib
    is shortened to Xb 13..34 so it clears the wire solder joints; the J2 rib runs Xb 5..44."""
    hw = P["BRD_W"] / 2 + P["BRD_CLR"]
    z_out = hw - P["POCKET_WALL_T"] * 0 - 0.3      # rib outer edge, 0.3 inside the pocket wall
    y1 = pcb_top_y - P["LID_RIB_CLR"]
    w = P["LID_RIB_W"]
    j2 = box(x0 + 5.0, x0 + 44.0, -EPS, y1, zc - z_out, zc - z_out + w)
    j3 = box(x0 + 13.0, x0 + 34.0, -EPS, y1, zc + z_out - w, zc + z_out)
    return j2.union(j3)

def lid_board_features(lid, x0, zc, pcb_top_y, lid_t):
    """Common lid features over the board: OLED window with an inside pocket and cleats for a clear
    insert, sealed PRG living-hinge button with a pusher pin, RST pinhole, sealed LED window."""
    cx = x0 + P["OLED_ACT_CX"]
    cz = zc + P["OLED_ACT_CY"]
    ww, wh = P["WIN_W"], P["WIN_H"]
    lid = lid.cut(box(cx - ww / 2, cx + ww / 2, -lid_t - 1, 1, cz - wh / 2, cz + wh / 2))
    # 0.8 mm chamfer on the outside of the window (cosmetic, and cleans the bed edge)
    lid = lid.cut(box(cx - ww / 2 - 0.8, cx + ww / 2 + 0.8, -lid_t - 1, -lid_t + 0.8, cz - wh / 2 - 0.8, cz + wh / 2 + 0.8))
    iw, ih, pd = P["INSERT_W"], P["INSERT_H"], P["INSERT_POCKET"]
    lid = lid.cut(box(cx - iw / 2, cx + iw / 2, -pd, 0.5, cz - ih / 2, cz + ih / 2))
    # cleats on the short pocket edges: insert flexes in under them
    c = P["INSERT_CLEAT"]
    for s in (-1, 1):
        xa, xb = sorted((cx + s * iw / 2, cx + s * (iw / 2 - c)))
        lid = lid.union(box(xa, xb, -pd + P["INSERT_T"] + 0.2, -pd + P["INSERT_T"] + 0.9, cz - 4.0, cz + 4.0))
    # PRG living-hinge tab: root on +X, thinned to 1.0 mm, 0.8 mm groove closed by a 0.4 mm outer skin
    tw, tl, tt, tg, ts = P["PRG_TAB"]
    px, pz = x0 + P["PRG"][0], zc + P["PRG"][1]
    tx0, tx1 = px - 1.9, px - 1.9 + tl            # free end at tx0, root at tx1
    tz0, tz1 = pz - tw / 2, pz + tw / 2
    y_skin = -lid_t + ts
    y_tab = -lid_t + tt
    lid = lid.cut(box(tx0 - tg, tx0, y_skin, 1, tz0 - tg, tz1 + tg))
    lid = lid.cut(box(tx0 - tg, tx1, y_skin, 1, tz0 - tg, tz0))
    lid = lid.cut(box(tx0 - tg, tx1, y_skin, 1, tz1, tz1 + tg))
    lid = lid.cut(box(tx0, tx1, y_tab, 1, tz0, tz1))
    lid = lid.union(cyl_y(px, pz, P["PUSHER_D"], y_tab - EPS, pcb_top_y - P["BTN_H"] - 0.3))
    lid = lid.cut(cyl_y(px, pz, 3.0, -lid_t - 1, -lid_t + 0.3))     # 0.3 mm dimple marks the press point
    # RST pinhole (paperclip)
    lid = lid.cut(cyl_y(x0 + P["RST"][0], zc + P["RST"][1], P["PINHOLE_D"], -lid_t - 1, 1))
    # sealed LED window: recess from the inside leaving a thin skin
    lid = lid.cut(cyl_y(x0 + P["LED"][0], zc + P["LED"][1], P["LED_WIN_D"], -lid_t + P["LED_SKIN"], 1))
    return lid

def lid_tongue(W, H, wall, bosses, cutouts=()):
    """Inner lip ring (2 x 4) sitting just inside the body walls, relieved around the bosses and
    at any listed cut-outs (x0, x1, z0, z1)."""
    t, h, c = P["TONGUE_T"], P["TONGUE_H"], P["TONGUE_CLR"]
    o = wall + c
    ring = rbox_y(o, W - o, 0, h, o, H - o, P["CORNER_R"] - o)
    ring = ring.cut(rbox_y(o + t, W - o - t, -1, h + 1, o + t, H - o - t, 0.6))
    for (bx, bz) in bosses:
        ring = ring.cut(cyl_y(bx, bz, P["BOSS_D"] + 0.6, -1, h + 1))
    for (x0, x1, z0, z1) in cutouts:
        ring = ring.cut(box(x0, x1, -1, h + 1, z0, z1))
    return ring

def lid_screw_cuts(lid, bosses, lid_t):
    for (bx, bz) in bosses:
        lid = lid.cut(csk_hole_y(bx, bz, -lid_t, 0.0, P["SCREW_M3_CLR"], P["CSK_M3_D"], P["CSK_M3_DEPTH"]))
    return lid

def boss_columns(body, bosses, y_back, insert_from_y=0.0):
    """Full-depth 8 mm columns with an M3 heat-set hole at the front (insert face at insert_from_y)."""
    for (bx, bz) in bosses:
        body = body.union(cyl_y(bx, bz, P["BOSS_D"], insert_from_y, y_back + EPS))
    for (bx, bz) in bosses:
        body = body.cut(cyl_y(bx, bz, P["INSERT_M3_D"], insert_from_y - 1, insert_from_y + P["INSERT_M3_DEPTH"]))
        body = body.cut(cyl_y(bx, bz, 2.8, insert_from_y + P["INSERT_M3_DEPTH"] - EPS, insert_from_y + P["INSERT_M3_DEPTH"] + 5.0))
    return body

def tie_saddle(cx, cz, y_back, along="Z"):
    """Cable tie saddle: 8 x 6 block on the back wall with a 5.5 x 2 tie tunnel through it."""
    blk = box(cx - 4, cx + 4, y_back - 7.0, y_back + EPS, cz - 3, cz + 3)
    if along == "Z":
        return blk.cut(box(cx - 2.75, cx + 2.75, y_back - 5.0, y_back - 3.0, cz - 4, cz + 4))
    return blk.cut(box(cx - 5, cx + 5, y_back - 5.0, y_back - 3.0, cz - 2.75, cz + 2.75))

def knockout_z(body, cx, cy, d, z_wall_outer, z_wall_inner):
    """Round knock-out in a wall parallel to XY: full hole from the inside, thin skin left outside."""
    lo, hi = sorted((z_wall_outer, z_wall_inner))
    skin = P["KNOCKOUT_SKIN"]
    if z_wall_inner > z_wall_outer:      # bottom wall: outer face below
        return body.cut(cyl_z(cx, cy, d, lo + skin, hi + 1))
    return body.cut(cyl_z(cx, cy, d, lo - 1, hi - skin))

# --------------------------------------------------------------------------------------
# HANGER
# --------------------------------------------------------------------------------------
def hanger_geom():
    """Derived hanger positions shared by body, lid, hook, backplate and references."""
    W, H, D, wall, lt = P["H_W"], P["H_H"], P["H_D"], P["WALL"], P["LID_T"]
    g = dict(W=W, H=H, D=D, wall=wall, y_back=D - wall, lid_t=lt,
             x0=wall + P["USB_SETBACK"], zc=P["H_BRD_ZC"], pcb_top=P["H_PCB_TOP_Y"])
    bz0, bz1 = P["BULK_Z"]
    g["bulk"] = (bz0, bz1)
    g["hook_screws"] = ((W / 2 - P["HOOK_SCREW_DX"], (bz0 + bz1) / 2), (W / 2 + P["HOOK_SCREW_DX"], (bz0 + bz1) / 2))
    g["arm_bot"] = P["HOOK_ZC"] - P["HOOK_T"] / 2
    g["arm_top"] = P["HOOK_ZC"] + P["HOOK_T"] / 2          # at the root
    g["base_back"] = -lt + P["HOOK_RECESS"]
    g["base_front"] = g["base_back"] - P["HOOK_BASE_T"]
    g["lip_front"] = g["base_front"] - P["HOOK_ARM"]
    g["lip_back"] = g["lip_front"] + P["HOOK_LIP_T"]
    g["sensor_y"] = g["base_front"] - P["HALL_Y_FROM_BASE"]
    g["base_z0"] = P["HOOK_ZC"] - P["HOOK_BASE_H"] / 2
    g["base_z1"] = P["HOOK_ZC"] + P["HOOK_BASE_H"] / 2
    g["hook_x0"] = W / 2 - P["HOOK_W"] / 2
    g["hook_x1"] = W / 2 + P["HOOK_W"] / 2
    g["slope"] = P["HOOK_SLOPE"] / P["HOOK_ARM"]
    g["arm_top_at"] = lambda y: g["arm_top"] + (g["base_front"] - y) * g["slope"]
    ceil_base = g["arm_top"] - P["HALL_SKIN"]
    g["slot_ceil_base"] = ceil_base
    g["slot_floor_base"] = ceil_base - P["HALL_SLOT_H"]
    cw, cl, ct = P["HALL_CARRIER"]
    g["slot_y_end"] = g["sensor_y"] - cl / 2 - P["HALL_SLOT_CLR"]
    g["slot_hw"] = (cw + 2 * P["HALL_SLOT_CLR"]) / 2
    g["wire_z0"] = ceil_base - P["HALL_WIRE_H"]
    g["lid_slot"] = (W / 2 - 4.75, W / 2 + 4.75, g["wire_z0"] - 0.5, ceil_base + 0.5)
    g["sensor_z"] = g["slot_floor_base"] + (g["base_front"] - g["sensor_y"]) * g["slope"] + ct + P["SOT23"][2] / 2
    return g

def build_hanger_body():
    g = hanger_geom()
    W, H, D, wall, yb = g["W"], g["H"], g["D"], g["wall"], g["y_back"]
    body = rbox_y(0, W, 0, D, 0, H, P["CORNER_R"])
    body = body.cut(rbox_y(wall, W - wall, -1, yb, wall, H - wall, P["CORNER_R"] - wall))
    # bulkhead between the battery bay and the board area; carries the two hook inserts
    bz0, bz1 = g["bulk"]
    body = body.union(box(wall - EPS, W - wall + EPS, 0, yb + EPS, bz0, bz1))
    # lead notches at both ends of the bulkhead (open toward the back wall, 7.5 mm bridge at the front)
    for (nx0, nx1) in ((wall - 1, wall + 7.5), (W - wall - 7.5, W - wall + 1)):
        body = body.cut(box(nx0, nx1, 12.0, yb + 1, bz0 - 1, bz1 + 1))
    body = boss_columns(body, g["hook_screws"], yb)
    # lid screw columns with heat-set inserts
    body = boss_columns(body, P["H_BOSSES"], yb)
    # keyhole peg pockets in 10 mm bosses on the back wall (pegs live on the backplate)
    stem_pass = P["PEG_STEM_L"] - 0.2
    head_ch = P["PEG_HEAD_L"] + 0.7
    boss_t = stem_pass + head_ch + P["PEG_POCKET_BACK"]
    slot_w = P["PEG_STEM_D"] + 2 * P["PEG_SLOT_CLR"]
    head_w = P["PEG_HEAD_D"] + 2 * P["PEG_HEAD_CLR"]
    drop = P["PEG_DROP"]
    for px in P["PEG_XS"]:
        for pz in P["PEG_ZS"]:
            body = body.union(box(px - 8, px + 8, D - boss_t, yb + EPS, pz - 8, pz + drop + head_w / 2 + 2))
    # board cradle (USB end against the left wall)
    body = body.union(board_cradle(g["x0"], g["zc"], g["pcb_top"], yb, wall))
    # 21700 holder bay: 3 mm ribs 8 mm tall, lead gaps in both end ribs, ends of the top rib open
    hx0 = P["HOLDER_X0"] - P["HOLDER_CLR"]; hx1 = P["HOLDER_X0"] + P["HOLDER_L"] + P["HOLDER_CLR"]
    hz0 = P["HOLDER_Z0"] - P["HOLDER_CLR"]; hz1 = P["HOLDER_Z0"] + P["HOLDER_W"] + P["HOLDER_CLR"]
    rt, rh, gap = P["HOLDER_RIB_T"], P["HOLDER_RIB_H"], P["HOLDER_LEAD_GAP"]
    zm = (hz0 + hz1) / 2
    for (xa, xb) in ((hx0 - rt, hx0), (hx1, hx1 + rt)):
        body = body.union(box(xa, xb, yb - rh, yb + EPS, wall - EPS, zm - gap / 2))
        body = body.union(box(xa, xb, yb - rh, yb + EPS, zm + gap / 2, hz1 + rt))
    body = body.union(box(hx0 - rt, hx1 + rt, yb - rh, yb + EPS, wall - EPS, hz0))
    body = body.union(box(hx0 + 10.0, hx1 - 10.0, yb - rh, yb + EPS, hz1, bz0 + EPS))
    # stub antenna C-clips on the right, rod snaps in from the front
    ax, ay = P["ANT_X"], P["ANT_Y"]
    for az in P["ANT_ZS"]:
        clip = box(ax - 4.5, ax + 4.5, ay - 10.0, yb + EPS, az - 3, az + 3)
        clip = clip.cut(cyl_z(ax, ay, P["ANT_D"] + 0.8, az - 4, az + 4))
        clip = clip.cut(box(ax - (P["ANT_D"] - 0.5) / 2, ax + (P["ANT_D"] - 0.5) / 2, ay - 11.0, ay, az - 4, az + 4))
        body = body.union(clip)
    # cable tie saddles: lead bundle rising past the security screw (tie tunnel along X),
    # pigtail run to the antenna (tunnel along Z)
    (s1x, s1z), (s2x, s2z) = P["SADDLES"]
    body = body.union(tie_saddle(s1x, s1z, yb, along="X"))
    body = body.union(tie_saddle(s2x, s2z, yb, along="Z"))
    # USB-C slot in the left wall, 13.5 x 8 rounded, with a 1 mm stepped lead-in outside
    uy = g["pcb_top"] - P["USB_OPEN_CY"]
    uw, uh = P["USB_SLOT_W"], P["USB_SLOT_H"]
    body = body.cut(box(-1, wall + 1, uy - uh / 2, uy + uh / 2, g["zc"] - uw / 2, g["zc"] + uw / 2).edges("|X").fillet(2.0))
    body = body.cut(box(-1, 1.0, uy - uh / 2 - 1, uy + uh / 2 + 1, g["zc"] - uw / 2 - 1, g["zc"] + uw / 2 + 1).edges("|X").fillet(3.0))
    # internal security screw: M3 through the back wall into the backplate insert
    sx, sz = P["SEC_SCREW"]
    body = body.cut(cyl_y(sx, sz, P["SCREW_M3_CLR"], yb - 1, D + 1))
    # optional knock-outs: SMA bulkhead in the top wall, cleaning button in the bottom wall
    kx, ky = P["SMA_KO"]
    body = knockout_z(body, kx, ky, P["SMA_HOLE_D"], H, H - wall)
    bx_, by_, bd_ = P["CLEAN_BTN_KO"]
    body = knockout_z(body, bx_, by_, bd_, 0.0, wall)
    # peg pockets are cut last so no internal rib can refill a head chamber
    for px in P["PEG_XS"]:
        for pz in P["PEG_ZS"]:
            body = body.cut(keyhole_y(px, pz + drop, head_w, slot_w, drop, D - stem_pass, D + 1))
            body = body.cut(slot_y(px, pz + drop / 2, drop + head_w, head_w, D - stem_pass - head_ch, D - stem_pass + EPS))
    return body

def build_hanger_lid():
    g = hanger_geom()
    W, H, wall, lt = g["W"], g["H"], g["wall"], g["lid_t"]
    lid = rbox_y(0, W, -lt, 0, 0, H, P["CORNER_R"])
    bz0, bz1 = g["bulk"]
    uy = g["pcb_top"] - P["USB_OPEN_CY"]
    cutouts = ((-1, 6, bz0 - 0.5, bz1 + 0.5), (W - 6, W + 1, bz0 - 0.5, bz1 + 0.5),
               (-1, 6, g["zc"] - P["USB_SLOT_W"] / 2 - 0.5, g["zc"] + P["USB_SLOT_W"] / 2 + 0.5))
    lid = lid.union(lid_tongue(W, H, wall, P["H_BOSSES"], cutouts))
    lid = lid.union(lid_header_ribs(g["x0"], g["zc"], g["pcb_top"]))
    lid = lid_board_features(lid, g["x0"], g["zc"], g["pcb_top"], lt)
    lid = lid_screw_cuts(lid, P["H_BOSSES"], lt)
    # hook base locating pocket (1 mm) and the two hook screw through holes
    c = 0.25
    lid = lid.cut(box(g["hook_x0"] - c, g["hook_x1"] + c, -lt - 1, -lt + P["HOOK_RECESS"], g["base_z0"] - c, g["base_z1"] + c))
    for (sx, sz) in g["hook_screws"]:
        lid = lid.cut(cyl_y(sx, sz, P["SCREW_M3_CLR"], -lt - 1, 1))
    # Hall carrier and lead slot (the carrier passes through it when the hook is off)
    x0s, x1s, z0s, z1s = g["lid_slot"]
    lid = lid.cut(box(x0s, x1s, -lt - 1, 1, z0s, z1s))
    # label recess
    lx0, lx1, lz0, lz1, ld = P["LABEL"]
    lid = lid.cut(box(lx0, lx1, -lt - 1, -lt + ld, lz0, lz1))
    return lid

def build_hanger_hook():
    """Separate J-hook: base plate + sloped arm + upturned lip + root gusset, one 26 mm wide profile
    extruded along X so it prints lying on its side (layers along the arm). Carries the Hall carrier
    in a slot under the arm top surface, entered from the base back face."""
    g = hanger_geom()
    x0, x1 = g["hook_x0"], g["hook_x1"]
    yb, yf, ylf, ylb = g["base_back"], g["base_front"], g["lip_front"], g["lip_back"]
    ab, at = g["arm_bot"], g["arm_top"]
    top_tip = g["arm_top_at"](ylf)
    prof = [(yb, g["base_z0"]), (yb, g["base_z1"]), (yf, g["base_z1"]), (yf, at),
            (ylf, top_tip), (ylf, ab + P["HOOK_LIP"]), (ylb, ab + P["HOOK_LIP"]),
            (ylb, g["arm_top_at"](ylb)), (yf, at)]
    base = prism_yz([(yb, g["base_z0"]), (yb, g["base_z1"]), (yf, g["base_z1"]), (yf, g["base_z0"])], x0, x1)
    arm = prism_yz([(yf + EPS, ab), (ylf, ab), (ylf, top_tip), (yf + EPS, at)], x0, x1)
    lip = prism_yz([(ylf, ab), (ylb, ab), (ylb, ab + P["HOOK_LIP"]), (ylf, ab + P["HOOK_LIP"])], x0, x1)
    hook = base.union(arm).union(lip)
    # side gussets only: the middle of the base front face stays open for the screw heads and a driver
    gw = P["HOOK_GUSSET_W"]
    for (gx0, gx1) in ((x0, x0 + gw), (x1 - gw, x1)):
        hook = hook.union(prism_yz([(yf + EPS, ab + EPS), (yf + EPS, ab - P["HOOK_GUSSET"]), (yf - P["HOOK_GUSSET"], ab + EPS)], gx0, gx1))
    # Hall carrier slot: flat through the base, then parallel to the sloped top (constant skin)
    hw = g["slot_hw"]
    ye = g["slot_y_end"]
    cb, fb = g["slot_ceil_base"], g["slot_floor_base"]
    rise = (yf - ye) * g["slope"]
    slot = prism_yz([(yb + 1, fb), (yf, fb), (ye, fb + rise), (ye, cb + rise), (yf, cb), (yb + 1, cb)],
                    g["W"] / 2 - hw, g["W"] / 2 + hw)
    hook = hook.cut(slot)
    # wire and pull-up resistor enlargement through the base
    hook = hook.cut(box(g["W"] / 2 - hw, g["W"] / 2 + hw, yf - 1.0, yb + 1, g["wire_z0"], cb))
    # two counterbored M3 button-head screws through the base
    for (sx, sz) in g["hook_screws"]:
        hook = hook.cut(cb_hole_y(sx, sz, yf, yb, P["SCREW_M3_CLR"], P["CB_M3_D"], P["CB_M3_DEPTH"]))
    return hook

def build_hanger_backplate():
    g = hanger_geom()
    W, H, D = g["W"], g["H"], g["D"]
    bw, bh, bt = P["BP_W"], P["BP_H"], P["BP_T"]
    x0, z0 = (W - bw) / 2, (H - bh) / 2
    plate = rbox_y(x0, x0 + bw, D, D + bt, z0, z0 + bh, P["CORNER_R"])
    # four countersunk wall screws (No.8 / 4 mm), heads on the front face under the body
    ins = P["BP_SCREW_INSET"]
    for (sx, sz) in ((x0 + ins, z0 + ins), (x0 + bw - ins, z0 + ins), (x0 + ins, z0 + bh - ins), (x0 + bw - ins, z0 + bh - ins)):
        plate = plate.cut(csk_hole_y(sx, sz, D, D + bt, P["BP_SCREW_D"], P["BP_SCREW_CSK_D"], (P["BP_SCREW_CSK_D"] - P["BP_SCREW_D"]) / 2))
    # security screw insert (M3 heat-set) on the front face
    sx, sz = P["SEC_SCREW"]
    plate = plate.cut(cyl_y(sx, sz, P["INSERT_M3_D"], D - 1, D + P["INSERT_M3_DEPTH"]))
    # four mushroom pegs standing off the front face, head underside chamfered for printing
    sl, hl, sd, hd, ch = P["PEG_STEM_L"], P["PEG_HEAD_L"], P["PEG_STEM_D"], P["PEG_HEAD_D"], P["PEG_CHAMFER"]
    for px in P["PEG_XS"]:
        for pz in P["PEG_ZS"]:
            stem = cyl_y(px, pz, sd, D - sl - EPS, D + EPS)
            cone = cone_y(px, pz, hd, hd - 2 * ch, D - sl - ch, D - sl + EPS)
            head = cyl_y(px, pz, hd, D - sl - hl, D - sl - ch + EPS)
            plate = plate.union(stem).union(cone).union(head)
    return plate

def hanger_refs():
    """Reference solids for the assembly (not printed)."""
    g = hanger_geom()
    W, yb = g["W"], g["y_back"]
    refs = {}
    refs["heltec"] = (heltec_ref(g["x0"], g["zc"], g["pcb_top"]), (0.10, 0.45, 0.20))
    # holder (box with a trough) and cell
    hx0, hz0 = P["HOLDER_X0"], P["HOLDER_Z0"]
    hl, hwd, hh = P["HOLDER_L"], P["HOLDER_W"], P["HOLDER_H"]
    cz = hz0 + hwd / 2
    cy = yb - hh / 2 - 0.5
    holder = box(hx0, hx0 + hl, yb - hh, yb, hz0, hz0 + hwd)
    holder = holder.cut(cyl_x(cy, cz, P["CELL_D"] + 0.5, hx0 + 3, hx0 + hl - 3))
    refs["holder"] = (holder, (0.15, 0.15, 0.15))
    cx = hx0 + hl / 2
    refs["cell"] = (cyl_x(cy, cz, P["CELL_D"], cx - P["CELL_L"] / 2, cx + P["CELL_L"] / 2), (0.20, 0.55, 0.85))
    # Hall carrier with the SOT-23 on top, sitting on the slot floor at the sensor position
    cw, cl, ct = P["HALL_CARRIER"]
    sy = g["sensor_y"]
    zf = g["slot_floor_base"] + (g["base_front"] - sy) * g["slope"]
    sw, sl_, sh = P["SOT23"]
    carrier = box(W / 2 - cw / 2, W / 2 + cw / 2, -cl / 2, cl / 2, 0, ct)
    carrier = carrier.union(box(W / 2 - sw / 2, W / 2 + sw / 2, -sl_ / 2, sl_ / 2, ct, ct + sh))
    # the carrier lies on the sloped slot floor, so it tilts with the arm top (sensor face parallel to the magnet)
    tilt = -math.degrees(math.atan(g["slope"]))
    carrier = carrier.rotate((0, 0, 0), (1, 0, 0), tilt).translate((0, sy, zf))
    refs["hall_carrier"] = (carrier, (0.05, 0.35, 0.10))
    # sign handle bar (assumed 24 wide x 16 thick x 20 tall) resting at the root, magnet in its bottom face
    bar_bot = g["arm_top_at"](sy) + P["TAG_CLR"]
    bar = box(W / 2 - 12, W / 2 + 12, g["base_front"] - 16.0, g["base_front"] - 0.5, bar_bot, bar_bot + 20.0)
    bar = bar.cut(cyl_z(W / 2, sy, P["MAGNET_D"] + 0.2, bar_bot - 1, bar_bot + P["TAG_WALL"] + P["MAGNET_T"]))
    refs["sign_handle"] = (bar, (0.95, 0.80, 0.10))
    refs["magnet"] = (cyl_z(W / 2, sy, P["MAGNET_D"], bar_bot + P["TAG_WALL"], bar_bot + P["TAG_WALL"] + P["MAGNET_T"]), (0.6, 0.6, 0.65))
    # stub antenna rod in the clips
    az0 = (P["ANT_ZS"][0] + P["ANT_ZS"][1]) / 2 - P["ANT_L"] / 2
    refs["stub_antenna"] = (cyl_z(P["ANT_X"], P["ANT_Y"], P["ANT_D"], az0, az0 + P["ANT_L"]), (0.2, 0.2, 0.2))
    # USB-C plug overmold in the port (shows the reach)
    uy = g["pcb_top"] - P["USB_OPEN_CY"]
    plug = box(-22.0, -3.0, uy - 3.25, uy + 3.25, g["zc"] - 6.2, g["zc"] + 6.2)
    plug = plug.union(box(-3.5, 3.4, uy - 1.2, uy + 1.2, g["zc"] - 4.1, g["zc"] + 4.1))
    refs["usb_plug"] = (plug, (0.5, 0.5, 0.5))
    # clear window insert
    cxw = g["x0"] + P["OLED_ACT_CX"]; czw = g["zc"] + P["OLED_ACT_CY"]
    refs["window_insert"] = (box(cxw - P["INSERT_W"] / 2 + 0.1, cxw + P["INSERT_W"] / 2 - 0.1, -P["INSERT_POCKET"], -P["INSERT_POCKET"] + P["INSERT_T"],
                                 czw - P["INSERT_H"] / 2 + 0.1, czw + P["INSERT_H"] / 2 - 0.1), (0.7, 0.9, 1.0))
    return refs

# --------------------------------------------------------------------------------------
# GATEWAY
# --------------------------------------------------------------------------------------
def gateway_geom():
    W, H, D, wall, lt = P["G_W"], P["G_H"], P["G_D"], P["WALL"], P["LID_T"]
    g = dict(W=W, H=H, D=D, wall=wall, y_back=D - wall, lid_t=lt,
             x0=P["G_BRD_X0"], zc=P["G_BRD_ZC"], pcb_top=P["G_PCB_TOP_Y"])
    g["cable_y"] = g["pcb_top"] - P["USB_OPEN_CY"]       # plug axis = cable axis
    g["cable_z"] = P["G_CABLE_ZC"]
    return g

def build_gateway_body():
    g = gateway_geom()
    W, H, D, wall, yb = g["W"], g["H"], g["D"], g["wall"], g["y_back"]
    body = rbox_y(0, W, 0, D, 0, H, P["CORNER_R"])
    body = body.cut(rbox_y(wall, W - wall, -1, yb, wall, H - wall, P["CORNER_R"] - wall))
    body = boss_columns(body, P["G_BOSSES"], yb)
    body = body.union(board_cradle(g["x0"], g["zc"], g["pcb_top"], yb, wall))
    # USB-C cable entry: notch in the left wall open to the front (cable drops in, lid closes it)
    cy, cz, nw = g["cable_y"], g["cable_z"], P["G_CABLE_NOTCH_W"]
    body = body.cut(box(-1, wall + 1, -1, cy + P["G_CABLE_D"], cz - nw / 2, cz + nw / 2))
    # tie saddle right behind the entry: block on the back wall, tie tunnel along Z behind the cable
    sx0, sx1, sy = P["G_SADDLE"]
    sad = box(sx0, sx1, sy, yb + EPS, cz - 7, cz + 7)
    sad = sad.cut(box(sx0 + 2.0, sx1 - 2.0, sy + 1.0, sy + 3.0, cz - 8, cz + 8))
    body = body.union(sad)
    # SMA bulkhead on the top wall: 14 mm pad thickened to 3 mm, 6.5 D-hole with a 6.0 flat
    ax, ay = P["G_SMA"]
    body = body.union(cyl_z(ax, ay, P["SMA_PAD_D"], H - P["SMA_WALL"], H - wall + EPS))
    dh = cyl_z(ax, ay, P["SMA_HOLE_D"], H - P["SMA_WALL"] - 1, H + 1)
    dh = dh.cut(box(ax + (P["SMA_FLAT"] - P["SMA_HOLE_D"] / 2), ax + 6, ay - 6, ay + 6, H - P["SMA_WALL"] - 2, H + 2))
    body = body.cut(dh)
    # pigtail tie saddle near the jack
    body = body.union(tie_saddle(105.0, 62.0, yb, along="X"))
    # ventilation: intake slots in the bottom wall, exhaust slots in the top wall (offset toward the back)
    v = P["G_VENT"]
    for i in range(v["n"]):
        for yv in v["ys"]:
            xb = v["bot_x0"] + i * v["pitch"]
            body = body.cut(box(xb, xb + v["len"], yv - v["w"] / 2, yv + v["w"] / 2, -1, wall + 1))
            xt = v["top_x0"] + i * v["pitch"]
            body = body.cut(box(xt, xt + v["len"], yv - v["w"] / 2 + 2.0, yv + v["w"] / 2 + 2.0, H - wall - 1, H + 1))
    # wall mount: two keyholes through the back wall plus a lower anti-lift screw hole
    for (kx, kz) in P["G_KEYHOLES"]:
        body = body.cut(keyhole_y(kx, kz + P["KEY_SLOT_L"], P["KEY_HEAD_D"], P["KEY_SLOT_W"], P["KEY_SLOT_L"], yb - 1, D + 1))
    lx, lz = P["G_LOWER_SCREW"]
    body = body.cut(cyl_y(lx, lz, P["BP_SCREW_D"], yb - 1, D + 1))
    return body

def build_gateway_lid():
    g = gateway_geom()
    W, H, wall, lt = g["W"], g["H"], g["wall"], g["lid_t"]
    lid = rbox_y(0, W, -lt, 0, 0, H, P["CORNER_R"])
    cz = g["cable_z"]
    cutouts = ((-1, 6, cz - P["G_CABLE_NOTCH_W"] / 2 - 0.5, cz + P["G_CABLE_NOTCH_W"] / 2 + 0.5),)
    lid = lid.union(lid_tongue(W, H, wall, P["G_BOSSES"], cutouts))
    lid = lid.union(lid_header_ribs(g["x0"], g["zc"], g["pcb_top"]))
    lid = lid_board_features(lid, g["x0"], g["zc"], g["pcb_top"], lt)
    lid = lid_screw_cuts(lid, P["G_BOSSES"], lt)
    # knock-out for a 12 mm panel button on GPIO3 (factory reset), skin left outside
    bx, bz, bd = P["G_BTN_KO"]
    lid = lid.cut(cyl_y(bx, bz, bd, -lt + P["KNOCKOUT_SKIN"], 1))
    lx0, lx1, lz0, lz1, ld = P["G_LABEL"]
    lid = lid.cut(box(lx0, lx1, -lt - 1, -lt + ld, lz0, lz1))
    return lid

def gateway_refs():
    g = gateway_geom()
    W, H, yb = g["W"], g["H"], g["y_back"]
    refs = {}
    refs["heltec"] = (heltec_ref(g["x0"], g["zc"], g["pcb_top"]), (0.10, 0.45, 0.20))
    cy, cz = g["cable_y"], g["cable_z"]
    nose = g["x0"] - P["USB_NOSE"]
    plug = box(nose - 6.5 - 24.0, nose - 6.5, cy - 3.25, cy + 3.25, cz - 6.2, cz + 6.2)   # overmold 24 long (assumed)
    plug = plug.union(box(nose - 6.6, nose + 6.0, cy - 1.2, cy + 1.2, cz - 4.1, cz + 4.1))
    refs["usb_plug"] = (plug, (0.5, 0.5, 0.5))
    refs["usb_cable"] = (cyl_x(cy, cz, P["G_CABLE_D"], -40.0, nose - 6.5 - 24.0 + 1), (0.3, 0.3, 0.3))
    ax, ay = P["G_SMA"]
    refs["sma_jack"] = (cyl_z(ax, ay, 6.3, H - 12.0, H + 8.0).union(cyl_z(ax, ay, 9.2, H, H + 3.0)), (0.8, 0.7, 0.3))
    refs["whip_antenna"] = (cyl_z(ax, ay, P["WHIP_D"], H + 8.0, H + 8.0 + P["WHIP_L"]), (0.15, 0.15, 0.15))
    cxw = g["x0"] + P["OLED_ACT_CX"]; czw = g["zc"] + P["OLED_ACT_CY"]
    refs["window_insert"] = (box(cxw - P["INSERT_W"] / 2 + 0.1, cxw + P["INSERT_W"] / 2 - 0.1, -P["INSERT_POCKET"], -P["INSERT_POCKET"] + P["INSERT_T"],
                                 czw - P["INSERT_H"] / 2 + 0.1, czw + P["INSERT_H"] / 2 - 0.1), (0.7, 0.9, 1.0))
    return refs

# --------------------------------------------------------------------------------------
# 2D drawings (ezdxf): section views with dimension entities
# --------------------------------------------------------------------------------------
import ezdxf

DIM_OVR = {"dimtxt": 2.5, "dimasz": 1.5, "dimexo": 0.8, "dimexe": 1.0, "dimgap": 0.6, "dimdec": 1}

MAPS = {
    "front": lambda v: (v.x, v.z),      # looking at the lid (X right, Z up)
    "top":   lambda v: (v.x, -v.y),     # looking down: wall at the bottom of the view
    "side":  lambda v: (-v.y, v.z),     # looking from the right: lid/hook to the right, wall to the left
}
PLANES = {"front": "XZ", "top": "XY", "side": "YZ"}

def section_edges(solids, view, at):
    """Section edges of one or more solids on the named plane at the given coordinate."""
    origin = {"front": (0, at, 0), "top": (0, 0, at), "side": (at, 0, 0)}[view]
    out = []
    for s in solids:
        try:
            sec = cq.Workplane(PLANES[view], origin=origin).add(s.val()).section()
            out.append(sec.edges().vals())
        except Exception as ex:      # a plane that misses the solid gives an empty section
            out.append([])
    return out

def dxf_new():
    doc = ezdxf.new("R2010", setup=True)
    for name, color in (("OUTLINE", 7), ("REF", 8), ("DIMS", 1), ("TEXT", 3), ("NOTES", 4)):
        doc.layers.add(name, color=color)
    return doc

def dxf_edges(msp, edges, view, off, layer="OUTLINE"):
    m = MAPS[view]; ox, oy = off
    for e in edges:
        if e.geomType() == "LINE":
            a, b = m(e.startPoint()), m(e.endPoint())
            msp.add_line((a[0] + ox, a[1] + oy), (b[0] + ox, b[1] + oy), dxfattribs={"layer": layer})
        else:
            n = 36
            pts = [m(e.positionAt(i / n)) for i in range(n + 1)]
            msp.add_lwpolyline([(p[0] + ox, p[1] + oy) for p in pts], dxfattribs={"layer": layer})

def dxf_dim(msp, kind, p1, p2, line_pos, off, text=None):
    """Linear dimension: kind 'h' (horizontal, line at y=line_pos) or 'v' (vertical, line at x=line_pos)."""
    ox, oy = off
    a = (p1[0] + ox, p1[1] + oy); b = (p2[0] + ox, p2[1] + oy)
    if kind == "h":
        d = msp.add_linear_dim(base=(a[0], line_pos + oy), p1=a, p2=b, angle=0, dimstyle="EZDXF",
                               override=DIM_OVR, text=text if text else "<>", dxfattribs={"layer": "DIMS"})
    else:
        d = msp.add_linear_dim(base=(line_pos + ox, a[1]), p1=a, p2=b, angle=90, dimstyle="EZDXF",
                               override=DIM_OVR, text=text if text else "<>", dxfattribs={"layer": "DIMS"})
    d.render()

def dxf_text(msp, s, pos, off, h=3.0, layer="TEXT"):
    msp.add_text(s, height=h, dxfattribs={"layer": layer}).set_placement((pos[0] + off[0], pos[1] + off[1]))

def write_part_drawing(path, title, solid, views, notes=()):
    """views: list of dicts {view, at, off, label, dims:[(kind,p1,p2,line_pos,text)], refs:[solids]}."""
    doc = dxf_new(); msp = doc.modelspace()
    dxf_text(msp, title, (0, 0), (0, 0), h=5.0)
    for v in views:
        off = v["off"]
        edges = section_edges([solid], v["view"], v["at"])[0]
        dxf_edges(msp, edges, v["view"], off)
        for r in v.get("refs", []):
            dxf_edges(msp, section_edges([r], v["view"], v["at"])[0], v["view"], off, layer="REF")
        dxf_text(msp, v["label"], v.get("label_at", (0, -8)), off, h=2.8)
        for dm in v.get("dims", []):
            dxf_dim(msp, dm[0], dm[1], dm[2], dm[3], off, dm[4] if len(dm) > 4 else None)
    y = -10.0
    for n in notes:
        dxf_text(msp, n, (0, y), (0, 0), h=2.5, layer="NOTES"); y -= 4.0
    doc.saveas(path)

# --------------------------------------------------------------------------------------
# previews (OpenSCAD) and exports
# --------------------------------------------------------------------------------------
OPENSCAD = "/Applications/OpenSCAD-2021.01.app/Contents/MacOS/OpenSCAD"

def render_scad(out_dir, name, body, camera="0,0,0,60,0,25,0", size="1200,900"):
    scad = os.path.join(out_dir, name + ".scad")
    png = os.path.join(out_dir, name + ".png")
    open(scad, "w").write(body)
    if not os.path.exists(OPENSCAD):
        print("  (OpenSCAD not found, skipped", png, ")"); return
    r = subprocess.run([OPENSCAD, "-o", png, "--autocenter", "--viewall", "--projection=o",
                        "--imgsize=" + size, "--colorscheme=Tomorrow", "--camera=" + camera, scad],
                       capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        print("  OpenSCAD failed for", name, r.stderr[-400:])

def scad_import(rel, color=None, translate=(0, 0, 0)):
    s = 'translate([%g,%g,%g]) ' % translate
    if color:
        s += 'color([%g,%g,%g]) ' % color
    return s + 'import("%s");\n' % rel

def export_part(out_dir, name, wp):
    cq.exporters.export(wp, os.path.join(out_dir, name + ".step"))
    cq.exporters.export(wp, os.path.join(out_dir, name + ".stl"), tolerance=0.01, angularTolerance=0.1)
    print("  %-22s %s" % (name, bbox_str(wp)))

def export_assembly(path, parts):
    """parts: list of (name, workplane, color, translate)."""
    assy = cq.Assembly(name=os.path.splitext(os.path.basename(path))[0])
    for (name, wp, col, tr) in parts:
        assy.add(wp, name=name, color=cq.Color(*col), loc=cq.Location(cq.Vector(*tr)))
    try:
        assy.export(path)
    except AttributeError:
        assy.save(path)

# --------------------------------------------------------------------------------------
# design rule checks and README
# --------------------------------------------------------------------------------------
def design_checks(hg, gg):
    out = []
    W = hg["W"]
    sy = hg["sensor_y"]
    mag_face = hg["arm_top_at"](sy) + P["TAG_CLR"] + P["TAG_WALL"]
    sens_top = hg["sensor_z"] + P["SOT23"][2] / 2
    gap = mag_face - sens_top
    out.append((3.5 <= gap <= 4.5, "magnet face to Hall package top = %.2f mm (target 3.5 to 4.5, research)" % gap))
    # steel keep-out: hook screws (head centre) and the security screw
    for (sx, sz) in hg["hook_screws"]:
        d = math.sqrt((sx - W / 2) ** 2 + (hg["base_front"] - sy) ** 2 + (sz - hg["sensor_z"]) ** 2)
        out.append((d >= 15.0, "Hall sensor to hook screw head at x=%.1f: %.1f mm (>= 15 assumed rule)" % (sx, d)))
    # cell to sensor
    cz = P["HOLDER_Z0"] + P["HOLDER_W"] / 2
    d = math.sqrt((hg["y_back"] - P["HOLDER_H"] / 2 - sy) ** 2 + (hg["sensor_z"] - cz - P["CELL_D"] / 2) ** 2)
    out.append((d >= 15.0, "Hall sensor to nearest cell surface: %.1f mm (>= 15)" % d))
    # OLED active area inside the window (board frame)
    ax0, ax1 = P["OLED_ACT_CX"] - 21.7 / 2, P["OLED_ACT_CX"] + 21.7 / 2
    ay0, ay1 = 1.0 - 10.9 / 2, 1.0 + 10.9 / 2
    wx0, wx1 = P["OLED_ACT_CX"] - P["WIN_W"] / 2, P["OLED_ACT_CX"] + P["WIN_W"] / 2
    wy0, wy1 = P["OLED_ACT_CY"] - P["WIN_H"] / 2, P["OLED_ACT_CY"] + P["WIN_H"] / 2
    out.append((wx0 < ax0 and wx1 > ax1 and wy0 < ay0 and wy1 > ay1, "OLED active area (assumed 21.7 x 10.9) inside the %g x %g window" % (P["WIN_W"], P["WIN_H"])))
    # hook lead slot above the bulkhead, bulkhead above the holder rib
    out.append((hg["lid_slot"][2] >= hg["bulk"][1], "lid lead slot bottom z=%.1f clears bulkhead top z=%.1f" % (hg["lid_slot"][2], hg["bulk"][1])))
    out.append((P["HOLDER_Z0"] + P["HOLDER_W"] + P["HOLDER_CLR"] + 2.0 <= hg["bulk"][0], "holder top rib fits under the bulkhead"))
    # hook counterbores clear the arm underside
    cb_top = hg["hook_screws"][0][1] + P["CB_M3_D"] / 2
    out.append((cb_top < hg["arm_bot"], "hook screw counterbores (top z=%.1f) clear the arm underside z=%.1f" % (cb_top, hg["arm_bot"])))
    # holder clears the corner bosses
    hx0 = P["HOLDER_X0"] - P["HOLDER_CLR"]; hx1 = P["HOLDER_X0"] + P["HOLDER_L"] + P["HOLDER_CLR"]
    bx = [b[0] for b in P["H_BOSSES"] if b[1] < 20]
    out.append((min(bx) + P["BOSS_D"] / 2 <= hx0 and max(bx) - P["BOSS_D"] / 2 >= hx1, "21700 holder envelope clears the bottom lid bosses"))
    # board pocket clears the top bosses
    top = hg["zc"] + P["BRD_W"] / 2 + P["BRD_CLR"] + P["POCKET_WALL_T"]
    bz = min(b[1] for b in P["H_BOSSES"] if b[1] > 100) - P["BOSS_D"] / 2
    out.append((top <= bz, "board pocket top z=%.1f clears the top lid bosses (z>=%.1f)" % (top, bz)))
    # WiFi keep-out: no metal within the last 10 mm of the board + 5 beyond (stub antenna, screws)
    ke = hg["x0"] + P["BRD_L"] + 5.0
    out.append((P["ANT_X"] - P["ANT_D"] / 2 >= ke, "stub antenna x=%.0f outside the 2.4 GHz keep-out (x<%.1f)" % (P["ANT_X"], ke)))
    # gateway: plug overmold room and SMA clear of the pocket
    out.append((gg["x0"] - gg["wall"] >= 36.0, "gateway: %.1f mm for the USB-C plug overmold left of the board" % (gg["x0"] - gg["wall"])))
    out.append((P["G_SMA"][0] - P["SMA_PAD_D"] / 2 >= gg["x0"] + P["BRD_L"] + 5.0 - 10.0, "gateway: SMA pad right of the board antenna end"))
    return out

def write_readme(out_dir, hg, gg):
    sy = hg["sensor_y"]
    txt = """HazardLink v8 enclosures, Designer A (robust and serviceable)
Generated by hazardlink_enclosures.py. Frame: X right, Z up, Y from the front face into the wall.

FILES
  <part>.step / .stl / .png / _drawing.dxf   printable parts: hanger_body, hanger_lid, hanger_hook, hanger_backplate, gateway_body, gateway_lid
  hanger_assembly.step, gateway_assembly.step  named and coloured assemblies including the reference solids
  hanger_section.dxf, gateway_section.dxf      assembly stack-up sections
  *_exploded.png, *_assembled*.png             previews
  ref/                                          reference solids (board, cell, holder, Hall carrier, magnet, antenna, plug), not printed
  autocad/                                      .sat + 3DSOLID .dxf for AutoCAD for Mac (from to_autocad.py)
  manifest.txt                                  bounding boxes and derived positions

HANGER SERVICE SEQUENCE (unit stays on the wall)
  1. Remove the two M3 pin-Torx button-head screws in the hook base (driver enters between the side gussets, under the arm).
     Lift the hook off its locating pocket, slide the Hall carrier out of the hook slot; it passes through the lid slot.
  2. Remove the four M3 pin-Torx countersunk lid screws. Lift the lid straight off (the lip is 4 mm deep).
  3. The 21700 cell sits in its holder facing you: push it against the spring end and lift it out. Fit the new cell, same polarity.
  4. To swap the board: unplug the JST 1.25 battery lead (under the board, plug enters from the right), unplug the U.FL antenna,
     unsolder or cut the three Hall wires at the board underside pads (J3 pin 1 GND, pin 2 3V3, pin 17 GPIO6), lift the board
     off its rails. No screws hold the board: it rests on the rails and is clamped by the two lid ribs.
  5. Refit in reverse. Insert the cell last, close the lid within the 60 s commissioning window, or press RST (2 mm pinhole) later.
  To take the unit off the wall: with the lid off, remove the internal M3 screw at (50, 62) through the back wall, then lift the body
  14 mm and pull it off the four backplate pegs.

GATEWAY SERVICE SEQUENCE
  1. Remove the six M3 countersunk lid screws, lift the lid.
  2. Unplug the USB-C plug (cable stays tied to the saddle), unplug the U.FL pigtail, lift the board off its rails.

MAGNET DATUM (publish to the sign tag)
  Magnet on the hook centreline (x=%.0f), %.0f mm out from the hook base front face (Y=%.0f), pole face parallel to the arm top surface,
  facing down, with %.1f mm running clearance and a %.1f mm tag wall (assumed). Air gap magnet face to Hall package top = %.2f mm.
  The arm top slopes up %.0f mm over its length so the handle slides to the root and rests there.

PRINTING (PETG, 0.4 nozzle, 3 perimeters, 0.2 layers)
  hanger_body: back face down, open front up. Peg pocket roofs bridge 11.5 mm; lead notch bridges 8 mm.
  hanger_lid: outer face down. PRG tab and LED window are thin skins on the bed. Fit the 36 x 19.5 x 1 mm clear insert from inside
  under the two cleats.
  hanger_hook: lying on a side (X) face so layers run along the arm. Counterbores print horizontal.
  hanger_backplate: back face down, pegs print vertical.
  gateway_body: back face down. gateway_lid: outer face down.
  Heat-set inserts: ruthex M3 x 5.7 (4.0 mm holes): 4 lid + 2 hook in the hanger body, 1 security in the backplate, 6 in the gateway body.
  Screws (assumed, not on SHOPPING.md): M3 x 8 countersunk pin-Torx x 4 (hanger lid), M3 x 12 button-head pin-Torx x 2 (hook),
  M3 x 8 countersunk x 6 (gateway lid), M3 x 8 pan head x 1 (internal security screw), 4 + 3 No.8 pan/csk wall screws with plugs.
  Use A2 stainless or brass for the two hook screws (they sit 16 mm from the Hall sensor).

MEASURE BEFORE FREEZING (assumed values in PARAMS)
  The TinyTronics 21700 holder outline (assumed 80 x 25 x 21 mm) and where its leads exit.
  The sign hand-hole and handle bar: hook width 26, arm 45, lip 22 are assumed; the magnet position in the handle must match the datum.
  How far the sign top rises above the handle bar: the OLED window bottom is %.0f mm above the arm top at the root.
  The stub antenna diameter and length (clips are for a 6 mm rod, 60 mm long).
  The OLED active area offset (window is 30 x 16 to cover it with margin).
""" % (hg["W"] / 2, P["HALL_Y_FROM_BASE"], sy, P["TAG_CLR"], P["TAG_WALL"],
       hg["arm_top_at"](sy) + P["TAG_CLR"] + P["TAG_WALL"] - (hg["sensor_z"] + P["SOT23"][2] / 2), P["HOOK_SLOPE"],
       hg["zc"] + P["OLED_ACT_CY"] - P["WIN_H"] / 2 - hg["arm_top"])
    open(os.path.join(out_dir, "README.txt"), "w").write(txt)

# --------------------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------------------
def main(out_dir, quick=False, autocad=True):
    t0 = time.time()
    os.makedirs(out_dir, exist_ok=True)
    ref_dir = os.path.join(out_dir, "ref"); os.makedirs(ref_dir, exist_ok=True)
    hg, gg = hanger_geom(), gateway_geom()

    print("Building hanger parts")
    h_body = build_hanger_body()
    h_lid = build_hanger_lid()
    h_hook = build_hanger_hook()
    h_plate = build_hanger_backplate()
    h_refs = hanger_refs()
    print("Building gateway parts")
    g_body = build_gateway_body()
    g_lid = build_gateway_lid()
    g_refs = gateway_refs()

    parts = {"hanger_body": h_body, "hanger_lid": h_lid, "hanger_hook": h_hook, "hanger_backplate": h_plate,
             "gateway_body": g_body, "gateway_lid": g_lid}
    print("Exporting parts (STEP + STL)")
    for name, wp in parts.items():
        assert wp.val().isValid(), name + " is not a valid solid"
        export_part(out_dir, name, wp)
    print("Exporting reference solids")
    for unit, refs in (("hanger", h_refs), ("gateway", g_refs)):
        for name, (wp, col) in refs.items():
            cq.exporters.export(wp, os.path.join(ref_dir, "%s_%s.step" % (unit, name)))
            cq.exporters.export(wp, os.path.join(ref_dir, "%s_%s.stl" % (unit, name)), tolerance=0.02, angularTolerance=0.2)

    # ---- assemblies ------------------------------------------------------------------
    print("Exporting assemblies")
    h_assy = [("hanger_body", h_body, (0.85, 0.85, 0.85), (0, 0, 0)), ("hanger_lid", h_lid, (0.75, 0.78, 0.82), (0, 0, 0)),
              ("hanger_hook", h_hook, (0.95, 0.55, 0.10), (0, 0, 0)), ("hanger_backplate", h_plate, (0.55, 0.55, 0.60), (0, 0, 0))]
    h_assy += [("ref_" + n, wp, col, (0, 0, 0)) for n, (wp, col) in h_refs.items()]
    export_assembly(os.path.join(out_dir, "hanger_assembly.step"), h_assy)
    g_assy = [("gateway_body", g_body, (0.85, 0.85, 0.85), (0, 0, 0)), ("gateway_lid", g_lid, (0.75, 0.78, 0.82), (0, 0, 0))]
    g_assy += [("ref_" + n, wp, col, (0, 0, 0)) for n, (wp, col) in g_refs.items()]
    export_assembly(os.path.join(out_dir, "gateway_assembly.step"), g_assy)

    # ---- 2D drawings ------------------------------------------------------------------
    print("Writing DXF drawings")
    W, H, D = hg["W"], hg["H"], hg["D"]
    zc, x0, pt = hg["zc"], hg["x0"], hg["pcb_top"]
    cxw, czw = x0 + P["OLED_ACT_CX"], zc + P["OLED_ACT_CY"]
    write_part_drawing(os.path.join(out_dir, "hanger_body_drawing.dxf"), "HazardLink hanger body v8A (mm)", h_body, [
        dict(view="front", at=28.0, off=(0, -150), label="FRONT SECTION at Y=28 (near back wall): peg bosses, bulkhead, cradle, holder ribs",
             dims=[("h", (0, 0), (W, 0), -10), ("v", (0, 0), (0, H), -12),
                   ("h", (P["PEG_XS"][0], P["PEG_ZS"][0]), (P["PEG_XS"][1], P["PEG_ZS"][0]), 55, "peg pitch <>"),
                   ("v", (P["PEG_XS"][1] + 8, P["PEG_ZS"][0]), (P["PEG_XS"][1] + 8, P["PEG_ZS"][1]), 112, "peg pitch <>"),
                   ("v", (W, P["BULK_Z"][0]), (W, P["BULK_Z"][1]), 108, "bulkhead <>"),
                   ("h", (P["HOLDER_X0"] - 0.5, 2.5), (P["HOLDER_X0"] + P["HOLDER_L"] + 0.5, 2.5), -6, "holder bay <>")]),
        dict(view="front", at=5.0, off=(0, -320), label="FRONT SECTION at Y=5 (near lid): USB slot, board pocket walls, bosses",
             dims=[("h", (0, zc - P["USB_SLOT_W"] / 2), (0, zc + P["USB_SLOT_W"] / 2), -8, "USB slot <>"),
                   ("v", (x0 - 1, zc - 15), (x0 - 1, zc + 15), -20, "board pocket <>"),
                   ("v", (W, 0), (W, zc), 108, "board centre <>")]),
        dict(view="top", at=zc, off=(0, -400), label="TOP SECTION at Z=104 (board centreline): pocket depth, USB slot, rails",
             dims=[("v", (W, -D), (W, 0), 108, "depth <>"), ("v", (-1, -pt), (-1, 0), -12, "PCB top <>"),
                   ("h", (0, -D), (P["WALL"], -D), -8, "wall <>")]),
        dict(view="side", at=30.0, off=(320, -150), label="SIDE SECTION at X=30 (through peg pockets, holder bay, board pocket)", label_at=(-35, -8),
             dims=[("h", (-D, 0), (0, 0), -8, "depth <>"), ("v", (2, 0), (2, H), 8)]),
    ], notes=["Section edges only. Reference parts on layer REF where shown. Every 'assumed' value is listed in PARAMS in hazardlink_enclosures.py.",
              "Print body back-face down (open front up), PETG, 0.4 nozzle, 3 perimeters; peg pocket roofs bridge 11.5 mm."])
    write_part_drawing(os.path.join(out_dir, "hanger_lid_drawing.dxf"), "HazardLink hanger lid v8A (mm)", h_lid, [
        dict(view="front", at=-1.5, off=(0, -150), label="FRONT SECTION at Y=-1.5: window, screw holes, PRG tab groove, Hall lead slot",
             dims=[("h", (0, 0), (W, 0), -10), ("v", (0, 0), (0, H), -12),
                   ("h", (cxw - P["WIN_W"] / 2, czw), (cxw + P["WIN_W"] / 2, czw), czw + 14, "window <>"),
                   ("v", (cxw + P["WIN_W"] / 2, czw - P["WIN_H"] / 2), (cxw + P["WIN_W"] / 2, czw + P["WIN_H"] / 2), cxw + 22, "window <>"),
                   ("h", (0, czw), (cxw, czw), czw - 12, "window centre <>"), ("v", (W, 0), (W, czw), 108, "window centre <>"),
                   ("h", (hg["hook_screws"][0][0], hg["hook_screws"][0][1]), (hg["hook_screws"][1][0], hg["hook_screws"][1][1]), 28, "hook screws <>")]),
        dict(view="front", at=-2.7, off=(0, -320), label="FRONT SECTION at Y=-2.7 (outer skin): hook pocket, label recess, LED window skin",
             dims=[("h", (hg["hook_x0"] - 0.25, hg["base_z0"]), (hg["hook_x1"] + 0.25, hg["base_z0"]), 22, "hook pocket <>"),
                   ("v", (hg["hook_x1"] + 0.25, hg["base_z0"] - 0.25), (hg["hook_x1"] + 0.25, hg["base_z1"] + 0.25), 75, "hook pocket <>")]),
        dict(view="top", at=zc, off=(0, -400), label="TOP SECTION at Z=104: lip, header ribs, insert pocket",
             dims=[("v", (W, -P["LID_T"]), (W, 0), 108, "lid <>"), ("v", (W, 0), (W, P["TONGUE_H"]), 118, "lip <>")]),
        dict(view="side", at=W / 2, off=(320, -150), label="SIDE SECTION at X=50: hook pocket, lead slot, lip", label_at=(-5, -8),
             dims=[("v", (5, hg["lid_slot"][2]), (5, hg["lid_slot"][3]), 14, "lead slot <>")]),
    ], notes=["Print lid outer face down. Window insert: 36 x 19.5 x 1.0 clear acrylic or PETG, snaps under the two cleats from inside.",
              "PRG tab: 6 x 10 x 1.0 living hinge sealed by a 0.4 skin; pusher pin 2.5 dia. RST: 2.0 pinhole. LED: 0.5 skin window."])
    sy = hg["sensor_y"]
    write_part_drawing(os.path.join(out_dir, "hanger_hook_drawing.dxf"), "HazardLink hanger J-hook v8A (mm)", h_hook, [
        dict(view="side", at=W / 2, off=(0, -120), label="SIDE SECTION at X=50 (J profile with the Hall carrier slot)",
             dims=[("h", (-hg["base_front"], hg["base_z0"]), (-hg["lip_front"], hg["base_z0"]), hg["base_z0"] - 10, "arm <>"),
                   ("h", (-hg["base_back"], hg["base_z1"]), (-hg["base_front"], hg["base_z1"]), hg["base_z1"] + 8, "base <>"),
                   ("v", (-hg["lip_front"], hg["arm_bot"]), (-hg["lip_front"], hg["arm_bot"] + P["HOOK_LIP"]), -hg["lip_front"] + 8, "lip <>"),
                   ("v", (-hg["base_back"], hg["base_z0"]), (-hg["base_back"], hg["base_z1"]), -hg["base_back"] - 10, "base <>"),
                   ("h", (-hg["base_front"], hg["arm_top"] + 6), (-sy, hg["arm_top"] + 6), hg["arm_top"] + 12, "sensor <>"),
                   ("v", (-hg["lip_back"] + 1, hg["arm_bot"]), (-hg["lip_back"] + 1, hg["arm_top_at"](hg["lip_back"] - 1)), -hg["lip_back"] + 12, "arm <>")],
             refs=[h_refs["hall_carrier"][0], h_refs["magnet"][0], h_refs["sign_handle"][0]]),
        dict(view="front", at=sy, off=(0, -230), label="FRONT SECTION at Y=-16 (through the sensor): arm width and slot",
             dims=[("h", (hg["hook_x0"], hg["arm_bot"]), (hg["hook_x1"], hg["arm_bot"]), hg["arm_bot"] - 8, "hook width <>"),
                   ("h", (W / 2 - hg["slot_hw"], hg["arm_top"]), (W / 2 + hg["slot_hw"], hg["arm_top"]), hg["arm_top"] + 8, "slot <>")],
             refs=[h_refs["hall_carrier"][0], h_refs["magnet"][0]]),
        dict(view="top", at=hg["slot_floor_base"] + 1.0, off=(230, -120), label="TOP SECTION through the slot: carrier pocket, screw holes",
             dims=[("h", (hg["hook_screws"][0][0], -hg["base_back"]), (hg["hook_screws"][1][0], -hg["base_back"]), -hg["base_back"] + 8, "screws <>")],
             refs=[h_refs["hall_carrier"][0]]),
    ], notes=["Print lying on a side face (X face on the bed) so layers run along the arm. PETG. Screws: 2 x M3 x 12 button head pin-Torx (assumed).",
              "Magnet datum: on the hook centreline, %.0f mm out from the base front face, pole face parallel to the arm top, 1.0 mm running clearance." % P["HALL_Y_FROM_BASE"]])
    bx0, bz0 = (W - P["BP_W"]) / 2, (H - P["BP_H"]) / 2
    write_part_drawing(os.path.join(out_dir, "hanger_backplate_drawing.dxf"), "HazardLink hanger backplate v8A (mm)", h_plate, [
        dict(view="front", at=D + 1.0, off=(0, -150), label="FRONT SECTION at Y=36 (just inside the front face): wall screw countersinks, security insert",
             dims=[("h", (bx0, bz0), (bx0 + P["BP_W"], bz0), bz0 - 10), ("v", (bx0, bz0), (bx0, bz0 + P["BP_H"]), bx0 - 12),
                   ("h", (bx0 + 10, bz0 + 10), (bx0 + P["BP_W"] - 10, bz0 + 10), bz0 + 4, "screws <>"),
                   ("v", (bx0 + P["BP_W"] - 10, bz0 + 10), (bx0 + P["BP_W"] - 10, bz0 + P["BP_H"] - 10), bx0 + P["BP_W"] + 8, "screws <>")]),
        dict(view="top", at=P["PEG_ZS"][0], off=(0, -310), label="TOP SECTION at Z=45 (through the lower pegs): mushroom peg profile",
             dims=[("v", (bx0, -D - P["BP_T"]), (bx0, -D), bx0 - 10, "plate <>"), ("v", (bx0 + P["BP_W"], -D), (bx0 + P["BP_W"], -D + P["PEG_STEM_L"] + P["PEG_HEAD_L"]), bx0 + P["BP_W"] + 8, "peg <>"),
                   ("h", (P["PEG_XS"][0], -D), (P["PEG_XS"][1], -D), -D + 14, "peg pitch <>")]),
        dict(view="side", at=P["PEG_XS"][0], off=(260, -150), label="SIDE SECTION at X=30 (through both pegs and the security insert level)", label_at=(-45, -8),
             dims=[("v", (-D, P["PEG_ZS"][0]), (-D, P["PEG_ZS"][1]), -D - P["BP_T"] - 10, "peg pitch <>")]),
    ], notes=["Print back face down. Four No.8 / 4 mm pan or countersunk wall screws with plugs. M3 heat-set insert at (50, 62) for the internal security screw.",
              "Pegs: 5.5 stem x 3.5, 10 head x 3.5, 1 mm chamfer under the head. Body slides down 14 mm onto them."])
    GW, GH, GD = gg["W"], gg["H"], gg["D"]
    gx0, gzc, gpt = gg["x0"], gg["zc"], gg["pcb_top"]
    gcx, gcz = gx0 + P["OLED_ACT_CX"], gzc + P["OLED_ACT_CY"]
    write_part_drawing(os.path.join(out_dir, "gateway_body_drawing.dxf"), "HazardLink gateway body v8A (mm)", g_body, [
        dict(view="front", at=26.0, off=(0, -100), label="FRONT SECTION at Y=26 (back wall): keyholes, saddles, cradle, bosses",
             dims=[("h", (0, 0), (GW, 0), -10), ("v", (0, 0), (0, GH), -12),
                   ("h", (P["G_KEYHOLES"][0][0], P["G_KEYHOLES"][0][1]), (P["G_KEYHOLES"][1][0], P["G_KEYHOLES"][1][1]), GH + 8, "keyhole pitch <>"),
                   ("v", (GW, 0), (GW, P["G_KEYHOLES"][0][1]), GW + 10, "keyhole <>"), ("v", (GW, 0), (GW, gzc), GW + 20, "board centre <>")]),
        dict(view="front", at=5.0, off=(0, -220), label="FRONT SECTION at Y=5: cable notch, plug space, board pocket walls",
             dims=[("v", (0, gg["cable_z"] - P["G_CABLE_NOTCH_W"] / 2), (0, gg["cable_z"] + P["G_CABLE_NOTCH_W"] / 2), -8, "cable notch <>"),
                   ("h", (0, gzc + 16), (gx0 - 1, gzc + 16), gzc + 24, "plug space <>")]),
        dict(view="top", at=gzc, off=(0, -300), label="TOP SECTION at Z=42: cable notch, saddle, board pocket",
             dims=[("v", (GW, -GD), (GW, 0), GW + 10, "depth <>"), ("v", (-1, -gpt), (-1, 0), -12, "PCB top <>")]),
        dict(view="top", at=GH - 1.2, off=(0, -350), label="TOP SECTION through the top wall: SMA D-hole and exhaust vents",
             dims=[("h", (0, -GD), (P["G_SMA"][0], -GD), -GD - 8, "SMA <>"), ("v", (GW, -GD), (GW, -P["G_SMA"][1]), GW + 10, "SMA <>")]),
        dict(view="side", at=103.0, off=(260, -100), label="SIDE SECTION at X=103 (through the SMA hole and a vent)", label_at=(-30, -8),
             dims=[("h", (-GD, 0), (0, 0), -8, "depth <>"), ("v", (2, 0), (2, GH), 8)]),
    ], notes=["Print back face down. SMA: 6.5 D-hole with a 6.0 flat in a 3.0 mm pad; use the 11 mm extended-thread U.FL-to-SMA pigtail.",
              "Cable: lay the USB-C cable in the left-wall notch, tie it to the saddle so no load reaches the board's receptacle."])
    write_part_drawing(os.path.join(out_dir, "gateway_lid_drawing.dxf"), "HazardLink gateway lid v8A (mm)", g_lid, [
        dict(view="front", at=-1.5, off=(0, -100), label="FRONT SECTION at Y=-1.5: window, screw holes, PRG tab groove, button knock-out",
             dims=[("h", (0, 0), (GW, 0), -10), ("v", (0, 0), (0, GH), -12),
                   ("h", (gcx - P["WIN_W"] / 2, gcz), (gcx + P["WIN_W"] / 2, gcz), gcz + 14, "window <>"),
                   ("h", (0, gcz), (gcx, gcz), gcz - 14, "window centre <>"), ("v", (GW, 0), (GW, gcz), GW + 10, "window centre <>"),
                   ("h", (0, P["G_BTN_KO"][1]), (P["G_BTN_KO"][0], P["G_BTN_KO"][1]), -6, "button KO <>")]),
        dict(view="top", at=gzc, off=(0, -220), label="TOP SECTION at Z=42: lip, header ribs, insert pocket",
             dims=[("v", (GW, -P["LID_T"]), (GW, 0), GW + 10, "lid <>")]),
    ], notes=["Print outer face down. Six M3 countersunk screws into heat-set inserts. Same window, PRG tab, RST pinhole and LED window as the hanger."])
    # assembly stack-up sections
    h_all = [h_body, h_lid, h_hook, h_plate]
    doc = dxf_new(); msp = doc.modelspace()
    dxf_text(msp, "HazardLink hanger v8A assembly sections (mm)", (0, 0), (0, 0), h=5.0)
    for (label, at, off) in (("SIDE SECTION at X=50: hook, Hall carrier, magnet datum, bulkhead, lid, backplate, wall", W / 2, (50, -160)),
                             ("SIDE SECTION at X=34.8: OLED window, insert, board on rails, USB-C level, backplate", cxw, (300, -160))):
        for s in h_all:
            dxf_edges(msp, section_edges([s], "side", at)[0], "side", off)
        for n, (wp, col) in h_refs.items():
            dxf_edges(msp, section_edges([wp], "side", at)[0], "side", off, layer="REF")
        dxf_text(msp, label, (-D - P["BP_T"], -10), off, h=2.8)
    off = (50, -160)
    mag_face = hg["arm_top_at"](sy) + P["TAG_CLR"] + P["TAG_WALL"]
    sens_top = hg["sensor_z"] + P["SOT23"][2] / 2
    dxf_dim(msp, "v", (-sy, sens_top), (-sy, mag_face), -sy + 30, off, "air gap <>")
    dxf_dim(msp, "h", (-D - P["BP_T"], H + 4), (-hg["lip_front"], H + 4), H + 10, off, "projection from wall <>")
    dxf_dim(msp, "h", (-hg["base_front"], hg["base_z0"]), (-hg["lip_front"], hg["base_z0"]), hg["base_z0"] - 10, off, "arm <>")
    off = (300, -160)
    dxf_dim(msp, "v", (10, czw - P["WIN_H"] / 2), (10, czw + P["WIN_H"] / 2), 20, off, "window <>")
    dxf_dim(msp, "h", (0, zc + 20), (-P["H_PCB_TOP_Y"], zc + 20), zc + 26, off, "PCB top from lid inner face <>")
    doc.saveas(os.path.join(out_dir, "hanger_section.dxf"))
    doc = dxf_new(); msp = doc.modelspace()
    dxf_text(msp, "HazardLink gateway v8A assembly sections (mm)", (0, 0), (0, 0), h=5.0)
    g_all = [g_body, g_lid]
    for (view, label, at, off, lab) in (("side", "SIDE SECTION at X=77.3: window, insert, board on rails", gcx, (40, -110), (-30, -10)),
                                        ("top", "TOP SECTION at Z=42: plug, cable, saddle, board, pocket", gzc, (200, -70), (0, -40)),
                                        ("front", "FRONT SECTION at Y=5: board, plug overmold, cable notch, SMA pad", 5.0, (200, -220), (0, -10))):
        for s in g_all:
            dxf_edges(msp, section_edges([s], view, at)[0], view, off)
        for n, (wp, col) in g_refs.items():
            dxf_edges(msp, section_edges([wp], view, at)[0], view, off, layer="REF")
        dxf_text(msp, label, lab, off, h=2.8)
    doc.saveas(os.path.join(out_dir, "gateway_section.dxf"))

    # ---- PNG previews ------------------------------------------------------------------
    if not quick:
        print("Rendering PNG previews")
        for name in parts:
            render_scad(out_dir, name, scad_import(name + ".stl", (0.8, 0.8, 0.8)))
        render_scad(out_dir, "hanger_hook_underside", scad_import("hanger_hook.stl", (0.95, 0.55, 0.1)), camera="0,0,0,120,0,200,0")
        render_scad(out_dir, "hanger_lid_inside", scad_import("hanger_lid.stl", (0.8, 0.8, 0.8)), camera="0,0,0,60,0,205,0")
        render_scad(out_dir, "gateway_lid_inside", scad_import("gateway_lid.stl", (0.8, 0.8, 0.8)), camera="0,0,0,60,0,205,0")
        def unit_scad(unit, part_tr, refs, ref_tr):
            s = ""
            for name, col, tr in part_tr:
                s += scad_import(name + ".stl", col, tr)
            for name, (wp, col) in refs.items():
                s += scad_import("ref/%s_%s.stl" % (unit, name), col, ref_tr.get(name, (0, 0, 0)))
            return s
        hook_refs = {"hall_carrier", "sign_handle", "magnet"}
        h_parts_ex = [("hanger_body", (0.85, 0.85, 0.85), (0, 0, 0)), ("hanger_lid", (0.75, 0.78, 0.82), (0, -EX, 0)),
                      ("hanger_hook", (0.95, 0.55, 0.1), (0, -2 * EX, 0)), ("hanger_backplate", (0.55, 0.55, 0.6), (0, EX, 0))]
        h_ref_tr = {n: (0, -2 * EX, 0) for n in hook_refs}; h_ref_tr["window_insert"] = (0, -EX, 0)
        render_scad(out_dir, "hanger_exploded", unit_scad("hanger", h_parts_ex, h_refs, h_ref_tr))
        h_parts = [(n, c, (0, 0, 0)) for (n, c, t) in h_parts_ex]
        render_scad(out_dir, "hanger_assembled", unit_scad("hanger", h_parts, h_refs, {}))
        render_scad(out_dir, "hanger_assembled_front", unit_scad("hanger", h_parts, h_refs, {}), camera="0,0,0,90,0,0,0")
        render_scad(out_dir, "hanger_assembled_side", unit_scad("hanger", h_parts, h_refs, {}), camera="0,0,0,90,0,90,0")
        g_parts_ex = [("gateway_body", (0.85, 0.85, 0.85), (0, 0, 0)), ("gateway_lid", (0.75, 0.78, 0.82), (0, -EX, 0))]
        render_scad(out_dir, "gateway_exploded", unit_scad("gateway", g_parts_ex, g_refs, {"window_insert": (0, -EX, 0)}))
        g_parts = [(n, c, (0, 0, 0)) for (n, c, t) in g_parts_ex]
        render_scad(out_dir, "gateway_assembled", unit_scad("gateway", g_parts, g_refs, {}))
        render_scad(out_dir, "gateway_assembled_front", unit_scad("gateway", g_parts, g_refs, {}), camera="0,0,0,90,0,0,0")
        for f in glob.glob(os.path.join(out_dir, "*.scad")):
            os.remove(f)

    # ---- design rule checks (fail loudly if a parameter change breaks the design) ----------
    print("Design rule checks")
    checks = design_checks(hg, gg)
    for ok, msg in checks:
        print("  %s %s" % ("PASS" if ok else "FAIL", msg))
    assert all(ok for ok, _ in checks), "design rule check failed"
    write_readme(out_dir, hg, gg)

    # ---- manifest -----------------------------------------------------------------------
    lines = ["HazardLink v8 enclosures, Designer A. Generated by hazardlink_enclosures.py", ""]
    for name, wp in parts.items():
        lines.append("%-22s %s" % (name, bbox_str(wp)))
    lines += ["", "Key derived positions (world frame, mm):",
              "  hanger board: USB-end corners at x=%.1f, centreline z=%.1f, PCB top at Y=%.1f, OLED glass at Y=%.1f" % (x0, zc, pt, pt - P["OLED_H"]),
              "  hanger window: %.0f x %.0f centred at (%.1f, %.1f); insert pocket %.0f x %.1f x %.1f" % (P["WIN_W"], P["WIN_H"], cxw, czw, P["INSERT_W"], P["INSERT_H"], P["INSERT_POCKET"]),
              "  hook: arm centre z=%.0f, arm top at root z=%.0f rising to z=%.1f at the lip, sensor at Y=%.0f (%.0f mm from base front)" % (P["HOOK_ZC"], hg["arm_top"], hg["arm_top_at"](hg["lip_front"]), sy, P["HALL_Y_FROM_BASE"]),
              "  magnet datum: hook centreline x=%.0f, Y=%.0f, pole face at z=%.2f (arm top + %.1f clearance + %.1f tag wall); sensor package top at z=%.2f; air gap %.2f mm" % (W / 2, sy, mag_face, P["TAG_CLR"], P["TAG_WALL"], sens_top, mag_face - sens_top),
              "  projection from the wall face to the hook lip: %.0f mm (backplate %.0f + body %.0f + lid %.0f + base %.0f + arm %.0f)" % (P["BP_T"] + D + P["LID_T"] - P["HOOK_RECESS"] + P["HOOK_BASE_T"] + P["HOOK_ARM"], P["BP_T"], D, P["LID_T"] - P["HOOK_RECESS"], P["HOOK_BASE_T"], P["HOOK_ARM"]),
              "  gateway board: USB-end corners at x=%.1f, centreline z=%.1f; SMA at (%.0f, %.0f) on the top wall; cable notch at z=%.0f" % (gx0, gzc, P["G_SMA"][0], P["G_SMA"][1], gg["cable_z"]),
              "", "Elapsed %.0f s" % (time.time() - t0)]
    open(os.path.join(out_dir, "manifest.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))

    # ---- AutoCAD for Mac deliverables ----------------------------------------------------
    if autocad:
        conv = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "to_autocad.py"))
        if os.path.exists(conv):
            print("Running to_autocad.py (SAT + 3DSOLID DXF)")
            r = subprocess.run([sys.executable, conv, out_dir, os.path.join(out_dir, "autocad")], capture_output=True, text=True, timeout=3000)
            print(r.stdout[-2000:]); print(r.stderr[-1500:])
        else:
            print("to_autocad.py not found at", conv)
    print("Done in %.0f s" % (time.time() - t0))

def interference_report():
    """Volumes of every pairwise intersection between parts and reference solids (should be ~0 except
    reference-in-reference pairs like the plug inside the receptacle)."""
    import itertools
    def inter(a, b):
        try:
            return a.intersect(b).val().Volume()
        except Exception:
            return 0.0
    for unit, parts, refs in (("hanger", dict(body=build_hanger_body(), lid=build_hanger_lid(), hook=build_hanger_hook(),
                                              plate=build_hanger_backplate()), {k: v[0] for k, v in hanger_refs().items()}),
                              ("gateway", dict(body=build_gateway_body(), lid=build_gateway_lid()), {k: v[0] for k, v in gateway_refs().items()})):
        print(unit.upper())
        for a, b in itertools.combinations(parts.keys(), 2):
            print("  %-8s x %-14s %8.2f mm3" % (a, b, inter(parts[a], parts[b])))
        for pk, pv in parts.items():
            for rk, rv in refs.items():
                v = inter(pv, rv)
                if v > 0.01:
                    print("  %-8s x %-14s %8.2f mm3" % (pk, rk, v))

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out = args[0] if args else os.path.dirname(os.path.abspath(__file__))
    if "--check" in sys.argv:
        interference_report()
    else:
        main(out, quick="--quick" in sys.argv, autocad="--no-autocad" not in sys.argv)
