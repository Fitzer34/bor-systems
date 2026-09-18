"""Assembly story for AutoCAD: nine stages (0, 1, 2, 3, 4, 5, 5B, 5C, 6) laid out left to right, every solid already in
position, one STEP per (stage, colour group). Convert with fusion_step2sat.py (true surfaces), then ACISIN each .sat with
CECOLOR set. The stage titles below are written into the drawing as text, so they are a short form of the assembly
instructions. The full version, with every check, is HANGER ASSEMBLY ORDER in README.txt. Keep each title on ONE line, in
CAPITAL letters, under 400 characters, and free of quote marks and apostrophes, so the drawing text stays readable.
What the titles must keep saying: only the TWO switch wires of the button go up to the board (5C); the battery cable's
two loose ends are fed down through the end notches of the bulkhead BEFORE they are soldered to the holder (3); a new
board has to be flashed with the hanger firmware (5B); the firmware does not act on the cleaning button yet (5).
After any change to a title, run this script again so that stages/manifest.json carries the new text.
Names: the "sensor" colour group holds the bare 3-leg Hall sensor (reference key hall_carrier, an old name kept so the
file names do not change) and its TWO retaining pins (reference key hall_pin, one reference that holds both pins)."""
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
others = [R["holder"], R["cell"], R["heltec"], R["stub_antenna"]] + ([R["clean_button"]] if "clean_button" in R else [])
for deg in (0, 3, 6, 12):
    r = lid.rotate((0, 0, H), (1, 0, H), -deg)
    v = r.intersect(free).val().Volume() + sum(r.intersect(o).val().Volume() for o in others)
    print("lid pivoted %2d deg: overlap with body and parts %.2f mm3" % (deg, v))

DX = 300.0
COL = dict(logo=255, plug=253, body=252, lid=251, bar=30, plate=152, board=94, holder=251, cell=150, sensor=2, antenna=6, sign=40, magnet=1, button=4)
def T(wp, dx=0, dy=0, dz=0): return wp.translate((dx, dy, dz))
BTN = [R["clean_button"]] if "clean_button" in R else []
def Tip(wp):           # tipped back about a left-right axis so the UNDERSIDE of the box faces the viewer
    return wp.rotate((50, 17.5, 40), (51, 17.5, 40), -110)
def Rv(wp):            # seen from behind: turn the group half a turn about a vertical axis through the body centre
    return wp.rotate((50, 17.5, 0), (50, 17.5, 1), 180)
stages = [
  ("0 (FROM THE WALL SIDE, BAR UPRIGHT) FIRST TRY BOTH PINS (2.85 MM FILAMENT, 6.0 TO 6.5 MM LONG, NEVER LONGER) IN THEIR HOLES IN THE SADDLE FLOOR, THEN TAKE THEM OUT. BAR UPSIDE DOWN: SLIDE THE SENSOR ALONG THE TUNNEL ROOF INTO ITS NEST, MARKED FACE TO THE ROOF. BAR UPRIGHT: DROP IN BOTH PINS. THREAD THE LEADS UNDER THE CLOSED BAND HALF WAY UP THE BACK OF THE WEB, THEN LAY THEM IN THE GROOVE", [
      ("bar", [Rv(T(bar))]), ("sensor", [Rv(T(R["hall_carrier"], dy=50)), Rv(T(R["hall_pin"], dz=22))]),
      ("magnet", [Rv(T(R["magnet"], dz=30))])]),
  ("1 (SEEN FROM THE WALL SIDE) FEED THE SENSOR LEADS UP THROUGH THE SLOT IN THE CHANNEL ROOF FIRST. THEN SLIDE THE PLATE OF THE HOOK BAR INTO THE DOVETAIL CHANNEL IN THE BODY FROM THE WALL SIDE, TAKING UP THE SLACK IN THE LEADS FROM INSIDE. THE DOVETAIL CHANNEL IS A SLOT WITH SLOPING SIDES, WIDER AT THE TOP, SO THE PLATE CANNOT DROP OUT. IT IS CUT IN THE RAISED STRIP IN THE FLOOR OF THE BOX", [
      ("body", [Rv(T(body))]), ("bar", [Rv(T(bar, dy=55))]), ("sensor", [Rv(T(R["hall_carrier"], dy=55)), Rv(T(R["hall_pin"], dy=55))])]),
  ("2 THE BACKPLATE GOES ON THE WALL FIRST: FOUR NO.8 COUNTERSUNK SCREWS AND WALL PLUGS, PEGS TOWARD YOU, THE FIXED END OF THE CATCH TONGUE (THE SPRINGY STRIP IN ITS FACE) AT THE BOTTOM. OFFER THE BODY UP 14 MM HIGH ONTO THE PEGS AND LET IT DROP UNTIL THE CATCH CLICKS. THE HOOK BAR MUST BE IN THE BODY BEFORE THIS. THE README DOES STAGES 3 AND 5C ON THE BENCH BEFORE THIS ONE. EITHER ORDER WORKS", [
      ("plate", [T(plate)]), ("body", [T(body, dy=-45, dz=14)]), ("bar", [T(bar, dy=-45, dz=14)]),
      ("sensor", [T(R["hall_carrier"], dy=-45, dz=14), T(R["hall_pin"], dy=-45, dz=14)])]),
  ("3 BUTTON FIRST (5C). FEED THE LOOSE ENDS OF THE BATTERY CABLE DOWN THROUGH THE BULKHEAD (THE THICK SHELF ABOVE THE BATTERY), ONE THROUGH EACH END NOTCH, PLUG LEFT ABOVE. HOLDER STILL OUT, IN FRONT OF THE BOX: CHECK POLARITY WITH A METER (REVERSED DESTROYS THE BOARD), SOLDER EACH WIRE TO THE SIDE OF ITS PIN. FOLD THE SENSOR LEADS FORWARD, PRESS THE HOLDER IN. THEN ANTENNA, BOARD, CELL LAST", [
      ("plate", [T(plate)]), ("body", [T(body)]), ("bar", [T(bar)]), ("sensor", [T(R["hall_carrier"]), T(R["hall_pin"])]),
      ("board", [T(R["heltec"], dy=-45)]), ("holder", [T(R["holder"], dy=-55)]), ("cell", [T(R["cell"], dy=-95)]),
      ("antenna", [T(R["stub_antenna"], dy=-40)]), ("button", [T(b, dx=35, dz=-25) for b in BTN])]),
  ("4 ALL PARTS HOME. THE ANTENNA JACK SLID INTO THE SLOT IN ITS SHELF FROM THE FRONT, FLANGE UNDER THE SHELF, WASHER AND NUT ON TOP. IF NOT DONE YET, PUSH THE TIP OF EACH LATCH ARM IN THE BOTTOM WALL OUTWARD ONCE (AWAY FROM THE INSIDE OF THE BOX) TO BREAK ITS BREAKAWAY TAB. LID (100 X 171 MM, PRG AND RST FINGER PADS ABOVE AND BELOW THE USB PORT, NO WINDOW INSERT): TOP TABS IN, BOTTOM HOOKS CLICK", [
      ("plate", [T(plate)]), ("body", [T(body)]), ("bar", [T(bar)]), ("sensor", [T(R["hall_carrier"]), T(R["hall_pin"])]),
      ("board", [T(R["heltec"])]), ("holder", [T(R["holder"])]), ("cell", [T(R["cell"])]), ("antenna", [T(R["stub_antenna"])]),
      ("button", [T(b) for b in BTN]), ("lid", [T(lid, dy=-75)]), ("logo", [T(inlay, dy=-75)])]),
  ("5 FINISHED. THE HANGER BOX IS 171 MM TALL IN V9.9: 41 MM WAS ADDED AT THE BOTTOM FOR THE CLEANING-MODE BUTTON, AND EVERY OTHER FEATURE KEEPS ITS PLACE MEASURED FROM THE TOP OF THE BOX. THE SIGN HANGS ON THE WIDE BAR THROUGH ITS HAND HOLE, 6 X 2 MM N52 DISC MAGNET (EITHER POLE) OVER THE HALL SENSOR. THE FIRMWARE DOES NOT ACT ON THE CLEANING BUTTON YET", [
      ("plate", [T(plate)]), ("body", [T(body)]), ("bar", [T(bar)]), ("sensor", [T(R["hall_carrier"]), T(R["hall_pin"])]),
      ("lid", [T(lid)]), ("logo", [T(inlay)]), ("sign", [T(R["sign_handle"])]), ("magnet", [T(R["magnet"])])]),
  ("5B USB-C CABLE PLUGGED IN AT THE LEFT EDGE WITH THE LID ON. A NEW HELTEC BOARD RUNS THE DEMO IT CAME WITH: IT MUST BE FLASHED WITH THE HANGER FIRMWARE FROM THE FIRMWARE FOLDER OF THE REPOSITORY (STEPS IN FIRMWARE/README.MD) BEFORE THE UNIT CAN REPORT ANYTHING", [
      ("plate", [T(plate)]), ("body", [T(body)]), ("bar", [T(bar)]), ("lid", [T(lid)]), ("logo", [T(inlay)]),
      ("plug", [T(R["usb_plug"])])]),
  ("5C (SEEN FROM UNDERNEATH) CLEANING BUTTON. NUT AND BLUE SOCKET OFF. BUTTON PART WAY UP THROUGH THE HOLE, NUT STARTED FROM INSIDE, SOCKET ON WHILE THE BUTTON HANGS LOW (ONCE TIGHT, THE SHELF ABOVE LEAVES TOO LITTLE ROOM), THEN BUTTON HOME, NUT TIGHT. ONLY THE TWO SWITCH WIRES (FOUND WITH A METER) GO UP TO THE BOARD. THE OTHER THREE STAY IN THE BAY, ENDS COVERED. ALL FIVE BEFORE THE HOLDER GOES IN", [
      ("body", [Tip(T(body))]), ("bar", [Tip(T(bar))]), ("lid", [Tip(T(lid))]), ("logo", [Tip(T(inlay))]), ("button", [Tip(T(b)) for b in BTN])]),
  ("6 (SEEN FROM BEHIND) THE LID ALONE, 100 X 171 MM: HOOKS, HINGE TABS, BATTERY POSTS, DISPLAY POCKET, PRG AND RST FINGER PADS WITH THEIR PUSHER PINS", [
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

# AutoCAD script that loads every converted stage (stages/sat_true/*.sat, made by Fusion) in its colour and types the labels
import textwrap
sat = os.path.abspath(os.path.join(out, "sat_true"))
scr = ["FILEDIA 0", "CMDECHO 0", "ERASE ALL", "", "PERSPECTIVE 0", "-VIEW _SWISO", "VSCURRENT S"]
for m in manifest:
    if "file" in m:
        scr += ["CECOLOR %d" % m["colour"], "ACISIN %s" % os.path.join(sat, m["file"] + ".sat")]
scr.append("CECOLOR 7")
for m in manifest:
    if "label" in m:
        lines = textwrap.wrap(m["label"], 38)
        if len(lines) > 9:
            lines = lines[:8] + ["(FULL STEPS: SEE README.TXT)"]
        for k, ln in enumerate(lines):
            scr.append("-TEXT %d,%d,-80 7 0 %s" % (m["x"] - 30, -150 - 12 * k, ln))
scr += ["CECOLOR BYLAYER", "ZOOM E", "FILEDIA 1", "CMDECHO 1", ""]
open(os.path.join(out, "assemble.scr"), "w").write("\n".join(scr))
print("assemble.scr written:", sum(1 for l in scr if l.startswith("ACISIN")), "solids,", sum(1 for l in scr if l.startswith("-TEXT")), "text lines")
