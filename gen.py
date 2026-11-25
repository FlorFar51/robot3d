import cadquery as cq, trimesh, numpy as np, math
# CAO en mm, Z vers le haut, avant = +X, essieu le long de Y.
def pocketed_nose():
    n=cq.Workplane("XY").box(70,150,14,centered=(False,True,False)).translate((60,0,2))      # x 60..130
    cut=cq.Workplane("XY").circle(20.5).extrude(20).translate((130-15.8+20.5,0,0))
    return n.cut(cut)
chassis=cq.Workplane("XY").box(120,150,25,centered=(False,True,False)).translate((-60,0,6))   # x -60..60
nose=pocketed_nose()
def wheel(y):
    return cq.Workplane("XZ").circle(25).extrude(20).translate((0,y+10,0)).translate((-20,0,25))  # axe Y, Ø50, large 20
wl=wheel(-85); wr=wheel(85)
def motor(y): return cq.Workplane("XZ").circle(6).extrude(30).translate((0,y+15,0)).translate((-10,0,20))
ml,mr=motor(-40),motor(40)
battery=cq.Workplane("XY").box(50,30,15).translate((10,0,26))
parts={"chassis":chassis,"nose":nose,"wheel_left":wl,"wheel_right":wr,"motor_l":ml,"motor_r":mr,"battery":battery}
asm=cq.Assembly(name="robot")
cols={"chassis":(0.2,0.4,0.9),"nose":(1,0.7,0.3),"wheel_left":(0.1,0.1,0.1),"wheel_right":(0.1,0.1,0.1),"motor_l":(0.6,0.6,0.6),"motor_r":(0.6,0.6,0.6),"battery":(0.9,0.2,0.2)}
for k,v in parts.items(): asm.add(v,name=k,color=cq.Color(*cols[k]))
asm.save("robotA_assembly.step")
# pièce unique fusionnée
u=chassis
for k in ["nose","wheel_left","wheel_right","battery"]: u=u.union(parts[k])
cq.exporters.export(u,"robotA_fused.step")
# tessellation pour STL/OBJ/GLB
meshes={}
for k,v in parts.items():
    vs,tr=v.val().tessellate(0.05,0.2)
    meshes[k]=trimesh.Trimesh(np.array([[p.x,p.y,p.z] for p in vs]),np.array(tr))
sc=trimesh.Scene()
for k,m in meshes.items(): sc.add_geometry(m,geom_name=k,node_name=k)
allm=trimesh.util.concatenate(list(meshes.values())); allm.export("robotA.stl")
sc.export("robotA.obj")
# GLB : mètres, Y vers le haut (Z-up -> Y-up)
R=trimesh.transformations.rotation_matrix(-math.pi/2,[1,0,0]); S=np.diag([.001,.001,.001,1])
sg=trimesh.Scene()
for k,m in meshes.items():
    m2=m.copy(); m2.apply_transform(S@R) if False else m2.apply_transform(R@S); sg.add_geometry(m2,geom_name=k,node_name=k)
sg.export("robotA.glb")
print({k:np.round(m.bounds,0).tolist() for k,m in meshes.items() if k in("nose","wheel_left")})
