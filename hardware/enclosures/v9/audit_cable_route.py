"""Does the Hall sensor lead have a clear path from the bar to the board with everything assembled and the lid ON?
Sweeps a wire-sized probe along the intended route and reports any printed part or component it would cut through."""
import sys, importlib.util
sys.argv = ["x"]
spec = importlib.util.spec_from_file_location("hl", "hazardlink_enclosures.py"); hl = importlib.util.module_from_spec(spec); spec.loader.exec_module(hl)
import cadquery as cq
P = hl.P; g = hl.hanger_geom()
parts = {"body": hl.build_hanger_body(), "lid": hl.build_hanger_lid(), "bar": hl.build_hanger_bar(), "backplate": hl.build_hanger_backplate()}
refs = {k: v[0] for k, v in hl.hanger_refs().items() if k in ("holder", "cell", "heltec", "hall_pin", "stub_antenna")}
everything = dict(parts, **refs)

def seg(a, b, d):
    v = cq.Vector(*b) - cq.Vector(*a)
    s = cq.Solid.makeCylinder(d / 2, v.Length, cq.Vector(*a), v.normalized())
    return cq.Workplane("XY").add(s).union(cq.Workplane("XY").sphere(d / 2).translate(b))

zb = (g["slot_floor"] + g["slot_ceil"]) / 2          # mid height of the sensor slot in the bar
zg = g["plate_z1"] - 0.75                             # mid height of the groove in the top of the dovetail plate
x_notch = P["LEAD_NOTCH"]; xn = g["x0"] + (x_notch[0] + x_notch[1]) / 2
route = [
  ("in the bar: sensor slot and lead tunnel to the web",      (48.5, 3.0, zb),   (48.5, 29.0, zb),  1.4),
  ("up the shaft inside the web",                             (50.0, 29.0, zb),  (50.0, 29.0, zg),  1.4),
  ("forward in the groove on top of the dovetail plate",      (50.0, 29.0, zg),  (50.0, 8.5, zg),   1.4),
  ("up through the slot in the body's channel roof",          (50.0, 8.5, zg),   (50.0, 8.5, 9.0),  1.4),
  ("sideways under the battery holder's front edge",          (50.0, 9.8, 9.0),  (6.0, 9.8, 9.0),   1.4),
  ("back and up beside the holder's end",                     (6.0, 9.8, 9.0),   (6.0, 16.0, 14.0), 1.4),
  ("up through the notch at the end of the bulkhead",         (6.0, 16.0, 14.0), (6.0, 16.0, 52.0), 1.4),
  ("across to under the board",                               (6.0, 16.0, 52.0), (xn, 16.0, 70.0),  1.4),
  ("up through the notch in the board cradle wall",           (xn, 16.0, 70.0),  (xn, 16.0, 96.0),  1.4),
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
