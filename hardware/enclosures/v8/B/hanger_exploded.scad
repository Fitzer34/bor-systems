
// HazardLink hanger, exploded (Designer B). Parts placed back into the body frame.
color("slategray") translate([0,0,-8.0-45]) import("/Users/owenfitzpatrick/Downloads/bor-systems/hardware/enclosures/v8/B/hanger_backplate.stl");
color("gold") import("/Users/owenfitzpatrick/Downloads/bor-systems/hardware/enclosures/v8/B/hanger_body.stl");
color("khaki") translate([0,0,45]) translate([0,130.0,38.0]) rotate([180,0,0]) import("/Users/owenfitzpatrick/Downloads/bor-systems/hardware/enclosures/v8/B/hanger_lid.stl");
color("dimgray") translate([0,0,100]) translate([50.0,50.0,38.0]) rotate([0,-90,0]) translate([0,-20.0,-11.0]) import("/Users/owenfitzpatrick/Downloads/bor-systems/hardware/enclosures/v8/B/hanger_hook.stl");
color("darkgreen") translate([0,0,20]) import("/Users/owenfitzpatrick/Downloads/bor-systems/hardware/enclosures/v8/B/ref_heltec_hanger.stl");
color("gray") translate([0,0,20]) import("/Users/owenfitzpatrick/Downloads/bor-systems/hardware/enclosures/v8/B/ref_cell_holder.stl");
color("black") translate([0,0,20]) import("/Users/owenfitzpatrick/Downloads/bor-systems/hardware/enclosures/v8/B/ref_stub_antenna.stl");
color("firebrick") translate([0,0,100]) import("/Users/owenfitzpatrick/Downloads/bor-systems/hardware/enclosures/v8/B/ref_hall_carrier.stl");
