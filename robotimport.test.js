import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as RI from './robotimport.js';

// ---- pièces synthétiques (mètres) ----
function box(name, c, s) {
  const P = [], I = [[0, 1, 3, 0, 3, 2], [4, 6, 7, 4, 7, 5], [0, 4, 5, 0, 5, 1], [2, 3, 7, 2, 7, 6], [0, 2, 6, 0, 6, 4], [1, 5, 7, 1, 7, 3]].flat();
  for (let i = 0; i < 8; i++) P.push(c[0] + (i & 1 ? s[0] : -s[0]) / 2, c[1] + (i & 2 ? s[1] : -s[1]) / 2, c[2] + (i & 4 ? s[2] : -s[2]) / 2);
  return { name, positions: Float32Array.from(P), indices: Uint32Array.from(I), color: null };
}
function cyl(name, c, R, W, n = 24) {   // axe = x
  const P = [], I = [];
  for (let k = 0; k < n; k++) { const a = k / n * 2 * Math.PI; for (const sx of [-1, 1]) P.push(c[0] + sx * W / 2, c[1] + R * Math.cos(a), c[2] + R * Math.sin(a)); }
  P.push(c[0] - W / 2, c[1], c[2], c[0] + W / 2, c[1], c[2]);
  for (let k = 0; k < n; k++) { const a = 2 * k, b = 2 * ((k + 1) % n); I.push(a, b, a + 1, b, b + 1, a + 1, a, 2 * n, b, a + 1, b + 1, 2 * n + 1); }
  return { name, positions: Float32Array.from(P), indices: Uint32Array.from(I), color: null };
}
// robot de référence : châssis 0,12 × 0,03 × 0,16, roues Ø 0,05 × 0,02 à l'arrière (z = -0.04), nez = +z
const robot = () => [box('plaque', [0, 0.03, 0], [0.12, 0.03, 0.16]), cyl('wheel_L', [-0.07, 0.025, -0.04], 0.025, 0.02), cyl('wheel_R', [0.07, 0.025, -0.04], 0.025, 0.02), cyl('moteur', [0, 0.03, -0.03], 0.006, 0.03)];
const permute = (parts, f) => parts.map(p => { const Q = new Float32Array(p.positions.length); for (let i = 0; i < Q.length; i += 3) { const v = f([p.positions[i], p.positions[i + 1], p.positions[i + 2]]); Q[i] = v[0]; Q[i + 1] = v[1]; Q[i + 2] = v[2]; } return { ...p, positions: Q }; });
const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test('roues détectées : paire cylindrique, ni la plaque ni le petit moteur', () => {
  const parts = robot(), d = RI.detectRoles(parts);
  assert.deepEqual(d.roles, ['chassis', 'wheel', 'wheel', 'chassis']);
});

test('un bloc, un disque ovale et un prisme à 8 pans ne sont pas des roues', () => {
  assert.equal(RI.wheelFit(box('b', [0, 0, 0], [0.05, 0.05, 0.02])), null);
  assert.equal(RI.wheelFit(cyl('p8', [0, 0, 0], 0.025, 0.02, 8)), null);
  const oval = permute([cyl('o', [0, 0, 0], 0.025, 0.02)], v => [v[0], v[1], v[2] * 0.6])[0];
  assert.equal(RI.wheelFit(oval), null);
  assert.ok(RI.wheelFit(cyl('ok', [0, 0, 0], 0.025, 0.02)));
});

test('orientation : le robot a le nez en +z, le haut en +y, les roues en x = ±, quelle que soit la CAO', () => {
  const variants = {
    'repère jeu': p => p,
    'CAO Z-haut, avant +X, essieu Y': p => permute(p, ([x, y, z]) => [z, x, y]),
    'avant inversé (nez en -X)': p => permute(p, ([x, y, z]) => [-z, -x, y]),
    'Y-haut tourné de 90°': p => permute(p, ([x, y, z]) => [z, y, -x]),
  };
  for (const [name, f] of Object.entries(variants)) {
    const parts = f(robot()), d = RI.detectRoles(parts), m = RI.buildModel(parts, d.roles);
    assert.equal(m.wheels.length, 2, name);
    near(m.dims.width, 0.16, 2e-3); near(m.dims.length, 0.16, 2e-3);
    assert.deepEqual(m.wheels.map(w => w.side), [-1, 1], name);
    for (const w of m.wheels) { near(Math.abs(w.center[0]), 0.07, 2e-3); near(w.center[2], -0.04, 2e-3); near(w.radius, 0.025, 1e-3); assert.ok(w.center[1] < 0.01, `${name}: roues sous le centre du châssis`); }
  }
});

test('réglages inversés : avant et haut', () => {
  const parts = robot(), d = RI.detectRoles(parts), a = RI.buildModel(parts, d.roles), b = RI.buildModel(parts, d.roles, { flipFront: true });
  near(b.wheels[0].center[2], -a.wheels[0].center[2], 2e-3);
});

test('unités : auto-détection mm / cm / m, et unité forcée', () => {
  const p = robot();
  assert.equal(RI.unitScale(p, 'auto', null), 1);
  assert.equal(RI.unitScale(RI.scaleParts(p, 1000), 'auto', null), 0.001);
  assert.equal(RI.unitScale(RI.scaleParts(p, 100), 'auto', null), 0.01);
  assert.equal(RI.unitScale(p, 'mm', 'm'), 0.001);
  assert.equal(RI.unitScale(p, 'auto', 'mm'), 0.001);
});

test('pièce unique : séparation en composants connexes', () => {
  const parts = robot(), all = { name: 'tout', color: null, positions: new Float32Array(parts.reduce((n, p) => n + p.positions.length, 0)), indices: new Uint32Array(parts.reduce((n, p) => n + p.indices.length, 0)) };
  let po = 0, io = 0, vo = 0;
  for (const p of parts) { all.positions.set(p.positions, po); for (let i = 0; i < p.indices.length; i++) all.indices[io + i] = p.indices[i] + vo; po += p.positions.length; io += p.indices.length; vo += p.positions.length / 3; }
  const comps = RI.splitComponents(all);
  assert.equal(comps.length, 4);
  assert.deepEqual(RI.detectRoles(comps).roles.filter(r => r === 'wheel').length, 2);
});

test('hitboxes : plaque pleine = 1 enveloppe, pièce creusée = tranches ; les roues n\'ont pas de collision', () => {
  const m = RI.buildModel(robot(), ['chassis', 'wheel', 'wheel', 'chassis']);
  assert.ok(m.hulls.length >= 1 && m.hulls.every(h => h instanceof Float32Array && h.length >= 12));
  assert.equal(m.hulls.length, 1, 'la plaque (le moteur, trop petit, est ignoré)');
});

test('conformité Micro et réglages', () => {
  const m = RI.buildModel(robot(), ['chassis', 'wheel', 'wheel', 'chassis']);
  assert.deepEqual(RI.modelCheck(m, 0.454), []);
  assert.ok(RI.modelCheck(m, 0.6).includes('masse > 454 g'));
  const big = RI.buildModel(RI.scaleParts(robot(), 1.5), ['chassis', 'wheel', 'wheel', 'chassis']);
  assert.ok(RI.modelCheck(big, 0.4).some(x => x.startsWith('largeur')));
  const s = { wheelRadius: 0, wheelWidth: 0 }; RI.applyToSettings(m, s);
  near(s.baseWidth, m.dims.width, 1e-9); near(s.wheelRadius, 0.025, 1e-3); assert.equal(s.hookLength, 0); assert.equal(s.importedRobot, 'robot');
});

test('sans roue détectable : tout est châssis, orientation estimée, pas d\'erreur', () => {
  const parts = [box('bloc', [0, 0, 0], [0.1, 0.03, 0.15])], d = RI.detectRoles(parts), m = RI.buildModel(parts, d.roles);
  assert.deepEqual(d.roles, ['chassis']); assert.equal(m.wheels.length, 0); assert.ok(m.note);
});

test('une partie « ignorée » n\'entre ni dans le modèle ni dans le centre de gravité', () => {
  const m = RI.buildModel([...robot(), box('vis', [1, 1, 1], [0.01, 0.01, 0.01])], ['chassis', 'wheel', 'wheel', 'chassis', 'ignore']);
  assert.equal(m.parts.length, 4); assert.ok(m.dims.width < 0.2);
});

// ---- vrais fichiers (CAO STEP, STL, OBJ, GLB) : nécessitent `occt-import-js` et `three` installés (sinon ignorés) ----
const require = createRequire(import.meta.url);
let occt = null, haveThree = true;
try { occt = await require('occt-import-js')(); } catch { /* non installé */ }
try { await import('three/examples/jsm/loaders/STLLoader.js'); } catch { haveThree = false; }
const deps = { occt: async () => occt, loader: async n => (await import(`three/examples/jsm/loaders/${n}.js`))[n] };
for (const [file, needs] of [['robotA_assembly.step', 'occt'], ['robotA.stl', 'three'], ['robotA.obj', 'three'], ['robotA.glb', 'three']]) {
  test(`fichier ${file} : mêmes roues, même orientation, même gabarit`, async t => {
    if (needs === 'occt' ? !occt : !haveThree) return t.skip('dépendance absente');
    const buf = fs.readFileSync(new URL(`./test-robots/${file}`, import.meta.url)), r = await RI.readParts(file, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), deps);
    let parts = RI.scaleParts(r.parts, RI.unitScale(r.parts, 'auto', r.unit));
    if (parts.length === 1) parts = RI.splitComponents(parts[0]);
    const d = RI.detectRoles(parts), m = RI.buildModel(parts, d.roles, { upHint: r.up });
    assert.equal(m.wheels.length, 2); near(m.wheels[0].radius, 0.025, 1e-3);
    near(m.dims.width, 0.19, 2e-3); near(m.dims.length, 0.19, 2e-3);
    assert.ok(m.wheels.every(w => w.center[2] < -0.04), 'roues à l\'arrière : le nez à poche est bien vers +z');
    assert.deepEqual(RI.modelCheck(m, 0.454), []);
  });
}
test('format non pris en charge', async () => { await assert.rejects(() => RI.readParts('x.dwg', new ArrayBuffer(4), {}), /non pris en charge/); });
