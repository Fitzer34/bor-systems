// HazardLink — sign tag enclosure (UWB precision finding)
//
// Embeds in the handle of a wet-floor sign. Holds a Qorvo DWM3001CDK
// dev board, a 500mAh LiPo cell, and a 6×3 mm neodymium magnet that
// triggers the hanger's Hall sensor.
//
// Designed for IP67 potting — drop the assembled tag into the
// enclosure, fill with two-part epoxy, snap the lid on.
//
// Print in PETG for prototype; production version should be
// injection-moulded ABS for ruggedness in a wet environment.

$fn = 64;
WALL = 2;
TOL  = 0.25;

// External dimensions — fits the dev kit; production PCB will shrink
// these substantially (target 50 × 25 × 12 mm).
W = 70;
H = 35;
D = 16;

PART = "both";  // "body", "lid", "both"

if (PART == "body" || PART == "both") body();
if (PART == "lid"  || PART == "both") translate([0, 0, D + 5]) lid();

module body() {
    difference() {
        rounded_box(W, H, D - WALL, r = 3);
        translate([WALL, WALL, WALL])
            rounded_box(W - 2*WALL, H - 2*WALL, D, r = 2);
        // USB-C cutout for charging
        translate([-1, H/2 - 4.5, D/2 - 1.5])
            cube([WALL + 2, 9, 3.5]);
        // LED light pipe (charging indicator visible through enclosure)
        translate([W - 8, H/2, D - WALL - 0.5])
            cylinder(d = 2, h = WALL + 1);
        // Magnet recess at the bottom (6×3 mm magnet press-fits in)
        translate([W/2 - 3, 4, -0.1])
            cylinder(d = 6.2, h = 3.2);
    }
    // Battery cradle
    translate([5, H - 14, WALL])
        cube([60, 8, 4]);
}

module lid() {
    rounded_box(W, H, WALL, r = 3);
    translate([WALL + TOL, WALL + TOL, -1])
        rounded_box(W - 2*(WALL + TOL), H - 2*(WALL + TOL), 1, r = 2);
}

module rounded_box(w, h, d, r) {
    hull() for (x = [r, w-r]) for (y = [r, h-r])
        translate([x, y, 0]) cylinder(r = r, h = d);
}
