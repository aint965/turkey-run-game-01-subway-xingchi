# rebuild_characters.py — REMODEL PENUH kalkun + Bram + re-export PBR 4 prop.
# Fix round 3 (27 Nov 22:55 WIB) + PBR mode (22:59 WIB).
# Dijalankan headless: blender --background --python rebuild_characters.py
# (tanpa argumen -- : OUTDIR default = game/assets).
#
# Yang berubah vs build_assets.py v1:
# - KALKUN: bulu punggung BERLAPIS (4 baris sirap, 3 warna cokelat, roughness
#   0,85/0,90/0,95), ekor kipas 2 lapis (5 belakang + 4 depan) + pita ujung
#   terang, sayap 2 lapis (base + ujung bulu, di-join jadi 1 mesh supaya
#   animasi flap tetap satu pivot), smooth shading di semua permukaan organik,
#   segmen naik (badan 20x14). Identitas tetap: kalkun cokelat, ekor mengembang.
# - BRAM: wajah RAPI — mata tidak lagi googly (bola mata 0,048 tertanam di
#   wajah + pupil 0,022 menonjol 0,017), jenggot BERBENTUK (janggut + jambul
#   dagu + kumis, di-join), alis, hidung lebih besar, topi jerami halus
#   (brim 0,38, 24 segmen, + pita topi), smooth shading, HIERARKI BENAR:
#   Farmer_HeadPivot (Empty di leher) membawahi semua bagian kepala, semua
#   di bawah Farmer_Root — kepala kini BISA menoleh di game (glance-back).
# - PBR (Principled, ikut ter-export ke glTF): bulu metallic 0 roughness
#   0,85-0,95 bervariasi; baju Bram 0,9; kulit 0,8; topi 0,95.
# - PROP (via build_assets, nilai PBR sudah diperbarui di sana): pisau bilah
#   metallic 1,0 / roughness 0,25; oven besi 0,8 / 0,5; kayu pagar/tong 0,7.
# - HANYA 6 file yang ditulis ulang: turkey, farmer, knife, oven, fence,
#   barrel. haystack/corn/pumpkin TIDAK disentuh (git status harus bersih).
# - Join per material (bukan per bulu) supaya draw call tidak meledak:
#   13 bulu punggung -> 3 mesh, ekor 9 bulu + 5 pita -> 4 mesh.
import bpy
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_assets as ba  # noqa: E402

OUTDIR = os.path.expanduser(
    "~/workspace/makefun/entries/turkey-run-game-01-subway-xingchi/game/assets")

mat = ba.mat
sphere = ba.sphere
cube = ba.cube
cyl = ba.cyl
cone = ba.cone
clear_scene = ba.clear_scene

BROWN = ba.BROWN
BROWN_LIGHT = ba.BROWN_LIGHT
CREAM = ba.CREAM
ORANGE = ba.ORANGE
RED = ba.RED
SKIN = ba.SKIN
STRAW = ba.STRAW
GREEN_SHIRT = ba.GREEN_SHIRT
DENIM = ba.DENIM
DARK = ba.DARK


def smooth_if_needed(ob):
    """Smooth shading hanya untuk permukaan organik (nama di daftar)."""
    if ob.type != "MESH":
        return
    prefixes = (
        "Turkey_Body", "Turkey_Belly", "Turkey_Neck", "Turkey_Head",
        "Turkey_Wattle", "Turkey_Eye", "Turkey_Feather", "Turkey_Tail",
        "Turkey_Wing", "Turkey_Leg",
        "Farmer_Body", "Farmer_Head", "Farmer_Beard", "Farmer_Nose",
        "Farmer_EyeWhite", "Farmer_Eye", "Farmer_Brow", "Farmer_HatTop",
        "Farmer_HatBrim", "Farmer_Arm", "Farmer_Leg", "Farmer_Hand",
        "Barrel_Body",
    )
    if any(ob.name.startswith(p) for p in prefixes):
        for poly in ob.data.polygons:
            poly.use_smooth = True


def empty(name, loc):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'PLAIN_AXES'
    e.empty_display_size = 0.2
    bpy.context.collection.objects.link(e)
    e.location = loc
    return e


def parent_keep(child, parent):
    """Parent dengan world transform TETAP (matrix_parent_inverse)."""
    bpy.context.view_layer.update()
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()
    bpy.context.view_layer.update()


def join(objs, name):
    """Gabung mesh jadi SATU objek (draw call lebih sedikit). Aktif = objs[0]."""
    bpy.ops.object.select_all(action="DESELECT")
    for ob in objs:
        ob.select_set(True)
    with bpy.context.temp_override(active_object=objs[0], selected_objects=objs):
        bpy.ops.object.join()
        joined = bpy.context.active_object
    joined.name = name
    return joined


def rot_xyz(rx, ry, rz, v):
    """Putar vektor dengan Euler XYZ Blender (R = Rz @ Ry @ Rx)."""
    x, y, z = v
    cx, sx = math.cos(rx), math.sin(rx)
    y, z = y * cx - z * sx, y * sx + z * cx
    cy, sy = math.cos(ry), math.sin(ry)
    x, z = x * cy + z * sy, -x * sy + z * cy
    cz, sz = math.cos(rz), math.sin(rz)
    x, y = x * cz - y * sz, x * sz + y * cz
    return (x, y, z)


# ---------------------------------------------------------------- kalkun (remodel penuh)
def build_turkey_pbr():
    clear_scene()
    m_body = mat("M_TurkeyBody", BROWN, 0.90)
    m_fdark = mat("M_TurkeyFeatherDark", (0.30, 0.17, 0.07), 0.85)
    m_fmid = mat("M_TurkeyFeatherMid", (0.52, 0.33, 0.16), 0.90)
    m_flight = mat("M_TurkeyFeatherLight", (0.68, 0.47, 0.24), 0.95)
    # Pita ujung ekor: krem pucat supaya kipas terbaca dari kamera chase.
    m_tip = mat("M_TurkeyTailTip", (0.88, 0.75, 0.50), 0.90)
    m_belly = mat("M_TurkeyBelly", BROWN_LIGHT, 0.90)
    m_head = mat("M_TurkeyHead", CREAM, 0.80)
    m_orange = mat("M_TurkeyOrange", ORANGE, 0.70)
    m_wattle = mat("M_TurkeyWattle", RED, 0.70)
    m_eye = mat("M_TurkeyEye", DARK, 0.40)
    parts = []
    parts.append(sphere("Turkey_Body", (0, 0, 0.62), (0.42, 0.50, 0.55), m_body, 20, 14))
    parts.append(sphere("Turkey_Belly", (0, -0.22, 0.52), (0.30, 0.30, 0.38), m_belly, 12, 10))
    parts.append(cyl("Turkey_Neck", (0, -0.24, 0.98), (0.13, 0.13, 0.30), m_head, 16))
    parts.append(sphere("Turkey_Head", (0, -0.30, 1.20), (0.17, 0.16, 0.17), m_head, 16, 12))
    parts.append(cone("Turkey_Beak", (0, -0.50, 1.18), (0.07, 0.16, 0.07), m_orange, 10,
                      rot=(math.radians(90), 0, 0), depth=1.0))
    parts.append(sphere("Turkey_Wattle", (0, -0.44, 1.06), (0.05, 0.05, 0.09), m_wattle, 8, 8))
    parts.append(sphere("Turkey_Eye_L", (-0.11, -0.40, 1.26), (0.04, 0.04, 0.04), m_eye, 8, 8))
    parts.append(sphere("Turkey_Eye_R", (0.11, -0.40, 1.26), (0.04, 0.04, 0.04), m_eye, 8, 8))
    # Bulu punggung berlapis: 4 baris sirap dari leher ke pangkal ekor.
    # rot.x NEGATIF = ujung bulu condong ke belakang (+Y, ekor).
    back = []
    rows = [
        (0.26, 1.03, -0.35, m_fmid, [-0.16, 0.0, 0.16]),
        (0.36, 0.94, -0.60, m_fdark, [-0.18, -0.06, 0.06, 0.18]),
        (0.43, 0.82, -0.85, m_flight, [-0.16, 0.0, 0.16]),
        (0.47, 0.72, -1.05, m_fmid, [-0.13, 0.0, 0.13]),
    ]
    for ri, (y, z, tilt, m, xs) in enumerate(rows):
        for ci, x in enumerate(xs):
            back.append(sphere("Turkey_FeatherBack_%d_%d" % (ri + 1, ci + 1), (x, y, z),
                               (0.15, 0.05, 0.24), m, 8, 6, rot=(tilt, 0, 0)))
    joined = []
    by_mat = {}
    for f in back:
        by_mat.setdefault(f.data.materials[0].name, []).append(f)
    for mname, group in sorted(by_mat.items()):
        suffix = mname.replace("M_TurkeyFeather", "")
        joined.append(join(group, "Turkey_FeathersBack_" + suffix))
    # Ekor kipas 2 lapis + pita ujung terang (banded tail).
    # REVISI crop-check: miring -28° terlalu rebah — kipas tenggelam di
    # belakang badan dari kamera chase. Miring -45° (kipas BERDIRI), kipas
    # lebih lebar (±0,68), pita ujung lebih panjang + lebih pucat supaya
    # ekor terbaca jelas dari belakang.
    tail_back = []
    tail_tips = []
    for i, ang in enumerate([-0.68, -0.34, 0.0, 0.34, 0.68]):
        m = m_fmid if i % 2 == 0 else m_fdark
        x = math.sin(ang) * 0.38
        y = 0.42 + math.cos(ang) * 0.10
        rot = (math.radians(-45), 0, -ang * 0.7)
        tail_back.append(sphere("Turkey_Tail_%d" % (i + 1), (x, y, 0.95),
                                (0.15, 0.06, 0.48), m, 8, 6, rot=rot))
        ox, oy, oz = rot_xyz(rot[0], rot[1], rot[2], (0, 0, 0.42))
        tail_tips.append(sphere("Turkey_TailTip_%d" % (i + 1), (x + ox, y + oy, 0.95 + oz),
                                (0.15, 0.07, 0.20), m_tip, 8, 6, rot=rot))
    by_mat = {}
    for f in tail_back:
        by_mat.setdefault(f.data.materials[0].name, []).append(f)
    for mname, group in sorted(by_mat.items()):
        suffix = mname.replace("M_TurkeyFeather", "")
        joined.append(join(group, "Turkey_TailBack_" + suffix))
    joined.append(join(tail_tips, "Turkey_TailTips"))
    tail_front = []
    for i, ang in enumerate([-0.52, -0.17, 0.17, 0.52]):
        x = math.sin(ang) * 0.34
        y = 0.36 + math.cos(ang) * 0.08
        tail_front.append(sphere("Turkey_TailFront_%d" % (i + 1), (x, y, 0.88),
                                 (0.13, 0.06, 0.40), m_fmid, 8, 6,
                                 rot=(math.radians(-45), 0, -ang * 0.7)))
    joined.append(join(tail_front, "Turkey_TailFront"))
    # Sayap 2 lapis: base + 3 ujung bulu, di-join supaya flap satu pivot.
    for side, sx in (("L", -1), ("R", 1)):
        x = 0.40 * sx
        tilt_z = math.radians(12 if side == "L" else -12)
        base = sphere("Turkey_Wing_%s_Base" % side, (x, 0.02, 0.66),
                      (0.12, 0.30, 0.40), m_fdark, 10, 8, rot=(0, 0, tilt_z))
        tips = []
        for k, (dy, dz) in enumerate([(-0.10, -0.12), (0.0, -0.18), (0.10, -0.12)]):
            tips.append(sphere("Turkey_WingTip_%s_%d" % (side, k + 1),
                               (x + sx * 0.02, 0.02 + dy, 0.66 + dz),
                               (0.10, 0.20, 0.14), m_fdark, 8, 6, rot=(0, 0, tilt_z)))
        joined.append(join([base] + tips, "Turkey_Wing_" + side))
    # Kaki + telapak (tetap seperti v1 — render menganimasikan rotation.x kaki).
    for side, x in (("L", -0.13), ("R", 0.13)):
        parts.append(cyl("Turkey_Leg_" + side, (x, 0, 0.14), (0.035, 0.035, 0.28), m_orange, 8))
        parts.append(cube("Turkey_Foot_" + side, (x, -0.03, 0.03), (0.16, 0.22, 0.05), m_orange))
    return parts + joined


# ---------------------------------------------------------------- Bram (remodel penuh + hierarki)
def build_farmer_pbr():
    clear_scene()
    m_shirt = mat("M_FarmerShirt", GREEN_SHIRT, 0.90)
    m_denim = mat("M_FarmerDenim", DENIM, 0.90)
    m_skin = mat("M_FarmerSkin", SKIN, 0.80)
    m_hat = mat("M_FarmerHat", STRAW, 0.95)
    m_band = mat("M_FarmerHatBand", (0.45, 0.30, 0.15), 0.85)
    m_boot = mat("M_FarmerBoot", (0.36, 0.23, 0.12), 0.85)
    m_beard = mat("M_FarmerBeard", CREAM, 0.95)
    m_eye_white = mat("M_FarmerEyeWhite", (1.0, 1.0, 1.0), 0.40)
    m_eye = mat("M_FarmerEye", DARK, 0.40)
    body_parts = []
    for side, x in (("L", -0.17), ("R", 0.17)):
        body_parts.append(cyl("Farmer_Leg_" + side, (x, 0, 0.30), (0.11, 0.11, 0.60), m_denim, 12))
        body_parts.append(cube("Farmer_Boot_" + side, (x, -0.05, 0.07), (0.17, 0.30, 0.13), m_boot))
    body_parts.append(sphere("Farmer_Body", (0, 0, 1.02), (0.44, 0.36, 0.52), m_shirt, 18, 12))
    body_parts.append(cube("Farmer_Apron", (0, -0.33, 0.95), (0.48, 0.06, 0.62), m_denim))
    body_parts.append(cube("Farmer_ApronStrap_L", (-0.18, -0.30, 1.34), (0.07, 0.05, 0.30), m_denim))
    body_parts.append(cube("Farmer_ApronStrap_R", (0.18, -0.30, 1.34), (0.07, 0.05, 0.30), m_denim))
    for side, x in (("L", -0.46), ("R", 0.46)):
        body_parts.append(cyl("Farmer_Arm_" + side, (x, -0.10, 1.18),
                              (0.10, 0.10, 0.55), m_shirt, 12,
                              rot=(math.radians(35), 0, math.radians(10 if side == "L" else -10))))
        body_parts.append(sphere("Farmer_Hand_" + side, (x, 0.06, 0.93),
                                 (0.09, 0.09, 0.09), m_skin, 8, 6))
    # Kepala — semua anak dari pivot leher (bisa menoleh di game).
    head_parts = []
    head_parts.append(sphere("Farmer_Head", (0, -0.02, 1.66), (0.23, 0.22, 0.23), m_skin, 18, 12))
    beard_bits = [
        sphere("Farmer_Beard_Main", (0, -0.14, 1.48), (0.17, 0.10, 0.15), m_beard, 10, 8),
        sphere("Farmer_Beard_Tuft", (0, -0.17, 1.40), (0.10, 0.08, 0.10), m_beard, 8, 6),
        sphere("Farmer_Mustache_L", (-0.07, -0.235, 1.56), (0.07, 0.035, 0.04), m_beard, 8, 6,
               rot=(0, math.radians(-0.25), 0)),
        sphere("Farmer_Mustache_R", (0.07, -0.235, 1.56), (0.07, 0.035, 0.04), m_beard, 8, 6,
               rot=(0, math.radians(0.25), 0)),
    ]
    head_parts.append(join(beard_bits, "Farmer_Beard"))
    head_parts.append(sphere("Farmer_Nose", (0, -0.245, 1.64), (0.055, 0.055, 0.055), m_skin, 8, 8))
    # Mata RAPI (bukan googly): bola mata tertanam di wajah, pupil menonjol tipis.
    head_parts.append(sphere("Farmer_EyeWhite_L", (-0.085, -0.205, 1.72), (0.048, 0.048, 0.048), m_eye_white, 8, 6))
    head_parts.append(sphere("Farmer_EyeWhite_R", (0.085, -0.205, 1.72), (0.048, 0.048, 0.048), m_eye_white, 8, 6))
    head_parts.append(sphere("Farmer_Eye_L", (-0.085, -0.248, 1.72), (0.022, 0.022, 0.022), m_eye, 6, 5))
    head_parts.append(sphere("Farmer_Eye_R", (0.085, -0.248, 1.72), (0.022, 0.022, 0.022), m_eye, 6, 5))
    # Alis tegas (ujung dalam turun): L rot.y +0,15, R rot.y -0,15.
    head_parts.append(sphere("Farmer_Brow_L", (-0.085, -0.22, 1.80), (0.06, 0.025, 0.03), m_band, 8, 6,
                             rot=(0, math.radians(0.15), 0)))
    head_parts.append(sphere("Farmer_Brow_R", (0.085, -0.22, 1.80), (0.06, 0.025, 0.03), m_band, 8, 6,
                             rot=(0, math.radians(-0.15), 0)))
    # Topi jerami: brim lebih kecil (0,38) + 24 segmen + pita topi.
    head_parts.append(cyl("Farmer_HatBrim", (0, -0.02, 1.90), (0.38, 0.38, 0.035), m_hat, 24))
    head_parts.append(cyl("Farmer_HatBand", (0, -0.02, 1.94), (0.24, 0.24, 0.05), m_band, 24))
    head_parts.append(sphere("Farmer_HatTop", (0, -0.02, 1.92), (0.23, 0.23, 0.15), m_hat, 16, 10))
    # Hierarki: pivot leher membawahi kepala; root membawahi semuanya.
    pivot = empty("Farmer_HeadPivot", (0, -0.02, 1.44))
    for ob in head_parts:
        parent_keep(ob, pivot)
    root = empty("Farmer_Root", (0, 0, 0))
    for ob in body_parts + [pivot]:
        parent_keep(ob, root)
    return body_parts + head_parts + [pivot, root]


# ---------------------------------------------------------------- main
def process_and_export(name, objs):
    bad = []
    for ob in objs:
        if ob.type != "MESH":
            continue
        nm, dg = ba.mesh_cleanup(ob)
        if nm or dg:
            bad.append("%s nonmanifold=%d degen=%d" % (ob.name, nm, dg))
    bpy.context.view_layer.update()
    for ob in objs:
        smooth_if_needed(ob)
    bpy.context.view_layer.update()
    ba.export_asset(name, objs)
    if bad:
        print("QA-WARN %s: %s" % (name, "; ".join(bad)))
    else:
        print("QA-OK %s: no non-manifold, no degenerate faces" % name)


if __name__ == "__main__":
    jobs = [
        ("turkey", build_turkey_pbr),
        ("farmer", build_farmer_pbr),
        # Prop PBR via build_assets (nilai sudah diperbarui di sana).
        ("knife", ba.build_knife),
        ("oven", ba.build_oven),
        ("fence", ba.build_fence),
        ("barrel", ba.build_barrel),
    ]
    for name, fn in jobs:
        objs = fn()
        process_and_export(name, objs)
    total = sum(os.path.getsize(os.path.join(OUTDIR, n + ".glb")) for n, _ in jobs)
    print("TOTAL bytes=%d files=%d (hanya 6 aset ini yang ditulis ulang)" % (total, len(jobs)))
