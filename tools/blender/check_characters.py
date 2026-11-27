# check_characters.py — verifikasi GLB hasil rebuild_characters.py.
# Re-import tiap .glb ke scene kosong, cek: hierarki (Farmer_HeadPivot +
# anak-anaknya), smooth shading poligon, tris/dimensi, dan faktor PBR
# (metallicFactor/roughnessFactor) yang dibaca dari JSON chunk GLB.
# Jalankan: blender --background --python check_characters.py -- <assetsdir>
import bpy
import json
import math
import os
import struct
import sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ASSETDIR = argv[0] if len(argv) > 0 else os.path.expanduser(
    "~/workspace/makefun/entries/turkey-run-game-01-subway-xingchi/game/assets")

ASSETS = ["turkey", "farmer", "knife", "oven", "fence", "barrel"]
# Harapan PBR (metallicFactor; roughnessFactor). Faktor yang hilang di JSON
# berarti default glTF = 1,0 (khusus metallic) — diperlakukan sebagai 1,0.
EXPECT_PBR = {
    "knife": {"M_KnifeBlade": (1.0, 0.25)},
    "oven": {"M_OvenIron": (0.8, 0.5), "M_OvenHandle": (0.8, 0.3)},
    "fence": {"M_FenceWood": (0.0, 0.7)},
    "barrel": {"M_BarrelBand": (0.6, 0.4)},
}


def glb_json(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != b"glTF":
        return None
    (chunk_len,) = struct.unpack_from("<I", data, 12)
    (chunk_type,) = struct.unpack_from("<I", data, 16)
    if chunk_type != 0x4E4F534A:  # 'JSON'
        return None
    return json.loads(data[20:20 + chunk_len].decode("utf-8"))


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def tree(ob, depth=0):
    kids = sorted(ob.children, key=lambda c: c.name)
    line = "  " * depth + "%s (%s)" % (ob.name, ob.type)
    out = [line]
    for k in kids:
        out.extend(tree(k, depth + 1))
    return out


failures = []
for name in ASSETS:
    clear_scene()
    path = os.path.join(ASSETDIR, name + ".glb")
    size = os.path.getsize(path)
    bpy.ops.import_scene.gltf(filepath=path)
    bpy.context.view_layer.update()
    roots = [o for o in bpy.context.scene.objects if o.parent is None]
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    mats = sorted({m.name for o in meshes for m in o.data.materials if m})
    tris = 0
    smooth_total = 0
    poly_total = 0
    smooth_by_mesh = {}
    for o in meshes:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
        sm = sum(1 for p in o.data.polygons if p.use_smooth)
        smooth_by_mesh[o.name] = (sm, len(o.data.polygons))
        smooth_total += sm
        poly_total += len(o.data.polygons)
    print("CHECK %s bytes=%d meshes=%d mats=%d tris=%d smooth=%d/%d poly" %
          (name, size, len(meshes), len(mats), tris, smooth_total, poly_total))
    print("  roots: %s" % ", ".join(sorted(o.name for o in roots)))
    if name == "farmer":
        pivot = bpy.context.scene.objects.get("Farmer_HeadPivot")
        if pivot is None:
            failures.append("farmer: Farmer_HeadPivot HILANG")
            print("  FAIL: Farmer_HeadPivot hilang")
        else:
            kids = sorted(c.name for c in pivot.children)
            print("  HeadPivot children (%d): %s" % (len(kids), ", ".join(kids)))
            need = {"Farmer_Head", "Farmer_Beard", "Farmer_Nose",
                    "Farmer_EyeWhite_L", "Farmer_EyeWhite_R",
                    "Farmer_Eye_L", "Farmer_Eye_R",
                    "Farmer_Brow_L", "Farmer_Brow_R",
                    "Farmer_HatBrim", "Farmer_HatBand", "Farmer_HatTop"}
            missing = need - set(kids)
            if missing:
                failures.append("farmer: HeadPivot kehilangan %s" % sorted(missing))
                print("  FAIL: HeadPivot kehilangan %s" % sorted(missing))
        for key in ("Farmer_Head", "Farmer_Body"):
            if key in smooth_by_mesh:
                sm, tot = smooth_by_mesh[key]
                print("  smooth %s: %d/%d" % (key, sm, tot))
                if sm == 0:
                    failures.append("%s: %s tidak smooth" % (name, key))
    if name == "turkey":
        for key in ("Turkey_Body", "Turkey_FeathersBack_Mid", "Turkey_Wing_L"):
            if key in smooth_by_mesh:
                sm, tot = smooth_by_mesh[key]
                print("  smooth %s: %d/%d" % (key, sm, tot))
                if sm == 0:
                    failures.append("%s: %s tidak smooth" % (name, key))
        # Nama part yang dipakai render.js harus tetap ada.
        have = {o.name for o in meshes}
        for need in ("Turkey_Body", "Turkey_Head", "Turkey_Wing_L",
                     "Turkey_Wing_R", "Turkey_Leg_L", "Turkey_Leg_R"):
            if need not in have:
                failures.append("turkey: %s HILANG" % need)
                print("  FAIL: %s hilang" % need)
    if name == "farmer":
        have = {o.name for o in meshes}
        for need in ("Farmer_Arm_L", "Farmer_Arm_R", "Farmer_Leg_L",
                     "Farmer_Leg_R", "Farmer_Hand_L", "Farmer_Hand_R"):
            if need not in have:
                failures.append("farmer: %s HILANG" % need)
                print("  FAIL: %s hilang" % need)
    # Faktor PBR dari JSON chunk.
    js = glb_json(path)
    if js is None:
        failures.append("%s: JSON chunk GLB tidak terbaca" % name)
        print("  FAIL: JSON chunk tidak terbaca")
        continue
    pbr = {}
    for m in js.get("materials", []):
        pr = m.get("pbrMetallicRoughness", {})
        pbr[m["name"]] = (pr.get("metallicFactor", 1.0),
                          pr.get("roughnessFactor", 1.0))
    for mname, (met, rough) in sorted(pbr.items()):
        print("  PBR %s metallic=%.2f roughness=%.2f" % (mname, met, rough))
    for mname, (emet, erough) in EXPECT_PBR.get(name, {}).items():
        if mname not in pbr:
            failures.append("%s: material %s HILANG dari GLB" % (name, mname))
            print("  FAIL: material %s hilang" % mname)
            continue
        met, rough = pbr[mname]
        if abs(met - emet) > 0.01 or abs(rough - erough) > 0.01:
            failures.append("%s: %s metallic/rough %.2f/%.2f != harapan %.2f/%.2f"
                            % (name, mname, met, rough, emet, erough))
            print("  FAIL: %s %.2f/%.2f != harapan %.2f/%.2f"
                  % (mname, met, rough, emet, erough))

print("CHECK-DONE failures=%d" % len(failures))
for f in failures:
    print("  FAILURE: %s" % f)
