// HazardLink — wall-mounted hanger enclosure
//
// Holds a Heltec WiFi LoRa 32 V3, a Samsung 50E 21700 cell + holder,
// a DRV5032FA Hall sensor PCB, and a hook for the wet-floor sign.
//
// Print in PETG (slightly flexible, water-resistant) or ABS for
// production. Walls 2.5 mm, internal supports designed for FDM
// printing without supports.
//
// Render: open in OpenSCAD (free), F5 to preview, F6 to render,
// File → Export → STL.
//
// Two halves: print body() and lid() separately, snap together
// after wiring + battery insertion. M3 screws on the back for
// wall mounting (M3 × 20 mm with wall plugs).

// ─── Top-level controls ────────────────────────────────────────
$fn = 64;
WALL = 2.5;
TOL  = 0.3;  // print tolerance — bump up if snap-fit is too tight

// External dimensions (mm) — fits 21700 cell + Heltec + Hall PCB
W = 80;      // width
H = 140;     // height
D = 32;      // depth
HOOK_LEN = 35;
HOOK_DEPTH = 12;

// What to render: "body", "lid", or "both" for visualisation.
PART = "both";

// ─── Main ──────────────────────────────────────────────────────
if (PART == "body" || PART == "both") body();
if (PART == "lid"  || PART == "both") translate([0, 0, PART == "both" ? D + 10 : 0]) lid();

// ─── Body ──────────────────────────────────────────────────────
module body() {
    difference() {
        // Outer shell
        union() {
            rounded_box(W, H, D - WALL, r = 4);
            // Wall mounting flange
            translate([0, H, 0]) rotate([90, 0, 0])
                rounded_box(W, D, 3, r = 2);
            // Sign hook protruding from the bottom
            translate([(W - 15) / 2, -HOOK_LEN, 0]) hook();
        }
        // Hollow it out
        translate([WALL, WALL, WALL])
            rounded_box(W - 2*WALL, H - 2*WALL, D, r = 3);

        // Battery compartment divider hole (for cable pass-through)
        translate([W/2, 50, WALL + 5])
            rotate([0, 90, 0])
            cylinder(d = 6, h = W, center = true);

        // Wall-mount screw holes (2× M3)
        for (x = [W/2 - 35, W/2 + 35])
            translate([x, H + 1, -1])
                rotate([90, 0, 0])
                cylinder(d = 3.5, h = 10);

        // USB-C cutout — left side, midway
        translate([-1, H/2 - 5, D/2 - 3]) cube([WALL + 2, 10, 6]);

        // OLED window (Heltec board has a built-in OLED — let it show through)
        translate([W/2 - 14, H/2 - 25, -1])
            cube([28, 14, WALL + 2]);

        // Snap-fit groove for lid (around the inner perimeter)
        translate([WALL - TOL, WALL - TOL, D - WALL - 1.5])
            rounded_box(W - 2*(WALL - TOL), H - 2*(WALL - TOL), 1.5, r = 3);
    }

    // Battery holder posts (4 corners of a 21700 footprint)
    translate([WALL + 2, WALL + 2, WALL])
        battery_holder();

    // PCB mount posts for the Heltec (50.5 mm × 25.5 mm spacing)
    pcb_offset_x = (W - 50.5) / 2;
    pcb_offset_y = H - 65;
    for (dx = [0, 50.5])
        for (dy = [0, 25.5])
            translate([pcb_offset_x + dx, pcb_offset_y + dy, WALL])
                pcb_post();
}

// ─── Lid ───────────────────────────────────────────────────────
module lid() {
    difference() {
        union() {
            rounded_box(W, H, WALL, r = 4);
            // Snap-fit lip (sits inside the body's groove)
            translate([WALL + TOL, WALL + TOL, -1.5])
                difference() {
                    rounded_box(W - 2*(WALL + TOL), H - 2*(WALL + TOL), 1.5, r = 3);
                    translate([2, 2, -0.5])
                        rounded_box(W - 2*(WALL + TOL) - 4, H - 2*(WALL + TOL) - 4, 2, r = 2);
                }
        }
    }
}

// ─── Helpers ───────────────────────────────────────────────────
module rounded_box(w, h, d, r = 3) {
    hull() {
        for (x = [r, w - r])
            for (y = [r, h - r])
                translate([x, y, 0])
                    cylinder(r = r, h = d);
    }
}

module hook() {
    // J-shaped hook for the wet-floor sign loop
    difference() {
        cube([15, HOOK_LEN, HOOK_DEPTH]);
        translate([2, 5, 1])
            cube([11, HOOK_LEN - 5, HOOK_DEPTH - 2]);
    }
    translate([0, HOOK_LEN, 0])
        rotate([0, 0, -90])
        difference() {
            cube([HOOK_DEPTH, 15, HOOK_DEPTH]);
            translate([1, 2, 1])
                cube([HOOK_DEPTH - 2, 11, HOOK_DEPTH - 2]);
        }
}

module battery_holder() {
    // 21700 cell is 21 mm × 70 mm.
    cell_d = 22;
    cell_l = 72;
    difference() {
        // Cradle
        translate([0, 0, 0]) cube([cell_d + 4, cell_l + 4, cell_d / 2 + 2]);
        translate([2, 2, 2])
            rotate([90, 0, 90])
            cylinder(d = cell_d, h = cell_l + 4, center = false);
        // Slot for spot-welded tabs at each end
        translate([cell_d / 2 - 5, -1, 5])  cube([10, 3, cell_d]);
        translate([cell_d / 2 - 5, cell_l + 2, 5]) cube([10, 3, cell_d]);
    }
}

module pcb_post() {
    difference() {
        cylinder(d = 5, h = 6);
        cylinder(d = 1.5, h = 6.1);  // self-tapping M2 screw
    }
}
