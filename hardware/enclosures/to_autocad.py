"""Convert enclosure parts to formats AutoCAD for Mac can actually open.

AutoCAD for Mac's IMPORT only accepts ACIS (.sat) and PDF, not STEP. This
takes every .step (or .stl) in a folder and writes, per part:
  <part>.sat              ACIS solid, IMPORT it in AutoCAD (proven on 2027 for Mac)
  <part>-3dsolid.dxf      the same solid as a 3DSOLID entity, opens with OPEN
plus <folder>-all-3dsolid.dxf with every part on its own layer.

Curved faces are tessellated, so they arrive as many flat facets (that is
how a mesh-built ACIS body works). Fine for editing and printing; tighten
TOL/ANG below if you want smoother cylinders at the cost of file size.

Usage:  cadenv/bin/python to_autocad.py <folder-with-step-files> [out-folder]
"""
import sys, os, glob
import ezdxf, cadquery as cq
from ezdxf.acis import api as acis
from ezdxf.render import MeshBuilder
from ezdxf.math import Vec3

TOL = float(os.environ.get("ACAD_TOL", "0.05"))   # mm, linear deflection of the tessellation
ANG = float(os.environ.get("ACAD_ANG", "0.2"))    # radians, angular deflection

def shape_to_body(shape):
    verts, tris = shape.tessellate(TOL, ANG)
    mb = MeshBuilder()
    mb.vertices = [Vec3(v.x, v.y, v.z) for v in verts]
    mb.faces = [tuple(t) for t in tris]
    mb = mb.merge_coplanar_faces()
    return acis.body_from_mesh(mb), len(mb.faces)

def load(path):
    if path.lower().endswith(".step") or path.lower().endswith(".stp"):
        return cq.importers.importStep(path)
    return cq.importers.importStl(path) if hasattr(cq.importers, "importStl") else None

def main(src, out):
    os.makedirs(out, exist_ok=True)
    files = sorted(glob.glob(os.path.join(src, "*.step")) + glob.glob(os.path.join(src, "*.stp")))
    if not files:
        print("no STEP files in", src); return
    all_doc = ezdxf.new("R2010"); all_msp = all_doc.modelspace()
    for f in files:
        name = os.path.splitext(os.path.basename(f))[0]
        wp = load(f)
        solids = wp.solids().vals() or [wp.val()]
        bodies = []
        faces = 0
        for s in solids:
            b, n = shape_to_body(s); bodies.append(b); faces += n
        with open(os.path.join(out, name + ".sat"), "w") as fh:
            fh.write("\n".join(acis.export_sat(bodies)) + "\n")
        doc = ezdxf.new("R2010")
        acis.export_dxf(doc.modelspace().add_3dsolid(), bodies)
        doc.saveas(os.path.join(out, name + "-3dsolid.dxf"))
        layer = name[:31].replace(" ", "_")
        if layer not in all_doc.layers: all_doc.layers.add(layer)
        acis.export_dxf(all_msp.add_3dsolid(dxfattribs={"layer": layer}), bodies)
        print(f"{name}: {len(solids)} solid(s), {faces} faces -> .sat + -3dsolid.dxf")
    all_doc.saveas(os.path.join(out, os.path.basename(os.path.normpath(src)) + "-all-3dsolid.dxf"))
    print("wrote", out)

if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "."
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(src, "autocad")
    main(src, out)
