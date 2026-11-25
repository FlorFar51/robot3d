// Import d'un robot complet (assemblage ou pièce unique) : lecture des fichiers, détection des roues et du châssis,
// orientation (essieu = axe latéral, haut, avant), hitboxes et modèle utilisable par le jeu.
// Module pur (aucun DOM, aucune dépendance) : les lecteurs de fichiers sont injectés par l'appelant (voir `deps`).
// Une « partie » = { name, positions: Float32Array (xyz), indices: Uint32Array, color: [r,g,b] | null }.
// Repère du robot dans le jeu : x = latéral, y = haut, z = avant (le nez est en +z), en mètres, origine au centre du châssis.

export const IMPORT_FORMATS = ['step', 'stp', 'iges', 'igs', 'brep', 'stl', 'obj', 'glb', 'gltf', 'ply'];
export const WHEEL_NAME = /wheel|roue|tire|tyre|pneu|rueda|rad\b|räder/i;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const neg = a => [-a[0], -a[1], -a[2]];
const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

// ---------- lecture des fichiers ----------
// deps.occt() -> instance occt-import-js ; deps.loader('STLLoader') -> classe d'un chargeur Three.js.
export async function readParts(fileName, buffer, deps) {
  const ext = fileName.split('.').pop().toLowerCase(), base = fileName.replace(/\.[^.]+$/, '');
  if (!IMPORT_FORMATS.includes(ext)) throw new Error(`Format .${ext} non pris en charge`);
  if (['step', 'stp', 'iges', 'igs', 'brep'].includes(ext)) {
    const occt = await deps.occt();
    const fn = { step: 'ReadStepFile', stp: 'ReadStepFile', iges: 'ReadIgesFile', igs: 'ReadIgesFile', brep: 'ReadBrepFile' }[ext];
    const r = occt[fn](new Uint8Array(buffer), { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.3 });
    if (!r || !r.success || !r.meshes.length) throw new Error('Fichier CAO illisible ou vide');
    const nodeNames = [], walk = n => { for (const i of n.meshes || []) if (!nodeNames[i] && n.name) nodeNames[i] = n.name; (n.children || []).forEach(walk); };
    walk(r.root);
    return { unit: 'mm', up: 'z', parts: r.meshes.map((m, i) => ({
      name: m.name || nodeNames[i] || `${base}_${i + 1}`, positions: Float32Array.from(m.attributes.position.array),
      indices: Uint32Array.from(m.index.array), color: m.color ? [...m.color] : null })) };
  }
  if (ext === 'stl' || ext === 'ply') {
    const Loader = await deps.loader(ext === 'stl' ? 'STLLoader' : 'PLYLoader');
    return { unit: null, up: 'z', parts: [geometryToPart(new Loader().parse(buffer), base, null)] };
  }
  if (ext === 'obj') {
    const Loader = await deps.loader('OBJLoader');
    return { unit: null, up: 'y', parts: objectToParts(new Loader().parse(new TextDecoder().decode(buffer)), base) };
  }
  const Loader = await deps.loader('GLTFLoader');   // glb / gltf (ressources externes non résolues)
  const gltf = await new Promise((ok, ko) => new Loader().parse(ext === 'gltf' ? new TextDecoder().decode(buffer) : buffer, '', ok, ko));
  return { unit: 'm', up: 'y', parts: objectToParts(gltf.scene, base) };
}

function geometryToPart(geo, name, matrix, color) {
  const pos = geo.attributes.position, n = pos.count, P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (matrix) { const m = matrix; [x, y, z] = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }
    P[3 * i] = x; P[3 * i + 1] = y; P[3 * i + 2] = z;
  }
  let I;
  if (geo.index) I = Uint32Array.from(geo.index.array); else { I = new Uint32Array(n); for (let i = 0; i < n; i++) I[i] = i; }
  return { name, positions: P, indices: I, color: color || null };
}

function objectToParts(root, base) {
  root.updateMatrixWorld(true);
  const parts = [];
  root.traverse(o => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    parts.push(geometryToPart(o.geometry, o.name || o.parent?.name || `${base}_${parts.length + 1}`, o.matrixWorld.elements, mat?.color ? [mat.color.r, mat.color.g, mat.color.b] : null));
  });
  if (!parts.length) throw new Error('Aucun maillage dans le fichier');
  return parts;
}

// ---------- unités ----------
export function extentOf(parts) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { const v = p.positions[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  return { min: mn, max: mx, size: mx.map((v, k) => v - mn[k]) };
}
const UNIT_TO_M = { mm: 0.001, cm: 0.01, m: 1, in: 0.0254 };
// unit : 'auto' | 'mm' | 'cm' | 'm' | 'in'. En auto : l'unité connue du format, sinon déduite de la plus grande dimension.
export function unitScale(parts, unit = 'auto', hint = null) {
  if (UNIT_TO_M[unit]) return UNIT_TO_M[unit];
  if (hint && UNIT_TO_M[hint]) return UNIT_TO_M[hint];
  const D = Math.max(...extentOf(parts).size);
  return D >= 80 ? 0.001 : D >= 8 ? 0.01 : 1;
}
export function scaleParts(parts, s) {
  return parts.map(p => ({ ...p, positions: p.positions.map(v => v * s) }));
}

// ---------- pièce unique : séparation en composants connexes ----------
export function splitComponents(part, tolRel = 1e-5) {
  const P = part.positions, I = part.indices, n = P.length / 3, e = extentOf([part]), tol = Math.max(...e.size) * tolRel || 1e-9;
  const key = new Map(), id = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(P[3 * i] / tol)},${Math.round(P[3 * i + 1] / tol)},${Math.round(P[3 * i + 2] / tol)}`;
    if (!key.has(k)) key.set(k, key.size); id[i] = key.get(k);
  }
  const par = Int32Array.from({ length: key.size }, (_, i) => i), find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < I.length; t += 3) { const a = find(id[I[t]]), b = find(id[I[t + 1]]), c = find(id[I[t + 2]]); par[b] = a; par[find(c)] = find(a); }
  const groups = new Map();
  for (let t = 0; t < I.length; t += 3) { const r = find(id[I[t]]); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(t); }
  const out = [];
  let k = 0;
  for (const tris of groups.values()) {
    if (tris.length < 4) continue;   // éclats minuscules ignorés
    const remap = new Map(), pos = [], idx = [];
    for (const t of tris) for (let j = 0; j < 3; j++) {
      const v = I[t + j]; if (!remap.has(v)) { remap.set(v, pos.length / 3); pos.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]); } idx.push(remap.get(v));
    }
    out.push({ name: `${part.name}_${++k}`, positions: Float32Array.from(pos), indices: Uint32Array.from(idx), color: part.color });
  }
  return out;
}

// ---------- statistiques d'une partie ----------
export function partStats(p) {
  const P = p.positions, I = p.indices, e = extentOf([p]);
  let vol = 0, cx = 0, cy = 0, cz = 0;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const v = (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
    vol += v; cx += v * (P[a] + P[b] + P[c]) / 4; cy += v * (P[a + 1] + P[b + 1] + P[c + 1]) / 4; cz += v * (P[a + 2] + P[b + 2] + P[c + 2]) / 4;
  }
  const mid = e.min.map((v, k) => (v + e.max[k]) / 2), box = e.size[0] * e.size[1] * e.size[2];
  const ok = Math.abs(vol) > box * 1e-4;   // maillage fermé exploitable
  return { ...e, mid, volume: ok ? Math.abs(vol) : box * 0.5, centroid: ok ? [cx / vol, cy / vol, cz / vol] : mid, closed: ok, box };
}

// ---------- axes principaux (Jacobi sur la covariance) ----------
function principalAxes(P) {
  const n = P.length / 3, m = [0, 0, 0];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) m[k] += P[i + k] / n;
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a][b] += (P[i + a] - m[a]) * (P[i + b] - m[b]) / n;
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) {
    let off = 0;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(C[p][q]) < 1e-18) continue; off += Math.abs(C[p][q]);
      const th = 0.5 * Math.atan2(2 * C[p][q], C[q][q] - C[p][p]), c = Math.cos(th), s = Math.sin(th);
      for (let k = 0; k < 3; k++) { const a = C[k][p], b = C[k][q]; C[k][p] = c * a - s * b; C[k][q] = s * a + c * b; }
      for (let k = 0; k < 3; k++) { const a = C[p][k], b = C[q][k]; C[p][k] = c * a - s * b; C[q][k] = s * a + c * b; }
      for (let k = 0; k < 3; k++) { const a = V[k][p], b = V[k][q]; V[k][p] = c * a - s * b; V[k][q] = s * a + c * b; }
    }
    if (off < 1e-16) break;
  }
  return [0, 1, 2].map(j => [V[0][j], V[1][j], V[2][j]]);
}
const perpTo = a => { const t = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], u = cross(a, t), l = Math.hypot(...u); return u.map(v => v / l); };

// Une partie est-elle un corps de révolution (roue) ? Renvoie { axis, center, radius, width } ou null.
// Critères : section circulaire (largeur ≈ hauteur dans le plan perpendiculaire) et le bord est couvert tout autour
// (au moins 10 secteurs de 30° sur 12) : un bloc, un prisme à 8 pans ou un disque ovale sont refusés.
export function wheelFit(p) {
  const P = p.positions, axes = [...AXES, ...principalAxes(P)];
  let best = null;
  for (const a of axes) {
    const u = perpTo(a), w = cross(a, u);
    let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity, h0 = Infinity, h1 = -Infinity;
    for (let i = 0; i < P.length; i += 3) {
      const v = [P[i], P[i + 1], P[i + 2]], pu = dot(v, u), pw = dot(v, w), ph = dot(v, a);
      if (pu < u0) u0 = pu; if (pu > u1) u1 = pu; if (pw < w0) w0 = pw; if (pw > w1) w1 = pw; if (ph < h0) h0 = ph; if (ph > h1) h1 = ph;
    }
    const eu = u1 - u0, ew = w1 - w0, width = h1 - h0;
    if (eu <= 0 || ew <= 0 || width <= 0 || Math.min(eu, ew) / Math.max(eu, ew) < 0.92) continue;
    const cu = (u0 + u1) / 2, cw = (w0 + w1) / 2;
    let R = 0;
    for (let i = 0; i < P.length; i += 3) { const v = [P[i], P[i + 1], P[i + 2]]; R = Math.max(R, Math.hypot(dot(v, u) - cu, dot(v, w) - cw)); }
    const sectors = new Set();
    for (let i = 0; i < P.length; i += 3) {
      const v = [P[i], P[i + 1], P[i + 2]], du = dot(v, u) - cu, dw = dot(v, w) - cw;
      if (Math.hypot(du, dw) >= 0.96 * R) sectors.add(Math.floor((Math.atan2(dw, du) + Math.PI) / (2 * Math.PI) * 12) % 12);
    }
    if (sectors.size < 10) continue;
    const ch = (h0 + h1) / 2, center = [0, 1, 2].map(k => cu * u[k] + cw * w[k] + ch * a[k]);
    if (!best || sectors.size > best.sectors) best = { axis: a, center, radius: R, width, sectors: sectors.size };
  }
  return best;
}

// ---------- détection des parties ----------
const sameAxis = (a, b) => Math.abs(dot(a, b)) > 0.97, close = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(a, b);
// Renvoie { roles: ['wheel'|'chassis'|'ignore' …], note } ; les parties sont en mètres.
export function detectRoles(parts) {
  const stats = parts.map(partStats), D = Math.max(...extentOf(parts).size);
  const fits = parts.map(wheelFit), hinted = parts.map(p => WHEEL_NAME.test(p.name));
  const cand = [];
  parts.forEach((p, i) => { if (fits[i] && (hinted[i] || fits[i].radius >= 0.05 * D)) cand.push(i); });
  // groupes : même axe, même rayon, même largeur
  const groups = [];
  for (const i of cand) {
    const g = groups.find(g => sameAxis(g.axis, fits[i].axis) && close(g.radius, fits[i].radius, 0.08) && close(g.width, fits[i].width, 0.15));
    if (g) g.members.push(i); else groups.push({ axis: fits[i].axis, radius: fits[i].radius, width: fits[i].width, members: [i] });
  }
  const valid = groups.filter(g => {
    if (g.members.length < 2) return false;
    const proj = g.members.map(i => dot(fits[i].center, g.axis));
    return Math.max(...proj) - Math.min(...proj) >= g.width;   // roues bien de part et d'autre
  });
  const score = g => (g.members.some(i => hinted[i]) ? 10 : 0) + g.radius / D;
  valid.sort((a, b) => score(b) - score(a));
  const roles = parts.map(() => 'chassis');
  if (!valid.length) return { roles, wheels: [], note: 'Aucune paire de roues détectée : tout est traité comme châssis.' };
  const win = valid[0], wheelIdx = new Set(win.members);
  win.members.forEach(i => { roles[i] = 'wheel'; });
  // pièces coaxiales aux roues (moyeux, vis, jantes séparées) : rattachées à la roue
  parts.forEach((p, i) => {
    if (roles[i] === 'wheel') return;
    for (const w of win.members) {
      const f = fits[w], rel = stats[i].mid.map((v, k) => v - f.center[k]), h = dot(rel, f.axis), r = Math.hypot(...rel.map((v, k) => v - h * f.axis[k]));
      if (Math.abs(h) <= f.width / 2 * 1.1 && r <= f.radius * 1.02 && stats[i].volume < stats[w].volume) { roles[i] = 'wheel'; break; }
    }
  });
  return { roles, wheels: win.members, note: `${win.members.length} roues détectées (Ø ${(win.radius * 2000).toFixed(0)} mm).` };
}

// ---------- construction du modèle de jeu ----------
// opts : { flipFront, flipUp, upHint: 'y'|'z' } ; roles : tableau parallèle à parts.
export function buildModel(allParts, allRoles, opts = {}) {
  const keep = allParts.map((_, i) => i).filter(i => allRoles[i] !== 'ignore'), parts = keep.map(i => allParts[i]), roles = keep.map(i => allRoles[i]);
  const stats = parts.map(partStats), idxOf = r => parts.map((_, i) => i).filter(i => roles[i] === r);
  const wheelParts = idxOf('wheel'), chassisParts = idxOf('chassis');
  if (!chassisParts.length) throw new Error('Aucune partie châssis');
  // une roue = une partie « roue » ; les parties plus petites contenues dans son cylindre sont ses accessoires
  const wheels = [];
  for (const i of wheelParts.sort((a, b) => stats[b].volume - stats[a].volume)) {
    const fit = wheelFit(parts[i]), host = fit && wheels.find(w => {
      const rel = stats[i].mid.map((v, k) => v - w.center[k]), h = dot(rel, w.axis);
      return Math.abs(h) <= w.width / 2 * 1.1 && Math.hypot(...rel.map((v, k) => v - h * w.axis[k])) <= w.radius * 1.02;
    });
    if (host) { host.parts.push(i); continue; }
    if (!fit) {   // partie marquée « roue » sans révolution nette : cylindre englobant, axe = plus petite dimension
      const k = stats[i].size.indexOf(Math.min(...stats[i].size)), others = [0, 1, 2].filter(j => j !== k);
      wheels.push({ parts: [i], axis: AXES[k], center: stats[i].mid, radius: Math.max(...others.map(j => stats[i].size[j])) / 2, width: stats[i].size[k] });
    } else wheels.push({ parts: [i], axis: fit.axis, center: fit.center, radius: fit.radius, width: fit.width });
  }
  const all = extentOf(parts), chassisExt = extentOf(chassisParts.map(i => parts[i]));
  let lateral = null, up, fwd, noteFront = null;
  if (wheels.length) {
    lateral = wheels[0].axis;
    const cands = AXES.filter(e => Math.abs(dot(e, lateral)) < 0.3);
    const gap = e => {
      const k = e.indexOf(1), lo = all.min[k], hi = all.max[k]; let g = Infinity, side = 1;
      for (const w of wheels) { const c = w.center[k], gl = c - w.radius - lo, gh = hi - (c + w.radius); if (gl < g) { g = gl; side = 1; } if (gh < g) { g = gh; side = -1; } }
      return { g, side };
    };
    const rated = cands.map(e => ({ e, ...gap(e), flat: chassisExt.size[e.indexOf(1)] })).sort((a, b) => (Math.abs(a.g - b.g) > 0.002 ? a.g - b.g : a.flat - b.flat));
    const pick = rated[0] || { e: perpTo(lateral), side: 1 };
    up = pick.side > 0 ? pick.e : neg(pick.e);
    const f0 = cross(lateral, up), fl = Math.hypot(...f0), f0n = f0.map(v => v / fl);
    const wc = wheels.reduce((s, w) => s + dot(w.center, f0n), 0) / wheels.length;
    let fmin = Infinity, fmax = -Infinity;
    for (const i of chassisParts) for (let t = 0; t < parts[i].positions.length; t += 3) { const v = dot([parts[i].positions[t], parts[i].positions[t + 1], parts[i].positions[t + 2]], f0n); if (v < fmin) fmin = v; if (v > fmax) fmax = v; }
    const plus = fmax - wc, minus = wc - fmin;
    fwd = plus >= minus ? f0n : neg(f0n);
    if (Math.abs(plus - minus) < 0.05 * Math.max(...all.size)) noteFront = 'Avant incertain (roues au milieu) : utilise « Inverser l\'avant » si besoin.';
  } else {
    const order = [0, 1, 2].sort((a, b) => chassisExt.size[a] - chassisExt.size[b]), k = opts.upHint === 'y' ? 1 : opts.upHint === 'z' ? 2 : order[0];
    up = AXES[k]; const rest = [0, 1, 2].filter(j => j !== k).sort((a, b) => chassisExt.size[b] - chassisExt.size[a]);
    fwd = AXES[rest[0]]; noteFront = 'Roues non détectées : orientation estimée sur les dimensions.';
  }
  if (opts.flipUp) { up = neg(up); fwd = neg(fwd); }   // rotation de 180° autour de l'essieu
  if (opts.flipFront) fwd = neg(fwd);
  const lat = cross(up, fwd);   // l = u × f  (f = l × u)
  const tr = v => [dot(v, lat), dot(v, up), dot(v, fwd)];
  const moved = parts.map(p => { const Q = new Float32Array(p.positions.length); for (let i = 0; i < Q.length; i += 3) { const t = tr([p.positions[i], p.positions[i + 1], p.positions[i + 2]]); Q[i] = t[0]; Q[i + 1] = t[1]; Q[i + 2] = t[2]; } return { ...p, positions: Q }; });
  const ce = extentOf(chassisParts.map(i => moved[i])), origin = ce.min.map((v, k) => (v + ce.max[k]) / 2);
  for (const p of moved) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) p.positions[i + k] -= origin[k];
  const mstats = moved.map(partStats), total = extentOf(moved), chassisBox = extentOf(chassisParts.map(i => moved[i]));
  const outWheels = wheels.map(w => {
    const c = tr(w.center).map((v, k) => v - origin[k]);
    return { center: c, radius: w.radius, width: w.width, side: c[0] < 0 ? -1 : 1, parts: w.parts };
  }).sort((a, b) => a.center[0] - b.center[0] || a.center[2] - b.center[2]);
  const maxDim = Math.max(...total.size);
  let vol = 0, com = [0, 0, 0];
  parts.forEach((_, i) => { vol += mstats[i].volume; for (let k = 0; k < 3; k++) com[k] += mstats[i].centroid[k] * mstats[i].volume; });
  com = com.map(v => v / vol);
  // collisions : parties châssis assez grandes, hors boîtes déjà contenues dans une autre
  const inside = (a, b) => [0, 1, 2].every(k => a.min[k] >= b.min[k] - 5e-4 && a.max[k] <= b.max[k] + 5e-4);
  const hulls = [];
  for (const i of chassisParts) {
    const s = mstats[i];
    if (Math.max(...s.size) < 0.1 * maxDim) continue;
    if (chassisParts.some(j => j !== i && inside(s, mstats[j]) && (mstats[j].volume > s.volume))) continue;
    hulls.push(...partHulls(moved[i], s));
  }
  return { version: 1, name: opts.name || 'robot', parts: moved.map((p, i) => ({ name: p.name, role: roles[i], positions: p.positions, indices: p.indices, color: p.color })),
    wheels: outWheels, hulls, dims: { width: total.size[0], height: chassisBox.size[1], length: total.size[2], totalHeight: total.size[1] },
    chassis: { width: chassisBox.size[0], height: chassisBox.size[1], length: chassisBox.size[2] },
    com, volume: vol, bounds: { min: total.min, max: total.max }, note: noteFront };
}

// ---------- hitboxes ----------
// Pièce quasi pleine (volume ≈ boîte) : une seule enveloppe convexe. Sinon : tranches de 1 cm en largeur, chaque tranche
// découpée exactement (coupe des triangles) puis enveloppée : un creux (nez arrondi) ou un trou reste visible.
function partHulls(p, s) {
  const fill = s.closed ? s.volume / s.box : 0;
  if (fill > 0.98) return [hullPoints(Array.from(p.positions))];
  const n = Math.max(4, Math.min(16, Math.round(s.size[0] / 0.01))), out = [];
  for (let k = 0; k < n; k++) {
    const lo = s.min[0] + s.size[0] * k / n, hi = s.min[0] + s.size[0] * (k + 1) / n, pts = [];
    const P = p.positions, I = p.indices;
    for (let t = 0; t < I.length; t += 3) {
      let poly = [0, 1, 2].map(j => [P[I[t + j] * 3], P[I[t + j] * 3 + 1], P[I[t + j] * 3 + 2]]);
      poly = clipPoly(poly, 0, lo, 1); poly = clipPoly(poly, 0, hi, -1);
      for (const v of poly) pts.push(...v);
    }
    if (pts.length >= 12) out.push(hullPoints(pts));
  }
  return out;
}
function clipPoly(poly, axis, bound, sign) {   // garde sign*(v[axis]-bound) >= 0
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = sign * (a[axis] - bound), db = sign * (b[axis] - bound);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push(a.map((v, k) => v + t * (b[k] - v))); }
  }
  return out;
}
function hullPoints(flat) {   // points dédoublonnés au 0,2 mm près (Rapier calcule l'enveloppe)
  const seen = new Set(), out = [];
  for (let i = 0; i < flat.length; i += 3) {
    const k = `${Math.round(flat[i] / 2e-4)},${Math.round(flat[i + 1] / 2e-4)},${Math.round(flat[i + 2] / 2e-4)}`;
    if (!seen.has(k)) { seen.add(k); out.push(flat[i], flat[i + 1], flat[i + 2]); }
  }
  return Float32Array.from(out);
}

// ---------- conformité et réglages ----------
export function modelCheck(m, mass) {
  const bad = [];
  if (mass > 0.454 + 1e-9) bad.push('masse > 454 g');
  if (m.dims.width > 0.2 + 1e-9) bad.push(`largeur ${(m.dims.width * 1000).toFixed(0)} mm > 200 mm`);
  if (m.dims.length > 0.2 + 1e-9) bad.push(`longueur ${(m.dims.length * 1000).toFixed(0)} mm > 200 mm`);
  return bad;
}
// Applique le modèle aux réglages du jeu (le robot importé remplace le châssis et le nez paramétriques).
export function applyToSettings(m, s) {
  const wr = m.wheels.length ? m.wheels.reduce((a, w) => a + w.radius, 0) / m.wheels.length : s.wheelRadius;
  Object.assign(s, { baseWidth: m.dims.width, baseLength: m.dims.length, hookLength: 0, baseHeight: Math.max(0.005, m.chassis.height), wheelRadius: wr,
    wheelWidth: m.wheels.length ? m.wheels[0].width : s.wheelWidth, centerOfMassX: m.com[0], centerOfMassY: m.com[1], centerOfMassZ: m.com[2], importedRobot: m.name });
}
