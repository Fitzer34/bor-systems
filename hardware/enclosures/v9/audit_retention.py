"""Retention audit: how far can each bought component move in +/-X, +/-Y, +/-Z before a printed part (or the part that
is meant to hold it) stops it? Frame: X right, Z up (gravity is -Z on the wall), Y from the lid face (0) into the wall.
A component is 'held' in a direction when its free travel is small (<= 1 mm). Run: cadenv python audit_retention.py"""
import sys, importlib.util, time
sys.argv = ["x"]
spec = importlib.util.spec_from_file_location("hl", "hazardlink_enclosures.py"); hl = importlib.util.module_from_spec(spec); spec.loader.exec_module(hl)
import cadquery as cq

body, lid, bar, plate = hl.build_hanger_body(), hl.build_hanger_lid(), hl.build_hanger_bar(), hl.build_hanger_backplate()
refs = {k: v[0] for k, v in hl.hanger_refs().items()}
LID_OFF = "--lid-off" in __import__("os").environ.get("AUDIT_ARGS", "")
printed = {"body": body, "bar": bar, "backplate": plate} if LID_OFF else {"body": body, "lid": lid, "bar": bar, "backplate": plate}
print("LID OFF: what still holds each part" if LID_OFF else "LID ON")
MAX, TOL = 14.0, 0.3     # mm searched, mm3 counted as contact

def hits(shape, obstacles, vec):
    moved = shape.translate(vec)
    for name, ob in obstacles.items():
        try:
            if moved.intersect(ob).val().Volume() > TOL:
                return name
        except Exception:
            pass
    return None

def travel(shape, obstacles, d):
    """Free travel along unit vector d: first contact found by stepping (thin obstacles are not jumped over)."""
    step = 0.1
    dist = step
    while dist <= MAX:
        who = hits(shape, obstacles, tuple(dist * c for c in d))
        if who:
            return max(dist - step, 0.0), who
        dist += step if dist < 2.0 else 0.5
    return None, None

DIRS = {"-X": (-1, 0, 0), "+X": (1, 0, 0), "-Y (toward lid)": (0, -1, 0), "+Y (toward wall)": (0, 1, 0), "-Z (down)": (0, 0, -1), "+Z (up)": (0, 0, 1)}
gbody, glid = hl.build_gateway_body(), hl.build_gateway_lid()
grefs = {k: v[0] for k, v in hl.gateway_refs().items()}
cases = {
    "heltec board (hanger)": (refs["heltec"], printed),
    "21700 holder": (refs["holder"], printed),
    "21700 cell": (refs["cell"], dict(printed, holder=refs["holder"])),
    "Hall carrier": (refs["hall_carrier"], dict(printed, pin=refs["hall_pin"])),
    "Hall retaining pin": (refs["hall_pin"], dict(printed, sign_handle=refs["sign_handle"])),
    "stub antenna": (refs["stub_antenna"], printed),
    "hook bar (printed)": (bar, {"body": body, "backplate": plate}),
    "lid (printed)": (lid, {"body": body}),
    "body (printed) on the backplate": (body, {"backplate": plate}),
    "heltec board (gateway)": (grefs["heltec"], {"body": gbody} if LID_OFF else {"body": gbody, "lid": glid}),
    "gateway lid (printed)": (glid, {"body": gbody}),
}
t0 = time.time()
for name, (shape, obstacles) in cases.items():
    print(name)
    for label, d in DIRS.items():
        dist, who = travel(shape, obstacles, d)
        if dist is None:
            print("   %-18s FREE for more than %.0f mm  <-- NOT HELD" % (label, MAX))
        else:
            flag = "" if dist <= 1.0 else "  <-- loose" if dist <= 3.0 else "  <-- NOT HELD"
            print("   %-18s %5.1f mm, stopped by %s%s" % (label, dist, who, flag))
print("(%.0f s)" % (time.time() - t0))
