"""Does the Hall sensor lead have a clear path from the bar to the board with everything assembled and the lid ON?
Sweeps a wire-sized probe along the intended route and reports any printed part or component it would cut through.

The probe is one sleeved wire. It starts in the tunnel BEHIND the two retaining pins, because only the sensor's bare
legs pass between the pins: the first 3 mm of leg behind the body stays bare, straight and unsleeved, and the soldered,
heat-shrunk joints sit further back where the tunnel is full width. The gate between the pins is covered by
design_checks in hazardlink_enclosures.py, so it is left out here (a sleeved probe there would report a blockage, which
is the intended design).
The slot in the channel roof opens UNDER the battery holder. On the bench that sets the order: feed the leads up through
the roof slot and fold them forward BEFORE the holder is pressed in, then stand them up in front of the holder."""
import sys, importlib.util
sys.argv = ["x"]
spec = importlib.util.spec_from_file_location("hl", "hazardlink_enclosures.py"); hl = importlib.util.module_from_spec(spec); spec.loader.exec_module(hl)
import cadquery as cq
P = hl.P; g = hl.hanger_geom()
parts = {"body": hl.build_hanger_body(), "lid": hl.build_hanger_lid(), "bar": hl.build_hanger_bar(), "backplate": hl.build_hanger_backplate()}
refs = {k: v[0] for k, v in hl.hanger_refs().items() if k in ("holder", "cell", "heltec", "hall_pin", "stub_antenna", "clean_button")}
everything = dict(parts, **refs)

def seg(a, b, d):
    v = cq.Vector(*b) - cq.Vector(*a)
    s = cq.Solid.makeCylinder(d / 2, v.Length, cq.Vector(*a), v.normalized())
    return cq.Workplane("XY").add(s).union(cq.Workplane("XY").sphere(d / 2).translate(b))

zb = (g["slot_floor"] + g["slot_ceil"]) / 2          # mid height of the Hall sensor tunnel in the bar (the keys still say "slot")
zg = g["plate_z1"] - 0.75                             # mid height of the groove in the top of the dovetail plate
x_notch = P["LEAD_NOTCH"]; xn = g["x0"] + (x_notch[0] + x_notch[1]) / 2
B = P.get("H_BASEMENT") or 0.0                       # the box grew downward by this much for the button under the base
route = [
  ("in the bar: Hall tunnel from behind the two pins to web", (48.5, 3.0, zb),   (48.5, 29.0, zb),  1.4),
  ("up the open groove in the back of the web",               (50.0, 30.5, zb),  (50.0, 30.5, zg),  1.4),
  ("forward in the groove on top of the dovetail plate",      (50.0, 30.5, zg),  (50.0, 8.5, zg),   1.4),
  ("up through the slot in the body's channel roof",          (50.0, 8.5, zg),   (50.0, 8.5, 7.4),  1.4),
  ("forward in the passage under the battery holder",         (50.0, 8.5, 7.4),  (50.0, 4.2, 7.4),  1.4),
  ("straight up in front of the battery holder",              (50.0, 4.2, 7.4),  (50.0, 4.2, 32.0 + B), 1.4),
  ("through the slot in the bulkhead",                        (50.0, 4.2, 32.0 + B), (50.0, 4.2, 50.0 + B), 1.4),
  ("back and across to under the board",                      (50.0, 4.2, 50.0 + B), (xn, 16.0, 70.0 + B),  1.4),
  ("up through the notch in the board cradle wall",           (xn, 16.0, 70.0 + B),  (xn, 16.0, 96.0 + B),  1.4),
]
if P.get("BTN16_ON"):
    # the cleaning button's own wires: from its pins in the bay under the battery, forward, up in front of the holder's
    # right end, through the bulkhead in front of the antenna shelf, then across to the same notch under the board
    bx, by = P["BTN16_XY"]; zt = hl.btn16_len() + 2.0
    bz0, bz1 = P["BULK_Z"]
    xr = hl.P["H_W"] - 7.5                                # between the lid's right holder post and the side wall
    route += [
      ("button wires: from the pins forward and to the right", (bx, by, zt),          (xr, 3.5, zt),         1.4),
      ("button wires: up past the battery holder's right end", (xr, 3.5, zt),         (xr, 3.5, bz0 - 1.8),  1.4),
      ("button wires: along under the bulkhead to its slot",   (xr, 3.5, bz0 - 1.8),  (52.0, 4.2, bz0 - 1.8), 1.4),
      ("button wires: up through the bulkhead slot",           (52.0, 4.2, bz0 - 1.8), (52.0, 4.2, bz1 + 4.0), 1.4),
    ]
ok = True
for label, a, b, d in route:
    probe = seg(a, b, d)
    hits = []
    for name, shape in everything.items():
        try: v = probe.intersect(shape).val().Volume()
        except Exception: v = 0.0
        if v > 0.05: hits.append("%s %.1f mm3" % (name, v))
    print("%-58s %s" % (label, "CLEAR" if not hits else "BLOCKED by " + ", ".join(hits)))
    ok = ok and not hits
print("ROUTE", "CLEAR end to end" if ok else "HAS A BLOCKAGE")
