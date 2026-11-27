# qa_assets.py — QA gate WAJIB setelah export (panduan blender-asset-qa).
# Re-import tiap .glb ke scene kosong, cek angka (dimensi, scale=1, mesh/material/
# tris, min_z), lalu render review shot multi-sudut (solid material + wireframe).
# Jalankan: blender --background --python qa_assets.py -- <assetsdir> <qadir>
import bpy
import math
import os
import sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ASSETDIR = argv[0] if len(argv) > 0 else "game/assets"
QADIR = argv[1] if len(argv) > 1 else "tools/blender/qa"
os.makedirs(QADIR, exist_ok=True)

ASSETS = ["turkey", "farmer", "oven", "fence", "knife", "haystack",
          "corn", "pumpkin", "barrel"]
# Target kamera (tengah objek) per aset; knife digantung jadi target lebih rendah.
TARGETS = {"turkey": (0, 0, 0.7), "farmer": (0, 0, 1.0), "oven": (0, 0, 1.0),
           "fence": (0, 0, 0.5), "knife": (0, 0, -1.0), "haystack": (0, 0, 0.9),
           "corn": (0, 0, 0.4), "pumpkin": (0, 0, 0.4), "barrel": (0, 0, 0.4)}


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def look_at(ob, target):
    direction = Vector(target) - ob.location
    ob.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def setup_camera(target):
    cam_data = bpy.data.cameras.new("QA_Cam")
    cam = bpy.data.objects.new("QA_Cam", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = (2.6, -3.4, target[2] + 1.4)
    look_at(cam, target)
    bpy.context.scene.camera = cam
    sun_data = bpy.data.lights.new("QA_Sun", type="SUN")
    sun_data.energy = 3.0
    sun = bpy.data.objects.new("QA_Sun", sun_data)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    return cam


def render(path, wireframe=False):
    # Workbench butuh libEGL (tidak ada di VM ini) -> pakai Cycles CPU.
    # Wireframe tidak bisa di-render di sini; diganti cek numerik (build) +
    # review visual in-game. Parameter wireframe dipertahankan sebagai penanda.
    if wireframe:
        print("QA-WIRE-SKIP: no EGL in VM; wireframe replaced by numeric checks")
        return False
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.filepath = path
    world = bpy.data.worlds.new("QA_World")
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.85, 0.88, 0.92, 1.0)
    bg.inputs["Strength"].default_value = 1.0
    scene.world = world
    bpy.ops.render.render(write_still=True)
    return os.path.exists(path)


for name in ASSETS:
    clear_scene()
    path = os.path.join(ASSETDIR, name + ".glb")
    size = os.path.getsize(path)
    bpy.ops.import_scene.gltf(filepath=path)
    bpy.context.view_layer.update()
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    meshes = len(objs)
    mats = sorted({m.name for o in objs for m in o.data.materials if m})
    tris = 0
    for o in objs:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    scales = sorted({tuple(round(s, 3) for s in o.scale) for o in objs})
    # Bounding box keseluruhan (world).
    mins = [1e9, 1e9, 1e9]
    maxs = [-1e9, -1e9, -1e9]
    for o in objs:
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            for i in range(3):
                mins[i] = min(mins[i], w[i])
                maxs[i] = max(maxs[i], w[i])
    dims = [round(maxs[i] - mins[i], 3) for i in range(3)]
    print("QA-IMPORT %s bytes=%d meshes=%d mats=%d (%s) tris=%d scales=%s "
          "dims=%.2fx%.2fx%.2f min_z=%.3f"
          % (name, size, meshes, len(mats), ",".join(mats), tris, scales,
             dims[0], dims[1], dims[2], mins[2]))
    target = TARGETS[name]
    setup_camera(target)
    ok_solid = render(os.path.join(QADIR, name + "_solid.png"), wireframe=False)
    ok_wire = render(os.path.join(QADIR, name + "_wire.png"), wireframe=True)
    print("QA-RENDER %s solid=%s wire=%s" % (name, ok_solid, ok_wire))
print("QA-DONE")
