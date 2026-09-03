"""STEP -> native DWG (true curved solids) through Autodesk Design Automation for AutoCAD.

AutoCAD for Mac cannot import STEP. Autodesk's cloud AutoCAD can, so this script:
  1. authenticates with the APS app credentials in ~/.config/hazardlink/aps.env
     (APS_CLIENT_ID / APS_CLIENT_SECRET; the file is never printed and never committed),
  2. uploads each .step to a transient OSS bucket,
  3. runs a Design Automation activity whose script IMPORTs the STEP, waits for the
     background import to finish, then SAVEAS 2018 DWG and DXFOUT,
  4. downloads output.dwg / output.dxf next to the STEP as <part>.dwg / <part>-aps.dxf,
  5. checks the DXF: counts 3DSOLIDs and reports whether their ACIS surfaces are curved
     (true solids) rather than hundreds of planar facets.

Usage:  cadenv/bin/python aps_step2dwg.py <file.step | folder> [--out DIR] [--engine Autodesk.AutoCAD+25_1]
        add --setup-only to just (re)create the activity, --list-engines to print the engines.
Design Automation is metered by Autodesk; each workitem is one job.

RESULT (2026-09-04): the whole harness works (token, bucket, activity, workitem, report), but the
AutoCAD Core Console never finishes a STEP IMPORT: the log stops at "Import job in progress" and the
job dies at the processing-time limit (tried 100 s default and an explicit 300 s, single instance,
engine Autodesk.AutoCAD+26_0). Headless AutoCAD cannot run the STEP translator. Keep this file for
other AutoCAD cloud jobs (DWG in -> DWG out works); for true-surface solids use fusion_step2sat.py.
"""
import sys, os, json, time, base64, hashlib, glob, argparse, urllib.request, urllib.parse, urllib.error

AUTH = "https://developer.api.autodesk.com/authentication/v2/token"
OSS = "https://developer.api.autodesk.com/oss/v2"
DA = "https://developer.api.autodesk.com/da/us-east/v3"
SCOPES = "code:all data:read data:write data:create bucket:create bucket:read bucket:delete"
ACTIVITY = "HlStep2Dwg"
ALIAS = "prod"

# AutoCAD script run by accoreconsole in the cloud. STEP import runs in the background inside
# AutoCAD, so after IMPORT we poll for a 3DSOLID (up to ~4 minutes) before saving.
ACAD_SCRIPT = r"""(setvar "FILEDIA" 0)
(setvar "CMDDIA" 0)
(setvar "INSUNITS" 4)
(setvar "DELOBJ" 1)
_.IMPORT
input.step
(progn (setq n 0) (while (and (< n 48) (not (ssget "_X" '((0 . "3DSOLID"))))) (command "_.DELAY" 5000) (setq n (1+ n))) (princ (strcat "\nHL_IMPORT_WAIT_LOOPS=" (itoa n))))
(if (ssget "_X" '((0 . "3DSOLID"))) (princ (strcat "\nHL_SOLIDS=" (itoa (sslength (ssget "_X" '((0 . "3DSOLID"))))))) (princ "\nHL_SOLIDS=0"))
_.ZOOM _E
_.SAVEAS 2018 output.dwg
_.DXFOUT output.dxf _V 2018 16
"""


def load_env():
    env = {}
    p = os.path.expanduser("~/.config/hazardlink/aps.env")
    for line in open(p):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    if not env.get("APS_CLIENT_ID") or not env.get("APS_CLIENT_SECRET"):
        raise SystemExit("APS_CLIENT_ID / APS_CLIENT_SECRET missing in " + p)
    return env


def http(method, url, headers=None, data=None, json_body=None, raw=False, timeout=120):
    h = dict(headers or {})
    body = None
    if json_body is not None:
        body = json.dumps(json_body).encode()
        h["Content-Type"] = "application/json"
    elif data is not None:
        body = data
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        r = urllib.request.urlopen(req, timeout=timeout)
        payload = r.read()
    except urllib.error.HTTPError as e:
        payload = e.read()
        raise RuntimeError("%s %s -> HTTP %s: %s" % (method, url.split("?")[0][-90:], e.code, payload[:400].decode(errors="replace")))
    if raw:
        return payload
    if not payload:
        return {}
    try:
        return json.loads(payload)
    except ValueError:
        return {"raw": payload.decode(errors="replace")}


class Aps:
    def __init__(self, env):
        self.cid = env["APS_CLIENT_ID"]
        basic = base64.b64encode((self.cid + ":" + env["APS_CLIENT_SECRET"]).encode()).decode()
        tok = http("POST", AUTH, {"Authorization": "Basic " + basic, "Content-Type": "application/x-www-form-urlencoded"},
                   data=urllib.parse.urlencode({"grant_type": "client_credentials", "scope": SCOPES}).encode())
        self.h = {"Authorization": "Bearer " + tok["access_token"]}
        self.bucket = "hazardlink-cad-" + hashlib.sha1(self.cid.encode()).hexdigest()[:10]

    # ---- OSS -------------------------------------------------------------------------------
    def ensure_bucket(self):
        try:
            http("POST", OSS + "/buckets", self.h, json_body={"bucketKey": self.bucket, "policyKey": "transient"})
        except RuntimeError as e:
            if "HTTP 409" not in str(e):
                raise

    def upload(self, path, obj):
        size = os.path.getsize(path)
        info = http("GET", "%s/buckets/%s/objects/%s/signeds3upload" % (OSS, self.bucket, obj), self.h)
        with open(path, "rb") as fh:
            http("PUT", info["urls"][0], {"Content-Type": "application/octet-stream"}, data=fh.read(), raw=True, timeout=600)
        http("POST", "%s/buckets/%s/objects/%s/signeds3upload" % (OSS, self.bucket, obj), self.h, json_body={"uploadKey": info["uploadKey"]})
        return size

    def signed(self, obj, access, minutes=120):
        r = http("POST", "%s/buckets/%s/objects/%s/signed?access=%s" % (OSS, self.bucket, obj, access), self.h,
                 json_body={"minutesExpiration": minutes})
        return r["signedUrl"]

    def download(self, obj, dest):
        info = http("GET", "%s/buckets/%s/objects/%s/signeds3download" % (OSS, self.bucket, obj), self.h)
        data = http("GET", info["url"], raw=True, timeout=600)
        with open(dest, "wb") as fh:
            fh.write(data)
        return len(data)

    # ---- Design Automation --------------------------------------------------------------------
    def nickname(self):
        r = http("GET", DA + "/forgeapps/me", self.h)
        return r.get("raw", "").strip('"') if isinstance(r, dict) else str(r).strip('"')

    def engines(self):
        out, url = [], DA + "/engines"
        while url:
            r = http("GET", url, self.h)
            out += r.get("data", [])
            url = (DA + "/engines?page=" + r["paginationToken"]) if r.get("paginationToken") else None
        return sorted(e for e in out if e.startswith("Autodesk.AutoCAD"))

    def ensure_activity(self, engine):
        spec = {
            "id": ACTIVITY,
            "commandLine": ["$(engine.path)\\accoreconsole.exe /s \"$(settings[script].path)\""],
            "parameters": {
                "inputStep": {"verb": "get", "localName": "input.step", "required": True},
                "outputDwg": {"verb": "put", "localName": "output.dwg", "required": True},
                "outputDxf": {"verb": "put", "localName": "output.dxf", "required": False},
            },
            "engine": engine,
            "settings": {"script": {"value": ACAD_SCRIPT}},
            "description": "HazardLink: IMPORT a STEP file and save it as a 2018 DWG with true solids",
        }
        try:
            r = http("POST", DA + "/activities", self.h, json_body=spec)
            version = r.get("version", 1)
        except RuntimeError as e:
            if "HTTP 409" not in str(e):
                raise
            spec.pop("id")
            r = http("POST", DA + "/activities/%s/versions" % ACTIVITY, self.h, json_body=spec)
            version = r.get("version")
        try:
            http("POST", DA + "/activities/%s/aliases" % ACTIVITY, self.h, json_body={"id": ALIAS, "version": version})
        except RuntimeError as e:
            if "HTTP 409" not in str(e):
                raise
            http("PATCH", DA + "/activities/%s/aliases/%s" % (ACTIVITY, ALIAS), self.h, json_body={"version": version})
        return version

    def run(self, nick, in_url, dwg_url, dxf_url):
        body = {"activityId": "%s.%s+%s" % (nick, ACTIVITY, ALIAS),
                "limitProcessingTimeSec": int(os.environ.get("APS_JOB_LIMIT_SEC", "300")),
                "arguments": {"inputStep": {"url": in_url},
                              "outputDwg": {"verb": "put", "url": dwg_url},
                              "outputDxf": {"verb": "put", "url": dxf_url}}}
        wi = http("POST", DA + "/workitems", self.h, json_body=body)
        wid = wi["id"]
        t0 = time.time()
        while True:
            st = http("GET", DA + "/workitems/" + wid, self.h)
            s = st.get("status")
            if s in ("pending", "inprogress"):
                if time.time() - t0 > 1500:
                    raise RuntimeError("workitem %s still %s after 25 min" % (wid, s))
                time.sleep(8)
                continue
            return st


def check_dxf(path):
    """Count 3DSOLIDs and classify their ACIS surfaces (planar vs curved)."""
    try:
        import ezdxf
        from ezdxf.acis import api as acis
    except ImportError:
        return "ezdxf not available for checking"
    doc = ezdxf.readfile(path)
    solids = list(doc.modelspace().query("3DSOLID"))
    n_faces = n_curved = 0
    kinds = {}
    for s in solids:
        try:
            bodies = acis.load(s.sab) if getattr(s, "has_binary_data", False) else acis.load(s.sat)
        except Exception as e:
            return "%d 3DSOLID(s); ACIS data could not be parsed here (%s)" % (len(solids), type(e).__name__)
        for b in bodies:
            for lump in [b.lump] if getattr(b, "lump", None) else []:
                shell = getattr(lump, "shell", None)
                face = getattr(shell, "face", None)
                while face is not None and not getattr(face, "is_none", False):
                    surf = getattr(face, "surface", None)
                    t = getattr(surf, "type", "?")
                    kinds[t] = kinds.get(t, 0) + 1
                    n_faces += 1
                    if t != "plane-surface":
                        n_curved += 1
                    face = getattr(face, "next_face", None)
    return "%d 3DSOLID(s), %d faces, %d curved (%s)" % (len(solids), n_faces, n_curved,
                                                        ", ".join("%s x%d" % kv for kv in sorted(kinds.items())))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", nargs="?", help=".step file or folder of .step files")
    ap.add_argument("--out", help="output folder (default: next to the STEP)")
    ap.add_argument("--engine", help="Design Automation engine id (default: newest Autodesk.AutoCAD)")
    ap.add_argument("--setup-only", action="store_true")
    ap.add_argument("--list-engines", action="store_true")
    a = ap.parse_args()

    aps = Aps(load_env())
    engines = aps.engines()
    if a.list_engines:
        print("\n".join(engines)); return
    engine = a.engine or engines[-1]
    nick = aps.nickname()
    version = aps.ensure_activity(engine)
    print("activity %s.%s+%s v%d on %s" % (nick, ACTIVITY, ALIAS, version, engine))
    if a.setup_only or not a.src:
        return
    files = sorted(glob.glob(os.path.join(a.src, "*.step"))) if os.path.isdir(a.src) else [a.src]
    aps.ensure_bucket()
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        out_dir = a.out or os.path.dirname(os.path.abspath(f))
        os.makedirs(out_dir, exist_ok=True)
        stamp = "%s-%d" % (name, int(time.time()))
        in_obj, dwg_obj, dxf_obj = stamp + ".step", stamp + ".dwg", stamp + ".dxf"
        print("%s: uploading %.1f MB" % (name, aps.upload(f, in_obj) / 1048576.0))
        st = aps.run(nick, aps.signed(in_obj, "read"), aps.signed(dwg_obj, "readwrite"), aps.signed(dxf_obj, "readwrite"))
        report = st.get("reportUrl")
        log = ""
        if report:
            try:
                log = http("GET", report, raw=True).decode(errors="replace")
            except Exception:
                pass
        marks = [l.strip() for l in log.splitlines() if "HL_" in l]
        print("%s: workitem %s (%s)" % (name, st.get("id"), st.get("status")), "; ".join(marks))
        if st.get("status") != "success":
            print(log[-3000:])
            continue
        dwg = os.path.join(out_dir, name + ".dwg")
        print("  %s  %.1f MB" % (dwg, aps.download(dwg_obj, dwg) / 1048576.0))
        try:
            dxf = os.path.join(out_dir, name + "-aps.dxf")
            aps.download(dxf_obj, dxf)
            print("  check:", check_dxf(dxf))
        except Exception as e:
            print("  dxf not produced (%s)" % e)


if __name__ == "__main__":
    main()
