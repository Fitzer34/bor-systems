"""Assembly story for AutoCAD: five stages laid out left to right, every solid already in position, one STEP per
(stage, colour group). Convert with fusion_step2sat.py (true surfaces), then ACISIN each .sat with CECOLOR set."""
import sys, os, json, importlib.util
sys.argv = ["x"]
spec = importlib.util.spec_from_file_location("hl", "hazardlink_enclosures.py"); hl = importlib.util.module_from_spec(spec); spec.loader.exec_module(hl)
import cadquery as cq
P = hl.P
body, lid, bar, plate = hl.build_hanger_body(), hl.build_hanger_lid(), hl.build_hanger_bar(), hl.build_hanger_backplate()
R = {k: v[0] for k, v in hl.hanger_refs().items()}
_g = hl.hanger_geom()
inlay = hl.inlay_of(hl.hanger_marks(), _g["W"], _g["H"], _g["lid_t"])
H = P["H_H"]

# motion check first: with the wall arms released, the lid (now with battery posts) must still pivot out freely
free = body
for (rx, d) in P["H_ARMS"]:
    g = hl.arm_geom(rx, d); lo, hi = sorted((g["root"], g["slot_far"]))
    free = free.cut(hl.box(lo, hi, -1, P["ARM_W"] + P["ARM_SLOT"], -3, P["WALL"] + 0.01))
others = [R["holder"], R["cell"], R["heltec"], R["stub_antenna"]]
for deg in (0, 3, 6, 12):
    r = lid.rotate((0, 0, H), (1, 0, H), -deg)
    v = r.intersect(free).val().Volume() + sum(r.intersect(o).val().Volume() for o in others)
    print("lid pivoted %2d deg: overlap with body and parts %.2f mm3" % (deg, v))

DX = 300.0
COL = dict(logo=255, plug=253, body=252, lid=251, bar=30, plate=152, board=94, holder=251, cell=150, sensor=2, antenna=6, sign=40, magnet=1)
def T(wp, dx=0, dy=0, dz=0): return wp.translate((dx, dy, dz))
def Rv(wp):            # seen from behind: turn the group half a turn about a vertical axis through the body centre
    return wp.rotate((50, 17.5, 0), (50, 17.5, 1), 180)
stages = [
  ("0 (SEEN FROM THE WALL SIDE) WIDE HOOK BAR: SENSOR SLIDES INTO ITS SLOT, PIN DROPS IN BEHIND IT, LEAD LAYS INTO THE GROOVE UP THE BACK", [
      ("bar", [Rv(T(bar))]), ("sensor", [Rv(T(R["hall_carrier"], dy=50)), Rv(T(R["hall_pin"], dz=22))]),
      ("magnet", [Rv(T(R["magnet"], dz=30))])]),
  ("1 (SEEN FROM THE WALL SIDE) HOOK BAR SLIDES INTO THE DOVETAIL CHANNEL IN THE BODY", [
      ("body", [Rv(T(body))]), ("bar", [Rv(T(bar, dy=55))]), ("sensor", [Rv(T(R["hall_carrier"], dy=55)), Rv(T(R["hall_pin"], dy=55))])]),
  ("2 BODY LIFTS 14 MM AND DROPS ONTO THE FOUR BACKPLATE PEGS; THE CATCH CLICKS", [
      ("plate", [T(plate)]), ("body", [T(body, dy=-45, dz=14)]), ("bar", [T(bar, dy=-45, dz=14)]),
      ("sensor", [T(R["hall_carrier"], dy=-45, dz=14), T(R["hall_pin"], dy=-45, dz=14)])]),
  ("3 BOARD, BATTERY HOLDER, CELL AND ANTENNA GO IN FROM THE FRONT", [
      ("plate", [T(plate)]), ("body", [T(body)]), ("bar", [T(bar)]), ("sensor", [T(R["hall_carrier"]), T(R["hall_pin"])]),
      ("board", [T(R["heltec"], dy=-45)]), ("holder", [T(R["holder"], dy=-55)]), ("cell", [T(R["cell"], dy=-95)]),
      ("antenna", [T(R["stub_antenna"], dy=-40)])]),
  ("4 ALL PARTS HOME. LID (WHITE WRITING, PRG AND RST PADS ABOVE AND BELOW THE USB PORT): TOP TABS IN, BOTTOM HOOKS CLICK", [
      ("plate", [T(plate)]), ("body", [T(body)]), ("bar", [T(bar)]), ("sensor", [T(R["hall_carrier"]), T(R["hall_pin"])]),
      ("board", [T(R["heltec"])]), ("holder", [T(R["holder"])]), ("cell", [T(R["cell"])]), ("antenna", [T(R["stub_antenna"])]),
      ("lid", [T(lid, dy=-75)]), ("logo", [T(inlay, dy=-75)])]),
  ("5 FINISHED. THE SIGN HANGS ON THE WIDE BAR THROUGH ITS HAND HOLE, MAGNET OVER THE SENSOR", [
      ("plate", [T(plate)]), ("body", [T(body)]), ("bar", [T(bar)]), ("sensor", [T(R["hall_carrier"]), T(R["hall_pin"])]),
      ("lid", [T(lid)]), ("logo", [T(inlay)]), ("sign", [T(R["sign_handle"])]), ("magnet", [T(R["magnet"])])]),
  ("5B USB-C CABLE PLUGGED IN AT THE LEFT EDGE WITH THE LID ON", [
      ("plate", [T(plate)]), ("body", [T(body)]), ("bar", [T(bar)]), ("lid", [T(lid)]), ("logo", [T(inlay)]),
      ("plug", [T(R["usb_plug"])])]),
  ("6 (SEEN FROM BEHIND) THE LID ALONE: HOOKS, HINGE TABS, BATTERY POSTS, DISPLAY POCKET, BUTTON PADS WITH THEIR PINS", [
      ("lid", [Rv(T(lid))])]),
]
out = "stages"; os.makedirs(out, exist_ok=True)
for f in os.listdir(out):
    if f.endswith((".step", ".sat")): os.remove(os.path.join(out, f))
manifest = []
for i, (title, groups) in enumerate(stages):
    for (gname, solids) in groups:
        comp = cq.Workplane("XY")
        for sld in solids:
            comp = comp.add(sld.translate((i * DX, 0, 0)).val())
        name = "S%d_%s" % (i, gname)
        cq.exporters.export(cq.Workplane("XY").add(cq.Compound.makeCompound(comp.vals())), os.path.join(out, name + ".step"))
        manifest.append(dict(file=name, colour=COL[gname]))
    manifest.append(dict(label=title, x=i * DX))
json.dump(manifest, open(os.path.join(out, "manifest.json"), "w"), indent=1)
print(len([m for m in manifest if "file" in m]), "stage files written to", out)
