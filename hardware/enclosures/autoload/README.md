# Showing the assembly in AutoCAD without any clicking

Two small start-up files do the work. Copies are kept here; the live ones sit in the Autodesk folders below.

1. `step2sat_auto.py` and `step2sat_auto.manifest` live in
   `~/Library/Application Support/Autodesk/Autodesk Fusion 360/API/AddIns/step2sat_auto/`.
   While Fusion is running it looks every few seconds for a file called `CONVERT_ME` in `v9/stages/` and turns every `.step` there into a true
   ACIS `.sat` in `v9/stages/sat_true/`, writes `DONE.txt` and removes the flag. A file called `SHOW_ME` (one STEP path per line, in `v9/` or `v9/stages/`) makes it open those models in new local documents, view set, nothing uploaded or saved. With no flag it does nothing.
2. `acaddoc.lsp` lives in
   `~/Library/Application Support/Autodesk/AutoCAD 2027/R26.0/roaming/@en@/Support/`.
   When AutoCAD opens any drawing and finds `LOAD_ME` in `v9/stages/`, it runs `v9/stages/assemble.scr`.
   Remove the flag afterwards, or every drawing you open will load the stages.

The whole refresh, from the `v9` folder:

```bash
~/.hazardlink/cadenv/bin/python make_assembly_stages.py
touch stages/CONVERT_ME && open -a "Autodesk Fusion"      # wait for stages/DONE.txt
echo "$PWD/hanger_assembly.step" > SHOW_ME                # optional: Fusion opens the full assembly
touch stages/LOAD_ME && open -a "AutoCAD 2027" stages/viewer.dxf
rm stages/LOAD_ME                                         # once the stages are on screen
```
