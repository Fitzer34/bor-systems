"""Fusion add-in: lets files on disk drive Fusion, so nobody has to click through dialogs.
It watches the known STEP folders every few seconds for two flag files:
  CONVERT_ME  every .step in that folder is exported as a true ACIS .sat into <folder>/sat_true/ (AutoCAD for Mac imports
              .sat, not STEP); DONE.txt gets a summary; the flag is removed.
  SHOW_ME     a text file with one STEP path per line: each is imported into a new LOCAL document (nothing is uploaded or
              saved), the view is set to look at the front from above left with Z up, and the flag is removed.
With no flag it does nothing. No network, no credentials."""
import os, threading, traceback
import adsk.core, adsk.fusion

_FOLDERS = ("~/Downloads/bor-systems/hardware/enclosures/v9/stages", "~/Downloads/bor-systems/hardware/enclosures/v9")
_EVENT = "step2sat_auto_tick"
_handlers = []
_stop = threading.Event()
_busy = threading.Event()

def _flags():
    out = []
    for folder in _FOLDERS:
        src = os.path.expanduser(folder)
        for name in ("CONVERT_ME", "SHOW_ME"):
            if os.path.isfile(os.path.join(src, name)):
                out.append((src, name))
    return out

def _convert(app, src):
    out = os.path.join(src, "sat_true")
    os.makedirs(out, exist_ok=True)
    steps = sorted(f for f in os.listdir(src) if f.lower().endswith((".step", ".stp")))
    done, failed = [], []
    for name in steps:
        try:
            doc = app.importManager.importToNewDocument(app.importManager.createSTEPImportOptions(os.path.join(src, name)))
            design = adsk.fusion.Design.cast(doc.products.itemByProductType("DesignProductType"))
            target = os.path.join(out, os.path.splitext(name)[0] + ".sat")
            ok = design.exportManager.execute(design.exportManager.createSATExportOptions(target, design.rootComponent))
            (done if ok else failed).append(name)
            doc.close(False)
        except Exception as e:
            failed.append("%s: %s" % (name, e))
    with open(os.path.join(src, "DONE.txt"), "w") as fh:
        fh.write("exported %d of %d\n" % (len(done), len(steps)) + "".join("FAILED %s\n" % f for f in failed))

def _show(app, src):
    paths = [l.strip() for l in open(os.path.join(src, "SHOW_ME")).read().splitlines() if l.strip()]
    shown = []
    for p in paths:
        p = os.path.expanduser(p)
        if not os.path.isfile(p):
            continue
        app.importManager.importToNewDocument(app.importManager.createSTEPImportOptions(p))
        vp = app.activeViewport
        cam = vp.camera
        cam.target = adsk.core.Point3D.create(5.0, 1.75, 6.5)          # centimetres
        cam.eye = adsk.core.Point3D.create(-30.0, -55.0, 32.0)         # in front of the lid, above and to the left
        cam.upVector = adsk.core.Vector3D.create(0, 0, 1)
        cam.isFitView = True
        cam.isSmoothTransition = False
        vp.camera = cam
        vp.fit()
        shown.append(os.path.basename(p))
    with open(os.path.join(src, "SHOWN.txt"), "w") as fh:
        fh.write("\n".join(shown) + "\n")

def _work(app):
    if _busy.is_set():
        return
    _busy.set()
    try:
        for (src, name) in _flags():
            try:
                (_convert if name == "CONVERT_ME" else _show)(app, src)
            except Exception:
                app.log("step2sat_auto %s failed:\n%s" % (name, traceback.format_exc()))
            finally:
                try: os.remove(os.path.join(src, name))
                except OSError: pass
    finally:
        _busy.clear()

class _Tick(adsk.core.CustomEventHandler):
    def notify(self, args):
        app = adsk.core.Application.get()
        if app.isStartupComplete:          # main thread here; if Fusion is still starting, the flag waits for the next tick
            _work(app)

def _watch(app):
    # Worker thread: files only. The ONE Fusion call allowed off the main thread is fireCustomEvent.
    while not _stop.wait(3.0):
        try:
            if not _busy.is_set() and _flags():
                app.fireCustomEvent(_EVENT, "")
        except Exception:
            pass

def run(context):
    app = adsk.core.Application.get()
    try:
        ev = app.registerCustomEvent(_EVENT)
        h = _Tick(); ev.add(h); _handlers.append(h)
        t = threading.Thread(target=_watch, args=(app,), daemon=True); t.start()
    except Exception:
        app.log("step2sat_auto failed to start:\n" + traceback.format_exc())

def stop(context):
    _stop.set()
    try: adsk.core.Application.get().unregisterCustomEvent(_EVENT)
    except Exception: pass
