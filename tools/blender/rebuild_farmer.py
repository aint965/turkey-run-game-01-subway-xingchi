# rebuild_farmer.py — export ULANG hanya farmer.glb (mata besar + topi baru).
# JANGAN jalankan build_assets.py penuh: re-export Blender tidak
# byte-deterministik dan bisa mengubah byte aset lain yang tidak disentuh.
# Dijalankan headless: blender --background --python rebuild_farmer.py
# (tanpa argumen -- : OUTDIR default = game/assets).
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_assets as ba  # noqa: E402

objs = ba.build_farmer()
bad = []
for ob in objs:
    if ob.type != "MESH":
        continue
    nm, dg = ba.mesh_cleanup(ob)
    if nm or dg:
        bad.append("%s nonmanifold=%d degen=%d" % (ob.name, nm, dg))
ba.bpy.context.view_layer.update()
ba.export_asset("farmer", objs)
if bad:
    print("QA-WARN farmer: %s" % "; ".join(bad))
else:
    print("QA-OK farmer: no non-manifold, no degenerate faces")
