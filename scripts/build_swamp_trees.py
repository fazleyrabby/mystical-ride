"""Create the swamp tree GLBs (cypress, mangrove, snag) in an isolated Blender scene.

Everything the script adds to the open file is removed again once the GLBs are written.
"""

import math
import os
import random

import bpy
from mathutils import Vector


OUTPUT = "/Users/rabbi/Desktop/Projects/boatride/public/models"
os.makedirs(OUTPUT, exist_ok=True)

created_materials = []
created_meshes = []


def material(name, color, roughness=1.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1)
    principled.inputs["Roughness"].default_value = roughness
    mat.use_backface_culling = False
    created_materials.append(mat)
    return mat


bark = material("Moonwater bark", (0.105, 0.125, 0.112))
leaf_dark = material("Moonwater deep leaves", (0.055, 0.155, 0.125))
leaf_mid = material("Moonwater moonlit leaves", (0.11, 0.245, 0.172))
moss = material("Moonwater moss", (0.16, 0.21, 0.17))


def add_tube(vertices, faces, path, radii, rng, sides=8):
    first = len(vertices)
    for i, point in enumerate(path):
        tangent = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        reference = Vector((1, 0, 0)) if abs(tangent.z) > 0.87 else Vector((0, 0, 1))
        across = tangent.cross(reference).normalized()
        around = tangent.cross(across).normalized()
        for step in range(sides):
            a = math.tau * step / sides
            uneven = rng.uniform(0.93, 1.07)
            vertices.append(point + (math.cos(a) * across + math.sin(a) * around) * radii[i] * uneven)
    for ring in range(len(path) - 1):
        for step in range(sides):
            a = first + ring * sides + step
            b = first + ring * sides + (step + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(first + i for i in range(sides - 1, -1, -1)))
    end = first + (len(path) - 1) * sides
    faces.append(tuple(end + i for i in range(sides)))


def add_leaves(vertices, faces, materials, cluster, count, spread, flatness, size, rng):
    for _ in range(count):
        center = cluster + Vector((rng.gauss(0, spread), rng.gauss(0, spread), rng.gauss(0, flatness)))
        direction = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.55, 1.0))).normalized()
        side = direction.cross(Vector((0, 0, 1)))
        if side.length < 0.08:
            side = Vector((1, 0, 0))
        side.normalize()
        normal = side.cross(direction).normalized()
        length = rng.uniform(size * 0.7, size * 1.3)
        width = length * rng.uniform(0.38, 0.6)
        base = len(vertices)
        vertices.extend([
            center - direction * length * 0.55,
            center - side * width * 0.5 + normal * 0.035,
            center + direction * length * 0.56,
            center + side * width * 0.5 + normal * 0.035,
            center + normal * 0.055,
        ])
        faces.extend([(base, base + 1, base + 4), (base + 1, base + 2, base + 4),
                      (base + 2, base + 3, base + 4), (base + 3, base, base + 4)])
        materials.extend([1 if rng.random() > 0.68 else 0] * 4)


def add_moss(vertices, faces, anchor, length, width, rng):
    """A ragged hanging strand: two crossed, tapering ribbons."""
    drift = Vector((rng.uniform(-0.12, 0.12), rng.uniform(-0.12, 0.12), 0))
    for turn in (0.0, math.pi / 2):
        a = rng.uniform(0, math.tau) + turn
        across = Vector((math.cos(a), math.sin(a), 0)) * width * 0.5
        mid = anchor + drift * 0.5 + Vector((0, 0, -length * 0.55))
        tip = anchor + drift + Vector((0, 0, -length))
        base = len(vertices)
        vertices.extend([anchor - across, anchor + across, mid + across * 0.75, mid - across * 0.75, tip])
        faces.extend([(base, base + 1, base + 2, base + 3), (base + 3, base + 2, base + 4)])


def build(collection, name, parts):
    objects = []
    for label, (vertices, faces, materials, face_materials, smooth) in parts.items():
        if not faces:
            continue
        mesh = bpy.data.meshes.new(f"{name} {label} mesh")
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        created_meshes.append(mesh)
        obj = bpy.data.objects.new(f"Moonwater {name} {label}", mesh)
        collection.objects.link(obj)
        for mat in materials:
            mesh.materials.append(mat)
        if smooth:
            for polygon in mesh.polygons:
                polygon.use_smooth = True
        if face_materials:
            for polygon, index in zip(mesh.polygons, face_materials):
                polygon.material_index = index
        objects.append(obj)
    return objects


def make_cypress(collection, seed):
    rng = random.Random(seed)
    wood, wood_faces = [], []
    leaves, leaf_faces, leaf_materials = [], [], []
    strands, strand_faces = [], []
    lean = Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 0))
    heights = [-0.7, 0.0, 1.2, 3.0, 6.0, 8.5, 9.7]
    trunk = [Vector((lean.x * (h / 9.7) ** 1.5, lean.y * (h / 9.7) ** 1.5, h)) if h > 0 else Vector((0, 0, h)) for h in heights]
    add_tube(wood, wood_faces, trunk, [0.66, 0.58, 0.37, 0.29, 0.22, 0.12, 0.04], rng, 12)
    for root in range(9):
        a = root * math.tau / 9 + rng.uniform(-0.16, 0.16)
        direction = Vector((math.cos(a), math.sin(a), 0))
        reach = rng.uniform(1.5, 2.2)
        add_tube(wood, wood_faces,
                 [direction * reach + Vector((0, 0, -0.75)), direction * reach * 0.42 + Vector((0, 0, 0.3)), direction * 0.2 + Vector((0, 0, 2.5))],
                 [0.07, 0.18, 0.12], rng, 6)
    for knee in range(7):
        a = rng.uniform(0, math.tau)
        foot = Vector((math.cos(a), math.sin(a), 0)) * rng.uniform(1.9, 3.3)
        add_tube(wood, wood_faces, [foot + Vector((0, 0, -0.7)), foot + Vector((0, 0, rng.uniform(0.3, 0.85)))], [0.13, 0.035], rng, 5)

    for i in range(15):
        a = i * 2.399 + rng.uniform(-0.25, 0.25)
        level = rng.uniform(5.0, 9.2)
        start = Vector((lean.x * (level / 9.7) ** 1.5, lean.y * (level / 9.7) ** 1.5, level))
        reach = rng.uniform(1.7, 3.5) * (1.15 - 0.45 * (level - 5.0) / 4.2)
        lift = rng.uniform(-0.15, 0.55)
        mid = start + Vector((math.cos(a) * reach * 0.55, math.sin(a) * reach * 0.55, lift * 0.8))
        tip = start + Vector((math.cos(a) * reach, math.sin(a) * reach, lift))
        add_tube(wood, wood_faces, [start, mid, tip], [0.11, 0.07, 0.02], rng, 6)
        add_leaves(leaves, leaf_faces, leaf_materials, tip, 40, 0.62, 0.26, 0.34, rng)
        add_leaves(leaves, leaf_faces, leaf_materials, mid, 22, 0.5, 0.22, 0.32, rng)
        for anchor in (mid, tip, mid.lerp(tip, 0.5)):
            for _ in range(2):
                hang = anchor + Vector((rng.uniform(-0.45, 0.45), rng.uniform(-0.45, 0.45), -0.08))
                add_moss(strands, strand_faces, hang, rng.uniform(0.9, 2.9), rng.uniform(0.1, 0.24), rng)
    for _ in range(5):
        crown = Vector((lean.x + rng.uniform(-0.8, 0.8), lean.y + rng.uniform(-0.8, 0.8), rng.uniform(9.2, 10.3)))
        add_leaves(leaves, leaf_faces, leaf_materials, crown, 38, 0.6, 0.3, 0.34, rng)
    return build(collection, "cypress", {
        "branches": (wood, wood_faces, [bark], None, True),
        "leaves": (leaves, leaf_faces, [leaf_dark, leaf_mid], leaf_materials, False),
        "moss": (strands, strand_faces, [moss], None, False),
    })


def arc(start, control, end, steps=6):
    """Points along a quadratic curve, so roots bend smoothly instead of kinking."""
    return [start.lerp(control, i / steps).lerp(control.lerp(end, i / steps), i / steps) for i in range(steps + 1)]


def make_mangrove(collection, seed):
    rng = random.Random(seed)
    wood, wood_faces = [], []
    leaves, leaf_faces, leaf_materials = [], [], []
    strands, strand_faces = [], []
    lean = Vector((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), 0))
    trunk = [Vector((0, 0, -0.7)), Vector((0, 0, 0.5)), Vector((lean.x * 0.3, lean.y * 0.3, 1.7)), Vector((lean.x * 0.7, lean.y * 0.7, 2.8)), Vector((lean.x, lean.y, 3.6))]
    add_tube(wood, wood_faces, trunk, [0.4, 0.34, 0.27, 0.2, 0.1], rng, 10)
    # A few thick roots that swell out of the trunk and curve down into the water.
    for root in range(6):
        a = root * math.tau / 6 + rng.uniform(-0.22, 0.22)
        direction = Vector((math.cos(a), math.sin(a), 0))
        reach = rng.uniform(0.75, 1.25)
        start = Vector((0, 0, rng.uniform(0.75, 1.25)))
        shoulder = direction * reach * 0.8 + Vector((0, 0, start.z * 0.85))
        foot = direction * reach + Vector((0, 0, -0.8))
        add_tube(wood, wood_faces, arc(start, shoulder, foot), [0.15, 0.14, 0.125, 0.11, 0.1, 0.09, 0.08], rng, 6)
    for i in range(12):
        a = i * 2.399 + rng.uniform(-0.25, 0.25)
        level = rng.uniform(2.2, 3.5)
        start = Vector((lean.x * level / 3.6, lean.y * level / 3.6, level))
        reach = rng.uniform(1.3, 2.7)
        lift = rng.uniform(0.2, 1.3)
        mid = start + Vector((math.cos(a) * reach * 0.55, math.sin(a) * reach * 0.55, lift * 0.75))
        tip = start + Vector((math.cos(a) * reach, math.sin(a) * reach, lift))
        add_tube(wood, wood_faces, [start, mid, tip], [0.1, 0.06, 0.018], rng, 5)
        add_leaves(leaves, leaf_faces, leaf_materials, tip, 46, 0.55, 0.32, 0.32, rng)
        add_leaves(leaves, leaf_faces, leaf_materials, mid + Vector((0, 0, 0.25)), 30, 0.5, 0.28, 0.32, rng)
        if rng.random() > 0.5:
            add_moss(strands, strand_faces, tip + Vector((0, 0, -0.1)), rng.uniform(0.6, 1.5), rng.uniform(0.08, 0.16), rng)
    for _ in range(6):
        crown = Vector((lean.x + rng.uniform(-0.8, 0.8), lean.y + rng.uniform(-0.8, 0.8), rng.uniform(3.9, 4.9)))
        add_leaves(leaves, leaf_faces, leaf_materials, crown, 44, 0.6, 0.32, 0.32, rng)
    return build(collection, "mangrove", {
        "branches": (wood, wood_faces, [bark], None, True),
        "leaves": (leaves, leaf_faces, [leaf_dark, leaf_mid], leaf_materials, False),
        "moss": (strands, strand_faces, [moss], None, False),
    })


def make_snag(collection, seed):
    rng = random.Random(seed)
    wood, wood_faces = [], []
    strands, strand_faces = [], []
    lean = Vector((rng.uniform(0.5, 0.9), rng.uniform(-0.3, 0.3), 0))
    heights = [-0.7, 0.3, 2.2, 4.4, 6.3]
    trunk = [Vector((lean.x * max(h, 0) / 6.3, lean.y * max(h, 0) / 6.3, h)) for h in heights]
    add_tube(wood, wood_faces, trunk, [0.5, 0.36, 0.25, 0.17, 0.09], rng, 9)
    for root in range(6):
        a = root * math.tau / 6 + rng.uniform(-0.2, 0.2)
        direction = Vector((math.cos(a), math.sin(a), 0))
        add_tube(wood, wood_faces, [direction * rng.uniform(1.0, 1.5) + Vector((0, 0, -0.75)), direction * 0.5 + Vector((0, 0, 0.2)), Vector((0, 0, 1.5))], [0.05, 0.13, 0.1], rng, 5)
    for i in range(6):
        a = i * 2.399 + rng.uniform(-0.3, 0.3)
        level = rng.uniform(2.6, 5.9)
        start = Vector((lean.x * level / 6.3, lean.y * level / 6.3, level))
        reach = rng.uniform(0.8, 2.4)
        mid = start + Vector((math.cos(a) * reach * 0.6, math.sin(a) * reach * 0.6, rng.uniform(0.1, 0.5)))
        tip = start + Vector((math.cos(a) * reach, math.sin(a) * reach, rng.uniform(-0.3, 0.9)))
        add_tube(wood, wood_faces, [start, mid, tip], [0.09, 0.055, 0.03], rng, 5)
        for anchor in (mid, tip):
            add_moss(strands, strand_faces, anchor + Vector((0, 0, -0.05)), rng.uniform(0.7, 2.2), rng.uniform(0.09, 0.2), rng)
    return build(collection, "snag", {
        "branches": (wood, wood_faces, [bark], None, True),
        "moss": (strands, strand_faces, [moss], None, False),
    })


original_scene = bpy.context.window.scene
asset_scene = bpy.data.scenes.new("Moonwater swamp export")
report = []
try:
    bpy.context.window.scene = asset_scene
    for variant, maker, seed in [("cypress", make_cypress, 613), ("mangrove", make_mangrove, 727), ("snag", make_snag, 839)]:
        collection = bpy.data.collections.new(f"Moonwater {variant} export")
        asset_scene.collection.children.link(collection)
        objects = maker(collection, seed)
        bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[collection.name]
        path = os.path.join(OUTPUT, f"{variant}.glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_active_scene=True, use_active_collection=True, use_selection=False, export_apply=True)
        report.append(f"{variant}: {sum(len(obj.data.polygons) for obj in objects)} faces")
        for obj in objects:
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(collection)
finally:
    bpy.context.window.scene = original_scene
    bpy.data.scenes.remove(asset_scene)
    for mesh in created_meshes:
        bpy.data.meshes.remove(mesh)
    for mat in created_materials:
        bpy.data.materials.remove(mat)
print("Exported " + ", ".join(report))
