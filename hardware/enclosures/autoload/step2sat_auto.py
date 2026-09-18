"""Fusion add-in: no clicking needed. At start-up it looks for a file called CONVERT_ME in the known STEP folders; if one
is there it imports every .step in that folder, writes <folder>/sat_true/<name>.sat (true ACIS surfaces, which AutoCAD for
Mac can import), writes DONE.txt with a summary and deletes the flag. With no flag it does nothing. No network, no credentials."""
import os, traceback
import adsk.core, adsk.fusion

_FOLDERS = ("~/Downloads/bor-systems/hardware/enclosures/v9/stages", "~/Downloads/bor-systems/hardware/enclosures/v9")
_handlers = []

def _convert(app):
    for folder in _FOLDERS:
        src = os.path.expanduser(folder)
        flag = os.path.join(src, "CONVERT_ME")
        if not os.path.isfile(flag):
            continue
        out = os.path.join(src, "sat_true")
        os.makedirs(out, exist_ok=True)
        steps = sorted(f for f in os.listdir(src) if f.lower().endswith((".step", ".stp")))
        done, failed = [], []
        for name in steps:
            try:
                opts = app.importManager.createSTEPImportOptions(os.path.join(src, name))
                doc = app.importManager.importToNewDocument(opts)
                design = adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
                target = os.path.join(out, os.path.splitext(name)[0] + ".sat")
                ok = design.exportManager.execute(design.exportManager.createSATExportOptions(target, design.rootComponent))
                (done if ok else failed).append(name)
                doc.close(False)
            except Exception as e:
                failed.append("%s: %s" % (name, e))
        with open(os.path.join(src, "DONE.txt"), "w") as fh:
            fh.write("exported %d of %d\n" % (len(done), len(steps)) + "".join("FAILED %s\n" % f for f in failed))
        os.remove(flag)
        app.log("step2sat_auto: exported %d of %d from %s" % (len(done), len(steps), src))

class _Started(adsk.core.ApplicationEventHandler):
    def notify(self, args):
        try:
            _convert(adsk.core.Application.get())
        except Exception:
            adsk.core.Application.get().log("step2sat_auto failed:\n" + traceback.format_exc())

def run(context):
    app = adsk.core.Application.get()
    try:
        if app.isStartupComplete:
            _convert(app)
        else:
            h = _Started(); app.startupCompleted.add(h); _handlers.append(h)
    except Exception:
        app.log("step2sat_auto failed:\n" + traceback.format_exc())

def stop(context):
    pass
