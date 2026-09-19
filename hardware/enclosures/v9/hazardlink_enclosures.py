#!/usr/bin/env python
"""HazardLink v9.9 enclosures, FINAL (Designer A base, hanger reworked to Owen's bottom-hung concept).

Two printed enclosures built around the Heltec WiFi LoRa 32 V3:
  HANGER  : battery wall hanger = body + lid + backplate + slide-in hanging BAR under the bottom edge
            (the sign hangs below the unit; the bar carries a saddle, and a bare Hall sensor sits in a nest under it,
            held by two filament pins). No screws between the parts; wall screws are the only screws.
            v9.9: a cleaning-mode push button (Owen's Gebildet 16 mm) is FITTED through the bottom wall, pointing down, above
            the hook and out of sight from the front. The box grew DOWNWARD by H_BASEMENT (41 mm, so 171 tall where v9.8 was
            130) to give the button an empty bay under the battery; every feature keeps its place measured from the TOP of
            the box. PARAMS BTN16_ON=False builds the old 130 mm box with no button. The hanger firmware reserves the button's
            pin (TEST_BUTTON_PIN = 3) but does not act on a press yet, so the README proves the wiring with a meter.
  GATEWAY : mains wall box      = body + lid (SMA bulkhead on top, USB-C entry with strain relief). Unchanged in v9.9.

Run with the CadQuery venv:
  cadenv/bin/python hazardlink_enclosures.py [out_dir] [--quick] [--no-autocad] [--check]
  --quick skips the PNG previews, --no-autocad skips the SAT/DXF conversion, --check prints
  part-to-part and part-to-reference intersection volumes instead of exporting.

Per part: <part>.step, <part>.stl (fine), <part>.png, <part>_drawing.dxf (section views with dimensions).
Per unit: <unit>_assembly.step (named, coloured, with reference solids), <unit>_exploded.png,
<unit>_assembled.png, <unit>_section.dxf (assembly stack-up section through the board).
print/ holds the same parts already turned into their print orientation (PRINT_ORIENT), the two lid inlays for a
second colour, the body coupon and ORIENTATION.txt. The slicer settings live in PRINT.md.
Reference solids (board, cell, holder, Hall sensor and its two pins, magnet, sign handle, antenna, plug) go to ref/.
The design rule checks run BEFORE anything is exported, so a bad parameter cannot overwrite good files.
AutoCAD for Mac deliverables (.sat + 3DSOLID .dxf) come from to_autocad.py, which this script tries to run at
the end into <out_dir>/autocad unless --no-autocad is given.

FRAME (both units): X to the viewer's right when facing the unit, Z up, Y is depth measured from
the body's front face INTO the wall (right-handed). Body occupies Y 0..D, lid sits at Y -LID_T..0,
backplate at Y D..D+BP_T, the bar's lip at Y < -LID_T. The body rim is Y=0 and the lid's outer face is Y=-LID_T.

Board frame -> world: Xb (along the board from the USB-end corner points) -> +X,
Zb (up from the PCB top, toward the OLED) -> -Y (toward the lid), Yb (+ toward PRG/J3) -> +Z.
So the OLED faces the lid, the USB-C is at the left wall, PRG is above the board centreline and
RST below it.

Every dimension lives in PARAMS with a tag:
  datasheet : from a vendor drawing or STEP (Heltec, Murata, TI, USB-IF, TE)
  research  : computed or measured in the research pass (field tables, community practice)
  v7        : kept from the v7 OpenSCAD sketch (design intent, not a measured requirement)
  assumed   : chosen here, must be measured or confirmed before the CAD is frozen
  Owen's caliper / ruler / side photo, packing slip, maker's listing : read off the parts that were delivered
  review    : changed after the independent review of v9.7
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
    BRD_CLR=0.3,            # assumed: pocket clearance per side (slip fit)
    USB_NOSE=0.65,          # datasheet: USB-C nose proud of the corner points
    USB_SETBACK=1.0,        # assumed: corner points to the wall inner face (nose 0.35 inside); gateway
    H_USB_SETBACK=3.2,      # not read by the model (the hanger cradle uses USB_SETBACK); kept for reference
    H_BRD_X0=3.5,           # v9.4: board back against the left wall (USB nose 0.35 inside it) so a cable plugs in with the LID ON.
                            # On this board the USB-C port sits between the two buttons at the very end, so port-at-the-edge,
                            # wide pads and a centred display cannot all be had: the display sits left of centre instead.
    H_PAD_V=(5.8, 17.5, 2.6, 0.5),   # assumed: hanger pads run vertically above and below the port: pad left edge x, pad height, pin diameter, pin x offset
    USB_LID_SKIN=1.4,       # review: seven layers left over the plug's overmold where the opening runs into the lid edge (the plug sits 1 mm deeper since v9.7, so 0.75 was needlessly fragile)
    # v9.3 buttons: each is a flap cut into the lid (U-slot through, thin hinge at the root) with a pin over the switch
    BTN_PAD=(24.0, 15.0, 1.6, 0.8, 4.0, 0.8),   # assumed: pad length (X), height (Z), pad thickness, hinge thickness, hinge length, slot width
    BTN_PAD_X1=11.3,        # assumed: pad edge nearest the display, measured from the board's USB-end corners (2 mm short of the display pocket;
                            # on the hanger the coil relief runs the pocket on to the slot at this edge)
    BTN_PAD_GAP=1.5,        # assumed: each pad starts this far from the board centreline
    BTN_PIN_D=3.2, BTN_PIN_GAP=0.3, BTN_TRAVEL=0.3,   # assumed: pin diameter, rest gap over the switch, switch travel
    BTN_LABEL=(4.2, 2.4),   # pad names are 4.2 tall and run up the LEFT side of each pad (centre 2.4 from the pad's left edge), clear of where the status lights sit under the RST pad
    LED_HOLE_D=1.8,         # assumed: light hole over the two status LEDs (it falls inside the RST pad)
    H_LED_HOLE=False,       # Owen: no hole in the hanger's face (it is cleaned around wet floors and he does not want it). The board's two status
                            # lights are hidden with the lid on; the display shows what the unit is doing. The gateway keeps its light hole.
    G_LED_HOLE=True,
    # v9.3 face marks: sunk MARK_DEPTH (0.6 = three layers, so white stays white over black) into the face as narrow strokes (prints cleanly on the bed), or filled flush in a
    # second colour from the other hotend using print/<lid>_inlay.stl
    MARK_DEPTH=0.6, LOGO_BADGE=(26.0, 40.0, 5.0, 2.0, -7.0),   # assumed: badge width, height, corner radius, stroke, tilt in degrees
    LOGO_BANG=(5.0, 17.0, 4.5, 5.5, -11.5),   # assumed: exclamation bar width, height, bar centre z, dot diameter, dot centre z (from the badge centre)
    H_LOGO=(74.0, 100.0, 1.0), H_WORDMARK=(50.0, 64.0, 8.0, "center"),   # assumed: badge to the right of the display, wordmark centred below the row
    G_LOGO=(17.0, 58.0, 0.78), G_WORDMARK=(62.0, 66.0, 6.5, "left"),     # assumed: gateway
    OLED_H_MAX=6.0,         # Owen's side photo of his own board (scaled off the USB-C shell): display on its clear carrier stands about 5.6 above the
                            # PCB and the coil antenna beside it about 5.9, both +/- 0.4. 6.0 clears both. A caliper-jaw reading would close the last few tenths.
                            # NEVER set this below the coil height: the pocket floor (OLED_H_MAX + OLED_GAP above the PCB) must stay at least 0.2 above
                            # the coil top, and design_checks stops the build before any file is written if it does not.
    COIL=(13.75, 7.3, 3.3, 5.9),   # Owen's side photo: WiFi coil antenna STANDING on the board between the USB end and the display (Xb 12.1 to 15.4, about 3.3 dia,
                            # 5.9 tall). Its position across the board (Yb) is NOT visible in that photo; 7.3 is where Heltec's V3.2 puts its RF part. Confirm with a top photo.
    BEZEL_T=1.0, OLED_POCKET=(36.0, 20.4), OLED_GAP=0.2,   # assumed: front skin left around the window, pocket for the display module (X, Z), clearance glass to bezel
    OLED_X0=14.9, OLED_X1=47.9, OLED_HALF_W=9.28, OLED_H=5.6,    # datasheet envelope; height from Owen's side photo
    OLED_ACT_CX=31.3, OLED_ACT_CY=0.5,       # research: window centre (active area ~1 mm toward +Yb)
    WIN_W=30.0, WIN_H=16.0,                  # research: conservative window showing the whole picture
    INSERT_W=36.0, INSERT_H=19.5, INSERT_T=1.0, INSERT_POCKET=1.3,   # assumed 1 mm acrylic or PETG pane (GATEWAY lid only; the hanger lid is flush and takes no insert)
    INSERT_CLEAT=0.6,                        # assumed: retaining cleat overhang into the pocket (gateway lid only)
    PRG=(3.4, 7.9), RST=(3.4, -7.9), BTN_H=2.0,   # datasheet (STEP)
    LED=(8.1, -8.0),                              # datasheet (STEP, two 0603 LEDs)
    IPEX=(50.4, 0.0), IPEX_H=1.26, UFL_PLUG_H=2.5,   # datasheet socket / assumed plug height
    USB_SHELL_W=8.94, USB_SHELL_H=3.5, USB_OPEN_CY=1.7,   # datasheet
    USB_SLOT_W=14.0, USB_SLOT_H=8.0,   # Owen's caliper photo: his white braided lead's plug body is about 12.2 to 12.6 wide (metal tip 8.3); 14.0 leaves 0.7 a side
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
    WALL=2.5,                # research: 2.4 min for an electronics box
    LID_T=3.0,               # research: 3.0 for a handled face
    CORNER_R=5.0,            # v7
    TONGUE_T=2.0, TONGUE_H=4.0, TONGUE_CLR=0.25,   # research: lip 2 x 4, 0.25 per side
    # ---- snap-fit lids (v9: no screws anywhere in the assembly) ------------------------
    # two rigid hinge tabs on the lid's top edge hook into pockets in a rib along the top wall; two rigid hooks on the
    # lid's bottom edge drop into windows in two spring arms cut into the body's bottom wall; a pull lip under each arm
    # tip releases it by hand (no release pins or pinholes since v9.2)
    # v9.2 latches: the SPRING is an arm cut into the body's bottom wall (it prints along its length, so bending runs
    # along the layers); the lid carries only a rigid hook. First PLA print: thin fingers standing on the lid snapped.
    ARM_L=21.0, ARM_W=10.5, ARM_T=2.0, ARM_SLOT=1.2,      # assumed: arm length (X), width from the rim (Y), thickness (outer face relieved), slot width
    ARM_TAB=(0.6, 0.8),      # assumed: breakaway tab (Y, Z) across the end slot so the arm's first layers bridge; snaps on first use
    ARM_WIN=(11.0, 5.0, 8.6),   # assumed: window through the arm near its free end (X width, Y front edge, Y back edge)
    ARM_WIN_FROM_TIP=7.0,    # assumed: window centre to the arm tip
    ARM_LIP=(6.0, 1.2),      # assumed: pull lip under the arm tip (X length, proud of the bottom face)
    HOOK_W=10.0, HOOK_T=3.0, HOOK_L=8.4, HOOK_BARB=1.0, HOOK_CATCH_Y=5.2, HOOK_FLAT=1.0, HOOK_GUSSET=4.0,   # assumed: rigid lid hook (barb catches the window's front edge)
    TAB_W=12.0, TAB_L=14.0, TAB_NOSE=2.5, TAB_NOSE_L=3.0, TAB_CLR=0.25, TAB_POCKET_UP=0.6,   # assumed: hinge tab (contiguous with the tongue, 2.25 thick) with a 45 deg hook face; nose pocket reaches 0.6 into the top wall
    TAB_RIB_Y0=8.0, TAB_RIB_H=2.0, TAB_RIB_SIDE=3.0,   # assumed: stiffening rib along the top wall from Y=8 to the back wall; the nose pocket is cut through it (bridge on 2.5 mm cheeks)
    H_ARMS=((7.0, 1), (93.0, -1)), H_TAB_XS=(22.0, 70.0),   # assumed: (root x, direction) of each wall arm, clear of the bar channel strip (x 30..70)
    G_ARMS=((8.0, 1), (36.0, 1)), G_TAB_XS=(66.0, 86.0),    # assumed: gateway arms, left of the intake vents
    SNAP_STRAIN_MAX=1.5,     # research: repeated-use design strain, percent; 1.5 covers PLA (the first spool) as well as PETG (2.0)
    # the next four belong to the v9.2 face (RST pinhole, sealed LED window, PRG living-hinge tab). Nothing reads them since
    # v9.3: both buttons are pads (BTN_PAD, H_PAD_V) and the LED shows through an open hole (LED_HOLE_D)
    PINHOLE_D=2.0,           # unused since v9.3
    LED_WIN_D=3.0, LED_SKIN=0.5,      # unused since v9.3
    PRG_TAB=(6.0, 10.0, 1.0, 0.8, 0.4),   # unused since v9.3
    PUSHER_D=2.5,            # unused since v9.3
    PEG_STEM_D=5.5, PEG_STEM_L=3.5, PEG_HEAD_D=10.0, PEG_HEAD_L=3.5, PEG_CHAMFER=1.0,  # assumed (PEG_CHAMFER is not read: the head has a 45 deg cone under it instead)
    PEG_DROP=14.0,           # v7: engagement slide
    PEG_SLOT_CLR=0.35, PEG_HEAD_CLR=0.75, PEG_POCKET_BACK=2.5,   # assumed clearances / roof
    KEY_HEAD_D=10.0, KEY_SLOT_W=5.0, KEY_SLOT_L=10.0,   # research: No.8 pan head keyhole (slot 10 here)
    KNOCKOUT_SKIN=0.8,       # assumed: membrane left in knock-outs

    # ---- Hanger -----------------------------------------------------------------------
    H_W=100.0, H_H=130.0, H_D=35.0,   # v7. These are the values BEFORE the basement: with the button fitted _apply_basement() adds H_BASEMENT (41) to H_H
                                      # and to every hanger height below (board centre, holder, bulkhead, pegs, catch, antenna, backplate, marks), so the box is 171 tall
    H_BRD_ZC=104.0,          # assumed: board centreline height (window as high as the bosses allow)
    H_PCB_TOP_Y=None,        # derived: the display sits inside the lid, its glass just behind a 1 mm bezel (see hanger_geom)
    HOLDER_L=77.7, HOLDER_W=20.9, HOLDER_H=21.3, HOLDER_CLR=0.5,   # maker's listing: BeiLaMoo BH18650-PC2 (TinyTronics "1x 18650 Battery holder for PCB", marked 18650-PC2)
    HOLDER_STANDOFF=5.0,     # Owen's caliper photo: one solder pin at each end, about 3.4 in from the end face, about 4.3 long. 5.0 leaves room for the pin and the wire soldered to it.
    HOLDER_PIN=(3.4, 4.3, 1.0),   # Owen's caliper photo: pin centre from the end face, pin length, pin width (reference only)
    HOLDER_X0=11.15, HOLDER_Z0=10.0,    # centred; 10.0 leaves a 4.1 mm passage under the holder for the sensor lead in the old box (BTN16_ON=False).
                                        # With the button fitted the holder sits H_BASEMENT higher and the whole bay under it (about 45 mm) is open
    HOLDER_RIB_T=3.0, HOLDER_RIB_H=12.0, HOLDER_LEAD_GAP=8.0,   # assumed
    CELL_D=18.5, CELL_L=65.2,         # packing slip: Murata US18650VTC6 (18650), datasheet maximum size
    BULK_Z=(34.0, 46.0),              # assumed: stiffening bulkhead between bay and board
    # ---- hanging bar (Owen: sign hangs from the bottom edge, nothing on the face) -------
    BAR_W=95.0,              # PROVISIONAL: the bar spans the sign's hand hole so the sign hangs level and cannot slide sideways
                             # off the sensor. Set to (measured hand-hole width - 5). No manufacturer publishes the hole size.
    WEB_W=26.0,              # assumed: the web and dovetail stay narrow, so the part is a T
    BAR_SPREAD=18.0,         # assumed: triangular spreaders each side of the web that carry the wide bar
    SIGN_HOLE_CLR=5.0, SIGN_HOLE_H=35.0, SIGN_T=12.0,   # assumed: hand hole = bar + 5 wide, 35 tall; folded handle stack 12 thick (reference only)
    BAR_T=10.0,              # assumed: bar thickness
    BAR_DROP=30.0,           # assumed: bar top sits this far below the body bottom (headroom for the sign's handle region, research 20 to 30)
    BAR_WEB_Y=(24.0, 34.0),  # assumed: the web that carries the bar down from the body, under the back of the body (nothing behind the back face, so the body can lift 14 mm past the backplate)
    # v9: the bar's plate is a dovetail that slides into a channel in the body's bottom wall FROM THE WALL SIDE;
    # the channel is closed at the front and the backplate covers its mouth, so with the body hung the bar cannot come out
    DT_MOUTH=27.0, DT_TOP=34.0, DT_H=3.5, DT_CLR=0.45, DT_ROOF=1.9, DT_STRIP_W=40.0, DT_Y0=6.0, DT_LEADIN=0.6,   # assumed: mouth width, top width (45 deg flanks: top - mouth = 2 x height), height, plate clearance per side (flanks print as 45 deg overhangs), roof, strip width, closed front end, mouth chamfer
    PLATE_Y=(6.6, 34.5),     # assumed: bar plate span along Y (flush with the web's back face, 1 mm inside the body's back face)
    HANDLE_H=20.0,           # assumed: sign panel height above the hand-hole that rests on the bar (research 20 to 30)
    BAR_REACH=70.0,          # assumed: wall face to the lip front (research: >= 45 so a folded sign clears the wall)
    BAR_LIP_T=9.0,           # v7 lip thickness
    BAR_LIP_H=20.0,          # assumed: lip rises this much above the bar top (forward of the lid, so no clash)
    BAR_SADDLE_Y=-2.0,       # assumed: saddle centre, 2 mm in front of the body rim (Y=0), which is 1 mm BEHIND the lid's outer face (Y=-3); sign thickness sits either side
    BAR_SADDLE_W=15.0, BAR_SADDLE_D=2.0,  # assumed: saddle width along Y (folded handle stack 6 to 12, research) and depth
    BAR_WIRE_Y=(6.5, 10.5),  # assumed: lead slot through the channel roof. It opens UNDER the battery holder (holder front face Y=6.2 at HOLDER_STANDOFF 5):
                             # the leads come up under the holder (into the bay under the battery since v9.9), bend forward, then rise in front of it.
                             # So they are fed up and folded forward BEFORE the holder is pressed in: a lead left standing is trapped behind the holder.
    BAR_WIRE_W=8.0,          # assumed
    WEB_BAND=(-19.0, -15.0), # assumed: the lead groove in the back of the web is open (wires lay in) except this band, which keeps them in.
                             # The band is closed, so the wire ends have to be THREADED under it (opening BAR_WIRE_W - 2 wide): no plug on them yet
    BULK_LEAD_SLOT=(46.0, 54.0, 2.0, 6.4),   # assumed: slot through the bulkhead right above the channel roof slot (x0, x1, y0, y1)
    BAR_GUSSET=8.0, BAR_GUSSET_W=2.0,    # assumed: short side gussets at the lip root
    HALL_PKG=(4.1, 3.0, 1.5),         # Owen's caliper photo: the lift sensor is a BARE flat 3-leg Hall sensor, TI DRV5032FA in the TO-92 style (LPG) package
                                      # (DigiKey DRV5032FALPG), body about 4.1 wide x 3.0 x 1.5 thick, no carrier board. OMNIPOLAR: either magnet pole works.
                                      # TI datasheet SLVSDC7H (Table 5-1, Figure 5-5): pin 1 VCC (1.65 to 5.5 V), pin 2 GND = the MIDDLE leg, pin 3 OUT (push-pull).
                                      # LEG ORDER CONFIRMED: Owen's sensors are marked 32FA, which that datasheet lists as the marking of DRV5032FALPG. Its
                                      # Figure 7-1 shows that the "top" of the TO-92 package is the marked, bevelled front face, and Figure 5-5 is the top view.
                                      # So with the MARKED face toward you and the legs pointing DOWN: LEFT = VCC (to 3V3), MIDDLE = GND, RIGHT = OUT (to GPIO6).
                                      # Never find a leg by putting 3V3 on it: 3V3 on the OUT leg is outside TI's absolute maximum ratings.
    HALL_LEG=(0.45, 1.27, 14.0),      # datasheet (TO-92 style): leg width, pitch, length. The wires are soldered to the legs and each joint sleeved, but the
                                      # first 3 mm of the legs behind the body stays bare, straight and unsleeved: the two retaining pins stand there
    HALL_NEST_CLR=(0.25, 0.3, 0.35),  # review: nest clearance each side, in front, above and below the package (0.35 so a sagging bridge cannot jam it, and every level of the cavity lands on a 0.2 mm layer)
    HALL_TUNNEL_W=8.6,                # v9: tunnel behind the nest for the legs and the three sleeved solder joints
    HALL_SLOT_H=3.0, HALL_SKIN=1.6, HALL_WIRE_H=4.4,   # review: values that put the roof, floors and trench on 0.2 mm layer boundaries with the bar printed upright
    HALL_PIN_PUSH_D=2.0,              # review: small hole under each pin through the bar's underside, to push a pin out and to drain
    HALL_FUNNEL_Y=4.5,                # review: the tunnel narrows to the nest over this length, so the package is steered in
    MAGNET_D=6.0, MAGNET_T=2.0,       # packing slip: XMP neodymium 6 x 2 mm N52
    TAG_WALL=1.2, TAG_CLR=1.0,        # research: tag wall and running clearance (assumed values)
    BP_W=90.0, BP_H=124.0, BP_T=10.0,   # v7 90 wide; 124 tall (z 3..127) so the plate covers the bar channel mouth; thickness 10 assumed.
                                        # With the button fitted H_BASEMENT is added: 165 tall (z 3..168)
    BP_SCREW_D=4.5, BP_SCREW_CSK_D=9.0, BP_SCREW_INSET=10.0,   # v7 / research No.8 csk
    PEG_XS=(30.0, 70.0), PEG_ZS=(55.0, 105.0),   # assumed peg positions (engaged); the head chamber BELOW each peg clears the holder's top rib
    # v9: spring catch on the backplate replaces the internal security screw; released from inside with the lid off
    CATCH_X=50.0, CATCH_Z0=44.0, CATCH_W=8.0, CATCH_T=1.8, CATCH_L=24.0, CATCH_GAP=3.0, CATCH_SLOT=0.8,   # assumed: tongue in the plate's front skin, root at the bottom; cavity open to the back face so the slicer can support it
    CATCH_NOSE=2.3, CATCH_NOSE_H=4.0, CATCH_NOSE_Z=16.0, CATCH_PAD=(1.5, 2.5, 5.0), CATCH_WIN=(9.5, 10.5), CATCH_WIN_CLR=0.5,   # assumed: nose z = root + 16; push pad (proud, height, above nose top); window through the back wall (w, h)
    # antenna, read off Owen's ruler photo: SMA bulkhead pigtail + stubby SMA antenna, black body about 9.5 dia, antenna about
    # 47 long including its brass connector. Mounted INSIDE: the jack's neck slides into a slotted shelf FROM THE FRONT with its
    # flange under the shelf (nut and washer taken off first, then refitted on top: the nut clamps it), the body snaps into a
    # clip. The knock-out in the top wall above it takes the same jack if an outside antenna is ever wanted.
    ANT_X=86.0, ANT_Y=22.0, ANT_D=9.5, ANT_L=47.0, ANT_SHELF_Z=62.0, ANT_SHELF_T=2.5, ANT_SLOT_W=6.6, ANT_CLIP_Z=100.0,
    SMA_KO=(84.0, 17.5),     # assumed optional SMA knock-out on the top wall
    # label recess removed: it was on the face that sits on the print bed, so it printed over nothing. Use a sticker.
    SADDLES=((30.0, 74.0),),   # assumed: one cable tie saddle on the back wall for the lead bundle (x, z)
    # retention added after the six-direction audit (audit_retention.py): nothing may move more than about 0.5 mm
    # v9.5: parts stay put with the lid OFF. Clips flex across the print layers here (the body prints back-face down), so
    # their strain is held under SNAP_STRAIN_XLAYER, well below the limit used for flexures that print flat.
    SNAP_STRAIN_XLAYER=0.7,
    BRD_BARB=(0.5, 6.0, 22.0, 32.0),   # assumed: board catch engagement over the PCB edge, catch length, J3-side start Xb, J2-side start Xb
    HOLDER_ARM_ROOT=3.0,             # review: the arm is slotted free of the end rib except for this much at the back wall
    HOLDER_ARM=(2.0, 6.0, 24.9, 0.8),  # assumed: battery holder snap arm thickness (X), width (Z), lower edge z, engagement over the holder's front face
    HOLD_POST=(4.0, 8.0, 0.3),      # assumed: lid posts on the holder's end blocks (X thickness, Z width, clearance)
    CELL_RIB=(16.0, 3.0, 0.5),       # assumed: lid ribs in front of the cell (X length, Z width, clearance)
    HALL_PIN_D=3.1, HALL_PIN_X=3.2,  # assumed: TWO holes for 2.85 mm filament offcuts (6.0 to 6.5 long), one each side of the sensor's legs right behind its body: the legs pass between them, the 4.1 mm body cannot

    # ---- cleaning-mode button UNDER THE BASE (Owen: out of sight of the public, above the hook) ----------
    BTN16=(16.4, 18.2, 3.2, 16.0, 22.0, 3.2),   # Owen's caliper photos of his Gebildet 16 mm button (scaled off its own M16 thread): hole for the thread,
                             # head dia, head height, body dia, nut across corners, nut thickness
    BTN16_METAL_L=15.0,      # Owen's photo: threaded metal body behind the head
    BTN16_SOCKET_L=25.6,     # Owen's photo: the blue plug-in wire socket that pushes onto the button's pins (five wires leave its end)
    BTN16_PINS_L=7.5,        # ASSUMED, NOT MEASURED: bare pins if the socket is left off and the wires are soldered on (they are hidden inside the socket in the photo)
    BTN16_USE_SOCKET=True,   # True keeps the plug-in socket (no soldering at the button, swap a button by unplugging). False leaves 18.1 mm less behind
                             # the head, and because H_BASEMENT is rounded up to a whole millimetre the box comes out 19 mm shorter (152 tall)
    BTN16_XY=(83.8, 21.3),   # assumed: through the bottom wall behind the right latch arm, clear of the hook channel strip (x 30..70) and of the rounded inside corner at the side wall
    BTN16_WIRE=6.0,          # assumed: room above the socket for the five wires to turn
    BTN16_ON=True,           # False builds the box without the button or the basement (the old 130 mm tall box)
                             # Fitting: bare button up through the hole from below, nut on from inside, then the blue socket onto its pins from inside
                             # (the socket will not pass through the hole). Of the socket's five wires only the two switch wires go to the board.
                             # Firmware: TEST_BUTTON_PIN = 3 in firmware/include/pinout.h is RESERVED as the cleaning-mode trigger, and
                             # firmware/src/hanger/hanger.cpp sets the pin as an input with pull-up, but the hanger loop does not act on a press
                             # yet, so no document may tell the builder to check for "cleaning mode". The wiring check is a meter continuity test.
                             # The button's LED voltage is NOT known: nothing here or in the README states one.

    # ---- Gateway ----------------------------------------------------------------------
    G_W=120.0, G_H=80.0, G_D=30.0,    # assumed
    G_BRD_X0=46.0, G_BRD_ZC=42.0, G_PCB_TOP_Y=7.5,   # assumed
    G_SMA=(104.0, 15.0), SMA_HOLE_D=6.5, SMA_FLAT=6.0, SMA_PAD_D=14.0, SMA_WALL=3.0,   # datasheet D-hole
    G_CABLE_ZC=42.0, G_CABLE_D=4.5, G_CABLE_NOTCH_W=7.0,   # assumed cable
    G_SADDLE=(4.5, 14.0, 9.5),        # assumed tie saddle x0, x1, front face Y (behind the plug overmold)
    G_KEYHOLES=((25.0, 62.0), (95.0, 62.0)), G_LOWER_SCREW=(60.0, 16.0),   # assumed (screw positions)
    G_VENT=dict(len=8.0, w=2.0, pitch=8.0, n=5, bot_x0=72.0, top_x0=16.0, ys=(13.0, 18.0, 23.0)),
    G_BTN_KO=(25.0, 15.0, 12.5),      # assumed knock-out for a 12 mm panel button on GPIO3
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
def btn16_len():
    """Length behind the button's head: metal body plus the plug-in socket (or the bare pins)."""
    return P["BTN16_METAL_L"] + (P["BTN16_SOCKET_L"] if P["BTN16_USE_SOCKET"] else P["BTN16_PINS_L"])

def _apply_basement():
    """The battery holder sits 7 mm above the bottom wall across nearly the full width, and the button is far longer than
    that. So the box grows DOWNWARD by H_BASEMENT: every hanger feature keeps its place relative to the top, and the button
    gets an empty bay under the battery. One number (the button's length) sets it."""
    if not P.get("BTN16_ON"):
        P["H_BASEMENT"] = 0.0
        return
    blen = btn16_len()
    need = (blen - P["WALL"]) + P["BTN16_WIRE"]                       # clear height wanted above the bottom wall's inner face
    have = (P["HOLDER_Z0"] - P["HOLDER_CLR"] - P["HOLDER_RIB_T"]) - P["WALL"]   # what is there now, under the holder's locating rib
    b = float(max(0, math.ceil(need - have)))
    P["H_BASEMENT"] = b
    for k in ("H_H", "H_BRD_ZC", "HOLDER_Z0", "BP_H", "CATCH_Z0", "ANT_SHELF_Z", "ANT_CLIP_Z"):
        P[k] += b
    P["BULK_Z"] = tuple(z + b for z in P["BULK_Z"])
    P["PEG_ZS"] = tuple(z + b for z in P["PEG_ZS"])
    P["SADDLES"] = tuple((x, z + b) for (x, z) in P["SADDLES"])
    a = P["HOLDER_ARM"]; P["HOLDER_ARM"] = (a[0], a[1], a[2] + b, a[3])
    l = P["H_LOGO"]; P["H_LOGO"] = (l[0], l[1] + b, l[2])
    w = P["H_WORDMARK"]; P["H_WORDMARK"] = (w[0], w[1] + b, w[2], w[3])
_apply_basement()

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
    if P.get("COIL"):                                   # Owen's boards: WiFi coil antenna standing beside the display
        kx, ky, kd, kh = P["COIL"]
        parts.append(cq.Workplane("XY").circle(kd / 2).extrude(kh).translate((kx, ky, 0)))
    return b2w(union_all(parts), x0, zc, pcb_top_y)

def board_cradle(x0, zc, pcb_top_y, y_back, x_wall_inner, setback=None):
    """Screwless cradle for the Heltec V3: a ledge under each long edge (the board rests on it),
    pocket side walls, an end stop at the antenna tip, corner stops at the USB end. The J3 (+Z, PRG)
    ledge has gaps at the wire pads (GND, 3V3, GPIO3, GPIO6). A notch in the J2 (-Z) wall lets the
    battery lead and the Hall wires out from under the board."""
    L, clr = P["BRD_L"], P["BRD_CLR"]
    hw = P["BRD_W"] / 2 + clr                     # pocket half height (Z)
    pcb_bot = pcb_top_y + P["BRD_T"]
    y_lip = max(pcb_top_y - P["RAIL_LIP_ABOVE"], 0.5)      # pocket walls rise above the PCB top but stop 0.5 under the lid
    wt = P["POCKET_WALL_T"]
    x_start = max(x0 - (setback if setback is not None else P["USB_SETBACK"]), x_wall_inner + P["TONGUE_T"] + P["TONGUE_CLR"] + 0.3)
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
        parts.append(box(xs0, x0 - clr, max(pcb_top_y, P["TONGUE_H"] + 0.4), y_back + EPS, z0, z1))   # starts below the lid's lip
    # catches: a 45 deg barb on each pocket wall's inner face hooks over the PCB's long edge, so the board stays in
    # with the lid off. Push the board straight in to fit it; lever one edge out with a fingernail to remove it.
    e, bl, xb3, xb2 = P["BRD_BARB"]
    b = e + clr
    yc = pcb_top_y - 0.05 - e
    for (zf, sgn, xb) in ((zc + hw, -1, xb3), (zc - hw, 1, xb2)):
        parts.append(prism_yz([(yc + b, zf - sgn * EPS), (yc, zf + sgn * b), (yc - 0.4, zf + sgn * b), (yc - 0.4 - 1.25 * b, zf - sgn * EPS)], x0 + xb, x0 + xb + bl))
    cradle = union_all(parts)
    # lead notch through the J2 wall + ledge, leaving the front part of the wall as a bridge
    n0, n1 = P["LEAD_NOTCH"]
    cradle = cradle.cut(box(x0 + n0, x0 + n1, pcb_bot + 5.0, y_back + 1, zc - hw - wt - 1, zc - hw + P["RAIL_W"] + 1))
    return cradle

def lid_header_ribs(x0, zc, pcb_top_y):
    """Ribs on the lid inner face bearing on the header pad strips (no headers fitted). Both start at Xb 13, clear of
    the button pads. The J3 rib stops at Xb 34 so it clears the wire solder joints; the J2 rib runs on to Xb 44. Each
    has a gap where the board catch on the pocket wall stands."""
    hw = P["BRD_W"] / 2 + P["BRD_CLR"]
    z_out = hw - P["POCKET_WALL_T"] * 0 - 0.3      # rib outer edge, 0.3 inside the pocket wall
    y1 = pcb_top_y - P["LID_RIB_CLR"]
    w = P["LID_RIB_W"]
    e, bl, xb3, xb2 = P["BRD_BARB"]
    def rib(xa, xb, z0, z1, gap0):
        r = box(x0 + xa, x0 + xb, -EPS, y1, z0, z1)
        return r.cut(box(x0 + gap0 - 1.0, x0 + gap0 + bl + 1.0, -1, y1 + 1, z0 - 1, z1 + 1))     # clear of the board catch
    j2 = rib(13.0, 44.0, zc - z_out, zc - z_out + w, xb2)      # starts clear of the button pads
    j3 = rib(13.0, 34.0, zc + z_out - w, zc + z_out, xb3)
    return j2.union(j3)

def lid_board_features(lid, x0, zc, pcb_top_y, lid_t, flush=False, vertical=None):
    """Common lid features over the board. Both lids: the display window with a 45 deg chamfer round its outside, the
    two button pads and the open LED light hole (lid_buttons). flush=True (hanger): the display module itself sits in a
    pocket behind a BEZEL_T skin, with a relief for the coil antenna (and for the USB-C shell and the mated U.FL plug, cut
    only if they would reach the lid); no insert, no cleats. flush=False (gateway): a pocket inside the lid with two cleats that hold a clear window insert."""
    cx = x0 + P["OLED_ACT_CX"]
    cz = zc + P["OLED_ACT_CY"]
    ww, wh = P["WIN_W"], P["WIN_H"]
    lid = lid.cut(box(cx - ww / 2, cx + ww / 2, -lid_t - 1, 1, cz - wh / 2, cz + wh / 2))
    # true 45 deg chamfer 0.6 deep round the outside of the window (self-supporting face down; the old square rebate left a
    # one-layer flash ring round the display)
    c = 0.6
    cha = prism_yz([(-lid_t - 1, cz - wh / 2 - c - 1), (-lid_t - 1, cz + wh / 2 + c + 1), (-lid_t + c, cz + wh / 2), (-lid_t + c, cz - wh / 2)], cx - ww / 2 - c - 2, cx + ww / 2 + c + 2)
    chb = cq.Workplane("XY").polyline([(cx - ww / 2 - c - 1, -lid_t - 1), (cx + ww / 2 + c + 1, -lid_t - 1), (cx + ww / 2, -lid_t + c), (cx - ww / 2, -lid_t + c)]).close() \
        .extrude(wh + 2 * c + 4).translate((0, 0, cz - wh / 2 - c - 2))
    lid = lid.cut(cha.intersect(chb))
    if flush:
        # the display module itself sits in this pocket, its glass OLED_GAP behind a BEZEL_T front skin; no insert, no cleats
        iw, ih = P["OLED_POCKET"]
        px0 = cx - iw / 2
        if P.get("COIL"):
            # the coil antenna stands between the pads and the display, as tall as the display; where it sits ACROSS the board is
            # not known yet, so the pocket runs on to the pads' end slot over its whole height
            px0 = min(px0, x0 + P["BTN_PAD_X1"] + P["BTN_PAD"][5])
        lid = lid.cut(box(px0, cx + iw / 2, -lid_t + P["BEZEL_T"], 0.5, cz - ih / 2, cz + ih / 2))
        if P.get("COIL"):
            # review: over the coil's own stretch of the board the relief runs right out to the header ribs' inner faces, with
            # 0.5 mm of margin along the board, so the coil clears anywhere inboard of the header pad rows
            kx, ky, kd, kh = P["COIL"]
            zr = P["BRD_W"] / 2 + P["BRD_CLR"] - 0.3 - P["LID_RIB_W"]
            lid = lid.cut(box(x0 + kx - kd / 2 - 0.5, x0 + kx + kd / 2 + 0.5, -lid_t + P["BEZEL_T"], 0.5, zc - zr, zc + zr))
        # relief over the USB-C shell (3.25 above the PCB top) where it would touch the lid
        usb_top = pcb_top_y - 3.25 - 0.4
        if usb_top < 0:
            lid = lid.cut(box(x0 - 0.9, x0 + 8.2, usb_top, 0.5, zc - 5.2, zc + 5.2))
        # relief over the mated U.FL plug (socket + plug can reach 3.8 above the PCB top)
        ufl_top = pcb_top_y - (P["IPEX_H"] + P["UFL_PLUG_H"]) - 0.4
        if ufl_top < 0:
            ix, iz = x0 + P["IPEX"][0], zc + P["IPEX"][1]
            lid = lid.cut(box(ix - 4.0, ix + 4.0, ufl_top, 0.5, iz - 4.0, iz + 4.0))
    else:
        iw, ih, pd = P["INSERT_W"], P["INSERT_H"], P["INSERT_POCKET"]
        lid = lid.cut(box(cx - iw / 2, cx + iw / 2, -pd, 0.5, cz - ih / 2, cz + ih / 2))
        # cleats on the short pocket edges: insert flexes in under them
        c = P["INSERT_CLEAT"]
        for s in (-1, 1):
            xa, xb = sorted((cx + s * iw / 2, cx + s * (iw / 2 - c)))
            lid = lid.union(box(xa, xb, -pd + P["INSERT_T"] + 0.2, -pd + P["INSERT_T"] + 0.9, cz - 4.0, cz + 4.0))
    lid = lid_buttons(lid, x0, zc, pcb_top_y, lid_t, vertical, led_hole=P["H_LED_HOLE"] if flush else P["G_LED_HOLE"])
    return lid

def button_pads(x0, zc, vertical=None):
    """(name, pad x0, x1, z0, z1, pin x, pin z, hinge) for the two board buttons. hinge is 'x0' (hinge at the pad's left
    end, pad runs along X) or 'z0' / 'z1' (pad runs along Z, hinge at its far end from the board centreline)."""
    fw, fh = P["BTN_PAD"][0], P["BTN_PAD"][1]
    fx1 = x0 + P["BTN_PAD_X1"]
    out = []
    for name, (bx, bz) in (("PRG", P["PRG"]), ("RST", P["RST"])):
        sgn = 1 if bz > 0 else -1
        if vertical:
            vx0, vh, pd, pdx = vertical
            za, zb = sorted((zc + sgn * P["BTN_PAD_GAP"], zc + sgn * (P["BTN_PAD_GAP"] + vh)))
            out.append((name, vx0, fx1, za, zb, x0 + bx + pdx, zc + bz, "z1" if sgn > 0 else "z0"))
        else:
            za, zb = sorted((zc + sgn * P["BTN_PAD_GAP"], zc + sgn * (P["BTN_PAD_GAP"] + fh)))
            out.append((name, fx1 - fw, fx1, za, zb, x0 + bx, zc + bz, "x0"))
    return out

def lid_buttons(lid, x0, zc, pcb_top_y, lid_t, vertical=None, led_hole=True):
    """Two pads in the face. Each is a flap: a slot cut right through on three sides, a thin hinge on the fourth (it
    prints flat on the bed, so it bends along the layers), and a pin on the back that sits just over the small switch
    on the board. Pressing anywhere on the pad clicks the switch."""
    fw, fh, ft, ht, hl, sl = P["BTN_PAD"]
    pin_d = vertical[2] if vertical else P["BTN_PIN_D"]
    for (name, fx0, fx1, z0, z1, px, pz, hinge) in button_pads(x0, zc, vertical):
        lid = lid.cut(box(fx0 - (0 if hinge == "x0" else sl), fx1 + sl, -lid_t + ft, 1, z0 - (0 if hinge == "z0" else sl), z1 + (0 if hinge == "z1" else sl)))
        if hinge == "x0":
            lid = lid.cut(box(fx0, fx0 + hl, -lid_t + ht, 1, z0 - sl, z1 + sl))
            slots = [(fx1, fx1 + sl, z0 - sl, z1 + sl), (fx0, fx1 + sl, z0 - sl, z0), (fx0, fx1 + sl, z1, z1 + sl)]
        else:
            ha, hb = (z1 - hl, z1) if hinge == "z1" else (z0, z0 + hl)
            lid = lid.cut(box(fx0 - sl, fx1 + sl, -lid_t + ht, 1, ha, hb))
            fe = (z0 - sl, z0) if hinge == "z1" else (z1, z1 + sl)            # free end is the side nearer the board centreline
            za, zb = (z0 - sl, z1) if hinge == "z1" else (z0, z1 + sl)
            slots = [(fx0 - sl, fx1 + sl, fe[0], fe[1]), (fx0 - sl, fx0, za, zb), (fx1, fx1 + sl, za, zb)]
        for (xa, xb, zca, zcb) in slots:
            lid = lid.cut(box(xa, xb, -lid_t - 1, 1, zca, zcb))
        lid = lid.union(cyl_y(px, pz, pin_d, -lid_t + ft - EPS, pcb_top_y - P["BTN_H"] - P["BTN_PIN_GAP"]))
    # light hole over the status LEDs (the hanger has none: H_LED_HOLE)
    if led_hole:
        lid = lid.cut(cyl_y(x0 + P["LED"][0], zc + P["LED"][1], P["LED_HOLE_D"], -lid_t - 1, 1))
    return lid

def face_marks(W, lid_t, logo, wordmark, x0, zc, vertical=None):
    """Everything sunk into the face: the badge outline with its exclamation mark, the HazardLink wordmark and the two
    button names. Narrow strokes only, so they print cleanly on the bed; the same solids are the second-colour inlay."""
    y1 = -lid_t + P["MARK_DEPTH"]; y0 = -lid_t - 1.0
    bw, bh, br, bs, tilt = P["LOGO_BADGE"]
    ew, eh, ez, dd, dz = P["LOGO_BANG"]
    lx, lz, k = logo
    def rr(w, h, r):
        return box(-w / 2, w / 2, y0, y1, -h / 2, h / 2).edges("|Y").fillet(r)
    badge = rr(bw * k, bh * k, br * k).cut(rr((bw - 2 * bs) * k, (bh - 2 * bs) * k, max((br - bs) * k, 0.6)))
    bang = rr(ew * k, eh * k, ew * k / 2 - 0.05).translate((0, 0, ez * k))
    dot = cyl_y(0, dz * k, dd * k, y0, y1)
    mark = badge.union(bang).union(dot).rotate((0, 0, 0), (0, 1, 0), -tilt).translate((lx, 0, lz))
    def txt(s, x, z, h, halign="left", turn=0):
        t = cq.Workplane("XZ", origin=(0, y1, 0)).text(s, h, y1 - y0, halign=halign, valign="center", kind="bold")
        if turn:
            t = t.rotate((0, 0, 0), (0, 1, 0), -turn)
        return t.translate((x, 0, z))
    tx, tz, th, ta = wordmark
    mark = mark.union(txt("HazardLink", tx, tz, th, halign=ta))
    for (name, fx0, fx1, z0, z1, px, pz, hinge) in button_pads(x0, zc, vertical):
        if hinge == "x0":
            mark = mark.union(txt(name, (fx0 + P["BTN_PAD"][4] + fx1) / 2, (z0 + z1) / 2, 5.0, halign="center"))
        else:       # tall narrow pad: the name reads upward, placed toward the free end away from the hinge
            zm = (z0 + z1) / 2 + (-2.0 if hinge == "z1" else 2.0)
            lh, lx = P["BTN_LABEL"]
            mark = mark.union(txt(name, fx0 + lx, zm, lh, halign="center", turn=90))
    return mark

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

def arm_geom(root_x, direction):
    """X stations of one wall arm. direction +1: free end toward +X."""
    tip = root_x + direction * P["ARM_L"]
    slot_far = tip + direction * P["ARM_SLOT"]
    win_cx = tip - direction * P["ARM_WIN_FROM_TIP"]
    return dict(root=root_x, tip=tip, slot_far=slot_far, win_cx=win_cx, d=direction)

def lid_snap_features(lid, W, H, wall, arms, tab_xs):
    """Rigid hooks on the bottom edge (they drop into the windows of the body's wall arms) and two rigid hinge tabs on the
    top edge. Nothing on the lid flexes."""
    o = wall + P["TONGUE_CLR"]                      # tongue outer face (bottom edge at z=o, top edge at z=H-o)
    hw, ht, hl = P["HOOK_W"] / 2, P["HOOK_T"], P["HOOK_L"]
    cy, fl, bb = P["HOOK_CATCH_Y"], P["HOOK_FLAT"], P["HOOK_BARB"]
    for (rx, d) in arms:
        g = arm_geom(rx, d)
        x = g["win_cx"]
        post = box(x - hw, x + hw, -EPS, hl, o, o + ht)
        # barb under the post: flat catch face toward the lid (it bears on the window's front edge), ramp toward the box
        barb = prism_yz([(cy, o + EPS), (cy, o - bb), (cy + fl, o - bb), (hl, o + EPS)], x - hw, x + hw)
        gus = prism_yz([(-EPS, o + ht - EPS), (-EPS, o + ht + P["HOOK_GUSSET"]), (P["HOOK_GUSSET"], o + ht - EPS)], x - hw, x + hw)
        lid = lid.union(post).union(barb).union(gus)
    tab_top = H - wall - P["TONGUE_CLR"] - P["TONGUE_T"]        # contiguous with the tongue's inner face
    tab_bot = tab_top - P["TONGUE_T"] - 0.25
    nose_y0 = P["TAB_RIB_Y0"] + 2.5 + P["TAB_CLR"]              # behind the 2.5 mm cheek of the rib pocket
    nose_y1 = nose_y0 + P["TAB_NOSE_L"]
    nose_top = tab_top + P["TAB_NOSE"]
    for x in tab_xs:
        tab = box(x - P["TAB_W"] / 2, x + P["TAB_W"] / 2, -EPS, P["TAB_L"], tab_bot, tab_top)
        nose = prism_yz([(nose_y0, tab_top - EPS), (nose_y1, tab_top - EPS), (nose_y1, nose_top), (nose_y0 + P["TAB_NOSE"], nose_top)],
                        x - P["TAB_W"] / 2, x + P["TAB_W"] / 2)
        lid = lid.union(tab).union(nose)
    return lid

def body_snap_features(body, W, H, wall, y_back, arms, tab_xs):
    """Spring arms cut into the bottom wall (one slot along X behind the arm, one end slot; the arm runs out to the rim),
    each with a window for the lid's hook and a pull lip underneath; hinge ribs on the top wall."""
    aw, at, sl = P["ARM_W"], P["ARM_T"], P["ARM_SLOT"]
    ww, wy0, wy1 = P["ARM_WIN"]
    ty, tz = P["ARM_TAB"]
    ll, lp = P["ARM_LIP"]
    for (rx, d) in arms:
        g = arm_geom(rx, d)
        xa, xb = sorted((g["root"], g["slot_far"]))
        body = body.cut(box(xa, xb, aw, aw + sl, -1.0, wall + EPS))                       # slot behind the arm
        ea, eb = sorted((g["tip"], g["slot_far"]))
        body = body.cut(box(ea, eb, -1.0, aw + sl, -1.0, wall + EPS))                     # end slot out to the rim
        ta, tb = sorted((g["root"] + d * 3.0, g["tip"]))
        body = body.cut(box(ta, tb, -1.0, aw, -1.0, wall - at))                           # thin the arm from outside
        body = body.cut(box(g["win_cx"] - ww / 2, g["win_cx"] + ww / 2, wy0, wy1, -1.0, wall + EPS))   # window for the hook
        # lead-in chamfer on the rim's inner edge so the hook's ramp rides up the arm
        body = body.cut(prism_yz([(-0.1, wall + 0.1), (-0.1, wall - 0.8), (0.8, wall + 0.1)], ta, tb))
        # breakaway tab across the end slot at the arm's back edge: the arm's first layers bridge root to tab
        body = body.union(box(ea - EPS, eb + EPS, aw - ty, aw, wall - at + 0.3, wall - at + 0.3 + tz))
        # pull lip under the tip, 45 deg on the side that prints first
        la, lb = sorted((g["tip"] - d * 0.5, g["tip"] - d * (0.5 + ll)))
        z_out = wall - at
        body = body.union(prism_yz([(0.5, z_out + EPS), (0.5, -lp), (4.5, -lp), (4.5 + z_out + lp, z_out + EPS)], la, lb))
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
             x0=P["H_BRD_X0"], zc=P["H_BRD_ZC"],
             pcb_top=-lt + P["BEZEL_T"] + P["OLED_GAP"] + P["OLED_H_MAX"])       # glass (at most OLED_H_MAX above the PCB) just behind the bezel
    g["bulk"] = P["BULK_Z"]
    g["holder_back"] = g["y_back"] - P["HOLDER_STANDOFF"]            # the holder's pin side rests here, on standoff ribs
    g["holder_front"] = g["holder_back"] - P["HOLDER_H"]
    g["cell_y"] = g["holder_back"] - P["HOLDER_H"] / 2 - 0.5        # cell axis
    # the wall face is at Y = D + BP_T; the bar runs from there forward to the lip
    g["wall_y"] = D + P["BP_T"]
    g["bar_x0"] = W / 2 - P["BAR_W"] / 2
    g["bar_x1"] = W / 2 + P["BAR_W"] / 2
    g["web_x0"] = W / 2 - P["WEB_W"] / 2
    g["web_x1"] = W / 2 + P["WEB_W"] / 2
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
    # Hall sensor under the saddle floor, entered from the bar's back end (under the body): a tunnel for the legs and the
    # soldered joints, and at its front a snug nest that holds the flat package right up under the saddle (nearest the magnet)
    pw, pl, pt = P["HALL_PKG"]
    ncs, ncf, ncz = P["HALL_NEST_CLR"]
    g["slot_ceil"] = g["saddle_floor"] - P["HALL_SKIN"]
    g["slot_floor"] = g["slot_ceil"] - P["HALL_SLOT_H"]
    g["slot_hw"] = P["HALL_TUNNEL_W"] / 2
    g["sensor_y"] = g["saddle_y"]
    g["nest_hw"] = pw / 2 + ncs
    g["nest_floor"] = g["slot_ceil"] - pt - 2 * ncz
    g["nest_y_back"] = g["sensor_y"] + pl / 2
    g["slot_y_front"] = g["sensor_y"] - pl / 2 - ncf
    g["sensor_z"] = g["slot_ceil"] - ncz - pt / 2
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
    # lead notches at both ends of the bulkhead for the two battery wires. Each is cut only from Y=12 back to the back wall, so
    # the front 12 mm of the bulkhead closes it (a 7.5 mm bridge when printed): it is a CLOSED hole, 7.5 mm wide. The battery
    # cable is one 2-pin plug with two loose ends, so the loose ends are fed DOWN through these notches BEFORE they are
    # soldered to the holder; once both are soldered the cable is a closed loop and cannot be threaded (README, step 4).
    for (nx0, nx1) in ((wall - 1, wall + 7.5), (W - wall - 7.5, W - wall + 1)):
        body = body.cut(box(nx0, nx1, 12.0, yb + 1, bz0 - 1, bz1 + 1))
    # sensor lead goes straight up: a slot through the bulkhead right above the slot in the channel roof
    sx0, sx1, sy0, sy1 = P["BULK_LEAD_SLOT"]
    body = body.cut(box(sx0, sx1, sy0, sy1, bz0 - 1, bz1 + 1))
    # snap-fit lid: spring arms with hook windows and pull lips in the bottom wall, hinge ribs with nose pockets on the top wall
    body = body_snap_features(body, W, H, wall, yb, P["H_ARMS"], P["H_TAB_XS"])
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
    body = body.union(board_cradle(g["x0"], g["zc"], g["pcb_top"], yb, wall, setback=P["USB_SETBACK"]))
    # BH18650-PC2 holder bay: ribs HOLDER_RIB_T (3 mm) thick and HOLDER_RIB_H (12 mm) tall, lead gaps in both end ribs, ends of the top rib open
    hx0 = P["HOLDER_X0"] - P["HOLDER_CLR"]; hx1 = P["HOLDER_X0"] + P["HOLDER_L"] + P["HOLDER_CLR"]
    hz0 = P["HOLDER_Z0"] - P["HOLDER_CLR"]; hz1 = P["HOLDER_Z0"] + P["HOLDER_W"] + P["HOLDER_CLR"]
    rt, rh, gap = P["HOLDER_RIB_T"], P["HOLDER_RIB_H"], P["HOLDER_LEAD_GAP"]
    zm = (hz0 + hz1) / 2
    rib_z0 = (wall - EPS) if not P["H_BASEMENT"] else hz0 - rt       # with a basement the ribs become a shelf off the back wall
    for (xa, xb) in ((hx0 - rt, hx0), (hx1, hx1 + rt)):
        body = body.union(box(xa, xb, yb - rh, yb + EPS, rib_z0, zm - gap / 2))
        body = body.union(box(xa, xb, yb - rh, yb + EPS, zm + gap / 2, hz1 + rt))
    body = body.union(box(hx0 - rt, hx1 + rt, yb - rh, yb + EPS, rib_z0, hz0))
    body = body.union(box(hx0 + 10.0, hx1 - 10.0, yb - rh, yb + EPS, hz1, bz0 + EPS))
    # standoff ribs: the holder's underside (with its two solder pins, one at each end) stands HOLDER_STANDOFF off the back wall on
    # three cross ribs; the pins and the wires soldered to them live in the gap and leave through the end-rib gaps
    for fx in (0.22, 0.5, 0.78):
        rx = hx0 + fx * (hx1 - hx0)
        body = body.union(box(rx - 1.5, rx + 1.5, g["holder_back"], yb + EPS, hz0, hz1))
    # snap arms at both ends of the holder: each rises from the back wall beside the holder's end face and hooks 0.8 mm over
    # its front face with a 45 deg barb, so the holder stays in with the lid off. Press the holder straight in to fit it.
    at, aw, az0, ae = P["HOLDER_ARM"]
    holder_front = g["holder_front"]
    ab = ae + P["HOLDER_CLR"]
    ayc = holder_front - 0.05 - ae
    for (xf, sgn) in ((hx0, 1), (hx1, -1)):                    # xf = arm's inner face, sgn = direction the barb points
        # review: the arm stood inside the 3 mm end rib, which made its back 12 mm rigid. Slot it free above and below for
        # the rib's full height and thin the rib behind it, leaving only a short root block at the back wall.
        ra, rb = sorted((xf, xf - sgn * rt))
        body = body.cut(box(ra - EPS, rb + EPS, yb - rh - EPS, yb, az0 - 1.0, az0))
        body = body.cut(box(ra - EPS, rb + EPS, yb - rh - EPS, yb, az0 + aw, az0 + aw + 1.0))
        oa, ob = sorted((xf - sgn * at, xf - sgn * rt))
        body = body.cut(box(oa, ob, yb - rh - EPS, yb - P["HOLDER_ARM_ROOT"], az0 - EPS, az0 + aw + EPS))
        xa, xb = sorted((xf, xf - sgn * at))
        body = body.union(box(xa, xb, ayc - 0.4 - 1.25 * ab - 0.5, yb + EPS, az0, az0 + aw))
        pts = [(xf - sgn * EPS, ayc + ab), (xf + sgn * ab, ayc), (xf + sgn * ab, ayc - 0.4), (xf - sgn * EPS, ayc - 0.4 - 1.25 * ab)]
        body = body.union(cq.Workplane("XY").polyline(pts).close().extrude(aw).translate((0, 0, az0)))
    # antenna inside the box, upright on the right: the SMA jack's neck slides into a slotted shelf from the front (nut and
    # washer off first) and its own nut clamps it (flange under the shelf, washer and nut on top); the antenna body snaps
    # into a C-clip above
    ax, ay, ad = P["ANT_X"], P["ANT_Y"], P["ANT_D"]
    sz, st_ = P["ANT_SHELF_Z"], P["ANT_SHELF_T"]
    shelf = box(ax - 8.0, W - wall + EPS, ay - 9.5, yb + EPS, sz, sz + st_)
    shelf = shelf.cut(box(ax - P["ANT_SLOT_W"] / 2, ax + P["ANT_SLOT_W"] / 2, ay - 11.0, ay, sz - 1, sz + st_ + 1))
    shelf = shelf.cut(cyl_z(ax, ay, P["ANT_SLOT_W"], sz - 1, sz + st_ + 1))
    body = body.union(shelf)
    cz_ = P["ANT_CLIP_Z"]
    clip = box(ax - ad / 2 - 2.5, ax + ad / 2 + 2.5, ay - ad / 2 - 2.0, yb + EPS, cz_ - 3, cz_ + 3)
    clip = clip.cut(cyl_z(ax, ay, ad + 0.6, cz_ - 4, cz_ + 4))
    clip = clip.cut(box(ax - (ad - 0.6) / 2, ax + (ad - 0.6) / 2, ay - ad, ay, cz_ - 4, cz_ + 4))
    body = body.union(clip)
    # cable tie saddle on the back wall for the lead bundle (tie tunnel along X)
    for (sx_, sz_) in P["SADDLES"]:
        body = body.union(tie_saddle(sx_, sz_, yb, along="X"))
    # USB-C opening in the left wall, USB_SLOT_W x USB_SLOT_H (14.0 x 8.0) with rounded corners and a 1 mm stepped lead-in outside
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
    # lead slot goes up through the channel roof UNDER the holder (slot Y 6.5..10.5, holder front face Y=6.2), so the
    # leads have to be fed up and folded forward before the holder is pressed in.
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
    # cleaning-mode button: a plain round hole through the bottom wall, behind the right latch arm and clear of the channel
    # strip; the button goes up through it from below and its own nut clamps it from inside
    if P["BTN16_ON"]:
        bx_, by_ = P["BTN16_XY"]
        body = body.cut(cyl_z(bx_, by_, P["BTN16"][0], -1.0, wall + 1.0))
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
    uw = P["USB_SLOT_W"] / 2
    cutouts = ((-1, 6, bz0 - 0.5, bz1 + 0.5), (W - 6, W + 1, bz0 - 0.5, bz1 + 0.5),
               (-1, 5.0, g["zc"] - P["BRD_W"] / 2 - 1.3, g["zc"] + P["BRD_W"] / 2 + 1.3),   # lip cut away along the board's end (the PCB reaches into the lip's depth) and the USB-C opening
               (5.0, W - 5.0, H - wall - P["TONGUE_CLR"] - P["TONGUE_T"] - 0.5, H + 1))   # top segment relieved: the tabs locate the top edge and the lid must pivot there
    lid = lid.union(lid_tongue(W, H, wall, (), cutouts))
    # USB-C with the lid on: the plug's overmold runs 0.75 mm into the lid's thickness, so the lid edge is hollowed from
    # behind over the opening, leaving USB_LID_SKIN (1.4 mm) of face skin over the plug
    lid = lid.cut(box(-1, wall + 0.6, -lt + P["USB_LID_SKIN"], 1, g["zc"] - uw, g["zc"] + uw))
    lid = lid_snap_features(lid, W, H, wall, P["H_ARMS"], P["H_TAB_XS"])
    lid = lid.union(lid_header_ribs(g["x0"], g["zc"], g["pcb_top"]))
    lid = lid_board_features(lid, g["x0"], g["zc"], g["pcb_top"], lt, flush=True, vertical=P["H_PAD_V"])
    # battery retention: two posts bear on the holder's end blocks and two ribs sit just in front of the cell, so neither
    # can move toward the lid. The middle (x 40..60) stays clear for the Hall leads rising from the bar channel.
    hx0, hl = P["HOLDER_X0"], P["HOLDER_L"]
    hzc = P["HOLDER_Z0"] + P["HOLDER_W"] / 2
    holder_front = g["holder_front"]
    pt_, pw_, pc_ = P["HOLD_POST"]
    for cx in (hx0 + 1.5, hx0 + hl - 1.5):
        lid = lid.union(box(cx - pt_ / 2, cx + pt_ / 2, -EPS, holder_front - pc_, hzc - pw_ / 2, hzc + pw_ / 2))
    cell_front = g["cell_y"] - P["CELL_D"] / 2
    rl, rw, rc = P["CELL_RIB"]
    for xa in (hx0 + 12.0, hx0 + hl - 12.0 - rl):
        lid = lid.union(box(xa, xa + rl, -EPS, cell_front - rc, hzc - rw / 2, hzc + rw / 2))
    return lid.cut(hanger_marks())

def build_hanger_window_gauge():
    """Small test piece that proves the screen lines up BEFORE a full lid is printed: the part of the hanger lid round the
    display window and the two button pads, plus low fences on its inside that hold the board exactly where the body's
    cradle will hold it. Lay the board in face down, turn it over and look: the whole picture must sit inside the window.
    It also proves the display and coil fit under the bezel (the board must lie flat on the two ribs, not rock) and that
    the PRG and RST pads click their switches. Prints face down like the lid, no support."""
    g = hanger_geom()
    x0, zc, pt, lt = g["x0"], g["zc"], g["pcb_top"], g["lid_t"]
    lid = build_hanger_lid()
    keep = box(-1, x0 + P["BRD_L"] + 6.0, -lt - 1, pt + 3.0, zc - 18.5, zc + 18.5).union(
           box(-1, 15.9, -lt - 1, pt + 3.0, zc - 21.5, zc + 21.5))                 # the pad column is taller than the board strip
    piece = lid.intersect(keep)
    piece = cq.Workplane("XY").add(max(piece.solids().vals(), key=lambda sol: sol.Volume()))
    clr, ft = P["BRD_CLR"], 1.6
    top = pt + P["BRD_T"] + 0.6
    hw = P["BRD_W"] / 2 + clr
    fences = []
    for sgn in (-1, 1):
        za, zb = sorted((zc + sgn * hw, zc + sgn * (hw + ft)))
        fences.append(box(x0 + 17.0, x0 + P["BRD_L"] - 4.5, -EPS, top, za, zb))       # along each long edge, clear of the pad slots and the far corners
        ea, eb = sorted((zc + sgn * 7.5, zc + sgn * 10.4))
        fences.append(box(x0 - clr - ft, x0 - clr, -EPS, top, ea, eb))              # stops for the USB end, either side of the socket
    return piece.union(union_all(fences))

def hanger_marks():
    g = hanger_geom()
    return face_marks(g["W"], g["lid_t"], P["H_LOGO"], P["H_WORDMARK"], g["x0"], g["zc"], vertical=P["H_PAD_V"])

def gateway_marks():
    g = gateway_geom()
    return face_marks(g["W"], g["lid_t"], P["G_LOGO"], P["G_WORDMARK"], g["x0"], g["zc"])

def inlay_of(marks, W, H, lid_t):
    """The second-colour body: the marks, trimmed to the MARK_DEPTH (0.6 mm) they occupy in the face."""
    return marks.intersect(box(-1, W + 1, -lid_t, -lid_t + P["MARK_DEPTH"], -1, H + 1))

def build_hanger_bar():
    """Slide-in hanging bar (no screws), T-shaped: a narrow dovetail plate and web join it to the body, and a WIDE bar
    below spans the sign's hand hole, so the sign hangs level and cannot slide sideways off the sensor. Saddle along the
    full width, upturned lip at the front, and a bare Hall sensor in a snug nest under the middle of the saddle, reached
    by a tunnel from the bar's back face and kept there by two filament pins. Prints UPRIGHT on the bar's bottom face
    with NO support at all: every bending load is then in-plane, the 45 deg dovetail flanks and the 45 deg spreaders
    are self-supporting, and a 45 deg gusset off the web carries the front of the dovetail plate. Support must never be
    generated inside the sensor tunnel, the nest or the pin holes: it could not be got out again."""
    g = hanger_geom()
    bx0, bx1, wx0, wx1, W = g["bar_x0"], g["bar_x1"], g["web_x0"], g["web_x1"], g["W"]
    w0, w1 = g["plate_w0"] / 2, g["plate_w1"] / 2
    plate = prism_xz([(W / 2 - w0, g["plate_z0"]), (W / 2 + w0, g["plate_z0"]), (W / 2 + w1, g["plate_z1"]), (W / 2 - w1, g["plate_z1"])],
                     g["plate_y0"], g["plate_y1"])
    web = box(wx0, wx1, g["web_y0"], g["web_y1"], g["bar_top"] - EPS, g["plate_bot"] + EPS)
    bar = box(bx0, bx1, g["lip_front"], g["bar_back"], g["bar_bot"], g["bar_top"])
    lip = box(bx0, bx1, g["lip_front"], g["lip_back"], g["bar_bot"], g["lip_top"])
    part = plate.union(web).union(bar).union(lip)
    # the front of the dovetail plate overhangs the BAR (not the bed) when printed upright, where bed supports cannot reach:
    # a 45 deg gusset off the web carries it, so the part prints with no support at all
    gh = g["web_y0"] - g["plate_y0"]
    part = part.union(prism_yz([(g["web_y0"] + EPS, g["plate_bot"] + EPS), (g["plate_y0"], g["plate_bot"] + EPS), (g["web_y0"] + EPS, g["plate_bot"] - gh)], wx0, wx1))
    # spreaders each side of the web carry the wide bar back into the web
    sp = P["BAR_SPREAD"]
    for sgn, xe in ((-1, wx0), (1, wx1)):
        part = part.union(prism_xz([(xe - sgn * EPS, g["bar_top"] - EPS), (xe + sgn * sp, g["bar_top"] - EPS), (xe - sgn * EPS, g["bar_top"] + sp)],
                                   g["web_y0"], g["web_y1"]))
    # gussets: where the web meets the bar (web edges), and at the lip root (bar ends and either side of the middle)
    gw, gl = P["BAR_GUSSET_W"], P["BAR_GUSSET"]
    for (gx0, gx1) in ((wx0, wx0 + gw), (wx1 - gw, wx1)):
        part = part.union(prism_yz([(g["web_y0"] + EPS, g["bar_top"] - EPS), (g["web_y0"] - gl, g["bar_top"] - EPS), (g["web_y0"] + EPS, g["bar_top"] + gl)], gx0, gx1))
    for (gx0, gx1) in ((bx0, bx0 + gw), (bx1 - gw, bx1), (wx0 - gw, wx0), (wx1, wx1 + gw)):
        part = part.union(prism_yz([(g["lip_back"] - EPS, g["bar_top"] - EPS), (g["lip_back"] + gl, g["bar_top"] - EPS), (g["lip_back"] - EPS, g["bar_top"] + gl)], gx0, gx1))
    # saddle across the bar's full width (the handle settles here by gravity)
    sw, sd = P["BAR_SADDLE_W"], P["BAR_SADDLE_D"]
    part = part.cut(box(bx0 - 1, bx1 + 1, g["saddle_y"] - sw / 2, g["saddle_y"] + sw / 2, g["saddle_floor"], g["bar_top"] + 1))
    # Hall sensor: tunnel from the bar's back face forward to the back of the package, a 45 deg ramp up, then the nest.
    # The ROOF (slot_ceil) is one level from the bar's back face to the front of the nest; only the floors step and ramp.
    # So the easy way in is with the bar held upside down: the sensor slides along the roof, nothing to climb. The only
    # break in the roof is the first stage of the pin holes (further down): a slot one 0.2 mm layer deep, just short of the nest.
    hw, nw = g["slot_hw"], g["nest_hw"]
    step = g["nest_floor"] - g["slot_floor"]
    yb0, yf = g["nest_y_back"], g["nest_y_back"] + P["HALL_FUNNEL_Y"]
    part = part.cut(box(W / 2 - hw, W / 2 + hw, yf, g["bar_back"] + 1, g["slot_floor"], g["slot_ceil"]))
    # last stretch before the nest: floor ramps up 45 deg and the side walls close in from the tunnel width to the nest width
    approach = box(W / 2 - hw, W / 2 + hw, yb0 + step, yf + EPS, g["slot_floor"], g["slot_ceil"]).union(
        prism_yz([(yb0 - EPS, g["nest_floor"]), (yb0 + step + EPS, g["slot_floor"]), (yb0 + step + EPS, g["slot_ceil"]), (yb0 - EPS, g["slot_ceil"])], W / 2 - hw, W / 2 + hw))
    funnel = cq.Workplane("XY").polyline([(W / 2 - nw, yb0 - 2 * EPS), (W / 2 + nw, yb0 - 2 * EPS), (W / 2 + hw, yf + 2 * EPS), (W / 2 - hw, yf + 2 * EPS)]).close() \
        .extrude(g["slot_ceil"] - g["slot_floor"] + 2.0).translate((0, 0, g["slot_floor"] - 1.0))
    part = part.cut(approach.intersect(funnel))
    part = part.cut(box(W / 2 - nw, W / 2 + nw, g["slot_y_front"], yb0 + EPS, g["nest_floor"], g["slot_ceil"]))
    # lead route: tunnel along the bar behind the saddle; then a groove up the BACK of the web that is open so the wires
    # simply lay in (one short closed band keeps them there); then a groove along the top of the plate to the roof slot
    cw2 = P["BAR_WIRE_W"] / 2 - 1
    ty0 = g["saddle_y"] + sw / 2
    tstep = g["slot_floor"] - g["wire_z0"]          # the deeper wire trench ends in a 45 deg ramp too, so nothing pushed along it meets a square step
    part = part.cut(box(W / 2 - cw2, W / 2 + cw2, ty0 + tstep, g["bar_back"] + 1, g["wire_z0"], g["slot_ceil"]))
    part = part.cut(prism_yz([(ty0 - EPS, g["slot_floor"]), (ty0 + tstep + EPS, g["wire_z0"]), (ty0 + tstep + EPS, g["slot_ceil"]), (ty0 - EPS, g["slot_ceil"])], W / 2 - cw2, W / 2 + cw2))
    band0, band1 = P["WEB_BAND"]
    for (za, zb) in ((g["wire_z0"], band0), (band1, g["plate_z1"] + 1)):
        part = part.cut(box(W / 2 - cw2, W / 2 + cw2, g["web_y0"] + 2.5, g["web_y1"] + 1, za, zb))
    part = part.cut(box(W / 2 - cw2, W / 2 + cw2, g["web_y0"] + 2.5, g["web_y1"] - 2.5, band0 - EPS, band1 + EPS))
    wy0, wy1 = P["BAR_WIRE_Y"]
    part = part.cut(box(W / 2 - cw2, W / 2 + cw2, wy0 + 0.5, g["plate_y1"] + 1, g["plate_z1"] - 1.5, g["plate_z1"] + 1))
    # retaining pins: two offcuts of 2.85 mm filament, 6.0 to 6.5 mm long, stand right behind the package, one each side of its
    # legs, so the sensor cannot slide back out of its nest. They drop into holes in the saddle floor (6.6 mm deep, so a pin
    # never stands proud of the saddle) and the sign's handle sits over them.
    # The holes cross the tunnel's bridged roof. So that roof still prints cleanly, the hole opens in stages (the usual FDM
    # trick): first roof layer = one slot right across, so its bridge lines run wall to wall; second = a square, bridged
    # the short way; round from the third layer up. Nothing has to be drilled. A 2 mm hole under each pin, through the
    # bar's underside, lets it be pushed out with a 1.5 mm rod and drains the cavity. That 2 mm hole is also the ledge the
    # pin stands on, and the ledge is thin (bar bottom to pin hole bottom = 1.4 mm). "Stop by feel" is not safe: a 3 mm drill
    # used to ease a tight pin hole gets a flag of tape 6 mm from its tip, is twisted by hand only, and stops when the tape
    # reaches the saddle floor (the README and the bar drawing say so).
    pd, lay = P["HALL_PIN_D"], 0.2
    pins = hall_pin_xys(g)
    sxw = max(hw, P["HALL_PIN_X"] + pd / 2)
    part = part.cut(box(W / 2 - sxw, W / 2 + sxw, pins[0][1] - pd / 2, pins[0][1] + pd / 2, g["slot_ceil"] - EPS, g["slot_ceil"] + lay))
    for (px_, py_) in pins:
        part = part.cut(cyl_z(px_, py_, pd, g["slot_floor"] - 2.0, g["slot_ceil"]))
        part = part.cut(box(px_ - pd / 2, px_ + pd / 2, py_ - pd / 2, py_ + pd / 2, g["slot_ceil"] + lay - EPS, g["slot_ceil"] + 2 * lay))
        part = part.cut(cyl_z(px_, py_, pd, g["slot_ceil"] + 2 * lay - EPS, g["saddle_floor"] + 1.0))
        part = part.cut(cyl_z(px_, py_, P["HALL_PIN_PUSH_D"], g["bar_bot"] - 1.0, g["slot_floor"] - 2.0 + EPS))
    return part

def hall_pin_xys(g):
    """Pin centres: each pin's edge meets the package's rear corner 0.2 mm behind it."""
    pw = P["HALL_PKG"][0]
    r, dx = 2.85 / 2, P["HALL_PIN_X"] - pw / 2          # the PIN's radius (2.85 filament), not the hole's
    py = g["nest_y_back"] + 0.2 + math.sqrt(max(r * r - dx * dx, 0.0))
    return [(g["W"] / 2 + s * P["HALL_PIN_X"], py) for s in (-1, 1)]

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
    cy = g["cell_y"]
    holder = box(hx0, hx0 + hl, g["holder_front"], g["holder_back"], hz0, hz0 + hwd)
    # open-topped trough like the real holder; its sprung contacts take up the end play, so the trough is cell length + 1
    tx0, tx1 = hx0 + hl / 2 - P["CELL_L"] / 2 - 0.5, hx0 + hl / 2 + P["CELL_L"] / 2 + 0.5
    holder = holder.cut(cyl_x(cy, cz, P["CELL_D"] + 0.5, tx0, tx1))
    holder = holder.cut(box(tx0, tx1, g["holder_front"] - 1, cy, cz - (P["CELL_D"] + 0.5) / 2, cz + (P["CELL_D"] + 0.5) / 2))
    pin_in, pin_l, pin_w = P["HOLDER_PIN"]
    for pxh in (hx0 + pin_in, hx0 + hl - pin_in):
        holder = holder.union(box(pxh - pin_w / 2, pxh + pin_w / 2, g["holder_back"] - EPS, g["holder_back"] + pin_l, cz - pin_w / 2, cz + pin_w / 2))
    refs["holder"] = (holder, (0.15, 0.15, 0.15))
    cx = hx0 + hl / 2
    refs["cell"] = (cyl_x(cy, cz, P["CELL_D"], cx - P["CELL_L"] / 2, cx + P["CELL_L"] / 2), (0.20, 0.55, 0.85))
    # cleaning-mode button: head under the bottom wall, threaded metal body up through the hole, nut on the wall's inner
    # face, then the plug-in socket (or the bare pins) standing up into the bay under the battery
    if P["BTN16_ON"]:
        hole, hd, hh, bd, nut, nut_t = P["BTN16"]
        bx_, by_ = P["BTN16_XY"]
        btn = cyl_z(bx_, by_, hd, -hh, 0.0).union(cyl_z(bx_, by_, bd - 0.2, -EPS, P["BTN16_METAL_L"])).union(cyl_z(bx_, by_, nut, g["wall"], g["wall"] + nut_t))
        btn = btn.union(cyl_z(bx_, by_, 17.0 if P["BTN16_USE_SOCKET"] else 12.0, P["BTN16_METAL_L"] - EPS, btn16_len()))     # socket envelope, latch tab included
        refs["clean_button"] = (btn, (0.75, 0.75, 0.78))
    # bare flat Hall sensor (DRV5032FA, TO-92 style) in its nest under the saddle, marked face up toward the magnet, three legs running back
    pw, pl, pt = P["HALL_PKG"]
    lw, lp, ll = P["HALL_LEG"]
    sy, sz = g["sensor_y"], g["sensor_z"]
    carrier = box(W / 2 - pw / 2, W / 2 + pw / 2, sy - pl / 2, sy + pl / 2, sz - pt / 2, sz + pt / 2)
    for k in (-1, 0, 1):
        carrier = carrier.union(box(W / 2 + k * lp - lw / 2, W / 2 + k * lp + lw / 2, sy + pl / 2 - EPS, sy + pl / 2 + ll, sz - lw / 2, sz + lw / 2))
    refs["hall_carrier"] = (carrier, (0.05, 0.05, 0.05))
    refs["hall_pin"] = (union_all([cyl_z(px_, py_, 2.85, g["slot_floor"] - 2.0, g["saddle_floor"]) for (px_, py_) in hall_pin_xys(g)]), (0.9, 0.9, 0.9))
    # top of a folded sign (reference): a plate with a hand hole; the hole's top edge rests in the saddle and the bar
    # fills the hole's width, so the sign cannot slide sideways. Magnet in the underside of the handle, over the sensor.
    bar_bot = g["saddle_floor"] + P["TAG_CLR"]
    hole_w = P["BAR_W"] + P["SIGN_HOLE_CLR"]
    st = P["SIGN_T"] / 2
    bar = box(W / 2 - hole_w / 2 - 28, W / 2 + hole_w / 2 + 28, sy - st, sy + st, bar_bot - P["SIGN_HOLE_H"] - 14, bar_bot + P["HANDLE_H"])
    bar = bar.cut(box(W / 2 - hole_w / 2, W / 2 + hole_w / 2, sy - st - 1, sy + st + 1, bar_bot - P["SIGN_HOLE_H"], bar_bot))
    bar = bar.cut(cyl_z(W / 2, sy, P["MAGNET_D"] + 0.2, bar_bot - 1, bar_bot + P["TAG_WALL"] + P["MAGNET_T"]))
    refs["sign_handle"] = (bar, (0.95, 0.80, 0.10))
    refs["magnet"] = (cyl_z(W / 2, sy, P["MAGNET_D"], bar_bot + P["TAG_WALL"], bar_bot + P["TAG_WALL"] + P["MAGNET_T"]), (0.6, 0.6, 0.65))
    # SMA jack + stubby antenna, upright in the shelf and clip
    ax, ay, sz, st_ = P["ANT_X"], P["ANT_Y"], P["ANT_SHELF_Z"], P["ANT_SHELF_T"]
    top = sz + st_
    ant = cyl_z(ax, ay, 6.0, sz - 15.0, sz - 2.0)                      # jack rear body and cable boot
    ant = ant.union(cyl_z(ax, ay, 8.6, sz - 2.0, sz))                     # flange under the shelf
    ant = ant.union(cyl_z(ax, ay, 6.3, sz - EPS, top + 9.0))              # thread through the shelf
    ant = ant.union(cyl_z(ax, ay, 9.0, top + 0.05, top + 2.6))            # washer and nut on top of the shelf
    ant = ant.union(cyl_z(ax, ay, 9.2, top + 2.8, top + 12.5))            # the antenna's brass connector
    ant = ant.union(cyl_z(ax, ay, P["ANT_D"], top + 12.5, top + 2.8 + P["ANT_L"]))   # black body
    refs["stub_antenna"] = (ant, (0.2, 0.2, 0.2))
    # USB-C cable plugged in with the lid ON (proves the opening): 12.35 x 6.5 overmold (USB-IF maximum), its face 0.45 mm
    # short of the receptacle, 6.65 mm nose inside the receptacle. No window insert: the display's own glass is behind the bezel.
    uy = g["pcb_top"] - P["USB_OPEN_CY"]
    face = g["x0"] - P["USB_NOSE"] - 0.45
    plug = box(face - 24.0, face, uy - 3.25, uy + 3.25, g["zc"] - 6.175, g["zc"] + 6.175)
    plug = plug.union(box(face - EPS, face + 6.65, uy - 1.2, uy + 1.2, g["zc"] - 4.1, g["zc"] + 4.1))
    refs["usb_plug"] = (plug, (0.5, 0.5, 0.5))
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
    body = body_snap_features(body, W, H, wall, yb, P["G_ARMS"], P["G_TAB_XS"])
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
    lid = lid_snap_features(lid, W, H, wall, P["G_ARMS"], P["G_TAB_XS"])
    lid = lid.union(lid_header_ribs(g["x0"], g["zc"], g["pcb_top"]))
    lid = lid_board_features(lid, g["x0"], g["zc"], g["pcb_top"], lt)
    # knock-out for a 12 mm panel button on GPIO3 (factory reset), skin left outside
    bx, bz, bd = P["G_BTN_KO"]
    lid = lid.cut(cyl_y(bx, bz, bd, -lt + P["KNOCKOUT_SKIN"], 1))
    return lid.cut(gateway_marks())

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

def export_print_stl(print_dir, name, wp, orient, companion=None):
    """STL already rotated into its print orientation (build direction = +Z, part resting on z=0). A companion (the
    second-colour inlay) gets exactly the same move, so the two line up when loaded together in the slicer."""
    def turn(shape):
        if orient == "back_down":        # back face (max Y) onto the bed: y -> -z
            return shape.rotate(cq.Vector(0, 0, 0), cq.Vector(1, 0, 0), -90)
        if orient == "face_down":        # outer face (min Y) onto the bed: y -> +z
            return shape.rotate(cq.Vector(0, 0, 0), cq.Vector(1, 0, 0), 90)
        return shape
    solid = turn(wp.val())
    bb = solid.BoundingBox()
    shift = cq.Vector(-bb.xmin, -bb.ymin, -bb.zmin)
    solid = solid.translate(shift)
    if companion is not None:
        cname, cwp = companion
        comp = cq.Compound.makeCompound([turn(sh).translate(shift) for sh in cwp.vals()])
        cq.exporters.export(cq.Workplane("XY").add(comp), os.path.join(print_dir, cname + ".stl"), tolerance=0.01, angularTolerance=0.1)
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
    sens_top = hg["sensor_z"] + P["HALL_PKG"][2] / 2
    gap = mag_face - sens_top
    out.append((3.5 <= gap <= 4.5, "magnet face to Hall package top = %.2f mm (target 3.5 to 4.5, research)" % gap))
    cz = P["HOLDER_Z0"] + P["HOLDER_W"] / 2
    d = math.sqrt((hg["cell_y"] - sy) ** 2 + (cz - P["CELL_D"] / 2 - hg["sensor_z"]) ** 2)
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
    out.append((P["ANT_X"] - P["ANT_D"] / 2 >= ke, "antenna x=%.0f outside the board's 2.4 GHz keep-out (x<%.1f)" % (P["ANT_X"], ke)))
    out.append((gg["x0"] - gg["wall"] >= 36.0, "gateway: %.1f mm for the USB-C plug overmold left of the board" % (gg["x0"] - gg["wall"])))
    out.append((P["G_SMA"][0] - P["SMA_PAD_D"] / 2 >= gg["x0"] + P["BRD_L"] + 5.0 - 10.0, "gateway: SMA pad right of the board antenna end"))

    # ---- v9 snap-fit rules -------------------------------------------------------------
    head_w = P["PEG_HEAD_D"] + 2 * P["PEG_HEAD_CLR"]
    rib_top = P["HOLDER_Z0"] + P["HOLDER_W"] + P["HOLDER_CLR"] + P["HOLDER_RIB_T"]
    out.append((min(P["PEG_ZS"]) - P["PEG_DROP"] - head_w / 2 >= rib_top, "keyhole head chamber (z>=%.1f) below the lower pegs clears the holder's top rib (z<=%.1f)" % (min(P["PEG_ZS"]) - P["PEG_DROP"] - head_w / 2, rib_top)))
    out.append((hg["plate_y1"] <= hg["D"] - 0.5 and hg["web_y1"] <= hg["D"] - 0.5, "nothing of the bar sits behind the body's back face (plate/web end Y %.1f/%.1f <= %.1f), so the 14 mm lift clears the backplate" % (hg["plate_y1"], hg["web_y1"], hg["D"] - 0.5)))
    bp_z0 = (hg["H"] - P["BP_H"]) / 2
    out.append((bp_z0 <= P["DT_H"] and bp_z0 >= 1.0, "backplate bottom edge z=%.1f covers the bar channel mouth (z 0..%.1f)" % (bp_z0, P["DT_H"])))
    out.append((abs((P["DT_TOP"] - P["DT_MOUTH"]) - 2 * P["DT_H"]) < 0.01, "dovetail flanks are 45 deg (top - mouth = 2 x height), self-supporting when the bar prints upright"))
    eps_catch = 100.0 * 1.5 * (P["CATCH_NOSE"] + 0.4) * P["CATCH_T"] / P["CATCH_L"] ** 2
    out.append((eps_catch <= P["SNAP_STRAIN_MAX"], "backplate catch strain %.2f %% (y=%.1f t=%.1f L=%.0f; <= %.1f %%)" % (eps_catch, P["CATCH_NOSE"] + 0.4, P["CATCH_T"], P["CATCH_L"], P["SNAP_STRAIN_MAX"])))
    out.append((P["CATCH_GAP"] >= P["CATCH_NOSE"] + 0.5, "catch free space %.1f mm >= nose %.1f + 0.5" % (P["CATCH_GAP"], P["CATCH_NOSE"])))
    out.append((P["CATCH_NOSE"] >= wall - 0.5, "catch nose %.1f mm reaches into the %.1f mm back wall (>= wall - 0.5)" % (P["CATCH_NOSE"], wall)))
    out.append((P["BP_T"] - P["CATCH_T"] - P["CATCH_GAP"] >= 3.0, "backplate left behind the catch pocket = %.1f mm (>= 3)" % (P["BP_T"] - P["CATCH_T"] - P["CATCH_GAP"])))
    o = wall + P["TONGUE_CLR"]
    # wall-arm latches (the spring is in the body, printed along its length)
    eps_arm = 100.0 * 1.5 * P["HOOK_BARB"] * P["ARM_T"] / P["ARM_L"] ** 2
    out.append((eps_arm <= P["SNAP_STRAIN_MAX"], "wall arm strain %.2f %% (1.5*y*t/L^2, y=%.1f t=%.1f L=%.0f; <= %.1f %%), bending along the layers" % (eps_arm, P["HOOK_BARB"], P["ARM_T"], P["ARM_L"], P["SNAP_STRAIN_MAX"])))
    out.append((P["ARM_WIN"][1] >= 4.0, "arm material in front of the hook window = %.1f mm (>= 4): this strip takes the pull on the lid" % P["ARM_WIN"][1]))
    out.append((P["ARM_W"] - P["ARM_WIN"][2] >= 1.5, "arm material behind the window = %.1f mm (>= 1.5)" % (P["ARM_W"] - P["ARM_WIN"][2])))
    out.append((P["HOOK_CATCH_Y"] - P["ARM_WIN"][1] >= 0.15 and P["ARM_WIN"][2] - P["HOOK_L"] >= 0.15, "hook (Y %.1f..%.1f) sits inside the window (Y %.1f..%.1f) with clearance" % (P["HOOK_CATCH_Y"], P["HOOK_L"], P["ARM_WIN"][1], P["ARM_WIN"][2])))
    out.append((P["ARM_WIN"][0] >= P["HOOK_W"] + 0.8, "window %.1f wide passes the %.1f mm hook" % (P["ARM_WIN"][0], P["HOOK_W"])))
    out.append((wall - P["ARM_T"] <= (wall + P["TONGUE_CLR"]) - P["HOOK_BARB"], "hook tip z=%.2f stays inside the arm thickness (outer face z=%.2f): nothing sticks out under the box" % ((wall + P["TONGUE_CLR"]) - P["HOOK_BARB"], wall - P["ARM_T"])))
    out.append((wall + P["TONGUE_CLR"] + P["HOOK_T"] + 0.2 <= holder_bot, "hook top z=%.2f under the battery holder (z=%.1f)" % (wall + P["TONGUE_CLR"] + P["HOOK_T"], holder_bot)))
    for (rx, d) in P["H_ARMS"]:
        g = arm_geom(rx, d)
        lo, hi = sorted((g["root"], g["slot_far"]))
        clear = min(abs(lo - W / 2), abs(hi - W / 2)) - P["DT_STRIP_W"] / 2
        out.append((clear >= 0.5 and lo >= P["CORNER_R"] + 1.0 and hi <= W - P["CORNER_R"] - 1.0, "hanger wall arm x %.1f..%.1f clears the bar channel strip by %.1f mm and the corner radii" % (lo, hi, clear)))
    out.append((P["ARM_W"] + P["ARM_SLOT"] + 5.0 <= hg["y_back"] - P["HOLDER_RIB_H"], "arm slot (Y<=%.1f) is well in front of the holder bay ribs (Y>=%.1f)" % (P["ARM_W"] + P["ARM_SLOT"], hg["y_back"] - P["HOLDER_RIB_H"])))
    # lid-off retention (clips that flex across the layers)
    e, bl, xb3, xb2 = P["BRD_BARB"]
    wall_free = hg["y_back"] - max(hg["pcb_top"] - P["RAIL_LIP_ABOVE"], 0.5)
    eps_brd = 100.0 * 1.5 * e * P["POCKET_WALL_T"] / wall_free ** 2
    out.append((eps_brd <= P["SNAP_STRAIN_XLAYER"], "board catches: %.1f mm over each long edge; pocket wall strain %.2f %% while the board goes in (<= %.1f %% across layers)" % (e, eps_brd, P["SNAP_STRAIN_XLAYER"])))
    at, aw, az0, ae = P["HOLDER_ARM"]
    arm_len = (hg["y_back"] - P["HOLDER_ARM_ROOT"]) - (hg["holder_front"] - 0.05 - ae - 0.2)     # FREE length: root block to the barb nose
    eps_arm2 = 100.0 * 1.5 * ae * at / arm_len ** 2
    eps_arm3 = 100.0 * 1.5 * (ae + P["HOLDER_CLR"]) * at / arm_len ** 2                          # holder pushed in hard against one arm
    out.append((max(eps_arm2, eps_arm3) <= P["SNAP_STRAIN_XLAYER"], "battery holder arms: %.1f mm over the holder's front face; free length %.1f mm (slotted out of the end rib); strain %.2f %%, or %.2f %% with the holder hard against one arm (<= %.1f %% across layers)" % (ae, arm_len, eps_arm2, eps_arm3, P["SNAP_STRAIN_XLAYER"])))
    out.append((az0 >= P["HOLDER_Z0"] + P["HOLDER_W"] / 2 + P["HOLD_POST"][1] / 2 + 0.4 and az0 + aw <= P["HOLDER_Z0"] + P["HOLDER_W"], "holder arms (z %.1f..%.1f) sit above the lid's holder posts and within the holder's height" % (az0, az0 + aw)))
    # flush display
    glass = hg["pcb_top"] - P["OLED_H_MAX"]
    out.append((abs(glass - (-hg["lid_t"] + P["BEZEL_T"] + P["OLED_GAP"])) < 0.01, "display glass (tallest case %.1f mm above the PCB) sits %.1f mm behind a %.1f mm bezel: %.1f mm below the face (was 5.5)" % (P["OLED_H_MAX"], P["OLED_GAP"], P["BEZEL_T"], P["BEZEL_T"] + P["OLED_GAP"])))
    out.append((P["OLED_POCKET"][0] >= (P["OLED_X1"] - P["OLED_X0"]) + 1.0 and P["OLED_POCKET"][1] / 2 - abs(P["OLED_ACT_CY"]) >= P["OLED_HALF_W"] + 0.3, "lid pocket %.0f x %.1f takes the %.1f x %.1f display module" % (P["OLED_POCKET"][0], P["OLED_POCKET"][1], P["OLED_X1"] - P["OLED_X0"], 2 * P["OLED_HALF_W"])))
    out.append((P["WIN_W"] <= (P["OLED_X1"] - P["OLED_X0"]) - 2.0 and P["WIN_H"] <= 2 * P["OLED_HALF_W"] - 2.0, "window %g x %g is smaller than the glass, so the bezel frames it and hides its edges" % (P["WIN_W"], P["WIN_H"])))
    out.append((hg["lid_t"] - (P["IPEX_H"] + P["UFL_PLUG_H"] + 0.4 - hg["pcb_top"]) >= 1.5, "lid left over the U.FL relief = %.1f mm (>= 1.5)" % (hg["lid_t"] - (P["IPEX_H"] + P["UFL_PLUG_H"] + 0.4 - hg["pcb_top"]))))
    out.append((hg["pcb_top"] - P["BTN_H"] >= 0.5, "PRG/RST button tops Y=%.1f clear the lid inner face" % (hg["pcb_top"] - P["BTN_H"])))
    nose = hg["x0"] - P["USB_NOSE"]
    out.append((wall <= nose <= wall + 0.6, "USB-C nose x=%.2f is right at the left wall (inner face %.1f): a cable plugs in with the lid on" % (nose, wall)))
    plug_top = (hg["pcb_top"] - P["USB_OPEN_CY"]) - 3.25
    out.append((plug_top - (-hg["lid_t"] + P["USB_LID_SKIN"]) >= 0.4, "plug overmold top Y=%.2f clears the %.2f mm lid skin over it by %.2f mm" % (plug_top, P["USB_LID_SKIN"], plug_top - (-hg["lid_t"] + P["USB_LID_SKIN"]))))
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
    out.append((P["DT_MOUTH"] >= P["WEB_W"] + 0.8, "channel mouth %.1f passes the %.0f mm web with 0.4 per side" % (P["DT_MOUTH"], P["WEB_W"])))
    out.append((P["BAR_W"] <= W + 20.0 and P["BAR_W"] >= P["WEB_W"], "hook bar %.0f mm wide (PROVISIONAL: set to the sign's hand-hole width minus %.0f)" % (P["BAR_W"], P["SIGN_HOLE_CLR"])))
    fw, fh, ft, ht, hl, sl = P["BTN_PAD"]
    pads = button_pads(hg["x0"], hg["zc"], P["H_PAD_V"])
    for (name, fx0, fx1, z0, z1, px, pz, hinge) in pads:
        hc = (z1 - hl / 2) if hinge == "z1" else (z0 + hl / 2) if hinge == "z0" else None
        arm = abs(pz - hc) if hc is not None else px - (fx0 + hl / 2)
        eps_btn = 100.0 * (ht / 2) * ((P["BTN_PIN_GAP"] + P["BTN_TRAVEL"]) / arm) / hl
        out.append((eps_btn <= P["SNAP_STRAIN_MAX"], "%s pad %.1f x %.1f mm, hinge strain %.2f %% for a full press (pin %.1f mm from the hinge; <= %.1f %%)" % (name, fx1 - fx0, z1 - z0, eps_btn, arm, P["SNAP_STRAIN_MAX"])))
        out.append((min(fx1 - fx0, z1 - z0) >= 8.5 and (fx1 - fx0) * (z1 - z0) >= 150.0, "%s pad is fingertip sized (%.0f mm2)" % (name, (fx1 - fx0) * (z1 - z0))))
        out.append((fx0 <= px - P["H_PAD_V"][2] / 2 and px + P["H_PAD_V"][2] / 2 <= fx1 and z0 < pz < z1, "%s pin sits wholly on its pad" % name))
    kx, ky, kd, kh = P["COIL"]
    slot_edge = P["BTN_PAD_X1"] + sl
    out.append((kx - kd / 2 - 0.4 >= slot_edge - 0.5 - 0.05, "coil antenna (Xb %.1f to %.1f, from Owen's photo, +/- 0.4) stays inside the relief, which starts at Xb %.1f" % (kx - kd / 2, kx + kd / 2, slot_edge - 0.5)))
    coil_clear = (hg["pcb_top"] - kh) - (-hg["lid_t"] + P["BEZEL_T"])
    out.append((coil_clear >= 0.2, "coil antenna top (%.1f above the PCB) clears the pocket floor by %.1f mm (>= 0.2); relieved for a coil centred anywhere within Yb +/-%.2f, which is everything inboard of the header pad rows" % (kh, coil_clear, P["BRD_W"] / 2 + P["BRD_CLR"] - 0.3 - P["LID_RIB_W"] - kd / 2)))
    out.append((P["HOLDER_STANDOFF"] >= P["HOLDER_PIN"][1] + 0.5, "holder stands %.1f mm off the back wall for its %.1f mm solder pins (>= pin + 0.5)" % (P["HOLDER_STANDOFF"], P["HOLDER_PIN"][1])))
    if P["BTN16_ON"]:
        hole, hd, hh, bd, nut, nut_t = P["BTN16"]
        blen = btn16_len()
        bx_, by_ = P["BTN16_XY"]
        rib_bot = P["HOLDER_Z0"] - P["HOLDER_CLR"] - P["HOLDER_RIB_T"]
        out.append((blen + P["BTN16_WIRE"] <= rib_bot + 0.01, "cleaning button (" + ("with" if P["BTN16_USE_SOCKET"] else "without") + " its plug-in socket): %.1f mm long behind its head + %.0f mm for the wires ends at z=%.1f, under the battery shelf (z=%.1f); the box is %.0f mm taller for it (%.0f tall)" % (blen, P["BTN16_WIRE"], blen + P["BTN16_WIRE"], rib_bot, P["H_BASEMENT"], P["H_H"])))
        out.append((bx_ + nut / 2 <= W - wall - 0.3 and by_ + nut / 2 <= hg["y_back"] + 0.01 and bx_ - nut / 2 >= W / 2 + P["DT_STRIP_W"] / 2 + 0.5, "cleaning button nut (%.0f mm across corners) turns freely between the side wall, the back wall and the hook channel strip" % nut))
        out.append((by_ - hole / 2 - (P["ARM_W"] + P["ARM_SLOT"]) >= 1.2, "bottom wall left between the latch arm's slot and the button hole = %.1f mm (>= 1.2)" % (by_ - hole / 2 - P["ARM_W"] - P["ARM_SLOT"])))
        out.append((P["BAR_DROP"] - hh >= 25.0, "finger room under the button: %.1f mm between its face and the hook (>= 25)" % (P["BAR_DROP"] - hh)))
    pw_ = P["HALL_PKG"][0]
    gate = 2 * P["HALL_PIN_X"] - 2.85
    legs = 2 * P["HALL_LEG"][1] + P["HALL_LEG"][0]
    out.append((legs + 0.3 <= gate <= pw_ - 0.4, "Hall sensor gate between the two pins = %.2f mm: passes the legs (%.2f) and stops the %.1f mm body" % (gate, legs, pw_)))
    out.append((P["USB_SLOT_W"] >= 12.6 + 1.2, "USB opening %.1f wide for Owen's %.1f mm plug body (>= 0.6 a side)" % (P["USB_SLOT_W"], 12.6)))
    out.append((min(pd[1] for pd in pads) - sl >= wall + P["TONGUE_CLR"] + P["TONGUE_T"] + 0.2, "button pad slots start clear of the lid's lip"))
    out.append((max(pd[4] for pd in pads) + sl <= H - wall - P["TONGUE_CLR"] - P["TONGUE_T"] - 0.5 - 0.4 and max(pd[2] for pd in pads) + sl < min(P["H_TAB_XS"]) - P["TAB_W"] / 2, "upper pad stops below the lid's top edge and beside the hinge tab roots"))
    out.append((True, "display window centre x=%.1f: left of centre on purpose, so the USB-C port is at the edge; badge balances it on the right" % (hg["x0"] + P["OLED_ACT_CX"])))
    out.append(((P["DT_TOP"] - P["DT_MOUTH"]) / 2 >= 2.0, "dovetail flank overhang %.2f mm per side (>= 2.0)" % ((P["DT_TOP"] - P["DT_MOUTH"]) / 2)))
    out.append((P["DT_STRIP_W"] >= P["DT_TOP"] + 2 * 3.0, "channel strip leaves >= 3 mm beside the dovetail top"))
    out.append((hg["plate_y1"] <= hg["wall_y"] - 1.0 and hg["plate_y0"] >= P["DT_Y0"] + 0.5, "bar plate Y %.0f..%.0f inside the channel (front end %.0f, wall %.0f)" % (hg["plate_y0"], hg["plate_y1"], P["DT_Y0"], hg["wall_y"])))
    lead_gap = (P["HOLDER_Z0"] - P["HOLDER_CLR"]) - hg["strip_top"]
    out.append((lead_gap >= 3.5, "passage under the holder for the sensor lead = %.1f mm (>= 3.5)" % lead_gap))
    hook_top = wall + P["TONGUE_CLR"] + P["HOOK_T"]
    hz_lo = P["HOLDER_Z0"] - P["HOLDER_CLR"]
    # the gusset is a triangle that only reaches HOOK_GUSSET deep (Y); past that the hook is just HOOK_T tall
    hooks_ok = (hg["holder_front"] >= P["HOOK_L"] - 1.5 or hz_lo >= hook_top + P["HOOK_GUSSET"]
                or (hg["holder_front"] >= P["HOOK_GUSSET"] + 0.5 and hz_lo >= hook_top + 0.5))
    out.append((hooks_ok, "lid hooks (top z=%.2f) pass under the holder (z>=%.1f) and their gussets (Y<=%.1f) stop short of it (Y>=%.1f)" % (hook_top, hz_lo, P["HOOK_GUSSET"], hg["holder_front"])))
    ant_top = P["ANT_SHELF_Z"] + P["ANT_SHELF_T"] + 2.8 + P["ANT_L"]
    out.append((ant_top + 3.0 <= H - wall - P["TAB_RIB_H"], "antenna top z=%.1f fits under the top wall rib (z=%.1f)" % (ant_top, H - wall - P["TAB_RIB_H"])))
    out.append((P["ANT_SHELF_Z"] - 15.0 >= hg["bulk"][1] + 0.5, "SMA jack's rear (z>=%.1f) clears the bulkhead top (z=%.1f)" % (P["ANT_SHELF_Z"] - 15.0, hg["bulk"][1])))
    out.append((P["BAR_WIRE_Y"][0] >= P["DT_Y0"], "lead slot starts inside the channel (Y>=%.0f)" % P["DT_Y0"]))
    win_w, win_h = P["CATCH_WIN"]
    out.append((win_w >= P["CATCH_W"] + 2 * 0.5 and win_h >= P["CATCH_NOSE_H"] + 2 * P["CATCH_WIN_CLR"], "catch window %.1f x %.1f fits the %.0f x %.0f nose with clearance" % (win_w, win_h, P["CATCH_W"], P["CATCH_NOSE_H"])))
    for (px, pz) in ((x, z) for x in P["PEG_XS"] for z in P["PEG_ZS"]):
        d = math.hypot(px - P["CATCH_X"], pz - (hg["win_z0"] + hg["win_z1"]) / 2)
        out.append((d >= 15.0, "catch window to peg (%.0f, %.0f): %.1f mm (>= 15)" % (px, pz, d)))
    gv = P["G_VENT"]
    for (rx, d) in P["G_ARMS"]:
        g = arm_geom(rx, d)
        lo, hi = sorted((g["root"], g["slot_far"]))
        out.append((hi + 2.0 <= gv["bot_x0"] and lo >= P["CORNER_R"] + 1.0, "gateway wall arm x %.1f..%.1f is left of the intake vents (x>=%.0f)" % (lo, hi, gv["bot_x0"])))
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
    """README.txt for the build folder. Every number in it is fed from PARAMS or from the derived geometry, by name, so
    the text cannot drift when a value changes. Literal percent signs in the template are doubled. The text is written for
    a builder who is not an engineer: every unusual word is explained in WORDS USED, and HANGER ASSEMBLY ORDER is meant to
    be followed literally, from a pile of parts to a sign hanging on the wall.
    Four facts the text must keep to (they replaced earlier, more cautious wording):
      the Hall sensor's leg order is CONFIRMED (marking 32FA, TI SLVSDC7H Figures 7-1 and 5-5, Table 5-1), so no step may put
        3V3 on an unknown leg to find out which it is;
      the battery cable's two loose ends are fed DOWN through the bulkhead's end notches BEFORE they are soldered to the holder,
        because each notch is a closed hole and the cable has one plug;
      the hanger firmware reserves the cleaning button's pin but does not act on a press yet, so the button is proved with a
        meter continuity test, never by looking for a "cleaning mode";
      a drill in a pin hole is stopped by a flag of tape, never by feel."""
    sy = hg["sensor_y"]
    gap = hg["saddle_floor"] + P["TAG_CLR"] + P["TAG_WALL"] - (hg["sensor_z"] + P["HALL_PKG"][2] / 2)
    base = P.get("H_BASEMENT") or 0.0
    # what the box would save with the button's plug-in socket left off (same sum as _apply_basement, text only)
    have = (P["HOLDER_Z0"] - base - P["HOLDER_CLR"] - P["HOLDER_RIB_T"]) - P["WALL"]
    base_nosock = float(max(0, math.ceil((P["BTN16_METAL_L"] + P["BTN16_PINS_L"] - P["WALL"]) + P["BTN16_WIRE"] - have)))
    bp_z0 = (hg["H"] - P["BP_H"]) / 2
    # how far the bottom edge of a lid comes out before its hinge noses drop free: lid height x sin(12 deg), the tilt at which
    # design_checks proves the noses are clear of the rib. It follows the box height, so it is never a literal in the text.
    free_tilt = math.radians(12.0)
    open_h, open_g = hg["H"] * math.sin(free_tilt), gg["H"] * math.sin(free_tilt)
    pin_depth = hg["saddle_floor"] - (hg["slot_floor"] - 2.0)       # pin hole depth below the saddle floor (build_hanger_bar)
    v = dict(
        open_h_lo=math.floor(open_h), open_h_hi=math.ceil(open_h), open_g_lo=math.floor(open_g), open_g_hi=math.ceil(open_g), g_box_h=gg["H"],
        # a drill easing a tight pin hole stops a little short of the hole's floor: tape flag at whole millimetres, at least 0.5 short
        drill_tape=math.floor(pin_depth - 0.5), ledge_t=(hg["slot_floor"] - 2.0) - hg["bar_bot"],
        # the bulkhead's two end notches (same literals as build_hanger_body: 7.5 wide, cut from Y=12 back to the back wall)
        notch_front=12.0, notch_w=7.5, notch_l=hg["y_back"] - 12.0,
        # room round the button's nut (the design check proves it turns; these say why a spanner does not go on)
        nut_back=hg["y_back"] - (P["BTN16_XY"][1] + P["BTN16"][4] / 2), nut_side=(hg["W"] - P["WALL"]) - (P["BTN16_XY"][0] + P["BTN16"][4] / 2),
        wall_y=hg["wall_y"], lid_t=P["LID_T"],
        tab_l=P["TAB_L"], arm_l=P["ARM_L"], arm_w=P["ARM_W"], arm_t=P["ARM_T"], strain=P["SNAP_STRAIN_MAX"],
        hook_w=P["HOOK_W"], hook_barb=P["HOOK_BARB"],
        bezel=P["BEZEL_T"], oled_gap=P["OLED_GAP"], oled_h_max=P["OLED_H_MAX"], oled_h=P["OLED_H"], coil_h=P["COIL"][3],
        glass_max=P["BEZEL_T"] + P["OLED_GAP"], glass_now=P["LID_T"] + hg["pcb_top"] - P["OLED_H"],
        pocket_h=P["OLED_H_MAX"] + P["OLED_GAP"], coil_need=P["COIL"][3] + 0.2,
        coil_band=P["BRD_W"] / 2 + P["BRD_CLR"] - 0.3 - P["LID_RIB_W"] - P["COIL"][2] / 2, coil_yb=P["COIL"][1],
        ins_w=P["INSERT_W"], ins_h=P["INSERT_H"], ins_t=P["INSERT_T"],
        dt_mouth=P["DT_MOUTH"], dt_top=P["DT_TOP"], dt_h=P["DT_H"], dt_clr=P["DT_CLR"], dt_flank=(P["DT_TOP"] - P["DT_MOUTH"]) / 2,
        peg_drop=P["PEG_DROP"], catch_w=P["CATCH_W"], catch_l=P["CATCH_L"], catch_t=P["CATCH_T"],
        win_w=P["CATCH_WIN"][0], win_h=P["CATCH_WIN"][1],
        usb_w=P["USB_SLOT_W"], usb_h=P["USB_SLOT_H"], usb_skin=P["USB_LID_SKIN"],
        pad_w=hg["x0"] + P["BTN_PAD_X1"] - P["H_PAD_V"][0], pad_h=P["H_PAD_V"][1], pad_slot=P["BTN_PAD"][5],
        led_d=P["LED_HOLE_D"], mark=P["MARK_DEPTH"],
        led_text=("The status LEDs show through an open %.1f mm light hole in the RST pad." % P["LED_HOLE_D"]) if P["H_LED_HOLE"] else
                 "There is NO light hole in the hanger's face: the board's two small status lights (one is the charging light) are hidden with the lid on, and the display shows what the unit is doing. Take the lid off if you need to see the charging light.",
        led_face=", the LED hole in the RST pad" if P["H_LED_HOLE"] else "",
        led_print=("The LED hole is an open %.1f mm hole. " % P["LED_HOLE_D"]) if P["H_LED_HOLE"] else "",
        bar_w=P["BAR_W"], web_w=P["WEB_W"], hole_clr=P["SIGN_HOLE_CLR"], bar_drop=P["BAR_DROP"], reach=P["BAR_REACH"], lip_h=P["BAR_LIP_H"],
        saddle_w=P["BAR_SADDLE_W"], sign_t=P["SIGN_T"], free_y=hg["web_y0"] - hg["lip_back"],
        hold_l=P["HOLDER_L"], hold_w=P["HOLDER_W"], hold_h=P["HOLDER_H"], standoff=P["HOLDER_STANDOFF"],
        pin_len=P["HOLDER_PIN"][1], pin_in=P["HOLDER_PIN"][0], pin_room=P["HOLDER_STANDOFF"] - P["HOLDER_PIN"][1],
        arm_over=P["HOLDER_ARM"][3], post_clr=P["HOLD_POST"][2], cell_clr=P["CELL_RIB"][2], rib_clr=P["LID_RIB_CLR"],
        hall_w=P["HALL_PKG"][0], hall_l=P["HALL_PKG"][1], hall_t=P["HALL_PKG"][2],
        gate=2 * P["HALL_PIN_X"] - 2.85, tunnel_l=hg["bar_back"] - hg["nest_y_back"],
        tunnel_w=P["HALL_TUNNEL_W"], tunnel_h=P["HALL_SLOT_H"],
        pin_hole=P["HALL_PIN_D"], pin_depth=hg["saddle_floor"] - (hg["slot_floor"] - 2.0), push_d=P["HALL_PIN_PUSH_D"],
        mag_d=P["MAGNET_D"], mag_t=P["MAGNET_T"],
        ant_d=P["ANT_D"], ant_l=P["ANT_L"], ant_slot=P["ANT_SLOT_W"],
        sy=sy, sy_front=-sy, sy_behind=P["LID_T"] + sy,
        wire_y0=P["BAR_WIRE_Y"][0], wire_y1=P["BAR_WIRE_Y"][1], holder_front=hg["holder_front"],
        lead_gap=(P["HOLDER_Z0"] - P["HOLDER_CLR"]) - hg["strip_top"],
        roof_w=P["BAR_WIRE_W"], roof_l=P["BAR_WIRE_Y"][1] - P["BAR_WIRE_Y"][0],
        bulk_w=P["BULK_LEAD_SLOT"][1] - P["BULK_LEAD_SLOT"][0], bulk_l=P["BULK_LEAD_SLOT"][3] - P["BULK_LEAD_SLOT"][2],
        band_w=P["BAR_WIRE_W"] - 2.0, band_d=(hg["web_y1"] - 2.5) - (hg["web_y0"] + 2.5),
        xc=hg["W"] / 2, tag_clr=P["TAG_CLR"], tag_wall=P["TAG_WALL"], gap=gap,
        gusset=hg["web_y0"] - hg["plate_y0"], head_w=P["PEG_HEAD_D"] + 2 * P["PEG_HEAD_CLR"], nose_pocket=P["TAB_W"] + 1.0,
        coupon=14.0, win_ww=P["WIN_W"], win_wh=P["WIN_H"], groove_open=hg["bar_back"] - (hg["web_y0"] + 2.5),
        g_screw_x=P["G_LOWER_SCREW"][0], g_screw_z=P["G_LOWER_SCREW"][1], key_l=P["KEY_SLOT_L"],
        # v9.9: the button under the base and the taller box
        box_w=hg["W"], box_h=hg["H"], box_d=hg["D"], basement=base, old_h=hg["H"] - base,
        bp_w=P["BP_W"], bp_h=P["BP_H"], bp_tb=bp_z0, bp_side=(hg["W"] - P["BP_W"]) / 2,
        peg_top=bp_z0 + P["BP_H"] - max(P["PEG_ZS"]), peg_bot=min(P["PEG_ZS"]) - bp_z0,
        btn_hole=P["BTN16"][0], btn_head_d=P["BTN16"][1], btn_head_h=P["BTN16"][2], btn_nut=P["BTN16"][4],
        btn_metal=P["BTN16_METAL_L"], btn_sock=P["BTN16_SOCKET_L"], btn_full=P["BTN16_METAL_L"] + P["BTN16_SOCKET_L"],
        btn_pins=P["BTN16_PINS_L"], btn_x=P["BTN16_XY"][0], btn_y=P["BTN16_XY"][1], btn_room=P["BAR_DROP"] - P["BTN16"][2],
        holder_above=have + P["HOLDER_RIB_T"], nosock_save=base - base_nosock, nosock_h=hg["H"] - base + base_nosock,
        clear_mid=hg["W"] - 2 * (P["HOLDER_X0"] + 12.0 + P["CELL_RIB"][0]),      # between the lid's two cell ribs (build_hanger_lid)
        body_len=hg["H"] + P["ARM_LIP"][1], wall=P["WALL"],
    )
    txt = """HazardLink v9.9 enclosures (sized from Owen's own parts): no screws between the parts; every part clipped in even with the lid off; wall-arm latches; flush display; USB-C at the edge (lid on); two finger pads; logo on the face; wide hook bar that prints with no support; bare Hall sensor held by two filament pins; NEW in v9.9, a cleaning-mode push button fitted under the base of the hanger, in a hanger box %(basement).0f mm taller to make room for it. Generated by hazardlink_enclosures.py.
Frame: X right, Z up, Y from the body rim (Y=0) into the wall. The lid's outer face is at Y=-%(lid_t).0f, the wall face at Y=%(wall_y).0f.
If you are building a hanger, read WORDS USED, then go to HANGER ASSEMBLY ORDER and follow it from the top.

WORDS USED IN THIS FILE
  front, back, left, right, top, bottom: as you see the box hanging on the wall. The front is the lid, the back is the wall
    side. "Forward" means toward the open front of the box (toward you). The floor of the box is the inside of its bottom wall.
  body: the open box. lid: its front cover. backplate: the flat plate that is screwed to the wall. The body hangs on it.
  hook bar, or just "the bar": the T-shaped part under the box that the sign hangs on. From the top down it has a dovetail
    plate (a flat tongue with sloping sides), a web (the narrow upright neck) and the wide bar itself, with a lip at the front.
  saddle: the shallow trough across the top of the bar. The top edge of the sign's hand hole rests in it.
  cable tie saddle: a different thing. It is a small block on the back wall of the box, below the board, with a tunnel
    through it for a cable tie. It has nothing to do with the saddle on the bar.
  tunnel and nest: the tunnel is the flat passage inside the bar, open at the back of the bar. The nest is the snug pocket
    at its far end, under the middle of the saddle, where the lift sensor sits.
  channel strip: the raised strip in the floor of the box that the hook bar slides into. The slot in its roof lets the
    sensor's wires up into the box.
  bulkhead: the thick shelf across the inside of the box above the battery. It has three openings: a slot in the middle,
    near the front, for the sensor and button wires, and a notch at each end, against the side walls, for the two battery
    wires. All three are CLOSED holes, shut in on every side, so a wire cannot be slipped in from the front: it has to be
    threaded through end first.
  bay under the battery: the empty space between the floor of the box and the battery holder. It is new in v9.9 and holds
    only the cleaning-mode button and wires.
  latch arm: one of two springy strips cut into the bottom wall of a body. The lid's two hooks click into them. The small lip
    under each arm's tip is what you pull to open the lid.
  pegs and catch: four mushroom-shaped pegs on the backplate carry the body. The catch is a springy tongue in the middle of
    the backplate with a bump (the nose) that clicks into a window in the back wall of the body, so the body cannot be lifted
    off until the nose is pushed back.
  board: the Heltec WiFi LoRa 32 V3 circuit board. PRG and RST are its two small buttons. Its underside is the side without
    the display. J3 is the row of 18 solder holes along its long edge on the PRG button's side.
  PCB: the bare circuit board itself, without the parts on it. "Above the PCB" is measured up from its display side.
  bezel: the thin skin of lid that is left in front of the display, round its window.
  firmware: the program that runs on the board. Flashing means loading it onto the board over the USB-C cable.
  GND, 3V3, GPIO3, GPIO6: the names of four solder holes in Heltec's pinout picture of the board. GND is ground (zero volts),
    3V3 is the board's 3.3 volt supply, GPIO3 and GPIO6 are two signal pins. HIGH means close to 3.3 volts, LOW means close
    to zero.
  U.FL pigtail: the thin antenna cable with a tiny press-on plug. The plug presses onto the board. The other end is a
    threaded SMA jack that the antenna screws onto.
  JST 1.25 cable: the battery cable. It has one tiny 2-pin plug, which fits the battery socket on the underside of the board,
    and two loose wire ends.
  Hall sensor, or lift sensor: the small black 3-leg part in the bar that senses the magnet on the sign. Its MARKED face is
    its front face, the one with 32FA printed on it. VCC is its supply leg, GND its ground leg and OUT its output leg.
  push-pull: the sensor drives its output wire both HIGH and LOW by itself, so it needs no extra resistor.
  momentary: a momentary button is on only while it is held in.
  lead: a wire, or a few wires together, going from one part to another. tail: a short wire soldered to the board.
  heat shrink: thin plastic sleeve that shrinks tight when warmed. It insulates a solder joint. meter: a multimeter. Its
    continuity setting beeps when its two probes are joined through a wire or a closed switch.

NEW IN v9.9: THE CLEANING-MODE BUTTON UNDER THE BASE, AND A TALLER HANGER BOX
  A cleaning-mode push button is now FITTED under the base of the hanger. It is Owen's Gebildet 16 mm momentary LED waterproof
  button (6 bought on Amazon UK): M16 thread, a head %(btn_head_d).1f mm across and %(btn_head_h).1f mm high, %(btn_metal).0f mm of threaded metal body behind the head, then
  a blue plug-in wire socket %(btn_sock).1f mm long with five wires, so %(btn_full).1f mm behind the head in all. It goes through a %(btn_hole).1f mm hole in the
  BOTTOM wall of the hanger body at x=%(btn_x).1f, Y=%(btn_y).1f: behind the right-hand latch arm, clear of the channel strip, pointing DOWN,
  above the hook, out of sight from the front. A cleaner reaches under the box from the right-hand side and presses it upward.
  There is about %(btn_room).1f mm between the button's face and the hook.
  The battery holder used to sit only %(holder_above).0f mm above the bottom wall, far too little for a button that long. So the hanger box grew
  DOWNWARD by %(basement).0f mm: the hanger body is now %(box_h).0f mm tall (it was %(old_h).0f), the lid is %(box_w).0f x %(box_h).0f and the backplate %(bp_w).0f x %(bp_h).0f. Every feature
  keeps its place measured from the TOP of the box. The new bay under the battery holds only the button and wires. The battery
  holder's lower ribs are now a shelf standing off the back wall.
  Wires: the blue socket has five wires. Only the TWO switch wires go up to the board (one to GND, one to GPIO3). The other
  three are folded back, their bare ends covered, and tucked down in the bay. The working voltage of the button's LED is not
  known yet, so this file gives none and the LED wires stay unconnected for now.
  Firmware: firmware/include/pinout.h reserves TEST_BUTTON_PIN = 3, which is GPIO3, as the cleaning-mode trigger, and
  firmware/src/hanger/hanger.cpp sets that pin up as an input with a pull-up (the pull-up holds the pin HIGH until the button
  joins it to GND). The hanger program does not act on a press yet: that part of the firmware is still to be written. So the
  button cannot be tested on the finished unit for now. The proof that it is wired correctly is the meter continuity check
  in HANGER ASSEMBLY ORDER, step 7.
  Two switches in PARAMS: BTN16_USE_SOCKET=False (leave the blue socket off and solder the wires to the button's own pins, which
  are ASSUMED to be %(btn_pins).1f mm long and have not been measured) would make the box %(nosock_save).0f mm shorter (%(nosock_h).0f tall). BTN16_ON=False builds
  the old %(old_h).0f mm box with no button. The gateway is unchanged.

FILES
  <part>.step / .stl / .png / _drawing.dxf   printable parts: hanger_body, hanger_lid, hanger_bar, hanger_backplate, gateway_body, gateway_lid
  print/                                        the same parts already turned into their print orientation (do not rotate them in the slicer),
                                                hanger_lid_inlay.stl and gateway_lid_inlay.stl (second colour), hanger_body_coupon.stl (test ring)
                                                and ORIENTATION.txt
  PRINT.md                                      the print recipe. It is the single source of truth for the slicer settings.
  hanger_assembly.step, gateway_assembly.step  named and coloured assemblies including the reference solids
  hanger_section.dxf, gateway_section.dxf      assembly stack-up sections
  *_exploded.png, *_assembled*.png, *_lid_off.png previews
  ref/                                          reference solids, not printed: board, cell, holder, Hall sensor (its file is still named
                                                hall_carrier), its two pins, magnet, sign handle, antenna, plug, the cleaning button
                                                (clean_button); window insert for the gateway only
  stages/                                       the assembly story for AutoCAD. This script does not write it: make_assembly_stages.py
                                                writes the STEP files and fusion_step2sat.py, run inside Fusion, converts them to .sat.
  sat_true/                                     true-surface ACIS files for AutoCAD for Mac. This script does not write them. A file in
                                                there that is older than hanger_body.step may come from an OLDER design (the copies
                                                that were there when v9.9 was written did): run fusion_step2sat.py in Fusion on the
                                                current STEP files before using it.
  autocad/                                      SAT and DXF solids from ../to_autocad.py. A run with --no-autocad does not write them,
                                                so check their dates against hanger_body.step in the same way.
  manifest.txt                                  bounding boxes and derived positions

HOW THE PARTS HOLD TOGETHER
  Lids (both units): two rigid hinge tabs on the lid's top edge reach %(tab_l).0f mm in and hook into pockets in a rib along the
    top wall. At the bottom the SPRING is in the body: two latch arms cut into the bottom wall (%(arm_l).0f long x %(arm_w).1f wide x %(arm_t).1f thick,
    printed along their length so they bend along the layers, strain under %(strain).1f %%). Each arm has a window; the lid carries a
    rigid %(hook_w).0f mm hook with a %(hook_barb).1f mm barb that drops into it. No part of the latch on the lid flexes, so the lid has
    no thin finger to snap off.
    After printing, before the first lid goes on: push each arm tip OUTWARD once with a screwdriver (away from the inside of
    the box, the same way its pull lip moves when the lid is opened) to break its small breakaway tab. The tab is there so
    the arm prints cleanly. Fit: top tabs into the rib pockets, swing the bottom edge in until both hooks click.
    Open: pull the lip under one arm tip down about 1 mm with a fingernail or coin, ease that corner of the lid out, do the
    other, then pull the bottom edge out until the top tabs drop free, and take the lid away. The tabs drop free when the lid
    has tilted about 12 degrees. On the hanger lid (%(box_h).0f mm tall) that is with the bottom edge about %(open_h_lo).0f to %(open_h_hi).0f mm out. On the gateway
    lid (%(g_box_h).0f mm tall) it is about %(open_g_lo).0f to %(open_g_hi).0f mm. Never lever the lid against tabs that are still hooked.
  Display (hanger): the board sits right up behind the lid and the display module sits in a pocket in the lid, behind a
    %(bezel).1f mm bezel. This lid has NO window insert and NO cleats. The pocket allows %(oled_h_max).1f mm above the PCB (OLED_H_MAX)
    plus %(oled_gap).1f mm between glass and bezel, so a display that tall would have its glass %(glass_max).1f mm below the face. Owen's
    display stands about %(oled_h).1f mm on its clear carrier, so its glass is %(glass_now).1f mm below the face (it was 5.5 mm down a well).
    A standing WiFi coil antenna about %(coil_h).1f mm tall sits on the board between the USB end and the display, and the pocket runs
    on over it. OLED_H_MAX has to cover the taller of the two, so NEVER set it below the coil height. The pocket floor is
    %(pocket_h).1f mm above the PCB now and must stay at least 0.2 mm above the coil top, so it may never be lower than %(coil_need).1f mm above
    the PCB. A lower value fails the design check, and the check runs before any file is written.
  Display (gateway): the gateway lid is different. It still has the window insert pocket: a clear %(ins_w).0f x %(ins_h).1f x %(ins_t).0f mm pane
    fits from inside under the two cleats.
  Hook bar to hanger body: the bar's plate is a dovetail that slides into a channel in the body's bottom wall FROM THE WALL
    SIDE (channel %(dt_mouth).1f wide at the mouth, %(dt_top).1f at the top, %(dt_h).1f tall, 45 deg flanks; the plate has %(dt_clr).2f mm clearance per
    side). The channel is closed at the front and the backplate covers its mouth, so with the body hung the bar cannot
    come out. The sign's weight is carried by the dovetail flanks (%(dt_flank).1f mm each side); no snap takes any of it. Nothing of
    the bar sits behind the body's back face, so the body still lifts the %(peg_drop).0f mm it needs to come off the pegs with the
    bar fitted.
  Body to backplate: the backplate goes on the wall FIRST (see HANGER ASSEMBLY ORDER, job B2, for which way up). It carries
    four mushroom pegs. Offer the body up %(peg_drop).0f mm high so the peg heads pass the keyhole circles (the circles are BELOW the
    pegs, slots running up) and let it drop; it hangs on the pegs. A spring tongue in the backplate's front face (%(catch_w).0f x %(catch_l).0f mm,
    %(catch_t).1f thick, fixed end at the bottom) carries a nose that springs into a %(win_w).1f x %(win_h).1f window through the body's back wall as the
    body drops home; the body cannot be lifted until the nose is pushed back through the window from inside, which needs the
    lid off. Same tamper resistance as the old security screw for that step.
  Tamper note: the lid opens by hand from underneath (two pull lips under the box). The enclosure has no lid switch: the
    one thing the unit can sense is the sign being lifted off the saddle.
  Face: the board sits against the left wall so the USB-C port is at the edge and a cable plugs in with the lid on. The
    opening is %(usb_w).1f x %(usb_h).1f mm in the left wall, shared by the body wall and a hollow in the lid edge, and the lid keeps a
    %(usb_skin).1f mm skin over the plug. On this board the port sits between the two buttons, so the two finger pads run down the
    left edge: PRG above the port, RST below it, each %(pad_w).0f x %(pad_h).1f mm. The display is left of centre and the badge balances
    it on the right. Each pad is a flap cut into the lid with a thin hinge at its far end and a pusher pin behind it over
    the board's small switch, so pressing anywhere on the pad clicks the switch. %(led_text)s The badge, the HazardLink wordmark and the two button names are sunk %(mark).1f mm into the
    face as narrow strokes. They are meant for a WHITE second-colour inlay over the black lid: load
    print/hanger_lid_inlay.stl with the lid (it is already lined up), assign it to the other hotend and merge the two
    models; the face then comes off the bed flush and smooth. Printed in one colour they are simply sunk lines. The gateway
    lid has its own print/gateway_lid_inlay.stl.
  Hook bar: T-shaped. The dovetail and web are narrow (web %(web_w).0f mm); the bar below is %(bar_w).0f mm wide (BAR_W) so it fills the
    sign's hand hole: the sign hangs level and cannot slide sideways off the sensor. BAR_W is PROVISIONAL until the hand
    hole is measured (set it to the hole width minus %(hole_clr).0f mm).
  Sensor lead (checked by audit_cable_route.py): along the tunnel in the bar; up the groove in the back of the web (the groove
    is open to the back so the wires lay in, except for one closed band half way up, opening %(band_w).0f x %(band_d).0f mm, that the wire ends have
    to be THREADED under); forward along the groove in the top of the dovetail plate; up through the slot in the channel roof
    (%(roof_w).0f x %(roof_l).0f mm), which comes up UNDER the battery holder, into the bay under the battery; forward; up in front of the battery
    holder; through the slot in the middle of the bulkhead (%(bulk_w).0f x %(bulk_l).1f mm); back to the cable tie saddle on the back wall; up through
    the notch in the lower wall of the board's pocket to the underside of the board.
  Button wires (checked by the same script): only the TWO switch wires make this journey. From the button's socket in the bay
    under the battery, forward and to the right, up past the right-hand end of the battery holder in front of it, along
    under the bulkhead to the slot in the middle of the bulkhead, up through that slot with the sensor lead, then to the
    join below the board with it. The socket's other three wires go nowhere: they are folded back, their bare ends are
    covered, and they are tucked down in the bay beside the socket.
  Battery wires (this route is NOT checked by audit_cable_route.py): the cable's plug stays ABOVE the bulkhead and its two
    loose ends go DOWN, one through the notch at each end of the bulkhead (each notch is about %(notch_w).1f x %(notch_l).1f mm), down the side of
    the box, in through the gap in the rib at that end of the holder, to the holder's pin at that end. Above the bulkhead
    the cable runs across to the cable tie saddle and up through the same notch in the lower wall of the board's pocket to
    the battery socket on the underside of the board. Each bulkhead notch is a closed hole: the front %(notch_front).0f mm of the bulkhead
    closes it. That is why the loose ends are fed through BEFORE they are soldered to the holder (assembly step 4).
  WHAT HOLDS EACH BOUGHT PART (checked by audit_retention.py: free travel in all six directions, target <= 0.5 mm)
    Everything below stays in place with the LID OFF as well (audit_retention.py with AUDIT_ARGS=--lid-off).
    Board: long edges on two rails, pocket walls each side, stops at both ends, and a 45 deg catch on each pocket wall hooked
      over the PCB's long edge (push the board straight in; lever one edge out with a fingernail to remove). With the lid
      on, two lid ribs also sit %(rib_clr).1f mm over its header pad strips.
    Battery: Murata US18650VTC6 cell (18650) in the BeiLaMoo BH18650-PC2 holder (%(hold_l).1f x %(hold_w).1f x %(hold_h).1f, two solder pins about
      %(pin_len).1f mm long, one at each end, %(pin_in).1f mm in from the end face). The holder stands on three ribs %(standoff).0f mm off the back wall so
      its pins and the wires soldered to them have room (%(pin_room).1f mm from pin tip to the back wall), inside ribs on four sides,
      with a snap arm at each end hooked %(arm_over).1f mm over its front face. The arms are slotted free of the end ribs so they can
      flex. With the lid on, two lid posts sit %(post_clr).1f mm in front of the holder's end blocks.
      THREAD, THEN SOLDER, THEN PRESS IN, in that order (HANGER ASSEMBLY ORDER, step 4). The battery cable is ONE 2-pin plug
      with two loose wire ends, and each wire has to pass through its own closed notch at one end of the bulkhead. Once both
      wires are soldered to the holder, the cable and the holder make a closed loop, and a closed loop cannot be threaded
      through two separate holes. So:
        first feed the two LOOSE ends DOWN through the two notches from the board's side, leaving the plug above the bulkhead;
        then, with the holder still OUT of the box, solder each wire to the SIDE of its pin and leave nothing standing beyond
        the pin tip. It has to be done before the holder goes in, because the pins end up behind the holder where no iron
        can reach;
        then press the holder straight in until both arms click, guiding each wire out through the gap in the rib at its end
        of the holder as it goes in, and draw the slack back up through the notches.
      Nothing is cut and nothing is joined to get the wires through.
      POLARITY: the battery lead is the 2-pin JST 1.25 cable with Heltec polarity (the Rokland order in SHOPPING.md). The wrong
      polarity destroys the board, and wire colour proves nothing. The + wire is found against the + and - printed beside the
      board's battery socket (job B5), and the soldered holder is checked with a meter and a cell before the plug ever goes
      into the board (step 4).
      ORDER MATTERS FOR THE OTHER WIRES TOO: the sensor lead slot in the channel roof is UNDER the holder, and the button's five
      wires leave the top of its socket pointing up at the holder's place. Fold the sensor wires forward and deal with all
      five button wires BEFORE the holder is pressed in (see HANGER ASSEMBLY ORDER).
    Cell: the holder's own spring contacts, plus two lid ribs %(cell_clr).1f mm in front of it so it cannot leave the holder.
    Cleaning-mode button: its own nut. The head sits against the underside of the bottom wall and the nut (%(btn_nut).0f mm across its
      corners) clamps it from inside, in the bay under the battery, where it has room to turn between the side wall, the back
      wall and the channel strip. Fitting: push the bare button up through the hole from below, put its nut on from inside
      and tighten, then plug the blue socket onto its pins from inside. The socket will not pass through the hole. A spanner
      does not go round the nut in that corner (the nut's corners pass %(nut_back).1f mm from the back wall and %(nut_side).1f mm from the side wall):
      hold the nut with long-nose pliers and turn the button's head from below.
      Wires: the socket has five. Find the two switch wires with a continuity test (job B6); no colour is given here because
      none has been checked. Only those two go up to the board. The other three are folded back, covered and tucked down in
      the bay, all before the battery holder goes in.
    Hall sensor (the lift sensor): TI DRV5032FA in the TO-92 style (LPG) package, DigiKey part DRV5032FALPG, 25 bought. It is a
      bare flat 3-leg part, body about %(hall_w).1f x %(hall_l).1f x %(hall_t).1f mm. There is no carrier board. It is OMNIPOLAR, so either magnet pole works.
      From the TI datasheet SLVSDC7H (Table 5-1 and Figure 5-5): pin 1 = VCC (the supply, 1.65 to 5.5 V), pin 2 = GND, pin 3 = OUT.
      The output is push-pull and goes LOW while the magnet is present. The sensor switches on at 4.8 mT at most and off again
      at 0.5 mT at least, samples 20 times a second and draws about 1.6 microamps on average at 3 V. TI recommends a 0.1 uF
      capacitor from VCC to GND.
      WHICH LEG IS WHICH (confirmed): Owen's sensors are marked 32FA, and that datasheet lists 32FA as the part marking of the
      DRV5032FALPG. Its Figure 7-1 shows that the "top" of this package is its marked, bevelled front face, and Figure 5-5 is
      the view onto that top, with the pin numbers of Table 5-1. So hold the sensor with its MARKED face (32FA) toward you
      and its legs pointing DOWN:
          LEFT leg   = VCC, goes to 3V3
          MIDDLE leg = GND, goes to GND
          RIGHT leg  = OUT, goes to GPIO6 (HALL_SENSOR_PIN = 6 in firmware/include/pinout.h)
      Never find a leg by putting 3V3 on it and watching what happens. 3V3 on the OUT leg is outside TI's absolute maximum
      ratings and can damage the sensor.
      Legs: the first 3 mm of the legs behind the body must stay bare, straight and unsleeved, because that stretch passes
      between the two pins (the gap between them is %(gate).2f mm). Solder the three wires further back. Keep the joints slim,
      stagger them along the legs so that they do not sit side by side, and heat-shrink each one, because all three have to
      slide down a tunnel %(tunnel_w).1f mm wide and %(tunnel_h).1f mm tall.
      Fitting: hold the bar UPSIDE DOWN. The tunnel roof is then underneath and the sensor rides on it. The roof is one level
      from the back of the bar to the front of the nest (%(tunnel_l).1f mm to the back of the nest), so there is no ramp to climb. The
      only break in it is a slot one 0.2 mm layer deep where the two pin holes open through, just short of the nest: if the
      sensor stops there, ease it back a little, keep it flat and push on. The floor has 45 degree ramps and the side walls
      funnel into the nest. The lead groove up the back of the web opens through the roof over the first %(groove_open).1f mm, so start the
      sensor on the roof just past it. Lay it with its marked face against the roof, legs pointing back, and push it forward
      by its wires until it stops in the nest under the saddle. Keep a light forward push on the wires and turn the bar UPRIGHT:
      the marked face now points UP, toward the magnet. Only then drop the pins in.
      Pins: TWO offcuts of 2.85 mm filament, 6.0 to 6.5 mm long. Never cut one longer, or the sign rests on the pins instead
      of the saddle (each hole is %(pin_depth).1f mm deep). With the bar upright, drop one into each of the two holes in the saddle floor.
      They stand one each side of the legs, right behind the body, so the sensor cannot slide back. The sign's handle sits
      over them. Try both pins in their holes BEFORE the sensor goes in: each must drop in under its own weight and tip out
      again. The %(pin_hole).1f mm holes open through the tunnel roof in printed stages, so no drilling is needed.
      If a pin hole is tight, ease it with a 3 mm drill bit, and do it like this. Wrap a flag of tape round the bit %(drill_tape).0f mm from
      its tip. Twist the bit down the hole BY HAND ONLY, never in a power drill, and STOP when the tape reaches the saddle
      floor. Do not try to stop at the bottom by feel: under each pin hole is a %(push_d).0f mm push-out and drain hole, the ledge round
      that smaller hole is what the pin stands on, and the ledge is only %(ledge_t).1f mm thick. A drill that goes through it ruins
      the bar. Shake the chips out from the back of the bar. Never put a drill down a pin hole with the sensor in the bar. If
      a pin will not drop in with the sensor fitted, the sensor is short of home: push it forward. To get a pin out, push it
      up from below with a 1.5 mm rod through the %(push_d).0f mm hole in the underside of the bar.
    Magnet: %(mag_d).0f x %(mag_t).0f mm N52 disc (TinyTronics), fixed to the sign so that it lies flat over the middle of the saddle when the
      sign hangs. Either face may point down. v9.9 has no printed holder for it yet (the word "tag" further down means that
      holder). For a first test, tape is enough. See MAGNET POSITION ON THE SIGN.
    Antenna: SMA bulkhead pigtail (the U.FL pigtail) and a stubby SMA antenna (about %(ant_d).1f dia x %(ant_l).0f long), both inside the box.
      Take the nut and washer off the pigtail's SMA jack. Slide the jack's threaded neck into the %(ant_slot).1f mm slot in the small
      shelf on the right of the box from the FRONT, with the jack's flange under the shelf. Put the washer and nut back on
      top and tighten: the nut clamps the jack to the shelf. The antenna screws on above and its body snaps into the clip.
      For an outside antenna, push out the knock-out in the top wall and fit the jack there.
    Hook bar: dovetail flanks carry the load; closed channel end in front, backplate behind (about 0.5 mm play each way).
  Wall screws (4 in the backplate; 3 for the gateway, two in keyholes and one in the lower hole) are the only screws. They
  fix the units to the building. The SMA nut and the button's nut are part of the bought parts.

HANGER: the sign hangs from the bar under the bottom edge. Nothing on the face except the display window, the PRG and RST
pads%(led_face)s and the sunk logo and names. The cleaning-mode button is under the base on the right,
pointing down. The web at the back carries the bar %(bar_drop).0f mm below the body; the bar reaches %(reach).0f mm out from the wall face and
ends in a %(lip_h).0f mm lip; the sign's handle settles in the saddle, which is centred %(sy_front).0f mm in front of the body rim (Y=%(sy).0f, which
is %(sy_behind).0f mm BEHIND the lid's outer face), directly over the Hall sensor.
The three Hall leads run along the bar, up the web, forward in a groove in the top of the dovetail plate, then up through the
slot in the channel roof (Y %(wire_y0).1f to %(wire_y1).1f). That slot is under the battery holder (holder front face at Y %(holder_front).1f): the leads come
up into the bay under the battery (%(lead_gap).1f mm clear between the channel strip and the holder), bend forward, stand up in the
%(holder_front).1f mm space between the holder and the lid, and go through the slot in the bulkhead to the board.
Nothing from the bar or the button is soldered straight to the board. The board carries short tails from its J3 holes (hole 1
GND, hole 2 3V3, hole 17 GPIO6 for the sensor; hole 1 GND again and hole 14 GPIO3 for the button), and the leads are joined to
those tails below the board's pocket. The standard join is soldered wire to wire and sleeved with heat shrink, which needs
nothing extra. OPTIONAL: small wire-to-wire plug and socket pairs (JST-PH or similar: a 3-way pair for the sensor and a 2-way
pair for the button) let the board come out later without a soldering iron. They are on no order. SHOPPING.md lists them as
optional too.

HANGER ASSEMBLY ORDER (from a pile of parts to a sign hanging on the wall)
  The AutoCAD stage drawing (stages/) shows the body hung on the backplate before the holder and board go in. Follow THIS
  list: it fits everything on the bench first, because the battery holder needs a firm push to click in and its two wires
  are soldered right beside the box (step 4).
  YOU NEED
    Printed: hanger_body, hanger_lid, hanger_bar, hanger_backplate, and two offcuts of the 2.85 mm filament cut 6.0 to 6.5 mm
      long (the two pins).
    Bought (SHOPPING.md): the Heltec V3 board, the BH18650-PC2 battery holder, one 18650 cell, one DRV5032FALPG Hall sensor, one
      %(mag_d).0f x %(mag_t).0f mm magnet, one 16 mm button with its nut and its blue plug-in socket, one 2-pin JST 1.25 battery cable, the U.FL
      pigtail and the stubby antenna, four No.8 countersunk screws with wall plugs. Also thin hook-up wire in three colours,
      thin heat shrink, a small cable tie, tape, and the 0.1 uF capacitor TI recommends for the sensor.
    Optional, on no order: a 3-way and a 2-way wire-to-wire plug and socket pair (JST-PH or similar). They keep the board
      removable without a soldering iron. Without them the joins below the board are soldered and sleeved, and the build is
      complete either way.
    Tools: soldering iron and solder, meter, small flat screwdriver, wire cutters and strippers, long-nose pliers (for the
      button's nut, where no spanner fits), a small spanner or the pliers for the antenna's nut, a 3 mm drill bit (turned by
      hand, only if a pin hole is tight), a round file (only if the button hole is tight), a torch, a marker and paper, a
      lighter or hot air for the heat shrink, a piece of string, and for the wall a drill, a level, a pencil and a
      screwdriver. A USB-C cable to power the board, and a computer set up for the firmware (job B0).
  BEFORE YOU START (bench jobs: the firmware, the printed parts, the backplate on the wall, the soldering that can be done on
  the bench, the button, the magnet)
    B0. Firmware. A new Heltec board runs the maker's demo program. Until the HazardLink hanger firmware from the repository's
        firmware folder has been loaded onto it (flashed), the unit can report nothing. The flashing steps are documented
        with the firmware, in firmware/README.md under "Build + flash" (it is a PlatformIO project, firmware/platformio.ini,
        and the hanger is its "hanger" environment; firmware/flash.sh is the helper script that goes with it). This file
        does not repeat them. Flashing is done over the USB-C cable. It can be done now, on the bare board, or later with
        the lid on, because the USB-C port is at the edge of the box.
    B1. Printed parts (PRINT.md, After printing).
        Latch arms: push each of the two arm tips in the bottom wall of the body OUTWARD once with a screwdriver (away from
        the inside of the box) to break its small breakaway tab.
        Pins: try both filament pins in the two holes in the saddle floor of the bar. Each must drop in under its own weight
        and tip out again. If one is tight, wrap a flag of tape round a 3 mm drill bit %(drill_tape).0f mm from its tip, twist the bit down
        that hole BY HAND ONLY, and STOP when the tape reaches the saddle floor. Do not try to stop at the bottom by feel: the
        ledge the pin stands on, round the %(push_d).0f mm hole underneath, is only %(ledge_t).1f mm thick. Shake the chips out from the back of
        the bar.
        Tunnel: shine a torch into the tunnel from the back of the bar. It must be clean all the way to the nest.
        Dovetail: slide the bar's plate into the channel in the bottom wall of the body from the BACK of the body and out again
        a few times. If it is tight, see PRINT.md.
        Button hole: with its nut and its blue socket off, push a bare button up through the hole in the bottom wall from
        below. Its thread must pass freely. If it does not, see PRINT.md before using the round file.
    B2. Backplate on the wall. It goes up FIRST, on its own. Hold it against the wall with its four pegs pointing toward you.
        Right way up: the catch tongue in the middle of the plate has its fixed end at the BOTTOM, with its nose and its push
        pad toward the top. As a second check, the pegs are nearer the top: the upper pair is %(peg_top).0f mm below the top edge and
        the lower pair %(peg_bot).0f mm above the bottom edge. Before drilling, hold the body against the plate and see that the four
        pegs line up with the four keyholes in the back of the body. Leave room on the wall: the box overhangs the plate by
        %(bp_tb).0f mm at top and bottom and %(bp_side).0f mm each side, the body has to start %(peg_drop).0f mm above its final place to go on, and the hook bar and
        the whole sign hang below. Level the plate, mark the four holes, drill, fit the plugs, and drive the four No.8
        countersunk screws until their heads are flush: a head left standing proud keeps the body off the plate.
    B3. Board tails (soldering). Work on the UNDERSIDE of the board. J3 is the row of 18 holes along the long edge on the PRG
        button's side. Count the holes from the USB end: hole 1 is GND, hole 2 is 3V3, hole 14 is GPIO3, hole 17 is GPIO6. Check
        those names against Heltec's pinout picture for the WiFi LoRa 32 V3 before soldering. Fit these tails, each long enough
        to reach from its hole, across the underside, out through the notch in the lower wall of the board's pocket in the
        body and a little beyond (hold the board in front of its pocket and measure with the string):
          hole 1 (GND): the sensor and the button share it. Twist two thin tails together into the one hole, or fit one
                        tail and join both GND wires to it later
          hole 2 (3V3): the sensor's supply          hole 17 (GPIO6): the sensor's output
          hole 14 (GPIO3): the button (TEST_BUTTON_PIN = 3 in firmware/include/pinout.h)
        Push each wire in from the underside, solder it, and trim its end flush on the display side, because the lid sits
        close over the board there. Label each tail with tape. If you are using the optional plugs and sockets, the socket
        halves go on these tails (a 3-way for GND, 3V3 and GPIO6, a 2-way for GND and GPIO3), but fit them after the sensor
        check in job B4, which uses the bare ends of the tails.
        The 0.1 uF capacitor goes between the 3V3 tail and the sensor's GND tail, at the far ends of the tails: solder one
        of its legs into each of those two joins when you make them (when you fit the 3-way socket, or in assembly step 7
        if you are joining wire to wire), and sleeve the joins so that the two legs cannot touch. There is no room
        for it in the bar.
    B4. Hall sensor (soldering). The leg order is CONFIRMED, so nothing has to be found out by experiment. Look at the sensor's
        marked face: it must read 32FA. Hold the sensor with that MARKED face toward you and its legs pointing DOWN:
            LEFT leg   = VCC, which goes to the board's 3V3
            MIDDLE leg = GND, which goes to the board's GND
            RIGHT leg  = OUT, which goes to the board's GPIO6
        This comes from the TI datasheet SLVSDC7H: it lists 32FA as the marking of the DRV5032FALPG, its Figure 7-1 shows that
        the marked, bevelled face is the "top" of this package, and its Figure 5-5 (the top view) with Table 5-1 gives pin 1
        = VCC, pin 2 = GND, pin 3 = OUT. If a sensor is marked anything other than 32FA, stop and do not fit it: another
        part may have another leg order. Never put 3V3 on a leg to find out which leg it is. 3V3 on the OUT leg is outside
        TI's absolute maximum ratings and can damage the sensor.
        Choose three wire colours and write down which is VCC, which is GND and which is OUT. Cut the three wires long enough
        to go from the nest to the join below the board's pocket: lay the string along the route on the printed parts (Sensor
        lead, under HOW THE PARTS HOLD TOGETHER) and add some spare.
        Solder: hold the sensor as above, marked face toward you, legs down, and check each wire against your written list
        as you solder it: VCC colour on the LEFT leg, GND colour on the MIDDLE leg, OUT colour on the RIGHT leg. Leave the
        first 3 mm of each leg behind the body bare, straight and unsleeved. Solder the wires further back along the legs,
        stagger the three joints so that they do not sit side by side, keep each joint slim, and shrink a thin sleeve over
        each. All three have to slide down a tunnel %(tunnel_w).1f mm wide and %(tunnel_h).1f mm tall. Leave the far ends of the wires BARE, with no
        plug on them: they still have to be threaded under the closed band on the web (%(band_w).0f x %(band_d).0f mm), up through the slot in
        the channel roof (%(roof_w).0f x %(roof_l).0f mm) and up through the slot in the bulkhead (%(bulk_w).0f x %(bulk_l).1f mm), and a plug may not pass.
        Check the finished sensor (safe, because it is already wired to the confirmed order). The USB cable is unplugged. Twist
        the bare end of the sensor's VCC wire onto the bare end of the board's 3V3 tail, and the bare end of its GND wire
        onto the bare end of a GND tail. Wrap a piece of tape round each twist so that the two cannot touch each other. The
        OUT wire is joined to nothing: wind its bare end round the tip of the meter's red probe, and hold or tape the black
        probe's tip on the GND twist. Set the meter to DC volts. Plug the USB cable into the board. With no magnet near, the
        meter reads HIGH, close to the 3.3 volt supply. Bring the magnet up to the sensor's marked face: the reading falls
        LOW, to about zero. Take the magnet away: it goes HIGH again. That is the only pass. If the reading does not follow
        the magnet like that, unplug the USB cable and check the marking, the leg order and your three joints against the
        list above. Do not swap wires to see what happens. When the check has passed, unplug the USB cable, untwist the two
        joins and take the tape off.
    B5. Battery cable and battery holder: find the + of each. NO soldering yet. The cable is the 2-pin JST 1.25 cable. Its two
        wires are soldered to the holder later, in assembly step 4, AFTER they have been fed through the bulkhead. If they
        are soldered now, the cable can never be threaded (Battery wires, under HOW THE PARTS HOLD TOGETHER).
        a. Find the cable's + wire. Unplug the USB cable from the board first. With nothing connected to the cable's loose
           ends, push its plug into the battery socket on the underside of the board. Look at the + and - printed on the
           board beside the socket and wrap tape round the wire that lines up with +. Then ease the plug out again by its
           plastic body, with a fingernail or the small screwdriver, never by its wires. Wire colour proves nothing.
        b. Find the holder's + end. The cell's + end is the end with the separate round cap and a ring of insulation round
           it; its - end is the plain flat bottom of the can. Put the cell in the holder, following the + and - marks
           moulded into the holder if it has them. Meter on DC volts, one probe on each of the holder's two pins. When the
           reading is positive, with no minus sign, the pin under the RED probe is the + pin. It should be the pin at the
           end where the cell's capped + end sits. Write + on that end of the holder with the marker, so that from now on
           the cell always goes in with its + end there. Take the cell OUT.
        c. Decide which way round the holder goes, and see that the wires are long enough. The printed frame is the same at
           both ends, so the holder fits either way round. This build puts its + end on the LEFT, so that every unit is the
           same. The taped wire will go down through the LEFT notch of the bulkhead to the left pin, the other wire down
           through the RIGHT notch to the right pin, and the right-hand wire has the longer way to go. Lay the string along
           each route on the printed body (Battery wires, under HOW THE PARTS HOLD TOGETHER), from the battery socket's
           place under the board to the holder's pin, and compare it with the cable. If a wire is too short, lengthen it
           now at its loose end with hook-up wire, soldered and sleeved. Keep the join slim: it has to pass down through
           the notch. If it is the taped wire, put tape on its new end as well.
    B6. Button: sort out its five wires. Plug the blue socket onto the button on the bench. Set the meter to continuity
        (the beep setting) and try the five wires in pairs until you find the pair that beeps only while the button is held
        in. Those are the two switch wires. No wire colour is given here, because none has been checked: the meter decides.
        Mark those two with tape. One will go to a GND tail on the board (the second one, or the shared one if you fitted
        only one in job B3) and the other to the GPIO3 tail, either way round.
        The other three wires are connected to nothing (on buttons of this kind they are the switch's third contact and the
        LED). The LED's working voltage is not known yet, so connect the LED wires to nothing until it has been checked
        against the seller's listing. Fold each of the three back along the socket and cover its bare end with heat shrink
        or tape so that it can touch nothing.
        See that the two switch wires are long enough. Lay the string along their route on the printed body (Button wires,
        under HOW THE PARTS HOLD TOGETHER), from the button hole to the join below the board's pocket, and compare it with
        the two taped wires. If they are too short, lengthen them at their far ends with hook-up wire, soldered and
        sleeved. Keep the two joins slim and stagger them, because they have to pass up through the slot in the bulkhead
        (%(bulk_w).0f x %(bulk_l).1f mm) beside the three sensor wires. Leave the far ends bare.
        Take the socket off the button again, because the socket will not pass through the hole in the box. If the socket
        has a latch lever on its side, press the lever while you pull. Pull on the socket's body, never on its wires.
    B7. Magnet on the sign. Fix one %(mag_d).0f x %(mag_t).0f mm magnet flat to the underside of the top edge of the sign's hand hole (the edge
        that will rest on the bar), half way along the hole and in the middle of the handle's thickness. Either face may
        point down. For a first test, tape is enough (see MAGNET POSITION ON THE SIGN).
  ASSEMBLY
  1. Sensor into the bar. Hold the bar UPSIDE DOWN, with the back of the bar (the end with the upright web) toward you. Lay
     the sensor on the tunnel roof, which is now underneath, marked face against the roof, legs and wires pointing back
     toward you, just past the first %(groove_open).1f mm where the web's groove opens through the roof. Push it forward by its wires until it
     stops in the nest. If it stops just short, at the shallow slot where the pin holes open through, ease it back a little,
     keep it flat and push on. Keep a light forward push on the wires, turn the bar UPRIGHT, and drop the TWO pins into the
     two holes in the saddle floor, one each side of the legs. Each pin must end up below the saddle floor. If one will not
     go down, the sensor is short of home: push it forward. Now let go of the wires.
     Thread the three wire ends up under the closed band half way up the back of the web, pull them through, press the
     wires into the groove below and above the band, and lay them forward along the groove in the top of the dovetail plate.
  2. Bar into the body. The channel strip is the raised strip in the floor of the box; its channel is open underneath and at
     the back of the body, and the slot in its roof is near its closed front end. From underneath, pass the three wire ends up
     through that slot so that they come out inside the box, in the bay under the battery. Then slide the bar's dovetail
     plate into the channel from the BACK of the body until it stops against the closed front end, drawing the slack of the
     wires up into the box as it goes so that no wire is pinched between the plate and the channel roof.
  3. Button into the base. Keep to this order, because once the button is tight there is too little room between the top of
     its blue socket and the battery shelf above to push the socket on. Take the nut off the button. From BELOW the box,
     push the button's threaded body only PART of the way up through the %(btn_hole).1f mm hole in the bottom wall (on the right,
     behind the right-hand latch arm), just far enough for the nut to catch. If it came with a rubber sealing ring, the ring
     stays under the head, outside the box. From inside, in the bay under the battery, spin the nut on by a few turns with
     your fingers. Now, while the button still hangs low in its hole, push the blue socket onto the button's pins from inside
     until it is fully home. Then push the button up until its head sits against the underside of the box and spin the nut
     down with your fingers until it touches the wall (a spanner does not go round the nut in that corner). To finish,
     hold the nut still with the long-nose pliers from the open front and give the button's HEAD one last quarter turn
     from below. No more than a quarter turn, so the wires on the socket do not twist. Do not force it: the wall is plastic.
     Now deal with ALL FIVE of the socket's wires, because they leave the top of the socket pointing up at the battery
     holder's place. Fold the three unused wires (folded back and covered in job B6) DOWN beside the socket and see that
     they stay down in the bay, below the shelf that the battery holder will sit on. Lay the two taped switch wires forward
     (toward the open front of the box) and to the right.
  4. Battery cable through the bulkhead, its wires onto the holder, then the holder in. Keep to this order. Each notch at the
     ends of the bulkhead is a closed hole and the cable has one plug, so once both wires are soldered to the holder nothing
     can be threaded any more.
     a. Clear the holder's place. Bend the three sensor wires FORWARD where they come up out of the channel strip. See that
        the button's three unused wires are down in the bay and that its two taped wires lie forward and to the right
        (step 3). Every wire must end up in FRONT of the battery holder, none behind it.
     b. Thread. Each notch is at the very end of the bulkhead, against the side wall, and starts %(notch_front).0f mm back from the front
        edge of the bulkhead. Hold the battery cable above the bulkhead, on the board's side of it, plug uppermost. Feed the
        loose end of the TAPED (+) wire DOWN through the notch at the LEFT end of the bulkhead, and the loose end of the other
        wire DOWN through the notch at the RIGHT end. Pull both down until the plug lies just above the bulkhead. The plug
        stays above the bulkhead from now on. It is not plugged into anything yet.
     c. Solder, with the holder still OUT of the box. Rest the holder across the open front of the box, in front of its own
        place, with its + end (job B5) to the LEFT, turned so that its two pins face you while you solder. Solder the taped
        wire to the SIDE of the pin at the + end, on the left, and the other wire to the SIDE of the pin at the right-hand
        end. Leave nothing standing beyond the pin tip: only %(pin_room).1f mm is left between the pin tips and the back wall.
     d. Check with the meter. The meter decides, whatever the marks and colours say. Keep the cable's plug away from the
        board and from anything metal while the cell is in. Put the cell in the holder, its + end at the holder's + mark.
        Meter on DC volts, red probe on the pin with the taped wire, black probe on the other pin. The reading must be
        positive, with no minus sign. A minus sign means the taped wire is on the - pin. First see that the cell is the
        right way round, its capped + end at the holder's + mark. If it is, the holder was soldered the wrong way round:
        take the cell out, unsolder both wires, turn the holder end for end so that its + end is on the left, solder again
        and check again. Leave the wires in their notches. A reversed lead or a reversed cell destroys the board. Take the
        cell OUT again. It goes in last (step 9).
     e. Holder in. Turn the holder so that its open side (where the cell goes) faces you and its two pins point at the back
        wall, + end still on the left. Press it straight back into its place (the ribbed frame on the back wall, between the
        bay and the bulkhead) until both snap arms click over its front face. As it goes in, guide each battery wire out
        sideways through the gap in the rib at its end of the holder, and draw the slack back up through the notches from
        above. A wire left standing behind the holder's front face gets trapped behind the holder, and then the arms cannot
        click and the lid cannot close.
  5. Thread the wires upward. The bulkhead is the thick shelf across the inside of the box above the battery; its slot is in
     the middle, near the front. Stand the three sensor wires up in front of the holder, in the middle of the box's width,
     and thread them up through that slot. Take the button's two taped wires forward and to the right, up past the right-hand
     end of the holder in front of it, close to the right-hand wall, then along under the bulkhead to the same slot and up
     through it beside the sensor wires. The lid has two posts and two ribs that stand close to the front of the holder. The
     middle %(clear_mid).0f mm of the box's width is clear of them, and so is the corner beside each side wall, so keep the wires to
     those places. Check that the button's three unused wires are still down in the bay. The two battery wires already run
     down through the end notches (step 4): draw any slack in them up above the bulkhead, so that no loop of battery wire
     lies in front of the holder.
  6. Antenna. The U.FL pigtail is the thin antenna cable with a tiny press-on plug at one end and a threaded SMA jack at the
     other. Take the nut and washer off the jack. From the FRONT, slide the jack's threaded neck into the slot in the small
     shelf on the right of the box, above the bulkhead, with the jack's flange UNDER the shelf and its cable hanging down.
     Put the washer and nut back on the thread above the shelf and tighten. Screw the antenna onto the jack from above and
     press its body back into the clip until it snaps in. The right-hand battery wire comes up through its notch just
     below this shelf: lead it past the jack's cable, in front of it or behind it, and see that it is not trapped under
     the bottom of the jack.
  7. Board. The cell is still OUT and the USB cable is unplugged. Hold the board in front of its pocket (top left of the
     box), display toward you, USB port to the left. Pass its tails down through the notch in the lower wall of the pocket.
     Bring the battery plug up through the same notch and push it into the battery socket on the underside of the board;
     check once more that the taped wire sits beside the + printed on the board. Push the board straight in until both
     catches hook over its long edges.
     Check the button before its wires are joined. Set the meter to continuity and put its probes on the bare ends of the
     button's two taped switch wires, where they come up through the bulkhead. It must beep only while the cleaning button
     (on the underside of the box's bottom wall) is pressed in, and stop when the button is let go. If it does not, the
     wrong pair was marked or the socket is not fully home on the button: go back to job B6. For now this is the proof
     that the button is wired correctly, because the firmware support for the button is still to be written.
     Join the wires below the pocket. Sensor: VCC wire to the 3V3 tail, GND wire to a GND tail, OUT wire to the GPIO6 tail,
     using the colours you wrote down in job B4 (the confirmed leg order, marked face toward you and legs down, is LEFT =
     VCC, MIDDLE = GND, RIGHT = OUT: TI datasheet SLVSDC7H, Figures 7-1 and 5-5 with Table 5-1). The 0.1 uF capacitor's two
     legs go in the 3V3 join and that GND join (job B3). Button: one taped wire to the GPIO3 tail, the other to a GND tail
     (the second one, or the shared one if you fitted only one in job B3). The standard way: slide a piece of heat shrink
     onto each wire first, solder wire to wire, then slide the sleeve over the joint and shrink it; leave enough spare to
     pull the ends out of the front of the box while you solder. Shrink every sleeve with the joint pulled well out in
     front of the box and the heat pointed away from the box, and keep the soldering iron off the printed parts. Printed
     plastic goes soft long before heat shrink tightens, and a warped rim or latch arm means printing a new body. A
     piece of card held between the joint and the box is enough protection. With the optional plugs and sockets, fit the plug halves
     to the threaded wires now instead. Gather the bundle and tie it to the cable tie saddle on the back wall below the
     pocket. Keep the bundle and the joins away from the small window in the middle of the back wall: the catch is released
     through it.
     Press the pigtail's small round plug (the U.FL plug) straight down onto its socket on the top of the board, at the end
     away from the USB port, until it clicks.
  8. Body onto the backplate, lid still off. Offer the body up to the backplate %(peg_drop).0f mm higher than its final place, so that the
     four peg heads enter the round parts of the four keyholes in the back of the body. Press it flat to the plate and let it
     slide down %(peg_drop).0f mm until the catch clicks. Try to lift it: it must stay down.
  9. Cell in, its + end at the holder's + mark. It is the last part to go in. The board starts up. With the hanger firmware
     loaded (job B0) its display lights for about a minute after every fresh start. With the maker's demo still on the
     board the display shows the demo instead, and the unit reports nothing until it has been flashed.
  10. Lid. Top tabs into the pockets under the top wall, then swing the bottom edge in until both hooks click. See that no
     wire is caught under the lid's edge and that the PRG and RST pads still click.
  11. Hang the sign on the bar through its hand hole, so that the top edge of the hole rests in the saddle with the magnet over
     the middle. Then check the lift sensor on the display. This needs the hanger firmware (job B0). Press the RST pad: the
     unit restarts and the display lights for about a minute (on a board's very first start it shows its registration
     number on a "Register hanger" screen for a few seconds first). The third line of the status screen ends in "Sign ON"
     while the sign hangs on the bar. Lift the sign off: within a second or two it reads "Sign LIFTED". Hang it back:
     "Sign ON" again. (These words come from showHangerStatus in firmware/src/hanger/hanger.cpp.)
     The cleaning button cannot be tested on the unit yet, because the firmware support for it is still to be written. The
     continuity check in step 7 is the proof that it is wired correctly.

HANGER SERVICE SEQUENCE (unit stays on the wall)
  0. Lift the sign off the bar. The unit senses this as a sign lift.
  1. Pull the lip under one latch arm down 1 mm, ease that corner of the lid out, then the other; pull the bottom edge out until
     the top tabs drop free (about %(open_h_lo).0f to %(open_h_hi).0f mm at the bottom edge) and take the lid away.
  2. The 18650 cell sits in its holder facing you: push it against the spring end and lift it out. Fit the new cell the same
     way round, its + end at the holder's + mark. A reversed cell destroys the board.
  3. To swap the board: take the cell out first. Pull the U.FL plug off the top of the board, lever one long edge of the board
     out from under its catch with a fingernail, lift the antenna end, and ease the JST 1.25 battery plug out of the exposed
     underside by its plastic body, with a fingernail or the small screwdriver, never by its wires. Undo the joins between
     the board's tails and the sensor and button wires below the pocket (cut them if they were soldered, unplug them if the
     optional plugs were fitted). Lift the board out, drawing its tails up through the notch. No screws hold the board: it
     rests on the rails under the two catches. The new board needs the same tails (job B3) and the hanger firmware (job B0).
  4. To swap the cleaning button: hold the head still from below and undo the nut with the long-nose pliers, then spin it up
     the thread with your fingers as far as it will go and let the button drop down in its hole. Now there is room above the
     socket: reach into the bay under the battery and pull the blue socket off the button (press its latch lever if it has
     one, and pull on the socket's body, never on its wires). Take the nut right off and let the button drop out. Fit the
     new one as in assembly step 3. The socket and
     its wires stay in the box, so nothing has to be threaded again. The body stays on the wall.
  5. To swap the Hall sensor: take the cell out. Put a flat screwdriver on the catch's push pad (visible through the window in
     the back wall, above the nose), push it back about 3 mm, lift the body 6 mm, withdraw the tool, lift the remaining 8 mm and
     pull the body forward off the pegs. Undo the join between the sensor's three wires and the board's tails below the
     pocket; the board can stay in. If a plug was fitted and will not pass a slot, cut it off: it goes onto the new sensor's
     wires after they have been threaded. Draw the three wires back down through the bulkhead slot into the bay under the
     battery. Slide the bar slowly out of the back of the body, feeding the wires down into the slot in the channel roof
     from inside the box as it goes. Turn the bar over and tip the two pins out; if one sticks, push it out from below with
     a 1.5 mm rod through the %(push_d).0f mm hole in the bar's underside. Slide the sensor out of the back of the bar, drawing its
     wires out from under the band. Prepare the new sensor as in job B4 and fit it as in assembly steps 1 and 2. The battery
     holder can stay in: the bay under it is open at the front, so reach in and bend the wires forward so that they rise in
     FRONT of the holder, then thread them up through the bulkhead slot and join them to the tails.
  6. Refit in reverse: bar in from the back, body offered up %(peg_drop).0f mm high onto the pegs and dropped until the catch clicks. The
     cell is the last part to go in. Then the lid: top tabs in first, then the latches. If the unit needs a restart
     afterwards, press the RST pad.
  Off the wall in one line: lid off, push the catch pad, lift %(peg_drop).0f mm, pull forward.

GATEWAY OFF THE WALL: lid off, remove the No.8 pan head at (%(g_screw_x).0f, %(g_screw_z).0f) from inside, lift %(key_l).0f mm, pull forward.

WHAT OPENS WITH WHAT
  sign off the bar: hands.   lid: fingernail or coin on the two lips underneath.   body off the backplate: lid off + flat screwdriver.
  bar out of the body: body off the wall.   gateway lid: the two lips underneath.   gateway off the wall: lid off + screwdriver.
  cleaning button out: lid off, its socket taken off from inside, its nut held from inside while the button is unscrewed from
  below, then the button drops out below.

GATEWAY SERVICE SEQUENCE
  1. Pull each arm lip under the box down 1 mm in turn, ease the lid's bottom edge out, and tilt the lid until the top tabs
     drop free (about %(open_g_lo).0f to %(open_g_hi).0f mm at the bottom edge of this shorter lid).
  2. Unplug the USB-C plug (cable stays tied to the saddle), pull the U.FL plug off the board, lever one long edge of the board
     out from under its catch and lift the board off its rails.

MAGNET POSITION ON THE SIGN (the figures a magnet holder on the sign has to be made to)
  Magnet: %(mag_d).0f x %(mag_t).0f mm N52 disc. On the bar centreline (x=%(xc).0f), centred on the saddle (Y=%(sy).0f: %(sy_front).0f mm in front of the body rim,
  %(sy_behind).0f mm behind the lid's outer face), flat face parallel to the saddle floor, facing down. EITHER pole: the DRV5032FA is
  omnipolar. The figures assume a holder (the "tag") that keeps %(tag_clr).1f mm running clearance over the saddle floor and has a
  %(tag_wall).1f mm wall under the magnet (both assumed). Air gap from the magnet's face to the top of the Hall sensor = %(gap).2f mm. A magnet
  taped straight under the handle sits closer than that, which only makes the signal stronger.
  Before fixing the magnet for good, hold it over the saddle with the unit powered and the hanger firmware loaded, press the
  RST pad so that the display lights, and check that the third line of the status screen ends in "Sign ON" with the magnet
  there and "Sign LIFTED" with it taken away (assembly step 11). Last step of the build: hang the sign by its hand hole with
  the handle resting in the saddle, and check again.

PRINTING
  The recipe lives in PRINT.md. If this summary and PRINT.md ever differ, PRINT.md wins. Summary: PLA (Polymaker PolyLite,
  black, hotend 2), 0.4 nozzle, 0.2 mm layers (the first layer 0.2 mm as well), 4 walls (1.6 mm), 1.6 mm top and bottom,
  60 to 100 %% infill, 215 C, fan 100 %%. PET-G is the alternative (+10 C, fan 30 %%).
  Use the STLs in print/: they are already turned the right way up. print/ORIENTATION.txt lists each one's footprint and height.
  WHAT TO PRINT NOW AND WHAT SHOULD WAIT: PRINT.md's first-print list has the detail. In short, two measurements are still
    open. The hook bar's width (BAR_W, %(bar_w).0f mm) is provisional until the sign's hand hole has been measured, so a hanger_bar
    printed before then may have to be printed again. The depth of the display pocket in the hanger lid rests on readings
    taken off a photo, until the display and coil heights have been measured with a caliper (MEASURE BEFORE FREEZING), so
    the same goes for a hanger_lid, and for a full hanger_body too, because the same figure (OLED_H_MAX) also sets how far
    back the board sits in the body. The body coupon is a test piece and is safe to print now, and so are the gateway
    parts. A hanger lid printed now to try on the coupon is a fair test of the latches, the hinge tabs and the lip, because
    none of those depends on either open measurement.
  hanger_body: back face down, open front up. It is %(body_len).0f mm long on the bed now. The dovetail channel runs along the print
    direction so its flanks print clean; its closed front end is a %(dt_mouth).0f to %(dt_top).0f mm bridge (turn the bridge settings on, see
    PRINT.md). The latch arms in the bottom wall each carry a small breakaway tab at the tip so they print cleanly; the hinge
    ribs grow from the bed and their nose pockets are %(nose_pocket).0f mm bridges; peg pocket roofs bridge %(head_w).1f mm. The holder's shelf and
    snap arms and the board pocket walls with their catches stand straight up from the back wall. The button hole is a round
    hole through the bottom wall, which stands upright on the bed, so the top of the hole prints as an unsupported arch only
    as deep as the wall is thick (%(wall).1f mm). If it sags, ease the hole with a round file until the button's thread passes.
    No support.
  hanger_lid: outer face down. Only the lip, the rigid hooks and tabs, ribs, posts and the two pusher pins stand up from it. The hook's catch
    face is a %(hook_barb).0f mm overhang; print the lid with the part fan on. The two finger pads print flat on the bed with %(pad_slot).1f mm
    slots round them: keep brim out of the slots. %(led_print)sNo window insert: the display
    glass itself sits behind the bezel. No support.
  hanger_bar: UPRIGHT on the bar's bottom face (lip pointing up), with NO SUPPORT AT ALL. All bending loads are then in-plane,
    the dovetail flanks and the spreaders are 45 deg, and a 45 deg gusset off the web carries the front %(gusset).1f mm of the
    dovetail plate. Never let the slicer generate support on this part: support inside the sensor tunnel, the nest or the
    pin holes cannot be got out again.
  hanger_backplate: back face down. The catch cavity is open to the back face on purpose: let the slicer drop support through
    it under the tongue (touching the buildplate only) and pull it out afterwards. Pegs print vertical with a 45 deg cone
    under the head.
  gateway_body: back face down. gateway_lid: outer face down.
  print/hanger_body_coupon.stl is the front %(coupon).0f mm ring of the hanger body: rim, both latch arms with their hook windows, the
    front of the hinge ribs, the USB opening. It exists to test the lid latches and the hinge fit, so print it WHOLE and
    leave its bottom edge alone: that edge carries the latch arms. The small scallop in its bottom wall on the bed side is
    the front edge of the button hole and is meant to be there. Print it with one lid before any full body.
  print/hanger_window_gauge.stl is a small test piece that proves the screen lines up with the window on YOUR board before a
    full lid is printed. It is the part of the lid round the display window and the two button pads, with low fences on
    the inside that hold the board exactly where the body will hold it. Print it outer face down like the lid, no
    support. Lay the board in it face down, USB end against the two short stops, and push it flat. Three checks:
    1. The board lies FLAT on the two long ribs and does not rock. If it rocks on the screen or on the coil antenna, the
       pocket is too shallow for your board: tell whoever edits the design (OLED_H_MAX) and do not print the lid yet.
    2. Turn it over with the screen switched on. The WHOLE picture must show inside the window with a dark border all
       round, about the same left and right. If the picture is cut off or sits hard against one edge, note which edge and
       by about how much, and the window is moved in the design (OLED_ACT_CX, OLED_ACT_CY).
    3. Press the PRG pad and the RST pad from the front. Each must click its switch.
  No heat-set inserts and no machine screws. Wall fixings: 4 No.8 countersunk screws with plugs for the backplate, 2 No.8 pan
  heads for the gateway keyholes plus 1 for its lower anti-lift hole.

MEASURE BEFORE FREEZING (still to be measured by Owen)
  The exact display height and coil antenna height above the PCB (now %(oled_h).1f and %(coil_h).1f, read off a side photo at +/- 0.4): close
    the caliper jaws on the top of each and the back of the board, and take off the board thickness. Then set OLED_H_MAX to
    the taller of the two, never below the coil height. OLED_H_MAX sets the depth of the pocket in the hanger lid and also
    how far back the board sits in the hanger body, so a change to it changes both parts.
  Where the coil antenna stands ACROSS the board (COIL Yb, guessed %(coil_yb).1f): one photo looking straight down on the screen side.
    The lid is relieved for a coil centred anywhere within Yb +/- %(coil_band).2f, which is everything inboard of the header pad rows.
  The sign's hand hole: width and height, and the folded handle thickness (assumed %(sign_t).0f in a %(saddle_w).0f mm saddle; %(free_y).0f mm is free
    between the lip and the web). BAR_W %(bar_w).0f is provisional; reach %(reach).0f and lip %(lip_h).0f are assumed. The magnet position in the
    handle must match MAGNET POSITION ON THE SIGN.
  The OLED active area offset (window is %(win_ww).0f x %(win_wh).0f to cover it with margin).
  The working voltage of the button's LED, from the seller's listing, before its LED wires are connected to anything.
  The button's bare pin length (BTN16_PINS_L, assumed %(btn_pins).1f), only if BTN16_USE_SOCKET is ever set to False.
  The length of the JST 1.25 battery cable and of the button socket's wires against their routes in the box (jobs B5 and
    B6 measure them with string and lengthen them if they are short).
  Already taken from the delivered parts: board, BH18650-PC2 holder and its pins, 18650 cell, Hall sensor body, %(mag_d).0f x %(mag_t).0f
    magnet, USB plug body, the 16 mm button with its socket (Owen's caliper photos), stub antenna (about %(ant_d).1f dia x %(ant_l).0f long,
    read off a ruler photo; check the clip fit on the first body).
  No longer open: the Hall sensor's leg order. It is confirmed from the 32FA marking on Owen's sensors and TI's datasheet
    SLVSDC7H (Figures 7-1 and 5-5, Table 5-1): marked face toward you, legs down, LEFT = VCC, MIDDLE = GND, RIGHT = OUT.
  Still to be WRITTEN, in the firmware and outside these files: acting on a press of the cleaning button. pinout.h reserves
    TEST_BUTTON_PIN = 3 and hanger.cpp sets the pin up as an input, but the hanger program does nothing with a press yet.
""" % v
    if not P.get("BTN16_ON"):
        txt = txt.replace("\nWORDS USED IN THIS FILE", "\nNOTE: THIS BUILD WAS MADE WITH BTN16_ON=False. The box has no button hole and no bay under the battery, so every "
                          "paragraph below about the cleaning-mode button and the taller box does not apply to these files.\n\nWORDS USED IN THIS FILE", 1)
    elif not P.get("BTN16_USE_SOCKET"):
        txt = txt.replace("\nWORDS USED IN THIS FILE", "\nNOTE: THIS BUILD WAS MADE WITH BTN16_USE_SOCKET=False. The bay under the battery is sized for the button's bare pins, "
                          "the blue plug-in socket does not fit, and the button's wires are soldered to its pins.\n\nWORDS USED IN THIS FILE", 1)
    if glob.glob(os.path.join(out_dir, "ref", "hanger_window_insert.*")):
        txt = txt.replace("  stages/ ", "  ref/hanger_window_insert.*                    leftover from an older revision (the hanger lid takes no insert). This script no\n"
                          "                                                longer writes it; delete it by hand.\n  stages/ ", 1)
    open(os.path.join(out_dir, "README.txt"), "w").write(txt)

# --------------------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------------------
def main(out_dir, quick=False, autocad=True):
    t0 = time.time()
    os.makedirs(out_dir, exist_ok=True)
    ref_dir = os.path.join(out_dir, "ref"); os.makedirs(ref_dir, exist_ok=True)
    hg, gg = hanger_geom(), gateway_geom()

    # ---- design rule checks FIRST: a parameter change that breaks the design stops here, before any file is overwritten ----
    print("Design rule checks")
    checks = design_checks(hg, gg)
    for ok, msg in checks:
        print("  %s %s" % ("PASS" if ok else "FAIL", msg))
    assert all(ok for ok, _ in checks), "design rule check failed"

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
    inlays = {"hanger_lid": ("hanger_lid_inlay", inlay_of(hanger_marks(), hg["W"], hg["H"], hg["lid_t"])),
              "gateway_lid": ("gateway_lid_inlay", inlay_of(gateway_marks(), gg["W"], gg["H"], gg["lid_t"]))}
    print_lines = [export_print_stl(print_dir, name, wp, PRINT_ORIENT[name], companion=inlays.get(name)) for name, wp in parts.items()]
    for unit, (iname, iwp) in inlays.items():
        cq.exporters.export(iwp, os.path.join(out_dir, iname + ".stl"), tolerance=0.01, angularTolerance=0.1)   # un-rotated copy for previews
    for l in print_lines:
        print("  " + l)
    # test coupon: the front 14 mm ring of the hanger body (rim, both wall arms with their hook windows and pull lips, the front
    # of the hinge ribs with their nose pockets, USB opening). It proves the lid's hooks, hinge tabs, lip fit and the USB
    # opening before the full body is printed. Print it WHOLE: its bottom edge carries the latch arms it is there to test.
    coupon = h_body.intersect(box(-5, hg["W"] + 5, -1, 14.0, -5, hg["H"] + 5))
    # keep only the ring itself: slices of the board cradle are cut loose from the back wall at this depth
    ring = max(coupon.solids().vals(), key=lambda sol: sol.Volume())
    coupon = cq.Workplane("XY").add(ring)
    print_lines.append(export_print_stl(print_dir, "hanger_body_coupon", coupon, "back_down"))
    # window gauge: proves on the real board that the screen lines up with the window, before a full lid is printed
    print_lines.append(export_print_stl(print_dir, "hanger_window_gauge", build_hanger_window_gauge(), "face_down"))
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
    write_part_drawing(os.path.join(out_dir, "hanger_body_drawing.dxf"), "HazardLink hanger body v9.9 (mm)", h_body, [
        dict(view="front", at=28.0, off=(0, -150), label="FRONT SECTION at Y=28 (near back wall): peg bosses, bulkhead, cradle, holder shelf ribs and standoff ribs, holder snap arms, the bay under the battery, dovetail strip, cleaning button hole in the bottom wall",
             dims=[("h", (0, 0), (W, 0), -10), ("v", (0, 0), (0, H), -12),
                   ("h", (P["PEG_XS"][0], P["PEG_ZS"][0]), (P["PEG_XS"][1], P["PEG_ZS"][0]), 55, "peg pitch <>"),
                   ("v", (P["PEG_XS"][1] + 8, P["PEG_ZS"][0]), (P["PEG_XS"][1] + 8, P["PEG_ZS"][1]), 112, "peg pitch <>"),
                   ("v", (W, P["BULK_Z"][0]), (W, P["BULK_Z"][1]), 108, "bulkhead <>"),
                   ("h", (P["HOLDER_X0"] - 0.5, 2.5), (P["HOLDER_X0"] + P["HOLDER_L"] + 0.5, 2.5), -6, "holder bay <>")]),
        dict(view="front", at=5.0, off=(0, -320), label="FRONT SECTION at Y=5 (near lid): USB opening, board pocket walls, wall arms in the bottom wall",
             dims=[("h", (0, zc - P["USB_SLOT_W"] / 2), (0, zc + P["USB_SLOT_W"] / 2), -8, "USB opening <>"),
                   ("v", (x0 - 1, zc - 15), (x0 - 1, zc + 15), -20, "board pocket <>"),
                   ("v", (W, 0), (W, zc), 108, "board centre <>")]),
        dict(view="top", at=zc, off=(0, -400), label="TOP SECTION at Z=%.0f (board centreline): pocket depth, USB opening, end stop" % zc,
             dims=[("v", (W, -D), (W, 0), 108, "depth <>"), ("v", (-1, -pt), (-1, 0), -12, "PCB top <>"),
                   ("h", (0, -D), (P["WALL"], -D), -8, "wall <>")]),
        dict(view="side", at=30.0, off=(320, -150), label="SIDE SECTION at X=30 (through peg pockets, holder bay, board pocket)", label_at=(-35, -8),
             dims=[("h", (-D, 0), (0, 0), -8, "depth <>"), ("v", (2, 0), (2, H), 8)]),
    ], notes=["Section edges only. Reference parts on layer REF where shown. Every 'assumed' value is listed in PARAMS in hazardlink_enclosures.py.",
              "Print body back face down (open front up), no support. 0.4 nozzle, 0.2 layers, 4 walls; the full recipe is in PRINT.md. Peg pocket roofs bridge %.1f mm." % (P["PEG_HEAD_D"] + 2 * P["PEG_HEAD_CLR"]),
              "After printing, push each latch arm tip OUTWARD once (away from the inside of the box) to break its small breakaway tab.",
              "Battery cable (one 2-pin plug, two loose ends): each notch at the ends of the bulkhead is a CLOSED hole. Feed the two loose ends DOWN through the notches from the board side BEFORE they are soldered to the holder, then solder with the holder out of the box, then press the holder in."]
             + (["v9.9 cleaning-mode button: %.1f hole through the bottom wall at x=%.1f, Y=%.1f, behind the right latch arm and clear of the channel strip. Button up through it from below, its nut on from inside, then its plug-in socket from inside (the socket will not pass through the hole). Of the socket's five wires only the two switch wires go up to the board; the other three are covered and tucked down in the bay before the battery holder goes in."
                 % (P["BTN16"][0], P["BTN16_XY"][0], P["BTN16_XY"][1]),
                 "The box is %.0f mm taller than v9.8 for the button (%.0f tall, was %.0f): every feature keeps its place measured from the TOP. The bay under the battery holds only the button and wires."
                 % (P["H_BASEMENT"], H, H - P["H_BASEMENT"])] if P["BTN16_ON"] else []))
    write_part_drawing(os.path.join(out_dir, "hanger_lid_drawing.dxf"), "HazardLink hanger lid v9.9 (mm)", h_lid, [
        dict(view="front", at=-1.5, off=(0, -150), label="FRONT SECTION at Y=-1.5 (inside the lid's thickness): window, display pocket with the coil relief, button pad slots, USB hollow in the left edge",
             dims=[("h", (0, 0), (W, 0), -10), ("v", (0, 0), (0, H), -12),
                   ("h", (cxw - P["WIN_W"] / 2, czw), (cxw + P["WIN_W"] / 2, czw), czw + 14, "window <>"),
                   ("v", (cxw + P["WIN_W"] / 2, czw - P["WIN_H"] / 2), (cxw + P["WIN_W"] / 2, czw + P["WIN_H"] / 2), cxw + 22, "window <>"),
                   ("h", (0, czw), (cxw, czw), czw - 12, "window centre <>"), ("v", (W, 0), (W, czw), 108, "window centre <>")]),
        dict(view="front", at=-2.7, off=(0, -320), label="FRONT SECTION at Y=-2.7 (outer skin): sunk badge, wordmark and button names, button pad slots, window chamfer", dims=[]),
        dict(view="top", at=zc, off=(0, -400), label="TOP SECTION at Z=%.0f (board centreline): display pocket behind the bezel, window chamfer, USB hollow, lip" % zc,
             dims=[("v", (W, -P["LID_T"]), (W, 0), 108, "lid <>"), ("v", (W, 0), (W, P["TONGUE_H"]), 118, "lip <>")]),
        dict(view="side", at=W / 2, off=(320, -150), label="SIDE SECTION at X=50: lip and display pocket", label_at=(-5, -8), dims=[]),
    ], notes=["Print lid outer face down, no support. NO window insert and no cleats: the display module sits in the pocket with its glass behind the %.1f mm bezel." % P["BEZEL_T"],
              "PRG and RST: two finger pads down the left edge, each %.1f x %.1f, %.1f thick, cut free on three sides by %.1f slots, %.1f hinge at the far end, %.1f dia pusher pin behind it over its switch."
              % (hg["x0"] + P["BTN_PAD_X1"] - P["H_PAD_V"][0], P["H_PAD_V"][1], P["BTN_PAD"][2], P["BTN_PAD"][5], P["BTN_PAD"][3], P["H_PAD_V"][2]),
              (("LED: open %.1f light hole in the RST pad. " % P["LED_HOLE_D"]) if P["H_LED_HOLE"] else "No LED hole in the hanger lid. ") + "Badge, wordmark and button names sunk %.1f; second colour inlay: print/hanger_lid_inlay.stl." % P["MARK_DEPTH"]])
    sy = hg["sensor_y"]
    write_part_drawing(os.path.join(out_dir, "hanger_bar_drawing.dxf"), "HazardLink hanger bar v9.9 (mm)", h_bar, [
        dict(view="side", at=W / 2, off=(0, -120), label="SIDE SECTION at X=50: bar, lip, dovetail plate on its 45 deg gusset, saddle, Hall sensor nest and tunnel, lead channel",
             dims=[("h", (-hg["bar_back"], hg["bar_bot"]), (-hg["lip_front"], hg["bar_bot"]), hg["bar_bot"] - 10, "reach from wall <>"),
                   ("v", (-hg["lip_front"], hg["bar_bot"]), (-hg["lip_front"], hg["lip_top"]), -hg["lip_front"] + 8, "lip <>"),
                   ("v", (-hg["bar_back"], hg["bar_bot"]), (-hg["bar_back"], hg["bar_top"]), -hg["bar_back"] - 10, "bar <>"),
                   ("h", (-hg["saddle_y"] - P["BAR_SADDLE_W"] / 2, hg["bar_top"] + 4), (-hg["saddle_y"] + P["BAR_SADDLE_W"] / 2, hg["bar_top"] + 4), hg["bar_top"] + 10, "saddle <>"),
                   ("h", (0, hg["lip_top"] + 4), (-sy, hg["lip_top"] + 4), hg["lip_top"] + 10, "saddle from body rim <>")],
             refs=[h_refs["hall_carrier"][0], h_refs["magnet"][0], h_refs["sign_handle"][0]]),
        dict(view="front", at=sy, off=(0, -230), label="FRONT SECTION through the saddle: bar width, Hall sensor in its nest (tunnel width dimensioned)",
             dims=[("h", (hg["bar_x0"], hg["bar_bot"]), (hg["bar_x1"], hg["bar_bot"]), hg["bar_bot"] - 8, "bar width <>"),
                   ("h", (W / 2 - hg["slot_hw"], hg["slot_ceil"]), (W / 2 + hg["slot_hw"], hg["slot_ceil"]), hg["bar_top"] + 8, "tunnel <>")],
             refs=[h_refs["hall_carrier"][0], h_refs["magnet"][0]]),
        dict(view="top", at=hg["slot_floor"] + 1.0, off=(230, -120), label="TOP SECTION through the Hall tunnel: tunnel from the bar's back face, funnel, sensor nest, two pin holes (dovetail top width dimensioned for reference)",
             dims=[("h", (W / 2 - hg["plate_w1"] / 2, -hg["plate_y0"]), (W / 2 + hg["plate_w1"] / 2, -hg["plate_y0"]), -hg["plate_y0"] + 8, "dovetail top <>")],
             refs=[h_refs["hall_carrier"][0]]),
    ], notes=["Print UPRIGHT on the bar's bottom face, lip pointing up, with NO support at all: a 45 deg gusset off the web carries the front of the dovetail plate. Never let support generate in the sensor tunnel, nest or pin holes. No screws: slides in from the wall side.",
              "Sensor: bare TI DRV5032FA (TO-92 style, flat 3-leg, marked 32FA), marked face up under the saddle. Leg order, confirmed from TI datasheet SLVSDC7H (Figures 7-1 and 5-5, Table 5-1): marked face toward you, legs down, LEFT = VCC (3V3), MIDDLE = GND, RIGHT = OUT (GPIO6). It slides in along the tunnel roof with the bar held UPSIDE DOWN; turn the bar upright before the pins go in.",
              "Two pins of 2.85 filament, 6.0 to 6.5 long (never longer), in the %.1f holes in the saddle floor; %.1f push-out and drain hole under each. No drilling needed. To ease a tight pin hole: a 3 mm drill with a flag of tape %.0f mm from its tip, twisted by hand only, stopped when the tape reaches the saddle floor. The ledge under each pin hole is only %.1f mm thick, so never stop by feel."
              % (P["HALL_PIN_D"], P["HALL_PIN_PUSH_D"], math.floor(hg["saddle_floor"] - (hg["slot_floor"] - 2.0) - 0.5), (hg["slot_floor"] - 2.0) - hg["bar_bot"]),
              "Magnet position on the sign: bar centreline, centred on the saddle %.0f mm in front of the body rim (%.0f mm behind the lid's outer face), flat face parallel to the saddle floor, either pole, %.1f mm running clearance." % (-sy, P["LID_T"] + sy, P["TAG_CLR"])])
    bx0, bz0 = (W - P["BP_W"]) / 2, (H - P["BP_H"]) / 2
    write_part_drawing(os.path.join(out_dir, "hanger_backplate_drawing.dxf"), "HazardLink hanger backplate v9.9 (mm)", h_plate, [
        dict(view="front", at=D + 1.0, off=(0, -150), label="FRONT SECTION at Y=%.0f (just inside the front face): wall screw countersinks, catch tongue" % (D + 1.0),
             dims=[("h", (bx0, bz0), (bx0 + P["BP_W"], bz0), bz0 - 10), ("v", (bx0, bz0), (bx0, bz0 + P["BP_H"]), bx0 - 12),
                   ("h", (bx0 + 10, bz0 + 10), (bx0 + P["BP_W"] - 10, bz0 + 10), bz0 + 4, "screws <>"),
                   ("v", (bx0 + P["BP_W"] - 10, bz0 + 10), (bx0 + P["BP_W"] - 10, bz0 + P["BP_H"] - 10), bx0 + P["BP_W"] + 8, "screws <>")]),
        dict(view="top", at=P["PEG_ZS"][0], off=(0, -310), label="TOP SECTION at Z=%.0f (through the lower pegs): mushroom peg profile" % P["PEG_ZS"][0],
             dims=[("v", (bx0, -D - P["BP_T"]), (bx0, -D), bx0 - 10, "plate <>"), ("v", (bx0 + P["BP_W"], -D), (bx0 + P["BP_W"], -D + P["PEG_STEM_L"] + P["PEG_HEAD_L"]), bx0 + P["BP_W"] + 8, "peg <>"),
                   ("h", (P["PEG_XS"][0], -D), (P["PEG_XS"][1], -D), -D + 14, "peg pitch <>")]),
        dict(view="side", at=P["PEG_XS"][0], off=(260, -150), label="SIDE SECTION at X=%.0f (through both pegs)" % P["PEG_XS"][0], label_at=(-45, -8),
             dims=[("v", (-D, P["PEG_ZS"][0]), (-D, P["PEG_ZS"][1]), -D - P["BP_T"] - 10, "peg pitch <>")]),
    ], notes=["Print back face down, support touching the buildplate only (it reaches the catch tongue through the open back of its cavity). Four No.8 / 4 mm countersunk wall screws with plugs. Spring catch tongue at x=%.0f replaces the security screw (push back from inside to release)." % P["CATCH_X"],
              "The backplate goes on the wall FIRST. Right way up: pegs toward you, the catch tongue's fixed end at the BOTTOM (nose and push pad toward the top); the upper pegs are %.0f below the top edge, the lower pegs %.0f above the bottom edge." % (bz0 + P["BP_H"] - max(P["PEG_ZS"]), min(P["PEG_ZS"]) - bz0),
              "Pegs: %.1f stem x %.1f, %.0f head x %.1f, 45 deg cone under the head. Body slides down %.0f mm onto them." % (P["PEG_STEM_D"], P["PEG_STEM_L"], P["PEG_HEAD_D"], P["PEG_HEAD_L"], P["PEG_DROP"])])
    GW, GH, GD = gg["W"], gg["H"], gg["D"]
    gx0, gzc, gpt = gg["x0"], gg["zc"], gg["pcb_top"]
    gcx, gcz = gx0 + P["OLED_ACT_CX"], gzc + P["OLED_ACT_CY"]
    write_part_drawing(os.path.join(out_dir, "gateway_body_drawing.dxf"), "HazardLink gateway body v9.9 (mm)", g_body, [
        dict(view="front", at=26.0, off=(0, -100), label="FRONT SECTION at Y=26 (just in front of the back wall): tie saddles, cradle (keyhole positions dimensioned)",
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
    write_part_drawing(os.path.join(out_dir, "gateway_lid_drawing.dxf"), "HazardLink gateway lid v9.9 (mm)", g_lid, [
        dict(view="front", at=-1.5, off=(0, -100), label="FRONT SECTION at Y=-1.5 (inside the lid's thickness): window, button pad slots, LED hole, button knock-out",
             dims=[("h", (0, 0), (GW, 0), -10), ("v", (0, 0), (0, GH), -12),
                   ("h", (gcx - P["WIN_W"] / 2, gcz), (gcx + P["WIN_W"] / 2, gcz), gcz + 14, "window <>"),
                   ("h", (0, gcz), (gcx, gcz), gcz - 14, "window centre <>"), ("v", (GW, 0), (GW, gcz), GW + 10, "window centre <>"),
                   ("h", (0, P["G_BTN_KO"][1]), (P["G_BTN_KO"][0], P["G_BTN_KO"][1]), -6, "button KO <>")]),
        dict(view="top", at=gzc, off=(0, -220), label="TOP SECTION at Z=%.0f (board centreline): lip, window insert pocket with its two cleats" % gzc,
             dims=[("v", (GW, -P["LID_T"]), (GW, 0), GW + 10, "lid <>")]),
    ], notes=["Print outer face down, no support. No screws: two hinge tabs at the top, two rigid hooks at the bottom that drop into the spring arms in the body's bottom wall; open with the pull lips under the box.",
              "Gateway lid only: clear window insert %.0f x %.1f x %.1f, fitted from inside under the two cleats. PRG and RST are two %.0f x %.0f pads, PRG above RST." % (P["INSERT_W"], P["INSERT_H"], P["INSERT_T"], P["BTN_PAD"][0], P["BTN_PAD"][1])])
    # assembly stack-up sections
    h_all = [h_body, h_lid, h_bar, h_plate]
    doc = dxf_new(); msp = doc.modelspace()
    dxf_text(msp, "HazardLink hanger v9.9 assembly sections (mm)", (0, 0), (0, 0), h=5.0)
    for (label, at, off) in (("SIDE SECTION at X=%.0f: hanging bar, saddle, Hall sensor in its nest, magnet over it, sign handle, lid, backplate, battery holder on its shelf above the bay" % (W / 2), W / 2, (50, -160)),
                             ("SIDE SECTION at X=%.1f: display window, display behind the bezel (no insert), board on rails, backplate" % cxw, cxw, (300, -160))):
        for s in h_all:
            dxf_edges(msp, section_edges([s], "side", at)[0], "side", off)
        for n, (wp, col) in h_refs.items():
            dxf_edges(msp, section_edges([wp], "side", at)[0], "side", off, layer="REF")
        dxf_text(msp, label, (-D - P["BP_T"], -10), off, h=2.8)
    off = (50, -160)
    mag_face = hg["saddle_floor"] + P["TAG_CLR"] + P["TAG_WALL"]
    sens_top = hg["sensor_z"] + P["HALL_PKG"][2] / 2
    dxf_dim(msp, "v", (-sy, sens_top), (-sy, mag_face), -sy + 30, off, "air gap <>")
    dxf_dim(msp, "h", (-hg["wall_y"], hg["bar_bot"] - 4), (-hg["lip_front"], hg["bar_bot"] - 4), hg["bar_bot"] - 10, off, "reach from wall <>")
    off = (300, -160)
    dxf_dim(msp, "v", (10, czw - P["WIN_H"] / 2), (10, czw + P["WIN_H"] / 2), 20, off, "window <>")
    dxf_dim(msp, "h", (0, zc + 20), (-hg["pcb_top"], zc + 20), zc + 26, off, "PCB top from lid inner face <>")
    doc.saveas(os.path.join(out_dir, "hanger_section.dxf"))
    doc = dxf_new(); msp = doc.modelspace()
    dxf_text(msp, "HazardLink gateway v9.9 assembly sections (mm)", (0, 0), (0, 0), h=5.0)
    g_all = [g_body, g_lid]
    for (view, label, at, off, lab) in (("side", "SIDE SECTION at X=%.1f: window, window insert under its cleats, board on rails" % gcx, gcx, (40, -110), (-30, -10)),
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
        bar_refs = {"hall_carrier", "hall_pin", "sign_handle", "magnet"}
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

    # the design rule checks already ran at the top of main(), before the first export
    write_readme(out_dir, hg, gg)

    # ---- manifest -----------------------------------------------------------------------
    lines = ["HazardLink v9.9 enclosures (sized from the real parts; parts clipped in with the lid off; no screws between the parts; wall-arm latches; flush display; USB-C at the edge; two finger pads; logo; wide bar that prints with no support; bare Hall sensor held by two filament pins; cleaning-mode button under the base of the hanger). Generated by hazardlink_enclosures.py", ""]
    for name, wp in parts.items():
        lines.append("%-22s %s" % (name, bbox_str(wp)))
    lines += ["", "Key derived positions (world frame, mm):",
              "  hanger board: USB-end corners at x=%.1f, centreline z=%.1f, PCB top at Y=%.1f; glass of the %.1f mm display at Y=%.1f (%.1f mm behind the lid's outer face); coil antenna top (%.1f mm) at Y=%.1f, pocket floor at Y=%.1f"
              % (x0, zc, pt, P["OLED_H"], pt - P["OLED_H"], P["LID_T"] + pt - P["OLED_H"], P["COIL"][3], pt - P["COIL"][3], -P["LID_T"] + P["BEZEL_T"]),
              "  hanger window: %.0f x %.0f centred at (%.1f, %.1f); display pocket %.0f x %.1f behind a %.1f mm bezel, no window insert; USB-C opening %.1f x %.1f in the left wall, %.1f mm lid skin over the plug"
              % (P["WIN_W"], P["WIN_H"], cxw, czw, P["OLED_POCKET"][0], P["OLED_POCKET"][1], P["BEZEL_T"], P["USB_SLOT_W"], P["USB_SLOT_H"], P["USB_LID_SKIN"]),
              "  bar: %.0f wide (provisional) x %.0f thick, top %.0f mm below the body bottom, reach %.0f mm from the wall face, lip %.0f tall; saddle at Y=%.0f (%.0f mm in front of the body rim, %.0f mm behind the lid's outer face); prints upright with no support"
              % (P["BAR_W"], P["BAR_T"], P["BAR_DROP"], P["BAR_REACH"], P["BAR_LIP_H"], sy, -sy, P["LID_T"] + sy),
              "  Hall sensor (bare DRV5032FA, TO-92 style, marked 32FA): package centre x=%.0f, Y=%.1f, z=%.2f, marked face up; two pin holes %.1f dia at x=%.1f and x=%.1f, Y=%.2f, %.1f mm deep from the saddle floor, for 2.85 filament pins 6.0 to 6.5 long; %.1f dia push-out hole under each, in a ledge %.1f mm thick"
              % (W / 2, sy, hg["sensor_z"], P["HALL_PIN_D"], hall_pin_xys(hg)[0][0], hall_pin_xys(hg)[1][0], hall_pin_xys(hg)[0][1], hg["saddle_floor"] - (hg["slot_floor"] - 2.0), P["HALL_PIN_PUSH_D"], (hg["slot_floor"] - 2.0) - hg["bar_bot"]),
              "  Hall sensor legs (confirmed, TI SLVSDC7H Figures 7-1 and 5-5, Table 5-1): marked face toward you, legs down: LEFT = VCC (to 3V3), MIDDLE = GND, RIGHT = OUT (to GPIO6, HALL_SENSOR_PIN = 6)",
              "  magnet datum (%.0f x %.0f disc, either pole): bar centreline x=%.0f, Y=%.0f, pole face at z=%.2f (saddle floor + %.1f clearance + %.1f tag wall); sensor package top at z=%.2f; air gap %.2f mm" % (P["MAGNET_D"], P["MAGNET_T"], W / 2, sy, mag_face, P["TAG_CLR"], P["TAG_WALL"], sens_top, mag_face - sens_top),
              "  battery: holder %.1f x %.1f x %.1f, z %.1f to %.1f, front face at Y=%.1f, standing %.1f mm off the back wall; sensor lead slot in the channel roof Y %.1f to %.1f (under the holder, %.1f mm below it)"
              % (P["HOLDER_L"], P["HOLDER_W"], P["HOLDER_H"], P["HOLDER_Z0"], P["HOLDER_Z0"] + P["HOLDER_W"], hg["holder_front"], P["HOLDER_STANDOFF"], P["BAR_WIRE_Y"][0], P["BAR_WIRE_Y"][1], (P["HOLDER_Z0"] - P["HOLDER_CLR"]) - hg["strip_top"]),
              "  battery cable (one 2-pin JST 1.25 plug, two loose ends): each end notch in the bulkhead is a closed hole, so the loose ends are fed DOWN through the notches before they are soldered to the holder, and the plug stays above the bulkhead",
              ]
    if P["BTN16_ON"]:
        blen = btn16_len()
        lines += ["  hanger box: %.0f x %.0f x %.0f, grown DOWNWARD by %.0f mm for the button (it was %.0f tall), every feature keeps its place from the top; backplate %.0f x %.0f; bulkhead z %.0f to %.0f; pegs at z %.0f and %.0f"
                  % (W, H, D, P["H_BASEMENT"], H - P["H_BASEMENT"], P["BP_W"], P["BP_H"], P["BULK_Z"][0], P["BULK_Z"][1], P["PEG_ZS"][0], P["PEG_ZS"][1]),
                  "  cleaning button (Gebildet 16 mm, %s its plug-in socket): %.1f hole through the bottom wall at x=%.1f, Y=%.1f, behind the right latch arm; head %.1f dia x %.1f under the base, %.1f mm from its face to the hook; %.1f mm long behind the head, top at z=%.1f, battery shelf above it at z=%.1f; only its two switch wires go to the board (GND and GPIO3); firmware reserves TEST_BUTTON_PIN = 3 (GPIO3) as the cleaning-mode trigger but the hanger program does not act on a press yet"
                  % ("with" if P["BTN16_USE_SOCKET"] else "without", P["BTN16"][0], P["BTN16_XY"][0], P["BTN16_XY"][1], P["BTN16"][1], P["BTN16"][2], P["BAR_DROP"] - P["BTN16"][2],
                     blen, blen, P["HOLDER_Z0"] - P["HOLDER_CLR"] - P["HOLDER_RIB_T"])]
    lines += ["  gateway board: USB-end corners at x=%.1f, centreline z=%.1f; SMA at (%.0f, %.0f) on the top wall; cable notch at z=%.0f" % (gx0, gzc, P["G_SMA"][0], P["G_SMA"][1], gg["cable_z"]),
              "", "Elapsed %.0f s" % (time.time() - t0)]
    open(os.path.join(out_dir, "manifest.txt"), "w").write("\n".join(lines) + "\n")
    print("\n".join(lines))

    # ---- AutoCAD for Mac deliverables ----------------------------------------------------
    if autocad:
        conv = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "to_autocad.py"))
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
