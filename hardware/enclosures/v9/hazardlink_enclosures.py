#!/usr/bin/env python
"""HazardLink v9 enclosures, FINAL (Designer A base, hanger reworked to Owen's bottom-hung concept).

Two printed enclosures built around the Heltec WiFi LoRa 32 V3:
  HANGER  : battery wall hanger = body + lid + backplate + bolt-on hanging BAR under the bottom edge
            (the sign hangs below the unit; the bar carries a saddle and the Hall sensor under it)
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
    # ---- snap-fit lids (v9: no screws anywhere in the assembly) ------------------------
    # two rigid hinge tabs on the lid's top edge hook behind a ledge on the top wall; two spring latches on the
    # bottom edge click into pockets in the bottom wall; a 2.2 mm pin through the bottom wall releases each latch
    LATCH_W=8.0, LATCH_T=1.35, LATCH_L=17.0, LATCH_BARB=1.0, LATCH_LEAD=2.5, LATCH_FLAT=0.7, LATCH_CLR=0.25, LATCH_CLR_Y=0.4,   # research: cantilever finger (3 x 0.45 lines), strain 1.5*y*t/L^2 <= 2 % for PETG; 55 deg catch face; fore-aft clearance in the layer direction
    LATCH_ROOT_FILLET=0.7,   # assumed: gusset at the finger/tongue step (stress riser relief)
    PIN_RING_D=4.0, PIN_RING_DEPTH=0.3,   # assumed: countersink ring around each release hole so it can be found by touch
    LATCH_SKIN=1.2,          # assumed: wall left under the latch pocket
    RELEASE_D=2.2,           # assumed: release pinhole under each latch (paperclip)
    TAB_W=12.0, TAB_L=14.0, TAB_NOSE=2.5, TAB_NOSE_L=3.0, TAB_CLR=0.25, TAB_POCKET_UP=0.6,   # assumed: hinge tab (contiguous with the tongue, 2.25 thick) with a 45 deg hook face; nose pocket reaches 0.6 into the top wall
    TAB_RIB_Y0=8.0, TAB_RIB_H=2.0, TAB_RIB_SIDE=3.0,   # assumed: stiffening rib along the top wall from Y=8 to the back wall; the nose pocket is cut through it (bridge on 2.5 mm cheeks)
    H_LATCH_XS=(15.0, 85.0), H_TAB_XS=(22.0, 70.0),   # assumed positions (clear of the bar channel, holder, SMA knock-out)
    G_LATCH_XS=(20.0, 56.0), G_TAB_XS=(66.0, 86.0),   # assumed positions (latches clear of the intake vents, ribs clear of the exhaust vents and the SMA pad)
    SNAP_STRAIN_MAX=2.0,     # research: PETG repeated-use design strain, percent
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
    HOLDER_L=80.0, HOLDER_W=25.0, HOLDER_H=21.0, HOLDER_CLR=0.5,   # assumed: TinyTronics leads holder
    HOLDER_X0=10.0, HOLDER_Z0=6.5,    # assumed placement (bottom of the body; 6.5 leaves 1.15 mm over the flexed latch fingers)
    HOLDER_RIB_T=3.0, HOLDER_RIB_H=8.0, HOLDER_LEAD_GAP=8.0,   # assumed
    CELL_D=21.25, CELL_L=70.8,        # datasheet Samsung INR21700-50E max
    BULK_Z=(34.0, 46.0),              # assumed: stiffening bulkhead between bay and board
    # ---- hanging bar (Owen: sign hangs from the bottom edge, nothing on the face) -------
    BAR_W=26.0,              # assumed (measure the sign hand-hole; v7 hook was 22)
    BAR_T=10.0,              # assumed: bar thickness
    BAR_DROP=30.0,           # assumed: bar top sits this far below the body bottom (headroom for the sign's handle region, research 20 to 30)
    BAR_WEB_Y=(24.0, 34.0),  # assumed: the web that carries the bar down from the body, under the back of the body (nothing behind the back face, so the body can lift 14 mm past the backplate)
    # v9: the bar's plate is a dovetail that slides into a channel in the body's bottom wall FROM THE WALL SIDE;
    # the channel is closed at the front and the backplate covers its mouth, so with the body hung the bar cannot come out
    DT_MOUTH=27.0, DT_TOP=34.0, DT_H=3.5, DT_CLR=0.45, DT_ROOF=1.9, DT_STRIP_W=40.0, DT_Y0=6.0, DT_LEADIN=0.6,   # assumed: mouth width, top width (45 deg flanks: top - mouth = 2 x height), height, plate clearance per side (flanks print as 45 deg overhangs), roof, strip width, closed front end, mouth chamfer
    PLATE_Y=(7.5, 34.0),     # assumed: bar plate span along Y (flush with the web's back face, 1 mm inside the body's back face)
    HANDLE_H=20.0,           # assumed: sign panel height above the hand-hole that rests on the bar (research 20 to 30)
    BAR_REACH=70.0,          # assumed: wall face to the lip front (research: >= 45 so a folded sign clears the wall)
    BAR_LIP_T=9.0,           # v7 lip thickness
    BAR_LIP_H=20.0,          # assumed: lip rises this much above the bar top (forward of the lid, so no clash)
    BAR_SADDLE_Y=-2.0,       # assumed: saddle centre, just in front of the lid face (sign thickness sits either side)
    BAR_SADDLE_W=14.0, BAR_SADDLE_D=2.0,  # assumed: saddle width along Y (folded handle stack 6 to 12, research) and depth
    BAR_WIRE_Y=(6.5, 10.5),  # assumed: lead slot through the channel roof, in front of the holder (leads rise into the free space under the bulkhead)
    BAR_WIRE_W=8.0,          # assumed
    BAR_GUSSET=8.0, BAR_GUSSET_W=2.0,    # assumed: short side gussets at the lip root
    HALL_CARRIER=(8.0, 8.0, 1.6),     # assumed carrier PCB
    HALL_SLOT_CLR=0.3, HALL_SLOT_H=3.0, HALL_SKIN=1.5, HALL_WIRE_H=4.5,   # assumed
    SOT23=(2.9, 1.3, 1.12),  # datasheet TI DBZ package
    MAGNET_D=6.0, MAGNET_T=3.0,       # datasheet 6 x 3 N35
    TAG_WALL=1.2, TAG_CLR=1.0,        # research: tag wall and running clearance (assumed values)
    BP_W=90.0, BP_H=124.0, BP_T=10.0,   # v7 90 wide; 124 tall (z 3..127) so the plate covers the bar channel mouth; thickness 10 assumed
    BP_SCREW_D=4.5, BP_SCREW_CSK_D=9.0, BP_SCREW_INSET=10.0,   # v7 / research No.8 csk
    PEG_XS=(30.0, 70.0), PEG_ZS=(55.0, 105.0),   # assumed peg positions (engaged); the head chamber BELOW each peg clears the holder's top rib
    # v9: spring catch on the backplate replaces the internal security screw; released from inside with the lid off
    CATCH_X=50.0, CATCH_Z0=44.0, CATCH_W=8.0, CATCH_T=1.8, CATCH_L=24.0, CATCH_GAP=3.0, CATCH_SLOT=0.8,   # assumed: tongue in the plate's front skin, root at the bottom; cavity open to the back face so the slicer can support it
    CATCH_NOSE=2.3, CATCH_NOSE_H=4.0, CATCH_NOSE_Z=16.0, CATCH_PAD=(1.5, 2.5, 5.0), CATCH_WIN=(9.5, 10.5), CATCH_WIN_CLR=0.5,   # assumed: nose z = root + 16; push pad (proud, height, above nose top); window through the back wall (w, h)
    ANT_X=86.0, ANT_ZS=(70.0, 110.0), ANT_D=6.0, ANT_L=60.0, ANT_Y=22.0,   # assumed stub antenna
    SMA_KO=(84.0, 17.5),     # assumed optional SMA knock-out on the top wall
    LABEL=(56.0, 90.0, 92.0, 118.0, 0.5),   # assumed label recess x0, x1, z0, z1, depth
    SADDLES=((30.0, 74.0), (86.0, 55.0)),   # assumed cable tie saddles (leads, pigtail)

    # ---- Gateway ----------------------------------------------------------------------
    G_W=120.0, G_H=80.0, G_D=30.0,    # assumed
    G_BRD_X0=46.0, G_BRD_ZC=42.0, G_PCB_TOP_Y=7.5,   # assumed
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
    """Keyhole along Y for a wall-hung part: head circle at cz_head (BELOW the engaged screw or peg), slot running UP
    by slot_len to the engaged position. Hang: offer the part up so the head passes the circle, then let it drop."""
    k = cyl_y(cx, cz_head, head_d, y0, y1)
    k = k.union(box(cx - slot_w / 2, cx + slot_w / 2, y0, y1, cz_head, cz_head + slot_len))
    return k.union(cyl_y(cx, cz_head + slot_len, slot_w, y0, y1))   # rounded slot end centred on the engaged peg

def prism_yz(pts, x0, x1):
    """Polygon in the YZ plane (list of (y, z)) extruded from x0 to x1."""
    return cq.Workplane("YZ", origin=(x0, 0, 0)).polyline(pts).close().extrude(x1 - x0)

def prism_xz(pts, y0, y1):
    """Polygon in the XZ plane (list of (x, z)) extruded from y0 to y1 (the XZ workplane normal is -Y)."""
    return cq.Workplane("XZ", origin=(0, y1, 0)).polyline(pts).close().extrude(y1 - y0)

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

def latch_geom():
    """Y stations of a lid latch finger (root at the tongue's inner end)."""
    tip = P["TONGUE_H"] + P["LATCH_L"]
    ramp0 = tip - P["LATCH_LEAD"]
    flat0 = ramp0 - P["LATCH_FLAT"] - 0.6          # 55 deg catch face over LATCH_FLAT, then a 0.6 flat under the barb
    return dict(tip=tip, ramp0=ramp0, flat0=flat0, pocket_y0=flat0 - P["LATCH_CLR_Y"], pocket_y1=tip + P["LATCH_CLR"],
                pin_y=(ramp0 + tip) / 2)

def lid_snap_features(lid, W, H, wall, latch_xs, tab_xs):
    """Two spring latches on the bottom edge and two rigid hinge tabs on the top edge (all part of the lid)."""
    o = wall + P["TONGUE_CLR"]                      # tongue outer face (bottom edge at z=o, top edge at z=H-o)
    lg = latch_geom()
    t, w = P["LATCH_T"], P["LATCH_W"]
    f = P["LATCH_ROOT_FILLET"]
    for x in latch_xs:
        finger = box(x - w / 2, x + w / 2, P["TONGUE_H"] - EPS, lg["tip"], o, o + t)
        # 55 deg catch face (rises the barb height over LATCH_FLAT of Y) so it prints without a 90 deg overhang and self-wedges
        barb = prism_yz([(lg["flat0"], o + EPS), (lg["flat0"] + P["LATCH_FLAT"], o - P["LATCH_BARB"]), (lg["ramp0"], o - P["LATCH_BARB"]), (lg["tip"], o + EPS)], x - w / 2, x + w / 2)
        gusset = prism_yz([(P["TONGUE_H"] - EPS, o + t - EPS), (P["TONGUE_H"] + f, o + t - EPS), (P["TONGUE_H"] - EPS, o + t + f)], x - w / 2, x + w / 2)
        lid = lid.union(finger).union(barb).union(gusset)
    tab_top = H - wall - P["TONGUE_CLR"] - P["TONGUE_T"]        # contiguous with the tongue's inner face
    tab_bot = tab_top - P["TONGUE_T"] - 0.25
    nose_y0 = P["TAB_RIB_Y0"] + 2.5 + P["TAB_CLR"]              # behind the 2.5 mm cheek of the rib pocket
    nose_y1 = nose_y0 + P["TAB_NOSE_L"]
    nose_top = tab_top + P["TAB_NOSE"]
    for x in tab_xs:
        tab = box(x - P["TAB_W"] / 2, x + P["TAB_W"] / 2, -EPS, P["TAB_L"], tab_bot, tab_top)
        # one 45 deg hook face from the tab top to the nose top (printable with the lid face down), short flat top
        nose = prism_yz([(nose_y0, tab_top - EPS), (nose_y1, tab_top - EPS), (nose_y1, nose_top), (nose_y0 + P["TAB_NOSE"], nose_top)],
                        x - P["TAB_W"] / 2, x + P["TAB_W"] / 2)
        lid = lid.union(tab).union(nose)
    return lid

def body_snap_features(body, W, H, wall, y_back, latch_xs, tab_xs):
    """Latch pockets and release pinholes in the bottom wall; hinge ledges on the top wall inner face."""
    lg = latch_geom()
    w = P["LATCH_W"] + 2 * P["LATCH_CLR"]
    for x in latch_xs:
        body = body.cut(box(x - w / 2, x + w / 2, lg["pocket_y0"], lg["pocket_y1"], P["LATCH_SKIN"], wall + 1.0))
        body = body.cut(cyl_z(x, lg["pin_y"], P["RELEASE_D"], -1.0, wall + 1.0))
        body = body.cut(cyl_z(x, lg["pin_y"], P["PIN_RING_D"], -1.0, P["PIN_RING_DEPTH"]))    # touch-find ring on the outside
    # hinge: a rib along the top wall from Y=TAB_RIB_Y0 to the back wall (grows from the bed, stiffens the wall) with the
    # nose pocket cut through its full height (a bridge on 2.5 mm cheeks); the pocket reaches TAB_POCKET_UP into the wall
    y0 = P["TAB_RIB_Y0"]
    pw = P["TAB_W"] + 1.0
    for x in tab_xs:
        body = body.union(box(x - P["TAB_W"] / 2 - P["TAB_RIB_SIDE"], x + P["TAB_W"] / 2 + P["TAB_RIB_SIDE"], y0, y_back + EPS, H - wall - P["TAB_RIB_H"], H - wall + EPS))
        body = body.cut(box(x - pw / 2, x + pw / 2, y0 + 2.5, y0 + 2.5 + P["TAB_NOSE_L"] + 2 * P["TAB_CLR"], H - wall - P["TAB_RIB_H"] - 1.0, H - wall + P["TAB_POCKET_UP"]))
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
    """Derived hanger positions shared by body, lid, bar, backplate and references."""
    W, H, D, wall, lt = P["H_W"], P["H_H"], P["H_D"], P["WALL"], P["LID_T"]
    g = dict(W=W, H=H, D=D, wall=wall, y_back=D - wall, lid_t=lt,
             x0=wall + P["USB_SETBACK"], zc=P["H_BRD_ZC"], pcb_top=P["H_PCB_TOP_Y"])
    g["bulk"] = P["BULK_Z"]
    # the wall face is at Y = D + BP_T; the bar runs from there forward to the lip
    g["wall_y"] = D + P["BP_T"]
    g["bar_x0"] = W / 2 - P["BAR_W"] / 2
    g["bar_x1"] = W / 2 + P["BAR_W"] / 2
    g["bar_top"] = -P["BAR_DROP"]
    g["bar_bot"] = g["bar_top"] - P["BAR_T"]
    g["web_y0"], g["web_y1"] = P["BAR_WEB_Y"]
    g["bar_back"] = g["web_y1"]
    # dovetail plate inside the bottom-wall channel: z from DT_CLR to DT_H - DT_CLR, widths follow the channel flanks
    g["plate_y0"], g["plate_y1"] = P["PLATE_Y"]
    g["plate_z0"], g["plate_z1"] = P["DT_CLR"], P["DT_H"] - P["DT_CLR"]
    slope = (P["DT_TOP"] - P["DT_MOUTH"]) / P["DT_H"]
    g["plate_w0"] = P["DT_MOUTH"] + slope * g["plate_z0"] - 2 * P["DT_CLR"]
    g["plate_w1"] = P["DT_MOUTH"] + slope * g["plate_z1"] - 2 * P["DT_CLR"]
    g["plate_bot"] = g["plate_z0"]
    g["strip_top"] = P["DT_H"] + P["DT_ROOF"]
    g["lip_front"] = g["wall_y"] - P["BAR_REACH"]
    g["lip_back"] = g["lip_front"] + P["BAR_LIP_T"]
    g["lip_top"] = g["bar_top"] + P["BAR_LIP_H"]
    g["saddle_y"] = P["BAR_SADDLE_Y"]
    g["saddle_floor"] = g["bar_top"] - P["BAR_SADDLE_D"]
    # Hall carrier slot under the saddle floor, entered from the bar's back end (under the body)
    cw, cl, ct = P["HALL_CARRIER"]
    g["slot_ceil"] = g["saddle_floor"] - P["HALL_SKIN"]
    g["slot_floor"] = g["slot_ceil"] - P["HALL_SLOT_H"]
    g["slot_hw"] = (cw + 2 * P["HALL_SLOT_CLR"]) / 2
    g["slot_y_front"] = g["saddle_y"] - cl / 2 - P["HALL_SLOT_CLR"]
    g["sensor_y"] = g["saddle_y"]
    g["sensor_z"] = g["slot_floor"] + ct + P["SOT23"][2] / 2
    g["wire_z0"] = g["slot_ceil"] - P["HALL_WIRE_H"]
    # backplate catch window (engaged position)
    g["catch_nose_z0"] = P["CATCH_Z0"] + P["CATCH_NOSE_Z"]
    g["win_z0"] = g["catch_nose_z0"] - P["CATCH_WIN_CLR"]
    g["win_z1"] = g["win_z0"] + P["CATCH_WIN"][1]
    return g

def build_hanger_body():
    g = hanger_geom()
    W, H, D, wall, yb = g["W"], g["H"], g["D"], g["wall"], g["y_back"]
    body = rbox_y(0, W, 0, D, 0, H, P["CORNER_R"])
    body = body.cut(rbox_y(wall, W - wall, -1, yb, wall, H - wall, P["CORNER_R"] - wall))
    # bulkhead between the battery bay and the board area
    bz0, bz1 = g["bulk"]
    body = body.union(box(wall - EPS, W - wall + EPS, 0, yb + EPS, bz0, bz1))
    # lead notches at both ends of the bulkhead (open toward the back wall, 7.5 mm bridge at the front)
    for (nx0, nx1) in ((wall - 1, wall + 7.5), (W - wall - 7.5, W - wall + 1)):
        body = body.cut(box(nx0, nx1, 12.0, yb + 1, bz0 - 1, bz1 + 1))
    # snap-fit lid: latch pockets + release pinholes in the bottom wall, hinge ledges on the top wall
    body = body_snap_features(body, W, H, wall, yb, P["H_LATCH_XS"], P["H_TAB_XS"])
    # keyhole peg pockets in 10 mm bosses on the back wall (pegs live on the backplate)
    stem_pass = P["PEG_STEM_L"] - 0.2
    head_ch = P["PEG_HEAD_L"] + 0.7
    boss_t = stem_pass + head_ch + P["PEG_POCKET_BACK"]
    slot_w = P["PEG_STEM_D"] + 2 * P["PEG_SLOT_CLR"]
    head_w = P["PEG_HEAD_D"] + 2 * P["PEG_HEAD_CLR"]
    drop = P["PEG_DROP"]
    for px in P["PEG_XS"]:
        for pz in P["PEG_ZS"]:
            body = body.union(box(px - 8, px + 8, D - boss_t, yb + EPS, pz - drop - head_w / 2 - 2, pz + 8))
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
    # window through the back wall for the backplate's spring catch (replaces the security screw)
    ww = P["CATCH_WIN"][0]
    body = body.cut(box(P["CATCH_X"] - ww / 2, P["CATCH_X"] + ww / 2, yb - 1, D + 1, g["win_z0"], g["win_z1"]))
    # optional knock-out: SMA bulkhead in the top wall
    kx, ky = P["SMA_KO"]
    body = knockout_z(body, kx, ky, P["SMA_HOLE_D"], H, H - wall)
    # hanging bar interface: a thickened strip inside the bottom wall carries a dovetail channel that is open at the
    # back (wall side) and closed at the front; the bar's plate slides in from behind and the wall locks it. The Hall
    # lead slot goes up through the channel roof in front of the holder.
    sw2 = P["DT_STRIP_W"] / 2
    strip_y0 = P["TONGUE_H"] + P["TONGUE_CLR"] + 0.5
    body = body.union(box(W / 2 - sw2, W / 2 + sw2, strip_y0, yb + EPS, wall - EPS, g["strip_top"]))
    m2, t2, dh = P["DT_MOUTH"] / 2, P["DT_TOP"] / 2, P["DT_H"]
    body = body.cut(prism_xz([(W / 2 - m2, -1.0), (W / 2 + m2, -1.0), (W / 2 + m2, 0.0), (W / 2 + t2, dh), (W / 2 - t2, dh), (W / 2 - m2, 0.0)],
                             P["DT_Y0"], D + 1.0))
    li = P["DT_LEADIN"]
    body = body.cut(prism_xz([(W / 2 - m2 - li, -1.0), (W / 2 + m2 + li, -1.0), (W / 2 + m2 + li, 0.0), (W / 2 + t2 + li, dh + li), (W / 2 - t2 - li, dh + li), (W / 2 - m2 - li, 0.0)],
                             D - li, D + 1.0))
    wy0, wy1 = P["BAR_WIRE_Y"]
    body = body.cut(box(W / 2 - P["BAR_WIRE_W"] / 2, W / 2 + P["BAR_WIRE_W"] / 2, wy0, wy1, -1.0, g["strip_top"] + 1.0))
    # peg pockets are cut last so no internal rib can refill a head chamber
    for px in P["PEG_XS"]:
        for pz in P["PEG_ZS"]:
            body = body.cut(keyhole_y(px, pz - drop, head_w, slot_w, drop, D - stem_pass, D + 1))
            body = body.cut(slot_y(px, pz - drop / 2, drop + head_w, head_w, D - stem_pass - head_ch, D - stem_pass + EPS))
    return body

def build_hanger_lid():
    g = hanger_geom()
    W, H, wall, lt = g["W"], g["H"], g["wall"], g["lid_t"]
    lid = rbox_y(0, W, -lt, 0, 0, H, P["CORNER_R"])
    bz0, bz1 = g["bulk"]
    uy = g["pcb_top"] - P["USB_OPEN_CY"]
    cutouts = ((-1, 6, bz0 - 0.5, bz1 + 0.5), (W - 6, W + 1, bz0 - 0.5, bz1 + 0.5),
               (-1, 6, g["zc"] - P["USB_SLOT_W"] / 2 - 0.5, g["zc"] + P["USB_SLOT_W"] / 2 + 0.5),
               (5.0, W - 5.0, H - wall - P["TONGUE_CLR"] - P["TONGUE_T"] - 0.5, H + 1))   # top segment relieved: the tabs locate the top edge and the lid must pivot there
    lid = lid.union(lid_tongue(W, H, wall, (), cutouts))
    lid = lid_snap_features(lid, W, H, wall, P["H_LATCH_XS"], P["H_TAB_XS"])
    lid = lid.union(lid_header_ribs(g["x0"], g["zc"], g["pcb_top"]))
    lid = lid_board_features(lid, g["x0"], g["zc"], g["pcb_top"], lt)
    # label recess
    lx0, lx1, lz0, lz1, ld = P["LABEL"]
    lid = lid.cut(box(lx0, lx1, -lt - 1, -lt + ld, lz0, lz1))
    return lid

def build_hanger_bar():
    """Slide-in hanging bar (no screws): a dovetail plate that enters the body's bottom-wall channel from the wall side,
    a web at the very back that carries the bar down BAR_DROP below the body, the bar itself out to an upturned lip, a
    saddle in the bar's top face where the sign's handle settles, and the Hall carrier in a slot directly under the
    saddle. The channel is closed at the front and the backplate covers its mouth, so with the body hung the bar cannot
    come out. Prints UPRIGHT on the bar's bottom face: every bending load (bar, web, plate) is then in-plane, the 45 deg
    dovetail flanks are self-supporting, and only the front of the plate needs support (it overhangs the bar by 30 mm)."""
    g = hanger_geom()
    x0, x1, W = g["bar_x0"], g["bar_x1"], g["W"]
    w0, w1 = g["plate_w0"] / 2, g["plate_w1"] / 2
    plate = prism_xz([(W / 2 - w0, g["plate_z0"]), (W / 2 + w0, g["plate_z0"]), (W / 2 + w1, g["plate_z1"]), (W / 2 - w1, g["plate_z1"])],
                     g["plate_y0"], g["plate_y1"])
    web = box(x0, x1, g["web_y0"], g["web_y1"], g["bar_top"] - EPS, g["plate_bot"] + EPS)
    bar = box(x0, x1, g["lip_front"], g["bar_back"], g["bar_bot"], g["bar_top"])
    lip = box(x0, x1, g["lip_front"], g["lip_back"], g["bar_bot"], g["lip_top"])
    part = plate.union(web).union(bar).union(lip)
    # gussets: inside corner where the bar meets the web (both sides), and at the lip root
    gw, gl = P["BAR_GUSSET_W"], P["BAR_GUSSET"]
    for (gx0, gx1) in ((x0, x0 + gw), (x1 - gw, x1)):
        part = part.union(prism_yz([(g["web_y0"] + EPS, g["bar_top"] - EPS), (g["web_y0"] - gl, g["bar_top"] - EPS), (g["web_y0"] + EPS, g["bar_top"] + gl)], gx0, gx1))
        part = part.union(prism_yz([(g["lip_back"] - EPS, g["bar_top"] - EPS), (g["lip_back"] + gl, g["bar_top"] - EPS), (g["lip_back"] - EPS, g["bar_top"] + gl)], gx0, gx1))
    # saddle across the bar's top face (the handle settles here by gravity)
    sw, sd = P["BAR_SADDLE_W"], P["BAR_SADDLE_D"]
    part = part.cut(box(x0 - 1, x1 + 1, g["saddle_y"] - sw / 2, g["saddle_y"] + sw / 2, g["saddle_floor"], g["bar_top"] + 1))
    # Hall carrier slot from the bar's back face forward to just past the saddle
    hw = g["slot_hw"]
    part = part.cut(box(W / 2 - hw, W / 2 + hw, g["slot_y_front"], g["bar_back"] + 1, g["slot_floor"], g["slot_ceil"]))
    # lead channel: along the bar behind the saddle, up the web, then forward in a groove in the plate's top face to the
    # body's roof slot
    cw2 = P["BAR_WIRE_W"] / 2 - 1
    part = part.cut(box(W / 2 - cw2, W / 2 + cw2, g["saddle_y"] + sw / 2, g["bar_back"] + 1, g["wire_z0"], g["slot_ceil"]))
    part = part.cut(box(W / 2 - cw2, W / 2 + cw2, g["web_y0"] + 2.5, g["web_y1"] - 2.5, g["wire_z0"], g["plate_z1"] + 1))
    wy0, wy1 = P["BAR_WIRE_Y"]
    part = part.cut(box(W / 2 - cw2, W / 2 + cw2, wy0 + 0.5, g["plate_y1"] + 1, g["plate_z1"] - 1.5, g["plate_z1"] + 1))
    return part

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
    # spring catch: a tongue in the plate's front skin (root at the bottom, U-slot around it, free space behind) with a
    # nose that springs into the window in the body's back wall once the body has dropped onto the pegs. Push the nose
    # back through the window (lid off) to release.
    cx, z0, cw, ct, cl, gap, sl = P["CATCH_X"], P["CATCH_Z0"], P["CATCH_W"], P["CATCH_T"], P["CATCH_L"], P["CATCH_GAP"], P["CATCH_SLOT"]
    plate = plate.cut(box(cx - cw / 2 - sl, cx + cw / 2 + sl, D + ct, D + bt + 1, z0, z0 + cl + sl))            # free space behind, open to the wall face (support reaches the tongue)
    for (ax, bx) in ((cx - cw / 2 - sl, cx - cw / 2), (cx + cw / 2, cx + cw / 2 + sl)):
        plate = plate.cut(box(ax, bx, D - 1, D + ct + EPS, z0, z0 + cl + sl))                                       # side slots
    plate = plate.cut(box(cx - cw / 2 - sl, cx + cw / 2 + sl, D - 1, D + ct + EPS, z0 + cl, z0 + cl + sl))       # top slot
    nz0 = z0 + P["CATCH_NOSE_Z"]
    nz1 = nz0 + P["CATCH_NOSE_H"]
    nose = prism_yz([(D + EPS, nz0), (D - P["CATCH_NOSE"], nz0), (D - P["CATCH_NOSE"], nz1 - 1.2), (D - 1.1, nz1), (D + EPS, nz1)], cx - cw / 2, cx + cw / 2)
    plate = plate.union(nose)
    # push pad above the nose: a screwdriver on it pushes the tongue back and stays clear of the window edge while lifting
    pp, ph, pz = P["CATCH_PAD"]
    plate = plate.union(box(cx - 3.0, cx + 3.0, D - pp, D + EPS, nz1 + 1.0, nz1 + 1.0 + ph))
    # four mushroom pegs standing off the front face, head underside chamfered for printing
    sl, hl, sd, hd, ch = P["PEG_STEM_L"], P["PEG_HEAD_L"], P["PEG_STEM_D"], P["PEG_HEAD_D"], P["PEG_CHAMFER"]
    for px in P["PEG_XS"]:
        for pz in P["PEG_ZS"]:
            stem = cyl_y(px, pz, sd, D - sl - EPS, D + EPS)
            c_len = (hd - sd) / 2                      # 45 deg cone from the stem out to the head diameter (no 90 deg step)
            cone = cone_y(px, pz, hd, sd, D - sl - c_len, D - sl + EPS)
            head = cyl_y(px, pz, hd, D - sl - hl, D - sl - c_len + EPS)
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
    # Hall carrier with the SOT-23 on top, lying on the bar slot floor under the saddle
    cw, cl, ct = P["HALL_CARRIER"]
    sy = g["sensor_y"]
    sw, sl_, sh = P["SOT23"]
    carrier = box(W / 2 - cw / 2, W / 2 + cw / 2, sy - cl / 2, sy + cl / 2, g["slot_floor"], g["slot_floor"] + ct)
    carrier = carrier.union(box(W / 2 - sw / 2, W / 2 + sw / 2, sy - sl_ / 2, sy + sl_ / 2, g["slot_floor"] + ct, g["slot_floor"] + ct + sh))
    refs["hall_carrier"] = (carrier, (0.05, 0.35, 0.10))
    # sign handle stack (assumed 24 wide x 12 thick x 20 tall) settled in the saddle, magnet in its underside
    bar_bot = g["saddle_floor"] + P["TAG_CLR"]
    bar = box(W / 2 - 12, W / 2 + 12, sy - 6.0, sy + 6.0, bar_bot, bar_bot + P["HANDLE_H"])
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
    body = body_snap_features(body, W, H, wall, yb, P["G_LATCH_XS"], P["G_TAB_XS"])
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
        body = body.cut(keyhole_y(kx, kz - P["KEY_SLOT_L"], P["KEY_HEAD_D"], P["KEY_SLOT_W"], P["KEY_SLOT_L"], yb - 1, D + 1))
    lx, lz = P["G_LOWER_SCREW"]
    body = body.cut(cyl_y(lx, lz, P["BP_SCREW_D"], yb - 1, D + 1))
    return body

def build_gateway_lid():
    g = gateway_geom()
    W, H, wall, lt = g["W"], g["H"], g["wall"], g["lid_t"]
    lid = rbox_y(0, W, -lt, 0, 0, H, P["CORNER_R"])
    cz = g["cable_z"]
    cutouts = ((-1, 6, cz - P["G_CABLE_NOTCH_W"] / 2 - 0.5, cz + P["G_CABLE_NOTCH_W"] / 2 + 0.5),
               (5.0, W - 5.0, H - wall - P["TONGUE_CLR"] - P["TONGUE_T"] - 0.5, H + 1))
    lid = lid.union(lid_tongue(W, H, wall, (), cutouts))
    lid = lid_snap_features(lid, W, H, wall, P["G_LATCH_XS"], P["G_TAB_XS"])
    lid = lid.union(lid_header_ribs(g["x0"], g["zc"], g["pcb_top"]))
    lid = lid_board_features(lid, g["x0"], g["zc"], g["pcb_top"], lt)
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

PRINT_ORIENT = {"hanger_body": "back_down", "hanger_lid": "face_down", "hanger_bar": "upright",
                "hanger_backplate": "back_down", "gateway_body": "back_down", "gateway_lid": "face_down"}

def export_print_stl(print_dir, name, wp, orient):
    """STL already rotated into its print orientation (build direction = +Z, part resting on z=0)."""
    solid = wp.val()
    if orient == "back_down":        # back face (max Y) onto the bed: y -> -z
        solid = solid.rotate(cq.Vector(0, 0, 0), cq.Vector(1, 0, 0), -90)
    elif orient == "face_down":      # outer face (min Y) onto the bed: y -> +z
        solid = solid.rotate(cq.Vector(0, 0, 0), cq.Vector(1, 0, 0), 90)
    bb = solid.BoundingBox()
    solid = solid.translate(cq.Vector(-bb.xmin, -bb.ymin, -bb.zmin))
    cq.exporters.export(cq.Workplane("XY").add(solid), os.path.join(print_dir, name + ".stl"), tolerance=0.01, angularTolerance=0.1)
    bb = solid.BoundingBox()
    return "%-18s %-10s footprint %.0f x %.0f mm, height %.1f mm" % (name, orient, bb.xlen, bb.ylen, bb.zlen)

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
    W, H, wall = hg["W"], hg["H"], hg["wall"]
    sy = hg["sensor_y"]
    mag_face = hg["saddle_floor"] + P["TAG_CLR"] + P["TAG_WALL"]
    sens_top = hg["sensor_z"] + P["SOT23"][2] / 2
    gap = mag_face - sens_top
    out.append((3.5 <= gap <= 4.5, "magnet face to Hall package top = %.2f mm (target 3.5 to 4.5, research)" % gap))
    cz = P["HOLDER_Z0"] + P["HOLDER_W"] / 2
    d = math.sqrt((hg["y_back"] - P["HOLDER_H"] / 2 - sy) ** 2 + (cz - P["CELL_D"] / 2 - hg["sensor_z"]) ** 2)
    out.append((d >= 15.0, "Hall sensor to nearest cell surface: %.1f mm (>= 15)" % d))
    out.append((hg["wall_y"] - hg["lip_front"] >= 45.0, "wall face to lip front = %.0f mm (>= 45 for a folded sign)" % (hg["wall_y"] - hg["lip_front"])))
    out.append((hg["lip_back"] < -hg["lid_t"], "lip (Y<=%.1f) is forward of the lid face (Y=%.1f)" % (hg["lip_back"], -hg["lid_t"])))
    out.append((hg["bar_bot"] + 3.0 <= hg["slot_floor"], "bar bottom skin under the Hall slot = %.1f mm (>= 3)" % (hg["slot_floor"] - hg["bar_bot"])))
    ax0, ax1 = P["OLED_ACT_CX"] - 21.7 / 2, P["OLED_ACT_CX"] + 21.7 / 2
    ay0, ay1 = 1.0 - 10.9 / 2, 1.0 + 10.9 / 2
    wx0, wx1 = P["OLED_ACT_CX"] - P["WIN_W"] / 2, P["OLED_ACT_CX"] + P["WIN_W"] / 2
    wy0, wy1 = P["OLED_ACT_CY"] - P["WIN_H"] / 2, P["OLED_ACT_CY"] + P["WIN_H"] / 2
    out.append((wx0 < ax0 and wx1 > ax1 and wy0 < ay0 and wy1 > ay1, "OLED active area (assumed 21.7 x 10.9) inside the %g x %g window" % (P["WIN_W"], P["WIN_H"])))
    out.append((P["HOLDER_Z0"] + P["HOLDER_W"] + P["HOLDER_CLR"] + 2.0 <= hg["bulk"][0], "holder top rib fits under the bulkhead"))
    holder_bot = P["HOLDER_Z0"] - P["HOLDER_CLR"]
    head = hg["saddle_floor"] + P["TAG_CLR"] + P["HANDLE_H"]
    out.append((head <= 0.0, "sign handle top (z=%.1f, %.0f mm above the saddle) clears the body bottom (z=0)" % (head, P["HANDLE_H"])))
    out.append((hg["lip_top"] <= 0.0, "lip top z=%.0f stays below the body bottom" % hg["lip_top"]))
    ke = hg["x0"] + P["BRD_L"] + 5.0
    out.append((P["ANT_X"] - P["ANT_D"] / 2 >= ke, "stub antenna x=%.0f outside the 2.4 GHz keep-out (x<%.1f)" % (P["ANT_X"], ke)))
    out.append((gg["x0"] - gg["wall"] >= 36.0, "gateway: %.1f mm for the USB-C plug overmold left of the board" % (gg["x0"] - gg["wall"])))
    out.append((P["G_SMA"][0] - P["SMA_PAD_D"] / 2 >= gg["x0"] + P["BRD_L"] + 5.0 - 10.0, "gateway: SMA pad right of the board antenna end"))

    # ---- v9 snap-fit rules -------------------------------------------------------------
    lg = latch_geom()
    eps_latch = 100.0 * 1.5 * (P["LATCH_BARB"] + P["LATCH_CLR"]) * P["LATCH_T"] / P["LATCH_L"] ** 2
    head_w = P["PEG_HEAD_D"] + 2 * P["PEG_HEAD_CLR"]
    rib_top = P["HOLDER_Z0"] + P["HOLDER_W"] + P["HOLDER_CLR"] + P["HOLDER_RIB_T"]
    out.append((min(P["PEG_ZS"]) - P["PEG_DROP"] - head_w / 2 >= rib_top, "keyhole head chamber (z>=%.1f) below the lower pegs clears the holder's top rib (z<=%.1f)" % (min(P["PEG_ZS"]) - P["PEG_DROP"] - head_w / 2, rib_top)))
    out.append((hg["plate_y1"] <= hg["D"] - 0.5 and hg["web_y1"] <= hg["D"] - 0.5, "nothing of the bar sits behind the body's back face (plate/web end Y %.1f/%.1f <= %.1f), so the 14 mm lift clears the backplate" % (hg["plate_y1"], hg["web_y1"], hg["D"] - 0.5)))
    bp_z0 = (hg["H"] - P["BP_H"]) / 2
    out.append((bp_z0 <= P["DT_H"] and bp_z0 >= 1.0, "backplate bottom edge z=%.1f covers the bar channel mouth (z 0..%.1f)" % (bp_z0, P["DT_H"])))
    out.append((abs((P["DT_TOP"] - P["DT_MOUTH"]) - 2 * P["DT_H"]) < 0.01, "dovetail flanks are 45 deg (top - mouth = 2 x height), self-supporting when the bar prints upright"))
    out.append((eps_latch <= P["SNAP_STRAIN_MAX"], "lid latch strain %.2f %% (1.5*y*t/L^2, y=%.2f t=%.1f L=%.0f; <= %.0f %% PETG)" % (eps_latch, P["LATCH_BARB"] + P["LATCH_CLR"], P["LATCH_T"], P["LATCH_L"], P["SNAP_STRAIN_MAX"])))
    eps_catch = 100.0 * 1.5 * (P["CATCH_NOSE"] + 0.4) * P["CATCH_T"] / P["CATCH_L"] ** 2
    out.append((eps_catch <= P["SNAP_STRAIN_MAX"], "backplate catch strain %.2f %% (y=%.1f t=%.1f L=%.0f; <= %.0f %%)" % (eps_catch, P["CATCH_NOSE"] + 0.4, P["CATCH_T"], P["CATCH_L"], P["SNAP_STRAIN_MAX"])))
    out.append((P["CATCH_GAP"] >= P["CATCH_NOSE"] + 0.5, "catch free space %.1f mm >= nose %.1f + 0.5" % (P["CATCH_GAP"], P["CATCH_NOSE"])))
    out.append((P["CATCH_NOSE"] >= wall - 0.5, "catch nose %.1f mm reaches into the %.1f mm back wall (>= wall - 0.5)" % (P["CATCH_NOSE"], wall)))
    out.append((P["BP_T"] - P["CATCH_T"] - P["CATCH_GAP"] >= 3.0, "backplate left behind the catch pocket = %.1f mm (>= 3)" % (P["BP_T"] - P["CATCH_T"] - P["CATCH_GAP"])))
    o = wall + P["TONGUE_CLR"]
    barb_tip = o - P["LATCH_BARB"]
    out.append((barb_tip >= P["LATCH_SKIN"] + 0.3, "latch barb tip z=%.2f clears the pocket floor (skin %.1f + 0.3)" % (barb_tip, P["LATCH_SKIN"])))
    out.append((P["LATCH_SKIN"] >= 1.0, "wall under the latch pocket = %.1f mm (>= 1.0)" % P["LATCH_SKIN"]))
    flexed_top = o + P["LATCH_T"] + P["LATCH_BARB"] + P["LATCH_CLR"]
    out.append((flexed_top <= holder_bot, "latch finger flexed top z=%.2f stays under the holder (z=%.1f)" % (flexed_top, holder_bot)))
    for x in P["H_LATCH_XS"]:
        clear = abs(x - W / 2) - P["LATCH_W"] / 2 - P["LATCH_CLR"] - P["DT_STRIP_W"] / 2
        out.append((clear >= 1.0, "hanger latch at x=%.0f clears the bar channel strip by %.1f mm" % (x, clear)))
    rib_y = hg["y_back"] - P["HOLDER_RIB_H"]
    out.append((lg["pocket_y1"] + 1.0 <= rib_y, "latch fingers (Y<=%.1f) run under the holder and stop before its bay ribs (Y>=%.1f)" % (lg["pocket_y1"], rib_y)))
    tab_top = H - wall - P["TONGUE_CLR"] - P["TONGUE_T"]
    tab_bot = tab_top - P["TONGUE_T"] - 0.25
    nose_top = tab_top + P["TAB_NOSE"]
    out.append((nose_top + P["TAB_CLR"] <= H - wall + P["TAB_POCKET_UP"], "hinge nose top z=%.2f fits the rib pocket (to z=%.2f) with clearance" % (nose_top, H - wall + P["TAB_POCKET_UP"])))
    out.append((wall - P["TAB_POCKET_UP"] >= 1.5, "top wall left over the nose pocket = %.1f mm (>= 1.5)" % (wall - P["TAB_POCKET_UP"])))
    out.append((tab_top + P["TAB_CLR"] <= H - wall - P["TAB_RIB_H"], "hinge tab top z=%.2f runs under the rib (z>=%.2f) with clearance" % (tab_top, H - wall - P["TAB_RIB_H"])))
    top = hg["zc"] + P["BRD_W"] / 2 + P["BRD_CLR"] + P["POCKET_WALL_T"]
    out.append((top + 0.5 <= tab_bot, "board pocket top z=%.1f clears the hinge tabs (z>=%.1f)" % (top, tab_bot)))
    th = math.radians(12.0)
    nose_y = P["TAB_RIB_Y0"] + 2.5 + P["TAB_CLR"] + P["TAB_NOSE_L"]
    tilted = H + (nose_top - H) * math.cos(th) - nose_y * math.sin(th)      # pivot at the lid's inner top edge (Y=0, z=H)
    out.append((tilted < H - wall - P["TAB_RIB_H"], "hinge noses drop free of the rib with the lid pivoted 12 deg about its top edge (z=%.2f < %.2f)" % (tilted, H - wall - P["TAB_RIB_H"])))
    for x in P["H_TAB_XS"]:
        out.append((x + P["TAB_W"] / 2 + P["TAB_RIB_SIDE"] + 1.0 <= P["SMA_KO"][0] - P["SMA_HOLE_D"] / 2 or x - P["TAB_W"] / 2 - P["TAB_RIB_SIDE"] - 1.0 >= P["SMA_KO"][0] + P["SMA_HOLE_D"] / 2, "hinge rib at x=%.0f clears the SMA knock-out" % x))
    out.append((P["DT_ROOF"] >= 1.2, "dovetail channel roof %.1f mm (>= 1.2)" % P["DT_ROOF"]))
    out.append((hg["strip_top"] <= holder_bot, "channel strip top z=%.1f under the holder (z=%.1f)" % (hg["strip_top"], holder_bot)))
    out.append((P["DT_MOUTH"] >= P["BAR_W"] + 0.8, "channel mouth %.1f passes the %.0f mm web with 0.4 per side" % (P["DT_MOUTH"], P["BAR_W"])))
    out.append(((P["DT_TOP"] - P["DT_MOUTH"]) / 2 >= 2.0, "dovetail flank overhang %.2f mm per side (>= 2.0)" % ((P["DT_TOP"] - P["DT_MOUTH"]) / 2)))
    out.append((P["DT_STRIP_W"] >= P["DT_TOP"] + 2 * 3.0, "channel strip leaves >= 3 mm beside the dovetail top"))
    out.append((hg["plate_y1"] <= hg["wall_y"] - 1.0 and hg["plate_y0"] >= P["DT_Y0"] + 0.5, "bar plate Y %.0f..%.0f inside the channel (front end %.0f, wall %.0f)" % (hg["plate_y0"], hg["plate_y1"], P["DT_Y0"], hg["wall_y"])))
    out.append((P["BAR_WIRE_Y"][1] + 1.0 <= hg["y_back"] - P["HOLDER_H"], "lead slot (Y<=%.1f) rises in front of the holder (Y>=%.1f)" % (P["BAR_WIRE_Y"][1], hg["y_back"] - P["HOLDER_H"])))
    out.append((P["BAR_WIRE_Y"][0] >= P["DT_Y0"], "lead slot starts inside the channel (Y>=%.0f)" % P["DT_Y0"]))
    win_w, win_h = P["CATCH_WIN"]
    out.append((win_w >= P["CATCH_W"] + 2 * 0.5 and win_h >= P["CATCH_NOSE_H"] + 2 * P["CATCH_WIN_CLR"], "catch window %.1f x %.1f fits the %.0f x %.0f nose with clearance" % (win_w, win_h, P["CATCH_W"], P["CATCH_NOSE_H"])))
    for (px, pz) in ((x, z) for x in P["PEG_XS"] for z in P["PEG_ZS"]):
        d = math.hypot(px - P["CATCH_X"], pz - (hg["win_z0"] + hg["win_z1"]) / 2)
        out.append((d >= 15.0, "catch window to peg (%.0f, %.0f): %.1f mm (>= 15)" % (px, pz, d)))
    gv = P["G_VENT"]
    for x in P["G_LATCH_XS"]:
        out.append((x + P["LATCH_W"] / 2 + P["LATCH_CLR"] + 2.0 <= gv["bot_x0"], "gateway latch at x=%.0f clears the intake vents (x>=%.0f)" % (x, gv["bot_x0"])))
    vent_x1 = gv["top_x0"] + (gv["n"] - 1) * gv["pitch"] + gv["len"]
    for x in P["G_TAB_XS"]:
        rib_x0 = x - P["TAB_W"] / 2 - P["TAB_RIB_SIDE"]
        rib_x1 = x + P["TAB_W"] / 2 + P["TAB_RIB_SIDE"]
        out.append((rib_x0 >= vent_x1 + 1.0 and rib_x1 + 1.0 <= P["G_SMA"][0] - P["SMA_PAD_D"] / 2, "gateway hinge rib at x=%.0f (x %.0f..%.0f) clears the exhaust vents (x<=%.0f) and the SMA pad" % (x, rib_x0, rib_x1, vent_x1)))
    gtop = gg["zc"] + P["BRD_W"] / 2 + P["BRD_CLR"] + P["POCKET_WALL_T"]
    gtab_bot = gg["H"] - gg["wall"] - P["TONGUE_CLR"] - 2 * P["TONGUE_T"] - 0.25
    out.append((gtop + 0.5 <= gtab_bot, "gateway board pocket top z=%.1f clears the hinge tabs (z>=%.1f)" % (gtop, gtab_bot)))
    return out

def write_readme(out_dir, hg, gg):
    sy = hg["sensor_y"]
    gap = hg["saddle_floor"] + P["TAG_CLR"] + P["TAG_WALL"] - (hg["sensor_z"] + P["SOT23"][2] / 2)
    lg = latch_geom()
    txt = """HazardLink v9 enclosures: NO SCREWS in the assembly. Generated by hazardlink_enclosures.py.
Frame: X right, Z up, Y from the front face into the wall. Wall face at Y=%.0f.

FILES
  <part>.step / .stl / .png / _drawing.dxf   printable parts: hanger_body, hanger_lid, hanger_bar, hanger_backplate, gateway_body, gateway_lid
  hanger_assembly.step, gateway_assembly.step  named and coloured assemblies including the reference solids
  hanger_section.dxf, gateway_section.dxf      assembly stack-up sections
  *_exploded.png, *_assembled*.png, *_lid_off.png previews
  ref/                                          reference solids (board, cell, holder, Hall carrier, magnet, antenna, plug), not printed
  sat_true/                                     true-surface ACIS files for AutoCAD for Mac (run fusion_step2sat.py in Fusion)
  manifest.txt                                  bounding boxes and derived positions

HOW THE PARTS HOLD TOGETHER (v9)
  Lids (both units): two rigid hinge tabs on the lid's top edge reach %.0f mm in and hook into pockets in a rib along the
    top wall; two spring latches on the bottom edge (%.0f x %.2f mm fingers, %.0f mm long, %.1f mm barb, 55 deg catch face)
    click into pockets in the bottom wall. Strain at full deflection is under %.0f %%, so they survive repeated use in PETG.
    Fit: hold the lid tilted (bottom edge out), push the top tabs into the rib pockets, swing the bottom edge in until both
    latches click. Open: lift the sign off the bar first (the release holes sit inside its footprint), push a paperclip
    (%.1f mm holes in the bottom face at Y=%.1f, each in a shallow 4 mm ring you can find by touch) into ONE hole, ease that
    corner of the lid out 1 mm, do the other, pull the bottom edge out about 25 mm (12 degrees) until the top tabs drop free,
    then take the lid away.
  Hook bar to hanger body: the bar's plate is a dovetail (%.1f wide at the mouth, %.1f at the top, %.1f tall, 45 deg flanks)
    that slides into a channel in the body's bottom wall FROM THE WALL SIDE. The channel is closed at the front and the
    backplate covers its mouth, so with the body hung the bar cannot come out. The sign's weight is carried by the dovetail
    flanks (%.1f mm each side), not by a snap. Nothing of the bar sits behind the body's back face, so the body still lifts
    the 14 mm it needs to come off the pegs with the bar fitted.
  Body to backplate: the four mushroom pegs stay. Offer the body up %.0f mm high so the peg heads pass the keyhole circles
    (the circles are BELOW the pegs, slots running up) and let it drop; it hangs on the pegs. A spring tongue in the
    backplate's front face (%.0f x %.0f mm, %.1f thick, root at the bottom) carries a nose that springs into a %.1f x %.1f window
    through the body's back wall as the body drops home; the body cannot be lifted until the nose is pushed back through
    the window from inside, which needs the lid off. Same tamper resistance as the old security screw for that step.
  Tamper note: the old lid needed pin-Torx screws; this one opens with a paperclip, but only after the sign has been lifted
    off the bar, which the Hall sensor reports. Firmware rule: a sign-removed event followed by a lid-open or a lift within
    a few minutes is a service visit, anything else is a tamper alarm. If a harder gate is ever wanted, one latch can be
    changed to a magnet-released catch without touching the rest of the design.
  Board: rests on rails, clamped by the lid ribs. Battery: holder in its ribbed bay, held by the lid. Window insert: cleats.
  Hall carrier: slot in the bar. Wall screws (4 in the backplate, 3 for the gateway keyholes) are the only screws left; they
  fix to the building, not to each other. The gateway's SMA nut is part of the bought connector.

HANGER: the sign hangs from the bar under the bottom edge. Nothing on the face except the screen window, PRG button, RST pinhole,
LED window and the label. The web at the back carries the bar 30 mm below the body; the bar reaches %.0f mm out from the wall face
and ends in a %.0f mm lip; the sign's handle settles in the saddle %.0f mm in front of the lid face, directly over the Hall sensor.
The three Hall leads run along the bar, up the web, forward in a groove in the top of the dovetail plate, then up through the
slot in the channel roof (Y %.1f to %.1f, in front of the battery holder) and on to the board. Terminate them in a 3-way JST-PH
plug and solder a short pigtail with the socket to the board's underside pads (J3 pin 1 GND, pin 2 3V3, pin 17 GPIO6) so the
board comes out without a soldering iron. Feed the leads up through the roof slot BEFORE the plate slides in, then take up the
slack from inside.

HANGER SERVICE SEQUENCE (unit stays on the wall)
  0. Lift the sign off the bar (the system logs a sign-removed event; service mode suppresses the alarm).
  1. Paperclip into one release hole, ease that corner out 1 mm, then the other; pull the bottom edge out until the top tabs
     drop free and take the lid away.
  2. The 21700 cell sits in its holder facing you: push it against the spring end and lift it out. Fit the new cell, same polarity.
  3. To swap the board: lift the antenna end of the board off its rail, unplug the U.FL antenna, the JST-PH Hall plug and the
     JST 1.25 battery plug from the exposed underside, lift the board out. No screws hold the board: it rests on the rails and
     is clamped by the two lid ribs.
  4. To swap the Hall sensor: with the lid off, put a flat screwdriver on the catch's push pad (visible through the window in
     the back wall, above the nose), push it back about 3 mm, lift the body 6 mm, withdraw the tool, lift the remaining 8 mm and
     pull the body forward off the pegs. Slide the bar out of the bottom wall backwards, slide the Hall carrier out of the bar's
     back end, fit the new carrier, lay the leads in the bar and plate grooves, feed them up through the roof slot, slide the
     plate home while taking up the slack from inside.
  5. Refit in reverse: bar in from the back, body offered up 14 mm high onto the pegs and dropped until the catch clicks, cell
     in, lid tabs in first then latches. Insert the cell last, close the lid within the 60 s commissioning window, or press RST
     (2 mm pinhole) later.
  Off the wall in one line: lid off, push the catch pad, lift 14 mm, pull forward.

GATEWAY OFF THE WALL: lid off, remove the No.8 pan head at (60, 16) from inside, lift 10 mm, pull forward.

WHAT OPENS WITH WHAT
  sign off the bar: hands.   lid: paperclip (after the sign is off).   body off the backplate: lid off + flat screwdriver.
  bar out of the body: body off the wall.   gateway lid: paperclip.   gateway off the wall: lid off + screwdriver.

GATEWAY SERVICE SEQUENCE
  1. Paperclip into the two release holes in the bottom wall, pull the bottom of the lid out, slide it down and off.
  2. Unplug the USB-C plug (cable stays tied to the saddle), unplug the U.FL pigtail, lift the board off its rails.

MAGNET DATUM (publish to the sign tag)
  Magnet on the bar centreline (x=%.0f), centred on the saddle (Y=%.0f), pole face parallel to the saddle floor, facing down,
  with %.1f mm running clearance and a %.1f mm tag wall (assumed). Air gap magnet face to Hall package top = %.2f mm.

PRINTING (PETG, 0.4 nozzle, 3 perimeters, 0.2 layers)
  hanger_body: back face down, open front up. The dovetail channel runs along the print direction so its flanks print clean;
    its closed front end is a 27 to 34 mm bridge (bridge fan 100 %%, bridge speed <= 20 mm/s); the latch pockets and pinholes
    are small vertical cavities; the hinge ribs grow from the bed and their nose pockets are 13 mm bridges; peg pocket roofs
    bridge 11.5 mm. No support.
  hanger_lid: outer face down. The latch fingers and hinge tabs stand up from the bed; slow the outer perimeters (30 mm/s) and
    keep the fan low on the fingers for layer bonding; set the slicer line width so 1.35 mm = 3 lines. The hook faces are 45 and
    55 deg, no support. PRG tab and LED window are thin skins on the bed. Fit the 36 x 19.5 x 1 mm clear insert from inside
    under the two cleats.
  hanger_bar: UPRIGHT on the bar's bottom face (lip pointing up). All bending loads are then in-plane and the dovetail flanks
    are 45 deg. Support is needed only under the front 16 mm of the plate (it overhangs the bar); use tree supports from the bed.
  hanger_backplate: back face down. The catch cavity is open to the back face on purpose: let the slicer drop support through
    it under the tongue and pull it out afterwards. Pegs print vertical with a 45 deg cone under the head.
  gateway_body: back face down. gateway_lid: outer face down.
  No heat-set inserts and no machine screws. Wall fixings: 4 No.8 countersunk screws with plugs for the backplate, 2 No.8 pan
  heads for the gateway keyholes plus 1 for its lower anti-lift hole.

MEASURE BEFORE FREEZING (assumed values in PARAMS)
  The TinyTronics 21700 holder outline (assumed 80 x 25 x 21 mm) and where its leads exit.
  The sign hand-hole and handle bar: bar width 26, reach 70, lip 20 are assumed; the magnet position in the handle must match the datum.
  The folded sign thickness at the handle (assumed 15 to 50): it sits between the lip and the wall either side of the saddle.
  The stub antenna diameter and length (clips are for a 6 mm rod, 60 mm long).
  The OLED active area offset (window is 30 x 16 to cover it with margin).
  Print one lid first and check the latch click and the pin release before printing the bodies.
""" % (hg["wall_y"], P["TAB_L"], P["LATCH_W"], P["LATCH_T"], P["LATCH_L"], P["LATCH_BARB"], P["SNAP_STRAIN_MAX"], P["RELEASE_D"], lg["pin_y"],
       P["DT_MOUTH"], P["DT_TOP"], P["DT_H"], (P["DT_TOP"] - P["DT_MOUTH"]) / 2, P["PEG_DROP"], P["CATCH_W"], P["CATCH_L"], P["CATCH_T"],
       P["CATCH_WIN"][0], P["CATCH_WIN"][1], P["BAR_REACH"], P["BAR_LIP_H"], -sy, P["BAR_WIRE_Y"][0], P["BAR_WIRE_Y"][1],
       hg["W"] / 2, sy, P["TAG_CLR"], P["TAG_WALL"], gap)
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
    h_bar = build_hanger_bar()
    h_plate = build_hanger_backplate()
    h_refs = hanger_refs()
    print("Building gateway parts")
    g_body = build_gateway_body()
    g_lid = build_gateway_lid()
    g_refs = gateway_refs()

    parts = {"hanger_body": h_body, "hanger_lid": h_lid, "hanger_bar": h_bar, "hanger_backplate": h_plate,
             "gateway_body": g_body, "gateway_lid": g_lid}
    print("Exporting parts (STEP + STL)")
    for name, wp in parts.items():
        assert wp.val().isValid(), name + " is not a valid solid"
        export_part(out_dir, name, wp)
    print_dir = os.path.join(out_dir, "print"); os.makedirs(print_dir, exist_ok=True)
    print("Exporting print-oriented STLs")
    print_lines = [export_print_stl(print_dir, name, wp, PRINT_ORIENT[name]) for name, wp in parts.items()]
    for l in print_lines:
        print("  " + l)
    open(os.path.join(print_dir, "ORIENTATION.txt"), "w").write(
        "Print-ready STLs: build direction is +Z, each part rests on z=0 in the orientation the design assumes.\n"
        "Do not rotate them in the slicer.\n\n" + "\n".join(print_lines) + "\n")
    print("Exporting reference solids")
    for unit, refs in (("hanger", h_refs), ("gateway", g_refs)):
        for name, (wp, col) in refs.items():
            cq.exporters.export(wp, os.path.join(ref_dir, "%s_%s.step" % (unit, name)))
            cq.exporters.export(wp, os.path.join(ref_dir, "%s_%s.stl" % (unit, name)), tolerance=0.02, angularTolerance=0.2)

    # ---- assemblies ------------------------------------------------------------------
    print("Exporting assemblies")
    h_assy = [("hanger_body", h_body, (0.85, 0.85, 0.85), (0, 0, 0)), ("hanger_lid", h_lid, (0.75, 0.78, 0.82), (0, 0, 0)),
              ("hanger_bar", h_bar, (0.95, 0.55, 0.10), (0, 0, 0)), ("hanger_backplate", h_plate, (0.55, 0.55, 0.60), (0, 0, 0))]
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
    write_part_drawing(os.path.join(out_dir, "hanger_body_drawing.dxf"), "HazardLink hanger body v9 (mm)", h_body, [
        dict(view="front", at=28.0, off=(0, -150), label="FRONT SECTION at Y=28 (near back wall): peg bosses, bulkhead, cradle, holder ribs, dovetail strip",
             dims=[("h", (0, 0), (W, 0), -10), ("v", (0, 0), (0, H), -12),
                   ("h", (P["PEG_XS"][0], P["PEG_ZS"][0]), (P["PEG_XS"][1], P["PEG_ZS"][0]), 55, "peg pitch <>"),
                   ("v", (P["PEG_XS"][1] + 8, P["PEG_ZS"][0]), (P["PEG_XS"][1] + 8, P["PEG_ZS"][1]), 112, "peg pitch <>"),
                   ("v", (W, P["BULK_Z"][0]), (W, P["BULK_Z"][1]), 108, "bulkhead <>"),
                   ("h", (P["HOLDER_X0"] - 0.5, 2.5), (P["HOLDER_X0"] + P["HOLDER_L"] + 0.5, 2.5), -6, "holder bay <>")]),
        dict(view="front", at=5.0, off=(0, -320), label="FRONT SECTION at Y=5 (near lid): USB slot, board pocket walls, hinge ledges",
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
    write_part_drawing(os.path.join(out_dir, "hanger_lid_drawing.dxf"), "HazardLink hanger lid v9 (mm)", h_lid, [
        dict(view="front", at=-1.5, off=(0, -150), label="FRONT SECTION at Y=-1.5: window, PRG tab groove, latch fingers, hinge tabs",
             dims=[("h", (0, 0), (W, 0), -10), ("v", (0, 0), (0, H), -12),
                   ("h", (cxw - P["WIN_W"] / 2, czw), (cxw + P["WIN_W"] / 2, czw), czw + 14, "window <>"),
                   ("v", (cxw + P["WIN_W"] / 2, czw - P["WIN_H"] / 2), (cxw + P["WIN_W"] / 2, czw + P["WIN_H"] / 2), cxw + 22, "window <>"),
                   ("h", (0, czw), (cxw, czw), czw - 12, "window centre <>"), ("v", (W, 0), (W, czw), 108, "window centre <>")]),
        dict(view="front", at=-2.7, off=(0, -320), label="FRONT SECTION at Y=-2.7 (outer skin): label recess, LED window skin", dims=[]),
        dict(view="top", at=zc, off=(0, -400), label="TOP SECTION at Z=104: lip, header ribs, insert pocket",
             dims=[("v", (W, -P["LID_T"]), (W, 0), 108, "lid <>"), ("v", (W, 0), (W, P["TONGUE_H"]), 118, "lip <>")]),
        dict(view="side", at=W / 2, off=(320, -150), label="SIDE SECTION at X=50: lip and window pocket", label_at=(-5, -8), dims=[]),
    ], notes=["Print lid outer face down. Window insert: 36 x 19.5 x 1.0 clear acrylic or PETG, snaps under the two cleats from inside.",
              "PRG tab: 6 x 10 x 1.0 living hinge sealed by a 0.4 skin; pusher pin 2.5 dia. RST: 2.0 pinhole. LED: 0.5 skin window."])
    sy = hg["sensor_y"]
    write_part_drawing(os.path.join(out_dir, "hanger_bar_drawing.dxf"), "HazardLink hanger bar v9 (mm)", h_bar, [
        dict(view="side", at=W / 2, off=(0, -120), label="SIDE SECTION at X=50: bar, lip, dovetail plate, saddle, Hall slot, lead channel",
             dims=[("h", (-hg["bar_back"], hg["bar_bot"]), (-hg["lip_front"], hg["bar_bot"]), hg["bar_bot"] - 10, "reach from wall <>"),
                   ("v", (-hg["lip_front"], hg["bar_bot"]), (-hg["lip_front"], hg["lip_top"]), -hg["lip_front"] + 8, "lip <>"),
                   ("v", (-hg["bar_back"], hg["bar_bot"]), (-hg["bar_back"], hg["bar_top"]), -hg["bar_back"] - 10, "bar <>"),
                   ("h", (-hg["saddle_y"] - P["BAR_SADDLE_W"] / 2, hg["bar_top"] + 4), (-hg["saddle_y"] + P["BAR_SADDLE_W"] / 2, hg["bar_top"] + 4), hg["bar_top"] + 10, "saddle <>"),
                   ("h", (0, hg["lip_top"] + 4), (-sy, hg["lip_top"] + 4), hg["lip_top"] + 10, "saddle from lid face <>")],
             refs=[h_refs["hall_carrier"][0], h_refs["magnet"][0], h_refs["sign_handle"][0]]),
        dict(view="front", at=sy, off=(0, -230), label="FRONT SECTION through the saddle: bar width, Hall slot, sensor",
             dims=[("h", (hg["bar_x0"], hg["bar_bot"]), (hg["bar_x1"], hg["bar_bot"]), hg["bar_bot"] - 8, "bar width <>"),
                   ("h", (W / 2 - hg["slot_hw"], hg["slot_ceil"]), (W / 2 + hg["slot_hw"], hg["slot_ceil"]), hg["bar_top"] + 8, "slot <>")],
             refs=[h_refs["hall_carrier"][0], h_refs["magnet"][0]]),
        dict(view="top", at=hg["slot_floor"] + 1.0, off=(230, -120), label="TOP SECTION through the Hall slot: carrier pocket, dovetail plate, lead channel",
             dims=[("h", (W / 2 - hg["plate_w1"] / 2, -hg["plate_y0"]), (W / 2 + hg["plate_w1"] / 2, -hg["plate_y0"]), -hg["plate_y0"] + 8, "dovetail top <>")],
             refs=[h_refs["hall_carrier"][0]]),
    ], notes=["Print lying on a side face (X face on the bed) so layers run along the bar and the dovetail flanks stand vertical. PETG. No screws: slides in from the wall side.",
              "Magnet datum: bar centreline, centred on the saddle %.0f mm in front of the lid face, pole face parallel to the saddle floor, 1.0 mm running clearance." % -sy])
    bx0, bz0 = (W - P["BP_W"]) / 2, (H - P["BP_H"]) / 2
    write_part_drawing(os.path.join(out_dir, "hanger_backplate_drawing.dxf"), "HazardLink hanger backplate v9 (mm)", h_plate, [
        dict(view="front", at=D + 1.0, off=(0, -150), label="FRONT SECTION at Y=36 (just inside the front face): wall screw countersinks, catch tongue",
             dims=[("h", (bx0, bz0), (bx0 + P["BP_W"], bz0), bz0 - 10), ("v", (bx0, bz0), (bx0, bz0 + P["BP_H"]), bx0 - 12),
                   ("h", (bx0 + 10, bz0 + 10), (bx0 + P["BP_W"] - 10, bz0 + 10), bz0 + 4, "screws <>"),
                   ("v", (bx0 + P["BP_W"] - 10, bz0 + 10), (bx0 + P["BP_W"] - 10, bz0 + P["BP_H"] - 10), bx0 + P["BP_W"] + 8, "screws <>")]),
        dict(view="top", at=P["PEG_ZS"][0], off=(0, -310), label="TOP SECTION at Z=45 (through the lower pegs): mushroom peg profile",
             dims=[("v", (bx0, -D - P["BP_T"]), (bx0, -D), bx0 - 10, "plate <>"), ("v", (bx0 + P["BP_W"], -D), (bx0 + P["BP_W"], -D + P["PEG_STEM_L"] + P["PEG_HEAD_L"]), bx0 + P["BP_W"] + 8, "peg <>"),
                   ("h", (P["PEG_XS"][0], -D), (P["PEG_XS"][1], -D), -D + 14, "peg pitch <>")]),
        dict(view="side", at=P["PEG_XS"][0], off=(260, -150), label="SIDE SECTION at X=30 (through both pegs)", label_at=(-45, -8),
             dims=[("v", (-D, P["PEG_ZS"][0]), (-D, P["PEG_ZS"][1]), -D - P["BP_T"] - 10, "peg pitch <>")]),
    ], notes=["Print back face down. Four No.8 / 4 mm countersunk wall screws with plugs. Spring catch tongue at x=50 replaces the security screw (push back from inside to release).",
              "Pegs: 5.5 stem x 3.5, 10 head x 3.5, 1 mm chamfer under the head. Body slides down 14 mm onto them."])
    GW, GH, GD = gg["W"], gg["H"], gg["D"]
    gx0, gzc, gpt = gg["x0"], gg["zc"], gg["pcb_top"]
    gcx, gcz = gx0 + P["OLED_ACT_CX"], gzc + P["OLED_ACT_CY"]
    write_part_drawing(os.path.join(out_dir, "gateway_body_drawing.dxf"), "HazardLink gateway body v9 (mm)", g_body, [
        dict(view="front", at=26.0, off=(0, -100), label="FRONT SECTION at Y=26 (back wall): keyholes, saddles, cradle",
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
    write_part_drawing(os.path.join(out_dir, "gateway_lid_drawing.dxf"), "HazardLink gateway lid v9 (mm)", g_lid, [
        dict(view="front", at=-1.5, off=(0, -100), label="FRONT SECTION at Y=-1.5: window, PRG tab groove, button knock-out, latches and tabs",
             dims=[("h", (0, 0), (GW, 0), -10), ("v", (0, 0), (0, GH), -12),
                   ("h", (gcx - P["WIN_W"] / 2, gcz), (gcx + P["WIN_W"] / 2, gcz), gcz + 14, "window <>"),
                   ("h", (0, gcz), (gcx, gcz), gcz - 14, "window centre <>"), ("v", (GW, 0), (GW, gcz), GW + 10, "window centre <>"),
                   ("h", (0, P["G_BTN_KO"][1]), (P["G_BTN_KO"][0], P["G_BTN_KO"][1]), -6, "button KO <>")]),
        dict(view="top", at=gzc, off=(0, -220), label="TOP SECTION at Z=42: lip, header ribs, insert pocket",
             dims=[("v", (GW, -P["LID_T"]), (GW, 0), GW + 10, "lid <>")]),
    ], notes=["Print outer face down. No screws: two hinge tabs at the top, two latches at the bottom, paperclip release holes in the body's bottom wall."])
    # assembly stack-up sections
    h_all = [h_body, h_lid, h_bar, h_plate]
    doc = dxf_new(); msp = doc.modelspace()
    dxf_text(msp, "HazardLink hanger v9 assembly sections (mm)", (0, 0), (0, 0), h=5.0)
    for (label, at, off) in (("SIDE SECTION at X=50: hanging bar, saddle, Hall carrier, magnet datum, lid, backplate, wall", W / 2, (50, -160)),
                             ("SIDE SECTION at X=34.8: OLED window, insert, board on rails, USB-C level, backplate", cxw, (300, -160))):
        for s in h_all:
            dxf_edges(msp, section_edges([s], "side", at)[0], "side", off)
        for n, (wp, col) in h_refs.items():
            dxf_edges(msp, section_edges([wp], "side", at)[0], "side", off, layer="REF")
        dxf_text(msp, label, (-D - P["BP_T"], -10), off, h=2.8)
    off = (50, -160)
    mag_face = hg["saddle_floor"] + P["TAG_CLR"] + P["TAG_WALL"]
    sens_top = hg["sensor_z"] + P["SOT23"][2] / 2
    dxf_dim(msp, "v", (-sy, sens_top), (-sy, mag_face), -sy + 30, off, "air gap <>")
    dxf_dim(msp, "h", (-hg["wall_y"], hg["bar_bot"] - 4), (-hg["lip_front"], hg["bar_bot"] - 4), hg["bar_bot"] - 10, off, "reach from wall <>")
    off = (300, -160)
    dxf_dim(msp, "v", (10, czw - P["WIN_H"] / 2), (10, czw + P["WIN_H"] / 2), 20, off, "window <>")
    dxf_dim(msp, "h", (0, zc + 20), (-P["H_PCB_TOP_Y"], zc + 20), zc + 26, off, "PCB top from lid inner face <>")
    doc.saveas(os.path.join(out_dir, "hanger_section.dxf"))
    doc = dxf_new(); msp = doc.modelspace()
    dxf_text(msp, "HazardLink gateway v9 assembly sections (mm)", (0, 0), (0, 0), h=5.0)
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
        render_scad(out_dir, "hanger_bar_underside", scad_import("hanger_bar.stl", (0.95, 0.55, 0.1)), camera="0,0,0,120,0,200,0")
        render_scad(out_dir, "hanger_lid_inside", scad_import("hanger_lid.stl", (0.8, 0.8, 0.8)), camera="0,0,0,60,0,205,0")
        render_scad(out_dir, "gateway_lid_inside", scad_import("gateway_lid.stl", (0.8, 0.8, 0.8)), camera="0,0,0,60,0,205,0")
        def unit_scad(unit, part_tr, refs, ref_tr):
            s = ""
            for name, col, tr in part_tr:
                s += scad_import(name + ".stl", col, tr)
            for name, (wp, col) in refs.items():
                s += scad_import("ref/%s_%s.stl" % (unit, name), col, ref_tr.get(name, (0, 0, 0)))
            return s
        bar_refs = {"hall_carrier", "sign_handle", "magnet"}
        h_parts_ex = [("hanger_body", (0.85, 0.85, 0.85), (0, 0, 0)), ("hanger_lid", (0.75, 0.78, 0.82), (0, -EX, 0)),
                      ("hanger_bar", (0.95, 0.55, 0.1), (0, 0, -EX)), ("hanger_backplate", (0.55, 0.55, 0.6), (0, EX, 0))]
        h_ref_tr = {n: (0, 0, -EX) for n in bar_refs}; h_ref_tr["window_insert"] = (0, -EX, 0)
        render_scad(out_dir, "hanger_exploded", unit_scad("hanger", h_parts_ex, h_refs, h_ref_tr))
        h_parts = [(n, c, (0, 0, 0)) for (n, c, t) in h_parts_ex]
        render_scad(out_dir, "hanger_assembled", unit_scad("hanger", h_parts, h_refs, {}))
        render_scad(out_dir, "hanger_assembled_front", unit_scad("hanger", h_parts, h_refs, {}), camera="0,0,0,90,0,0,0")
        render_scad(out_dir, "hanger_assembled_side", unit_scad("hanger", h_parts, h_refs, {}), camera="0,0,0,90,0,90,0")
        # lid off: how the board, holder, cell, antenna and bar sit in the body
        h_open = [p for p in h_parts if p[0] != "hanger_lid"]
        h_open_refs = {n: v for n, v in h_refs.items() if n != "window_insert"}
        render_scad(out_dir, "hanger_lid_off", unit_scad("hanger", h_open, h_open_refs, {}))
        g_parts_ex = [("gateway_body", (0.85, 0.85, 0.85), (0, 0, 0)), ("gateway_lid", (0.75, 0.78, 0.82), (0, -EX, 0))]
        render_scad(out_dir, "gateway_exploded", unit_scad("gateway", g_parts_ex, g_refs, {"window_insert": (0, -EX, 0)}))
        g_parts = [(n, c, (0, 0, 0)) for (n, c, t) in g_parts_ex]
        render_scad(out_dir, "gateway_assembled", unit_scad("gateway", g_parts, g_refs, {}))
        render_scad(out_dir, "gateway_assembled_front", unit_scad("gateway", g_parts, g_refs, {}), camera="0,0,0,90,0,0,0")
        g_open = [p for p in g_parts if p[0] != "gateway_lid"]
        g_open_refs = {n: v for n, v in g_refs.items() if n != "window_insert"}
        render_scad(out_dir, "gateway_lid_off", unit_scad("gateway", g_open, g_open_refs, {}))
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
    lines = ["HazardLink v9 enclosures (no screws, reviewed). Generated by hazardlink_enclosures.py", ""]
    for name, wp in parts.items():
        lines.append("%-22s %s" % (name, bbox_str(wp)))
    lines += ["", "Key derived positions (world frame, mm):",
              "  hanger board: USB-end corners at x=%.1f, centreline z=%.1f, PCB top at Y=%.1f, OLED glass at Y=%.1f" % (x0, zc, pt, pt - P["OLED_H"]),
              "  hanger window: %.0f x %.0f centred at (%.1f, %.1f); insert pocket %.0f x %.1f x %.1f" % (P["WIN_W"], P["WIN_H"], cxw, czw, P["INSERT_W"], P["INSERT_H"], P["INSERT_POCKET"]),
              "  bar: %.0f wide x %.0f thick, top %.0f mm below the body bottom, reach %.0f mm from the wall face, lip %.0f tall; saddle at Y=%.0f (%.0f mm in front of the lid face)" % (P["BAR_W"], P["BAR_T"], P["BAR_DROP"], P["BAR_REACH"], P["BAR_LIP_H"], sy, -sy),
              "  magnet datum: bar centreline x=%.0f, Y=%.0f, pole face at z=%.2f (saddle floor + %.1f clearance + %.1f tag wall); sensor package top at z=%.2f; air gap %.2f mm" % (W / 2, sy, mag_face, P["TAG_CLR"], P["TAG_WALL"], sens_top, mag_face - sens_top),
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
    for unit, parts, refs in (("hanger", dict(body=build_hanger_body(), lid=build_hanger_lid(), bar=build_hanger_bar(),
                                              plate=build_hanger_backplate()), {k: v[0] for k, v in hanger_refs().items()}),
                              ("gateway", dict(body=build_gateway_body(), lid=build_gateway_lid()), {k: v[0] for k, v in gateway_refs().items()})):
        print(unit.upper())
        for a, b in itertools.combinations(parts.keys(), 2):
            print("  %-8s x %-14s %8.2f mm3" % (a, b, inter(parts[a], parts[b])))
        for pk, pv in parts.items():
            for rk, rv in refs.items():
                v = inter(pv, rv)
                if v > 0.01:
                    try:
                        bb = pv.intersect(rv).val().BoundingBox()
                        where = "at X %.1f..%.1f Y %.1f..%.1f Z %.1f..%.1f" % (bb.xmin, bb.xmax, bb.ymin, bb.ymax, bb.zmin, bb.zmax)
                    except Exception:
                        where = ""
                    print("  %-8s x %-14s %8.2f mm3  %s" % (pk, rk, v, where))

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out = args[0] if args else os.path.dirname(os.path.abspath(__file__))
    if "--check" in sys.argv:
        interference_report()
    else:
        main(out, quick="--quick" in sys.argv, autocad="--no-autocad" not in sys.argv)
