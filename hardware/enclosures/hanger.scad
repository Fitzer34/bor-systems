// HazardLink — wall-mounted hanger enclosure (v7 — flush mount + grippy lid)
//
// CHANGES FROM v6:
//   1. Body sits FLUSH against backplate. Backplate is now thick enough
//      to contain the entire keyhole pocket — peg goes INTO the
//      backplate, not through it. Body's back face touches backplate's
//      front face with no gap.
//   2. Lid has a 3 mm raised lip around its perimeter that press-fits
//      into a matching recess in the body's front opening. Like a
//      Tupperware container. Plus 2 spring tabs at the bottom edge
//      that clip into pockets — these are the REAL retention, the lip
//      is just for water/dust sealing.
//   3. Bigger / more obvious snap tabs (3 mm protrusion, easy to print).

$fn = 64;
WALL = 2.5;
TOL  = 0.4;
PART = "exploded";   // "backplate" / "body" / "lid" / "assembled" / "exploded"

// ─── Shared alignment constants (world Z) ─────────────────────────────
PEG_TOP_Z   = 80;
PEG_BOT_Z   = 25;
PEG_SPACING = 50;

// ─── Component dimensions ────────────────────────────────────────────
HELTEC_W = 50.8; HELTEC_H = 25.4;
HELTEC_MOUNT_DX = 45.0; HELTEC_MOUNT_DY = 19.0;
HELTEC_USB_W = 9.0; HELTEC_USB_H = 3.5;
HELTEC_OLED_W = 25.0; HELTEC_OLED_H = 14.0;
HOLDER_L = 77.0; HOLDER_W = 22.0;
BUTTON_DIA = 16.5;
HALL_DIA = 5.5;

// ─── Enclosure dimensions ────────────────────────────────────────────
W = 100; H = 130; D = 35;

// Front hook
HOOK_ARM = 32; HOOK_LIP = 22; HOOK_W = 22; HOOK_T = 9; HOOK_BASE_BOOST = 6;

// Backplate — thicker than v6 so it can contain the entire peg pocket
BP_W = 90; BP_H = 110; BP_T = 9;          // 9 mm thick — peg pocket fits inside
BP_SCREW_DIA = 4.5;
BP_SCREW_INSET = 10;

// Peg geometry (peg sticks out the BACK of the body, into the backplate)
PEG_HEAD_DIA = 9;
PEG_HEAD_T   = 2.5;
PEG_STEM_DIA = 4.5;
PEG_STEM_LEN = 3;         // total peg length = HEAD_T + STEM_LEN = 5.5 mm
PEG_TOTAL    = PEG_HEAD_T + PEG_STEM_LEN;

// Matching pocket in backplate (deeper than peg total so body sits flush)
POCKET_DEPTH    = 6.5;     // pocket is 1 mm deeper than the peg
POCKET_BIG_DIA  = PEG_HEAD_DIA + 1.5;
POCKET_SLOT_W   = PEG_STEM_DIA + 1.2;
POCKET_SLOT_LEN = 14;

// Lid lip-fit
LID_LIP_W = 2;            // lip thickness (out from lid perimeter)
LID_LIP_H = 4;            // how deep the lip sits into the body
LID_RECESS_W = LID_LIP_W + TOL;  // matching body recess

// Lid bottom snap tabs (2 of them, bigger than v6)
SNAP_TAB_W = 18;
SNAP_TAB_T = 3;           // bigger protrusion = better grip
SNAP_TAB_H = 5;

// Security screw (M3)
SEC_SCREW_DIA = 3.2;

// ─── Main render ─────────────────────────────────────────────────────
EX = PART == "exploded" ? 40 : 0;

if (PART == "body" || PART == "assembled" || PART == "exploded") body();

if (PART == "lid" || PART == "assembled" || PART == "exploded")
    translate([0, D + 5 + EX, 0])
        lid();

if (PART == "backplate" || PART == "assembled" || PART == "exploded") {
    bp_x = (W - BP_W) / 2;
    bp_y = (PART == "backplate") ? -BP_W - 25 : -BP_T - EX;
    translate([bp_x, bp_y, 0])
        backplate();
}

// ─── Backplate ───────────────────────────────────────────────────────
// 4 corner wall-screw holes + 2 keyhole POCKETS milled into the front
// face. Pockets are deep enough to swallow the peg entirely so the
// body sits flush against the backplate's front.
module backplate() {
    difference() {
        rounded_box(BP_W, BP_T, BP_H, r = 5);

        // 4 wall-mount countersunk screw holes
        for (x = [BP_SCREW_INSET, BP_W - BP_SCREW_INSET])
            for (z = [BP_SCREW_INSET, BP_H - BP_SCREW_INSET])
                translate([x, -0.1, z]) {
                    rotate([-90, 0, 0])
                        cylinder(d = BP_SCREW_DIA, h = BP_T + 0.2);
                    translate([0, BP_T - 2, 0])
                        rotate([-90, 0, 0])
                        cylinder(d1 = BP_SCREW_DIA, d2 = BP_SCREW_DIA + 5, h = 2);
                }

        // 2 keyhole pockets (cut INTO front face, NOT through-cuts)
        // Front face of backplate is at local y=0 — pocket opens HERE
        for (x_off = [-PEG_SPACING/2, PEG_SPACING/2])
            for (z = [PEG_TOP_Z, PEG_BOT_Z])
                translate([BP_W/2 + x_off, -0.1, z])
                    keyhole_pocket();

        // Security-screw thread receiver (bottom centre)
        translate([BP_W/2, BP_T/2, -0.1])
            cylinder(d = 2.6, h = 8);
    }
}

// Keyhole pocket — big circle at top + narrow slot extending DOWN.
// Cut into the FRONT face of the backplate (so body can press in and slide).
module keyhole_pocket() {
    // Big circle at peg's Z position
    rotate([-90, 0, 0])
        cylinder(d = POCKET_BIG_DIA, h = POCKET_DEPTH + 0.1);
    // Narrow slot going DOWN
    translate([-POCKET_SLOT_W/2, 0, -POCKET_SLOT_LEN])
        cube([POCKET_SLOT_W, POCKET_DEPTH + 0.1, POCKET_SLOT_LEN + 0.1]);
}

// ─── Body ────────────────────────────────────────────────────────────
module body() {
    difference() {
        union() {
            rounded_box(W, D, H, r = 5);

            // 4 pegs on BACK face (positioned to align with backplate pockets)
            for (x_off = [-PEG_SPACING/2, PEG_SPACING/2])
                for (z = [PEG_TOP_Z, PEG_BOT_Z])
                    translate([W/2 + x_off, 0, z])
                        peg();
        }

        // Hollow inside
        translate([WALL, WALL, WALL])
            cube([W - 2*WALL, D - WALL + 1, H - 2*WALL]);

        // Cleaning button (bottom face, centre)
        translate([W/2, D/2, -0.1])
            cylinder(d = BUTTON_DIA, h = WALL + 0.2);

        // USB-C cutout (left side)
        translate([-1, D/2 - 4, H - 35])
            cube([WALL + 2, HELTEC_USB_W + 2, HELTEC_USB_H + 2]);

        // Security screw hole (bottom, offset from button)
        translate([W/2 + 20, D/2, -0.1])
            cylinder(d = SEC_SCREW_DIA, h = WALL + 0.2);

        // ---- Lid lip RECESS around front-face perimeter ----
        // Cut a 2 mm trench into the inside edge of the front opening
        // so the lid's lip slides into it (Tupperware-style fit).
        translate([WALL - LID_RECESS_W, D - LID_LIP_H - 0.1, WALL - LID_RECESS_W])
            difference() {
                cube([W - 2*(WALL - LID_RECESS_W), LID_LIP_H + 0.2, H - 2*(WALL - LID_RECESS_W)]);
                translate([LID_RECESS_W, -0.1, LID_RECESS_W])
                    cube([W - 2*WALL, LID_LIP_H + 0.4, H - 2*WALL]);
            }

        // ---- Snap tab POCKETS on the BOTTOM inside edge of the body ----
        // The lid's 2 bottom tabs click into these.
        for (x_off = [-22, 22])
            translate([W/2 + x_off - SNAP_TAB_W/2, D - WALL - SNAP_TAB_T - 0.5, 6])
                cube([SNAP_TAB_W, SNAP_TAB_T + 1, SNAP_TAB_H]);
    }

    // Internal mounts
    translate([WALL + 4, WALL, WALL + 8]) battery_holder_seat();
    pcb_origin_x = (W - HELTEC_W) / 2;
    pcb_origin_z = H - 30 - HELTEC_H;
    for (dx = [(HELTEC_W - HELTEC_MOUNT_DX)/2, (HELTEC_W + HELTEC_MOUNT_DX)/2])
        for (dz = [(HELTEC_H - HELTEC_MOUNT_DY)/2, (HELTEC_H + HELTEC_MOUNT_DY)/2])
            translate([pcb_origin_x + dx, WALL, pcb_origin_z + dz])
                rotate([-90, 0, 0])
                pcb_post();
    translate([W/2 - HALL_DIA/2 - 1, D - WALL - 8, 45]) hall_bracket();
}

// Mushroom-headed peg — sized to fit in the backplate's pocket.
// Sticks out the BACK face of the body in the -Y direction.
// Stem (length PEG_STEM_LEN) first, then mushroom head at the far end.
module peg() {
    // Stem: from body back face (y=0) extending to y=-PEG_STEM_LEN
    rotate([90, 0, 0])
        cylinder(d = PEG_STEM_DIA, h = PEG_STEM_LEN);
    // Head: from y=-PEG_STEM_LEN extending to y=-(PEG_STEM_LEN+PEG_HEAD_T)
    translate([0, -PEG_STEM_LEN, 0])
        rotate([90, 0, 0])
        cylinder(d = PEG_HEAD_DIA, h = PEG_HEAD_T);
}

// ─── Lid ─────────────────────────────────────────────────────────────
// Flat plate + 3 mm raised lip around the perimeter (presses into the
// body's recess for a snug fit) + 2 bottom snap tabs for retention.
module lid() {
    difference() {
        union() {
            // Flat plate
            rounded_box(W, WALL, H, r = 5);

            // Raised lip around perimeter (sticks INTO the body)
            translate([WALL - LID_LIP_W, WALL, WALL - LID_LIP_W])
                difference() {
                    cube([W - 2*(WALL - LID_LIP_W), LID_LIP_H, H - 2*(WALL - LID_LIP_W)]);
                    translate([LID_LIP_W, -0.1, LID_LIP_W])
                        cube([W - 2*WALL, LID_LIP_H + 0.2, H - 2*WALL]);
                }

            // 2 bottom snap tabs (the real retention)
            for (x_off = [-22, 22])
                translate([W/2 + x_off - SNAP_TAB_W/2, WALL, 6])
                    snap_tab();

            // J-HOOK on the OUTER face of the lid (lid local y=0).
            // Arm extends forward (-Y in lid coords = +Y in world after
            // the assembly translate) — sticks AWAY from the wall.
            // Upturned lip catches the sign loop.
            translate([(W - HOOK_W)/2, 0, 45])
                mirror([0, 1, 0])
                hook();
        }

        // OLED window
        translate([W/2 - HELTEC_OLED_W/2, -0.1, H - 30 - HELTEC_OLED_H])
            cube([HELTEC_OLED_W, WALL + 0.2, HELTEC_OLED_H]);

        // Buzzer grill (3×3 of small holes top-right)
        for (i = [-1, 0, 1])
            for (j = [-1, 0, 1])
                translate([W - 25 + i * 4, -0.1, H - 25 + j * 4])
                    rotate([-90, 0, 0])
                    cylinder(d = 2.2, h = WALL + 0.2);

        // Pry-off notch at the bottom centre
        translate([W/2 - 8, -0.1, 3])
            cube([16, WALL + 0.2, 2.5]);
    }
}

// Beefier snap tab (3mm protrusion, easier to release with a fingernail)
module snap_tab() {
    hull() {
        cube([SNAP_TAB_W, 0.1, SNAP_TAB_H]);
        translate([0, SNAP_TAB_T, SNAP_TAB_H * 0.3])
            cube([SNAP_TAB_W, 0.1, SNAP_TAB_H * 0.4]);
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────
module rounded_box(w, d, h, r = 3) {
    hull()
        for (x = [r, w - r])
            for (z = [r, h - r])
                translate([x, 0, z])
                    rotate([-90, 0, 0])
                    cylinder(r = r, h = d);
}

module hook() {
    hull() {
        cube([HOOK_W, HOOK_T, HOOK_T + HOOK_BASE_BOOST]);
        translate([0, 10, HOOK_BASE_BOOST])
            cube([HOOK_W, 0.1, HOOK_T]);
    }
    translate([0, 0, HOOK_BASE_BOOST])
        cube([HOOK_W, HOOK_ARM, HOOK_T]);
    translate([0, HOOK_ARM - HOOK_T, HOOK_BASE_BOOST])
        cube([HOOK_W, HOOK_T, HOOK_LIP]);
}

module battery_holder_seat() {
    cube([HOLDER_W + 4, 4, HOLDER_L]);
    for (x = [0, HOLDER_W + 2])
        translate([x, 0, 0])
            cube([2, 8, HOLDER_L]);
}

module pcb_post() {
    h = 6;
    difference() {
        cylinder(d = 5, h = h);
        cylinder(d = 1.7, h = h + 0.1);
    }
}

module hall_bracket() {
    difference() {
        cube([HALL_DIA + 4, 6, HALL_DIA + 4]);
        translate([HALL_DIA/2 + 2, 6.1, HALL_DIA/2 + 2])
            rotate([90, 0, 0])
            cylinder(d = HALL_DIA + 0.3, h = 7);
    }
}
