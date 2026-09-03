"""Fusion (desktop) script: import every STEP in a folder and export true ACIS .sat files.

Why: AutoCAD for Mac imports ACIS (.sat) but not STEP. Our local converter (to_autocad.py)
tessellates, so cylinders arrive as facets. Fusion writes real ACIS surfaces, so the .sat it
exports imports into AutoCAD for Mac as smooth, editable solids. Fusion is free for personal
and education use, and its cloud automation only takes TypeScript bundles, so this runs on
the desktop instead.

How to run (once Fusion is installed and signed in):
  1. Fusion > Utilities tab > Scripts and Add-Ins (Shift+S) > Scripts > green "+" > pick this
     folder (Fusion wants a folder that contains a .py of the same name; copy this file into a
     folder called fusion_step2sat and add it from there).
  2. Select the script, click Run. It asks for the folder of STEP files, then writes
     <folder>/sat_true/<part>.sat for each one and prints a summary in the Text Commands panel.
  3. In AutoCAD for Mac: ACISIN (or IMPORT with the format set to ACIS) each .sat.

No network, no credentials. Tested against Fusion's Python API (adsk.core / adsk.fusion).
"""
import os
import traceback

import adsk.core
import adsk.fusion

# Folder converted without asking when it exists; otherwise a folder dialog is shown.
DEFAULT_SRC = os.path.expanduser("~/Downloads/bor-systems/hardware/enclosures/v8/final")


def run(context):
    app = adsk.core.Application.get()
    ui = app.userInterface
    try:
        src = DEFAULT_SRC if os.path.isdir(DEFAULT_SRC) else ""
        if not src:
            dlg = ui.createFolderDialog()
            dlg.title = "Folder with .step files"
            if dlg.showDialog() != adsk.core.DialogResults.DialogOK:
                return
            src = dlg.folder
        out = os.path.join(src, "sat_true")
        os.makedirs(out, exist_ok=True)
        steps = sorted(f for f in os.listdir(src) if f.lower().endswith((".step", ".stp")))
        if not steps:
            ui.messageBox("No .step files in " + src)
            return

        importer = app.importManager
        done, failed = [], []
        for name in steps:
            path = os.path.join(src, name)
            try:
                opts = importer.createSTEPImportOptions(path)
                doc = importer.importToNewDocument(opts)
                design = adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
                if design is None:
                    raise RuntimeError("no design product after import")
                exporter = design.exportManager
                target = os.path.join(out, os.path.splitext(name)[0] + ".sat")
                sat = exporter.createSATExportOptions(target, design.rootComponent)
                if not exporter.execute(sat):
                    raise RuntimeError("SAT export returned false")
                done.append((name, os.path.getsize(target)))
                doc.close(False)
            except Exception as e:  # keep going with the other parts
                failed.append((name, str(e)))

        lines = ["%s -> sat_true/%s.sat (%.1f MB)" % (n, os.path.splitext(n)[0], s / 1048576.0) for n, s in done]
        lines += ["FAILED %s: %s" % f for f in failed]
        app.log("\n".join(lines))
        ui.messageBox("Exported %d of %d parts to %s" % (len(done), len(steps), out) +
                      ("\n\nFailed:\n" + "\n".join("%s: %s" % f for f in failed) if failed else ""))
    except Exception:
        if ui:
            ui.messageBox("Script failed:\n" + traceback.format_exc())
