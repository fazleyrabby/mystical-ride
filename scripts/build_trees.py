"""Create six detailed shoreline tree GLBs in an isolated Blender scene."""

import math
import os
import random

import bpy
from mathutils import Vector


OUTPUT = "/Users/rabbi/Desktop/Projects/boatride/public/models"
os.makedirs(OUTPUT, exist_ok=True)


def material(name, color, roughness=1.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (*color, 1)
    principled.inputs["Roughness"].default_value = roughness
    mat.use_backface_culling = False
    return mat


bark = material("Moonwater bark", (0.105, 0.125, 0.112))
leaf_dark = material("Moonwater deep leaves", (0.055, 0.155, 0.125))
leaf_mid = material("Moonwater moonlit leaves", (0.11, 0.245, 0.172))


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


def make_tree(collection, variant, seed):
    rng = random.Random(seed)
    trunk_vertices, trunk_faces = [], []
    leaf_vertices, leaf_faces, leaf_materials = [], [], []
    broad = variant == "banyan"
    emergent = variant == "kapok"
    height = 1.48 if emergent else 1.0
    spread = 1.38 if broad else 1.18 if emergent else 0.82 if variant == "slim" else 1.0
    lean = Vector((rng.uniform(-0.22, 0.22), rng.uniform(-0.18, 0.18), 0))
    trunk_path = [
        Vector((0, 0, 0)),
        Vector((0.03, 0.01, 1.15 * height)),
        Vector((lean.x * 0.55, lean.y * 0.55, 2.35 * height)),
        Vector((lean.x, lean.y, 3.72 * height)),
        Vector((lean.x + rng.uniform(-0.18, 0.18), lean.y, 4.42 * height)),
    ]
    trunk_width = 1.22 if broad or emergent else 1.0
    add_tube(trunk_vertices, trunk_faces, trunk_path, [0.34 * trunk_width, 0.29 * trunk_width, 0.21 * trunk_width, 0.12, 0.045], rng, 11)
    if emergent:
        for root in range(6):
            a = root * math.tau / 6 + rng.uniform(-0.12, 0.12)
            direction = Vector((math.cos(a), math.sin(a), 0))
            add_tube(trunk_vertices, trunk_faces,
                     [direction * rng.uniform(1.0, 1.5), direction * 0.56 + Vector((0, 0, 0.48)), Vector((0, 0, 2.1))],
                     [0.055, 0.13, 0.17], rng, 6)

    clusters = []
    branch_count = 15 if broad else 13 if variant == "willow" else 12 if emergent else 11
    for i in range(branch_count):
        a = i * 2.399 + rng.uniform(-0.22, 0.22)
        start_height = rng.uniform(1.72, 3.3) if broad else rng.uniform(2.55, 3.85) if emergent else rng.uniform(2.02, 3.55)
        start = Vector((lean.x * start_height / 3.72, lean.y * start_height / 3.72, start_height * height))
        reach = rng.uniform(1.12, 2.15) * spread
        lift = rng.uniform(0.12, 0.88) if broad else rng.uniform(-0.10, 0.58) if variant == "willow" else rng.uniform(0.45, 1.47)
        mid = start + Vector((math.cos(a) * reach * 0.54, math.sin(a) * reach * 0.54, lift * 0.72 * height))
        tip = start + Vector((math.cos(a) * reach, math.sin(a) * reach, lift * height))
        add_tube(trunk_vertices, trunk_faces, [start, mid, tip], [0.10, 0.065, 0.018], rng, 7)
        clusters.append(tip)
        for fork in (-1, 1):
            fork_angle = a + fork * rng.uniform(0.34, 0.75)
            twig_tip = mid + Vector((math.cos(fork_angle) * reach * 0.54,
                                     math.sin(fork_angle) * reach * 0.54,
                                     rng.uniform(-0.2, 0.4) if broad else rng.uniform(-0.42, 0.20) if variant == "willow" else rng.uniform(0.18, 0.82)))
            add_tube(trunk_vertices, trunk_faces, [mid, twig_tip], [0.048, 0.009], rng, 5)
            clusters.append(twig_tip)
    clusters += [Vector((lean.x + rng.uniform(-0.65, 0.65), lean.y + rng.uniform(-0.65, 0.65), rng.uniform(4.1, 5.5) * height)) for _ in range(7)]

    for cluster in clusters:
        for _ in range(68 if variant != "willow" else 82):
            offset = Vector((rng.gauss(0, 0.53 if broad else 0.43), rng.gauss(0, 0.53 if broad else 0.43), rng.gauss(0, 0.32 if variant != "willow" else 0.57)))
            center = cluster + offset
            direction = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.55, 1.2))).normalized()
            side = direction.cross(Vector((0, 0, 1)))
            if side.length < 0.08:
                side = Vector((1, 0, 0))
            side.normalize()
            normal = side.cross(direction).normalized()
            length = rng.uniform(0.16, 0.32) * (0.82 if variant == "slim" else 1)
            width = length * rng.uniform(0.36, 0.58)
            base = len(leaf_vertices)
            leaf_vertices.extend([
                center - direction * length * 0.55,
                center - side * width * 0.5 + normal * 0.035,
                center + direction * length * 0.56,
                center + side * width * 0.5 + normal * 0.035,
                center + normal * 0.055,
            ])
            leaf_faces.extend([(base, base + 1, base + 4),
                               (base + 1, base + 2, base + 4),
                               (base + 2, base + 3, base + 4),
                               (base + 3, base, base + 4)])
            leaf_materials.extend([1 if rng.random() > 0.68 else 0] * 4)

    trunk_mesh = bpy.data.meshes.new(f"{variant} bark mesh")
    trunk_mesh.from_pydata(trunk_vertices, [], trunk_faces)
    trunk_mesh.update()
    trunk_obj = bpy.data.objects.new(f"Moonwater {variant} branches", trunk_mesh)
    collection.objects.link(trunk_obj)
    trunk_mesh.materials.append(bark)
    for polygon in trunk_mesh.polygons:
        polygon.use_smooth = True

    leaves_mesh = bpy.data.meshes.new(f"{variant} leaf mesh")
    leaves_mesh.from_pydata(leaf_vertices, [], leaf_faces)
    leaves_mesh.update()
    leaves_obj = bpy.data.objects.new(f"Moonwater {variant} leaves", leaves_mesh)
    collection.objects.link(leaves_obj)
    leaves_mesh.materials.append(leaf_dark)
    leaves_mesh.materials.append(leaf_mid)
    for polygon, index in zip(leaves_mesh.polygons, leaf_materials):
        polygon.material_index = index
    return [trunk_obj, leaves_obj]


def make_palm(collection, seed):
    rng=random.Random(seed)
    trunk_vertices,trunk_faces=[],[]
    leaf_vertices,leaf_faces,leaf_materials=[],[],[]
    trunk_path=[Vector((0,0,0)),Vector((0.12,0,1.5)),Vector((0.22,0.08,3.3)),
                Vector((0.39,0.12,5.3)),Vector((0.54,0.16,7.15))]
    add_tube(trunk_vertices,trunk_faces,trunk_path,[.28,.25,.19,.14,.085],rng,11)
    crown=trunk_path[-1]
    for frond in range(12):
        angle=frond*math.tau/12+rng.uniform(-.11,.11)
        direction=Vector((math.cos(angle),math.sin(angle),0))
        sideways=Vector((-math.sin(angle),math.cos(angle),0))
        length=rng.uniform(2.65,3.95)
        spine=[]
        for step in range(8):
            t=step/7
            spine.append(crown+direction*(length*t)+Vector((0,0,.66*math.sin(math.pi*t)-1.55*t*t)))
        add_tube(trunk_vertices,trunk_faces,spine,[.085,.076,.065,.054,.042,.03,.018,.004],rng,5)
        for step in range(1,17):
            t=step/17
            segment=t*7
            index=int(segment)
            factor=segment-index
            anchor=spine[index].lerp(spine[min(index+1,7)],factor)
            leaflet_length=math.sin(math.pi*t)**.7*rng.uniform(.68,1.12)
            for side in (-1,1):
                droop=Vector((0,0,-rng.uniform(.28,.55)))
                tip=anchor+sideways*side*leaflet_length+direction*.22+droop*leaflet_length
                base=len(leaf_vertices)
                leaf_vertices.extend([anchor-direction*.08,
                                      anchor+direction*.12+Vector((0,0,.035)),
                                      tip,
                                      anchor-direction*.15+sideways*side*leaflet_length*.46+Vector((0,0,-.11))])
                leaf_faces.extend([(base,base+1,base+3),(base+1,base+2,base+3)])
                leaf_materials.extend([1 if rng.random()>.76 else 0]*2)

    trunk_mesh=bpy.data.meshes.new("palm bark mesh")
    trunk_mesh.from_pydata(trunk_vertices,[],trunk_faces);trunk_mesh.update()
    trunk_obj=bpy.data.objects.new("Moonwater palm trunk",trunk_mesh);collection.objects.link(trunk_obj)
    trunk_mesh.materials.append(bark)
    for polygon in trunk_mesh.polygons:polygon.use_smooth=True

    leaves_mesh=bpy.data.meshes.new("palm frond mesh")
    leaves_mesh.from_pydata(leaf_vertices,[],leaf_faces);leaves_mesh.update()
    leaves_obj=bpy.data.objects.new("Moonwater palm fronds",leaves_mesh);collection.objects.link(leaves_obj)
    leaves_mesh.materials.append(leaf_dark);leaves_mesh.materials.append(leaf_mid)
    for polygon,index in zip(leaves_mesh.polygons,leaf_materials):polygon.material_index=index
    return [trunk_obj,leaves_obj]


original_scene = bpy.context.window.scene
asset_scene = bpy.data.scenes.new("Moonwater tree export")
try:
    bpy.context.window.scene = asset_scene
    for variant, seed in [("oak", 31), ("willow", 81), ("slim", 127), ("palm", 213), ("banyan", 349), ("kapok", 521)]:
        collection=bpy.data.collections.new(f"Moonwater {variant} export")
        asset_scene.collection.children.link(collection)
        objects = make_palm(collection,seed) if variant=="palm" else make_tree(collection, variant, seed)
        bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children[collection.name]
        path = os.path.join(OUTPUT, f"{variant}.glb")
        bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_active_scene=True, use_active_collection=True, use_selection=False, export_apply=True)
        print(f"Exported {variant}: {path}, {len(objects[1].data.polygons)} leaf faces")
        for obj in objects:
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(collection)
finally:
    bpy.context.window.scene = original_scene
    bpy.data.scenes.remove(asset_scene)
