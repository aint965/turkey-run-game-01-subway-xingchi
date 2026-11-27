# build_assets.py — model aset ORIGINAL "Kalkun Kabur" untuk turkey-run-game-01.
# Dijalankan headless: blender --background --python build_assets.py -- <outdir>
# Konvensi (dari panduan Blender): 1 unit = 1 m; karakter menghadap -Y (depan
# Blender), origin di tanah di antara kaki; prop bottom-center, ground z = 0.
# Material HANYA Principled BSDF base color (nama M_*), tanpa tekstur prosedural
# (tidak ikut ter-export ke glTF). Tanpa armature — animasi prosedural di engine.
# Setiap aset di-export sebagai .glb terpisah ke <outdir>.
import bpy
import bmesh
import math
import os
import sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUTDIR = argv[0] if argv else os.path.expanduser(
    "~/workspace/makefun/entries/turkey-run-game-01-subway-xingchi/game/assets")
os.makedirs(OUTDIR, exist_ok=True)

# ---------------------------------------------------------------- helpers
def principal(mat, rgb, rough=0.85, emission=None, emission_strength=0.0, metallic=0.0):
    """Set base color pada node Principled (dicari by type, bukan by name).
    PBR: metallic + roughness ikut ter-export ke glTF (metallicRoughness)."""
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def mat(name, rgb, rough=0.85, emission=None, emission_strength=0.0, metallic=0.0):
    m = bpy.data.materials.new(name=name)
    return principal(m, rgb, rough, emission, emission_strength, metallic)


def apply_trs(ob):
    """Apply rotation + scale (SEBELUM export). Pakai temp_override agar aman di background."""
    with bpy.context.temp_override(active_object=ob, selected_objects=[ob]):
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def mesh_cleanup(ob):
    """Merge by distance 1e-4, recalc normals, laporkan cacat (angka, bukan kata sifat)."""
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0001)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    nonmanifold = sum(1 for e in bm.edges if not e.is_manifold)
    degen = sum(1 for f in bm.faces if f.calc_area() < 1e-8)
    bm.to_mesh(me)
    bm.free()
    me.update()
    return nonmanifold, degen


def tris_of(ob):
    me = ob.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def add_prim(op, name, location, rotation=(0, 0, 0), scale=(1, 1, 1), material=None, **kw):
    """Satu primitive, referensi dipegang + rename eksplisit (jangan percaya nama default)."""
    op(**kw)
    ob = bpy.context.active_object
    ob.name = name
    ob.location = location
    ob.rotation_euler = rotation
    ob.scale = scale
    if material is not None:
        ob.data.materials.append(material)
    apply_trs(ob)
    return ob


def sphere(name, loc, scale, material, seg=16, ring=12, rot=(0, 0, 0)):
    return add_prim(bpy.ops.mesh.primitive_uv_sphere_add, name, loc, rot, scale,
                    material, segments=seg, ring_count=ring, radius=1.0)


def cube(name, loc, scale, material, rot=(0, 0, 0)):
    return add_prim(bpy.ops.mesh.primitive_cube_add, name, loc, rot, scale,
                    material, size=1.0)


def cyl(name, loc, scale, material, verts=12, rot=(0, 0, 0), depth=1.0):
    return add_prim(bpy.ops.mesh.primitive_cylinder_add, name, loc, rot, scale,
                    material, vertices=verts, radius=1.0, depth=depth)


def cone(name, loc, scale, material, verts=12, rot=(0, 0, 0), depth=1.0):
    return add_prim(bpy.ops.mesh.primitive_cone_add, name, loc, rot, scale,
                    material, vertices=verts, radius1=1.0, radius2=0.0, depth=depth)


def torus(name, loc, scale, material, major=1.0, minor=0.1, rot=(0, 0, 0)):
    return add_prim(bpy.ops.mesh.primitive_torus_add, name, loc, rot, scale,
                    material, major_radius=major, minor_radius=minor,
                    major_segments=16, minor_segments=8)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.materials,
                 bpy.data.cameras, bpy.data.lights):
        pass  # material dibiarkan (dibuat ulang per aset dengan nama unik)


def export_asset(asset_name, objects):
    """Export objek terpilih sebagai .glb; laporkan angka (tris/objek/material/dimensi/byte)."""
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objects:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    path = os.path.join(OUTDIR, asset_name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_apply=True, export_yup=True)
    total_tris = sum(tris_of(o) for o in objects if o.type == "MESH")
    # o.data None untuk Empty (pivot/root) — jangan sentuh .materials-nya.
    mats = sorted({m.name for o in objects if o.data is not None
                   for m in o.data.materials if m})
    dims = [round(v, 3) for o in objects for v in o.dimensions]
    minz = min((o.matrix_world.translation.z - o.dimensions.z / 2.0)
               for o in objects if o.type == "MESH")
    size = os.path.getsize(path)
    print("ASSET %s tris=%d objs=%d mats=%d dims_max=%.2f,%.2f,%.2f min_z=%.3f bytes=%d"
          % (asset_name, total_tris, len(objects), len(mats),
             max(d[0] for d in [o.dimensions for o in objects]),
             max(d[1] for d in [o.dimensions for o in objects]),
             max(d[2] for d in [o.dimensions for o in objects]),
             minz, size))
    return path


# ---------------------------------------------------------------- palette
BROWN = (0.45, 0.27, 0.12)
BROWN_DARK = (0.32, 0.19, 0.08)
BROWN_LIGHT = (0.62, 0.42, 0.20)
TAN = (0.85, 0.62, 0.35)
CREAM = (0.91, 0.86, 0.78)
ORANGE = (0.91, 0.53, 0.18)
RED = (0.85, 0.23, 0.17)
SKIN = (0.91, 0.72, 0.54)
STRAW = (0.85, 0.71, 0.36)
GREEN_SHIRT = (0.29, 0.49, 0.35)
DENIM = (0.23, 0.36, 0.55)
IRON = (0.23, 0.23, 0.25)
SILVER = (0.79, 0.81, 0.84)
WOOD = (0.54, 0.42, 0.26)
WOOD_DARK = (0.48, 0.36, 0.21)
HAY = (0.85, 0.64, 0.26)
HAY_DARK = (0.72, 0.53, 0.18)
CORN_YELLOW = (0.90, 0.65, 0.10)
LEAF = (0.20, 0.50, 0.15)
DARK = (0.10, 0.10, 0.10)
FIRE = (1.0, 0.42, 0.05)


# ---------------------------------------------------------------- (a) kalkun
def build_turkey():
    clear_scene()
    m_body = mat("M_TurkeyBody", BROWN, 0.9)
    m_belly = mat("M_TurkeyBelly", BROWN_LIGHT, 0.9)
    m_head = mat("M_TurkeyHead", CREAM, 0.8)
    # Paruh + kaki + telapak SATU material (warna ORANGE sama persis) — 10 -> 9
    # material tanpa perubahan visual apa pun (fix round: kurangi material).
    m_orange = mat("M_TurkeyOrange", ORANGE, 0.7)
    m_beak = m_orange
    m_wattle = mat("M_TurkeyWattle", RED, 0.7)
    m_tail_a = mat("M_TurkeyTailA", (0.63, 0.32, 0.18), 0.9)
    m_tail_b = mat("M_TurkeyTailB", (0.91, 0.64, 0.24), 0.9)
    m_wing = mat("M_TurkeyWing", BROWN_DARK, 0.9)
    m_leg = m_orange
    m_eye = mat("M_TurkeyEye", DARK, 0.4)
    o = []
    # Badan: ellipsoid, pusat z 0.62; depan -Y.
    o.append(sphere("Turkey_Body", (0, 0, 0.62), (0.42, 0.50, 0.55), m_body, 16, 12))
    o.append(sphere("Turkey_Belly", (0, -0.22, 0.52), (0.30, 0.30, 0.38), m_belly, 12, 10))
    o.append(cyl("Turkey_Neck", (0, -0.24, 0.98), (0.13, 0.13, 0.30), m_head, 10))
    o.append(sphere("Turkey_Head", (0, -0.30, 1.20), (0.17, 0.16, 0.17), m_head, 14, 10))
    # Paruh: cone menunjuk -Y.
    o.append(cone("Turkey_Beak", (0, -0.50, 1.18), (0.07, 0.16, 0.07), m_beak, 10,
                  rot=(math.radians(90), 0, 0), depth=1.0))
    # Pial merah di bawah paruh.
    o.append(sphere("Turkey_Wattle", (0, -0.44, 1.06), (0.05, 0.05, 0.09), m_wattle, 8, 8))
    o.append(sphere("Turkey_Eye_L", (-0.11, -0.40, 1.26), (0.035, 0.035, 0.035), m_eye, 8, 8))
    o.append(sphere("Turkey_Eye_R", (0.11, -0.40, 1.26), (0.035, 0.035, 0.035), m_eye, 8, 8))
    # Ekor kipas: 5 bulu pipih di belakang (+Y), miring ke belakang.
    for i, ang in enumerate([-0.55, -0.28, 0.0, 0.28, 0.55]):
        m = m_tail_a if i % 2 == 0 else m_tail_b
        x = math.sin(ang) * 0.34
        y = 0.42 + math.cos(ang) * 0.10
        o.append(sphere("Turkey_Tail_%d" % (i + 1), (x, y, 0.95),
                        (0.16, 0.07, 0.46), m, 10, 8,
                        rot=(math.radians(-28), 0, -ang * 0.7)))
    # Sayap pipih di sisi badan.
    o.append(sphere("Turkey_Wing_L", (-0.40, 0.02, 0.66), (0.12, 0.30, 0.40), m_wing, 10, 8,
                    rot=(0, 0, math.radians(12))))
    o.append(sphere("Turkey_Wing_R", (0.40, 0.02, 0.66), (0.12, 0.30, 0.40), m_wing, 10, 8,
                    rot=(0, 0, math.radians(-12))))
    # Kaki + telapak (origin di tanah, z=0).
    for side, x in (("L", -0.13), ("R", 0.13)):
        o.append(cyl("Turkey_Leg_" + side, (x, 0, 0.14), (0.035, 0.035, 0.28), m_leg, 8))
        o.append(cube("Turkey_Foot_" + side, (x, -0.03, 0.03), (0.16, 0.22, 0.05), m_leg))
    return o


# ---------------------------------------------------------------- (b) petani Bram
def build_farmer():
    clear_scene()
    m_shirt = mat("M_FarmerShirt", GREEN_SHIRT, 0.9)
    m_denim = mat("M_FarmerDenim", DENIM, 0.9)
    m_skin = mat("M_FarmerSkin", SKIN, 0.8)
    m_hat = mat("M_FarmerHat", STRAW, 0.95)
    m_boot = mat("M_FarmerBoot", (0.36, 0.23, 0.12), 0.85)
    m_beard = mat("M_FarmerBeard", CREAM, 0.95)
    m_eye = mat("M_FarmerEye", DARK, 0.4)
    # Mata BESAR (putih + pupil) supaya wajah terbaca dari kamera chase yang
    # tinggi — mata lama 0.03 m tidak terbaca dari 5 m. Putih menonjol dari
    # permukaan wajah, pupil menonjol dari putih.
    m_eye_white = mat("M_FarmerEyeWhite", (1.0, 1.0, 1.0), 0.4)
    o = []
    for side, x in (("L", -0.17), ("R", 0.17)):
        o.append(cyl("Farmer_Leg_" + side, (x, 0, 0.30), (0.11, 0.11, 0.60), m_denim, 10))
        o.append(cube("Farmer_Boot_" + side, (x, -0.05, 0.07), (0.17, 0.30, 0.13), m_boot))
    # Badan besar (perut) + celemek biru di depan (-Y).
    o.append(sphere("Farmer_Body", (0, 0, 1.02), (0.44, 0.36, 0.52), m_shirt, 16, 12))
    o.append(cube("Farmer_Apron", (0, -0.33, 0.95), (0.48, 0.06, 0.62), m_denim))
    o.append(cube("Farmer_ApronStrap_L", (-0.18, -0.30, 1.34), (0.07, 0.05, 0.30), m_denim))
    o.append(cube("Farmer_ApronStrap_R", (0.18, -0.30, 1.34), (0.07, 0.05, 0.30), m_denim))
    # Lengan mengayun ke depan.
    for side, x in (("L", -0.46), ("R", 0.46)):
        o.append(cyl("Farmer_Arm_" + side, (x, -0.10, 1.18),
                     (0.10, 0.10, 0.55), m_shirt, 10,
                     rot=(math.radians(35), 0, math.radians(10 if side == "L" else -10))))
        # Tangan tepat di ujung bawah lengan (ujung bawah = pusat - 0.275*sumbu).
        o.append(sphere("Farmer_Hand_" + side, (x, 0.06, 0.93),
                        (0.09, 0.09, 0.09), m_skin, 10, 8))
    o.append(sphere("Farmer_Head", (0, -0.02, 1.66), (0.23, 0.22, 0.23), m_skin, 14, 10))
    o.append(sphere("Farmer_Beard", (0, -0.16, 1.52), (0.16, 0.10, 0.14), m_beard, 10, 8))
    o.append(sphere("Farmer_Nose", (0, -0.24, 1.66), (0.05, 0.05, 0.05), m_skin, 8, 8))
    o.append(sphere("Farmer_EyeWhite_L", (-0.09, -0.215, 1.72), (0.065, 0.065, 0.05), m_eye_white, 10, 8))
    o.append(sphere("Farmer_EyeWhite_R", (0.09, -0.215, 1.72), (0.065, 0.065, 0.05), m_eye_white, 10, 8))
    o.append(sphere("Farmer_Eye_L", (-0.09, -0.26, 1.72), (0.032, 0.032, 0.032), m_eye, 8, 8))
    o.append(sphere("Farmer_Eye_R", (0.09, -0.26, 1.72), (0.032, 0.032, 0.032), m_eye, 8, 8))
    # Topi jerami: piringan + kubah. Piringan dikecilkan (0.44->0.40) dan
    # dinaikkan (1.86->1.90) supaya tidak menaungi mata dari kamera tinggi.
    o.append(cyl("Farmer_HatBrim", (0, -0.02, 1.90), (0.40, 0.40, 0.04), m_hat, 16))
    o.append(sphere("Farmer_HatTop", (0, -0.02, 1.92), (0.24, 0.24, 0.16), m_hat, 12, 8))
    return o


# ---------------------------------------------------------------- (c) rintangan
def build_oven():
    clear_scene()
    # PBR: besi oven metallic 0,8 / roughness 0,5; gagang baja 0,8 / 0,3.
    m_iron = mat("M_OvenIron", IRON, 0.5, metallic=0.8)
    m_door = mat("M_OvenDoor", (0.42, 0.29, 0.18), 0.7, metallic=0.3)
    m_fire = mat("M_OvenFire", (0.20, 0.05, 0.01), 0.6,
                 emission=FIRE, emission_strength=2.0)
    m_handle = mat("M_OvenHandle", SILVER, 0.3, metallic=0.8)
    o = []
    o.append(cube("Oven_Body", (0, 0, 0.95), (1.60, 1.20, 1.90), m_iron))
    # Pintu di depan (-Y, menghadap pemain yang datang).
    o.append(cube("Oven_Door", (0, -0.62, 0.85), (1.10, 0.06, 1.00), m_door))
    o.append(cyl("Oven_Handle", (0, -0.68, 1.18), (0.04, 0.04, 1.00), m_handle, 8,
                 rot=(0, math.radians(90), 0)))
    o.append(cube("Oven_Fire", (0, -0.63, 0.38), (0.70, 0.05, 0.28), m_fire))
    o.append(cube("Oven_Chimney", (0.45, 0.20, 2.15), (0.30, 0.30, 0.55), m_iron))
    for x, y in ((-0.65, -0.45), (0.65, -0.45), (-0.65, 0.45), (0.65, 0.45)):
        o.append(cube("Oven_Leg_%d_%d" % (1 if x < 0 else 2, 1 if y < 0 else 2),
                      (x, y, 0.06), (0.14, 0.14, 0.12), m_iron))
    return o


def build_fence():
    clear_scene()
    # PBR: kayu roughness 0,7 (bukan 0,95 — kayu matte total tidak memantul).
    m_wood = mat("M_FenceWood", WOOD, 0.7)
    m_wood2 = mat("M_FenceWoodDark", WOOD_DARK, 0.7)
    o = []
    for i, x in enumerate((-1.10, 0.0, 1.10)):
        o.append(cube("Fence_Post_%d" % (i + 1), (x, 0, 0.50), (0.12, 0.12, 1.00), m_wood))
        o.append(cone("Fence_PostTop_%d" % (i + 1), (x, 0, 1.06), (0.09, 0.09, 0.12),
                      m_wood2, 4, rot=(0, 0, math.radians(45))))
    o.append(cube("Fence_Rail_Top", (0, 0, 0.78), (2.40, 0.08, 0.12), m_wood2))
    o.append(cube("Fence_Rail_Bottom", (0, 0, 0.38), (2.40, 0.08, 0.12), m_wood2))
    return o


def build_knife():
    # Pisau ukir BERAYUN: origin = pivot gantungan di atas, bilah menggantung ke -Z.
    # (Pengecualian ground_z: prop gantung, min_z negatif disengaja.)
    # PBR: bilah logam metallic 1,0 / roughness 0,25 — HARUS BERKILAU (dengan
    # environment map di game); tanpa env, metalness tinggi = hitam.
    clear_scene()
    m_blade = mat("M_KnifeBlade", SILVER, 0.25, metallic=1.0)
    m_handle = mat("M_KnifeHandle", (0.48, 0.29, 0.15), 0.8)
    o = []
    o.append(torus("Knife_Ring", (0, 0, -0.06), (1.0, 1.0, 1.0), m_handle,
                   major=0.07, minor=0.02))
    o.append(cube("Knife_Handle", (0, 0, -0.35), (0.13, 0.17, 0.50), m_handle))
    o.append(cube("Knife_Blade", (0, 0, -1.15), (0.36, 0.05, 1.30), m_blade))
    o.append(cone("Knife_Tip", (0, 0, -1.95), (0.18, 0.30, 0.05), m_blade, 4,
                  rot=(math.radians(180), 0, math.radians(45))))
    return o


def build_haystack():
    clear_scene()
    m_hay = mat("M_Hay", HAY, 0.95)
    m_hay2 = mat("M_HayDark", HAY_DARK, 0.95)
    o = []
    # Satu kerucut besar + kerucut atas yang menumpang (overlap), sabuk torus
    # MENEMPEL di permukaan kerucut (jari-jari torus = jari-jari kerucut di z itu).
    o.append(cone("Hay_Base", (0, 0, 0.75), (0.95, 0.95, 1.50), m_hay, 12))
    o.append(cone("Hay_Top", (0, 0, 1.45), (0.55, 0.55, 0.90), m_hay2, 12))
    o.append(torus("Hay_Band", (0, 0, 0.55), (1.0, 1.0, 1.0), m_hay2,
                   major=0.60, minor=0.06, rot=(0, 0, 0)))
    return o


# ---------------------------------------------------------------- (d) jagung
def build_corn():
    clear_scene()
    m_cob = mat("M_CornCob", CORN_YELLOW, 0.8)
    m_husk = mat("M_CornHusk", LEAF, 0.9)
    m_tip = mat("M_CornTip", (0.91, 0.64, 0.24), 0.8)
    o = []
    o.append(cyl("Corn_Cob", (0, 0, 0.45), (0.10, 0.10, 0.55), m_cob, 12))
    o.append(cone("Corn_Tip", (0, 0, 0.78), (0.08, 0.08, 0.14), m_tip, 10))
    for i, ang in enumerate((0.0, 2.09, 4.19)):
        o.append(cone("Corn_Husk_%d" % (i + 1),
                      (math.cos(ang) * 0.10, math.sin(ang) * 0.10, 0.28),
                      (0.09, 0.09, 0.42), m_husk, 8,
                      rot=(math.radians(18), 0, ang)))
    o.append(cyl("Corn_Stem", (0, 0, 0.06), (0.03, 0.03, 0.12), m_husk, 8))
    return o


# ---------------------------------------------------------------- (e) prop lingkungan
def build_pumpkin():
    clear_scene()
    m_pump = mat("M_Pumpkin", ORANGE, 0.85)
    m_stem = mat("M_PumpkinStem", (0.29, 0.49, 0.25), 0.9)
    o = []
    o.append(sphere("Pumpkin_Body", (0, 0, 0.38), (0.46, 0.46, 0.38), m_pump, 14, 10))
    o.append(cyl("Pumpkin_Stem", (0, 0, 0.74), (0.05, 0.05, 0.14), m_stem, 8,
                 rot=(0, 0, math.radians(12))))
    return o


def build_barrel():
    clear_scene()
    # PBR: kayu 0,7; sabuk besi 0,6 / 0,4.
    m_wood = mat("M_BarrelWood", WOOD, 0.7)
    m_band = mat("M_BarrelBand", IRON, 0.4, metallic=0.6)
    o = []
    o.append(cyl("Barrel_Body", (0, 0, 0.36), (0.36, 0.36, 0.72), m_wood, 14))
    o.append(torus("Barrel_Band_Top", (0, 0, 0.58), (1.0, 1.0, 1.0), m_band,
                   major=0.36, minor=0.03))
    o.append(torus("Barrel_Band_Bottom", (0, 0, 0.14), (1.0, 1.0, 1.0), m_band,
                   major=0.36, minor=0.03))
    return o


BUILDERS = [
    # NOTE (fix round 3, 27 Nov 22:55 WIB): build_turkey + build_farmer di file
    # ini SUPERSEDED oleh tools/blender/rebuild_characters.py (remodel penuh
    # PBR + smooth shading + hierarki kepala). JANGAN jalankan daftar ini
    # untuk kalkun/Bram lagi — daftar di bawah hanya prop yang TIDAK di-remodel.
    ("oven", build_oven),
    ("fence", build_fence),
    ("knife", build_knife),
    ("haystack", build_haystack),
    ("corn", build_corn),
    ("pumpkin", build_pumpkin),
    ("barrel", build_barrel),
]

if __name__ == "__main__":
    for name, fn in BUILDERS:
        objs = fn()
        bad = []
        for ob in objs:
            if ob.type != "MESH":
                continue
            nm, dg = mesh_cleanup(ob)
            if nm or dg:
                bad.append("%s nonmanifold=%d degen=%d" % (ob.name, nm, dg))
        bpy.context.view_layer.update()
        export_asset(name, objs)
        if bad:
            print("QA-WARN %s: %s" % (name, "; ".join(bad)))
        else:
            print("QA-OK %s: no non-manifold, no degenerate faces" % name)
    total = sum(os.path.getsize(os.path.join(OUTDIR, n + ".glb")) for n, _ in BUILDERS)
    print("TOTAL bytes=%d files=%d" % (total, len(BUILDERS)))
