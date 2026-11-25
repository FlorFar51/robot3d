// Interface d'import de robot (fenêtre de configuration) et stockage du modèle dans IndexedDB.
import * as RI from './robotimport.js';

const LOADERS = 'https://esm.sh/three@0.181.1/examples/jsm/loaders/', OCCT = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/';
let occtPromise = null;
export const deps = {
  loader: async n => (await import(`${LOADERS}${n}.js`))[n],
  occt: () => occtPromise ??= new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = `${OCCT}occt-import-js.js`;
    s.onload = () => globalThis.occtimportjs({ locateFile: n => OCCT + n }).then(ok, ko);
    s.onerror = () => ko(new Error('Lecteur STEP indisponible (réseau)')); document.head.append(s);
  }),
};

// ---- stockage : un seul modèle, clé « robotModel » ----
const idb = () => new Promise((ok, ko) => { if (!globalThis.indexedDB) return ok(null); const r = indexedDB.open('robotpushlab', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
const run = async (mode, fn) => { const db = await idb(); if (!db) return null; return new Promise((ok, ko) => { const tx = db.transaction('kv', mode), req = fn(tx.objectStore('kv')); tx.oncomplete = () => ok(req.result ?? null); tx.onerror = () => ko(tx.error); }); };
export const loadStoredModel = () => run('readonly', st => st.get('robotModel')).catch(() => null);
export const storeModel = m => run('readwrite', st => st.put(m, 'robotModel'));
export const clearStoredModel = () => run('readwrite', st => st.delete('robotModel'));

// ---- interface ----
const ROLE_LABEL = { wheel: 'Roue', chassis: 'Châssis', ignore: 'Ignorer' }, mm = v => (v * 1000).toFixed(0);
export function mountImportUI(container, anchor, current) {
  const box = document.createElement('details'); box.id = 'robotImport';
  box.innerHTML = `<summary><b>Robot importé</b> (STEP, IGES, STL, OBJ, GLB, GLTF, PLY)</summary>
  <p id="impStatus"></p><input id="impFile" type="file" accept=".step,.stp,.iges,.igs,.brep,.stl,.obj,.glb,.gltf,.ply">
  <div id="impTools" class="hidden"><div id="impOpts"><label>Unité <select id="impUnit"><option value="auto">Auto</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option><option value="in">pouce</option></select></label>
  <label><input id="impFront" type="checkbox"> Inverser l’avant</label> <label><input id="impUp" type="checkbox"> Retourner haut/bas</label>
  <label>Masse (g) <input id="impMass" type="number" min="20" max="2000" step="1" value="454"></label></div>
  <canvas id="impView" width="300" height="200" style="width:100%;max-width:300px;background:#0b1522;border-radius:8px"></canvas>
  <div id="impParts"></div><p id="impReport"></p><button id="impApply" class="tinted">Utiliser ce robot</button></div>
  <button id="impClear" class="tinted hidden">Revenir au robot paramétrique</button>`;
  container.insertBefore(box, anchor);
  const $ = id => box.querySelector('#' + id), status = $('impStatus');
  let raw = null, parts = [], roles = [], model = null, scaleKey = '';
  const describe = m => `${m.name} : ${mm(m.dims.width)} × ${mm(m.dims.length)} mm, ${m.wheels.length} roue(s), ${m.hulls.length} enveloppes de collision, ${(m.mass * 1000).toFixed(0)} g.`;
  if (current) { status.textContent = `Robot actif — ${describe(current)}`; $('impClear').classList.remove('hidden'); box.open = true; } else status.textContent = 'Aucun robot importé : modèle paramétrique.';
  $('impClear').onclick = async () => { await clearStoredModel(); location.reload(); };
  const draw = () => {
    const c = $('impView'), g = c.getContext?.('2d'); if (!g || !model) return;
    g.clearRect(0, 0, c.width, c.height); const b = model.bounds, sc = Math.min((c.width - 30) / (b.max[0] - b.min[0]), (c.height - 40) / (b.max[2] - b.min[2])), X = x => c.width / 2 + x * sc, Z = z => c.height / 2 + 8 - z * sc;
    for (const p of model.parts) { if (p.role === 'ignore') continue; g.fillStyle = p.role === 'wheel' ? 'rgba(240,240,240,.85)' : 'rgba(80,160,255,.45)'; const P = p.positions, I = p.indices;
      for (let t = 0; t < I.length; t += 3) { g.beginPath(); g.moveTo(X(P[I[t] * 3]), Z(P[I[t] * 3 + 2])); g.lineTo(X(P[I[t + 1] * 3]), Z(P[I[t + 1] * 3 + 2])); g.lineTo(X(P[I[t + 2] * 3]), Z(P[I[t + 2] * 3 + 2])); g.fill(); } }
    g.fillStyle = '#ffb34d'; g.beginPath(); g.moveTo(c.width / 2, 6); g.lineTo(c.width / 2 - 7, 20); g.lineTo(c.width / 2 + 7, 20); g.fill();   // avant = haut de l'écran
  };
  const recompute = (reset) => {
    const sc = RI.unitScale(raw.parts, $('impUnit').value, raw.unit), key = `${sc}|${raw.parts.length}`;
    if (key !== scaleKey) { scaleKey = key; parts = RI.scaleParts(raw.parts, sc); if (parts.length === 1) parts = RI.splitComponents(parts[0]); reset = true; }
    let note = '';
    if (reset) { const d = RI.detectRoles(parts); roles = d.roles; note = d.note; renderParts(); }
    try { model = RI.buildModel(parts, roles, { flipFront: $('impFront').checked, flipUp: $('impUp').checked, upHint: raw.up, name: raw.name }); } catch (e) { $('impReport').textContent = e.message; return; }
    const mass = (+$('impMass').value || 454) / 1000, bad = RI.modelCheck(model, mass);
    $('impReport').textContent = [note, model.note, `${mm(model.dims.width)} × ${mm(model.dims.length)} mm — ${bad.length ? 'Hors règlement Micro : ' + bad.join(', ') : 'conforme au gabarit Micro (20 × 20 cm, 454 g)'}`].filter(Boolean).join(' ');
    draw();
  };
  const renderParts = () => {
    const host = $('impParts'); host.innerHTML = '';
    parts.forEach((p, i) => { const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;align-items:center;margin:2px 0'; const name = document.createElement('span'); name.style.flex = '1'; name.textContent = p.name;
      const sel = document.createElement('select'); for (const r of Object.keys(ROLE_LABEL)) { const o = document.createElement('option'); o.value = r; o.textContent = ROLE_LABEL[r]; sel.append(o); } sel.value = roles[i]; sel.onchange = () => { roles[i] = sel.value; recompute(false); };
      row.append(name, sel); host.append(row); });
  };
  $('impFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return; status.textContent = 'Lecture…';
    try { const r = await RI.readParts(f.name, await f.arrayBuffer(), deps); raw = { ...r, name: f.name.replace(/\.[^.]+$/, '') }; scaleKey = ''; $('impTools').classList.remove('hidden'); recompute(true); status.textContent = `${f.name} lu : ${raw.parts.length} partie(s).`; }
    catch (err) { status.textContent = `Échec : ${err.message}`; $('impTools').classList.add('hidden'); }
  };
  for (const id of ['impUnit', 'impFront', 'impUp', 'impMass']) $(id).onchange = () => raw && recompute(id === 'impUnit');
  $('impApply').onclick = async () => { if (!model) return; await storeModel({ ...model, mass: (+$('impMass').value || 454) / 1000 }); location.reload(); };
}
