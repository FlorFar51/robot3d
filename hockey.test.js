// Lancer : node --test hockey.test.js   (Node 20 ou plus, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './hockey.js';

const BASE = { fieldWidth: 20, fieldLength: 33 };       // terrain 1v1 d'origine
const ROBOT = { w: 2.3, l: 1.9 + 1.55 };                // largeur du châssis ; longueur châssis + crochets
const cfg = (o = {}) => ({
  periodDuration: 10, overtimeDuration: 6, winningScore: 5, goalDelay: 1.4,
  arenaW: 20, arenaL: 33, goalWidth: 6.5, goalDepth: 3.5, wallH: 2, puckRadius: 0.45, ...o,
});
const play = (m) => { m.phase = 'play'; return m; };
const still = { x: 0, y: 0.15, z: 0, speed: 5 };
const tick = (m, sec, puck = still) => { const ev = []; for (let t = 0; t < sec - 1e-9; t += 0.01) ev.push(...H.stepMatch(m, 0.01, puck)); return ev; };

test('dimensions : le 1v1 garde le terrain réglé, 2v2 et 3v3 sont agrandis de 20 % par robot en plus', () => {
  assert.deepEqual(H.arenaFor(1, BASE), { width: 20, length: 33, scale: 1 });
  const a2 = H.arenaFor(2, BASE), a3 = H.arenaFor(3, BASE);
  assert.ok(Math.abs(a2.width - 24) < 1e-9 && Math.abs(a2.length - 39.6) < 1e-9);
  assert.ok(Math.abs(a3.width - 28) < 1e-9 && Math.abs(a3.length - 46.2) < 1e-9);
});

test('proportions : ratio longueur/largeur, but et robot cohérents avec la référence IIHF (but ≈ 3 robots)', () => {
  for (const n of [1, 2, 3]) {
    const a = H.arenaFor(n, BASE);
    assert.ok(a.length / a.width > 1.5 && a.length / a.width < 2.4, 'ratio proche de 60:30 à 60:26');
    assert.ok(6.5 / ROBOT.w > 2.5 && 6.5 / ROBOT.w < 3.1, 'but ≈ 3 largeurs de robot');
  }
  assert.ok(33 / 6.5 > 4, 'le terrain est bien plus long que le but est large');
});

test('départs : bon nombre de robots, chevauchement impossible, tout dans le terrain, équipes symétriques', () => {
  for (const n of [1, 2, 3]) {
    const a = H.arenaFor(n, BASE), poses = [];
    for (let k = 0; k < n; k++) for (const team of [0, 1]) poses.push({ team, ...H.startPose(team, k, n, a) });
    assert.equal(poses.length, 2 * n);
    for (const p of poses) {
      assert.ok(Math.abs(p.x) + ROBOT.w / 2 < a.width / 2, 'dans la largeur');
      assert.ok(Math.abs(p.z) + ROBOT.l / 2 < a.length / 2, 'dans la longueur');
      assert.ok(Math.abs(p.z) > ROBOT.l, 'hors de la zone de remise en jeu centrale');
    }
    for (let i = 0; i < poses.length; i++) for (let j = i + 1; j < poses.length; j++) {
      const dx = Math.abs(poses[i].x - poses[j].x), dz = Math.abs(poses[i].z - poses[j].z);
      assert.ok(dx >= ROBOT.w + 0.5 || dz >= ROBOT.l + 0.5, `robots ${i} et ${j} se chevauchent (n=${n})`);
    }
    const t0 = poses.filter((p) => p.team === 0), t1 = poses.filter((p) => p.team === 1);
    assert.equal(t0.length, n); assert.equal(t1.length, n);
    t0.forEach((p, k) => { assert.ok(Math.abs(p.x - t1[k].x) < 1e-9); assert.ok(Math.abs(p.z + t1[k].z) < 1e-9); });
    assert.ok(t0.every((p) => p.z > 0) && t1.every((p) => p.z < 0));
  }
});

test('1v1 : la position de départ reste celle d’origine (≈ z = 10)', () => {
  const p = H.startPose(0, 0, 1, H.arenaFor(1, BASE));
  assert.equal(p.x, 0); assert.ok(Math.abs(p.z - 9.9) < 1e-9); assert.equal(p.yaw, Math.PI);
});

test('hookDir : orientation des crochets', () => {
  const a = H.hookDir({ x: 0, y: 0, z: 0, w: 1 });
  assert.ok(Math.abs(a.fx) < 1e-9 && Math.abs(a.fz - 1) < 1e-9);
  const b = H.hookDir({ x: 0, y: 1, z: 0, w: 0 });            // rotation d'origine du robot (180°)
  assert.ok(Math.abs(b.fx) < 1e-9 && Math.abs(b.fz + 1) < 1e-9);
  assert.ok(H.upY({ x: 0, y: 0, z: 0, w: 1 }) > 0.99);
  assert.ok(H.upY({ x: 1, y: 0, z: 0, w: 0 }) < -0.99);       // renversé
});

test('but : le palet doit avoir franchi entièrement la ligne, entre les poteaux', () => {
  const c = cfg(), L2 = c.arenaL / 2, r = c.puckRadius;
  assert.equal(H.goalScorer({ x: 0, z: L2 + r + 0.01 }, c), 1, 'but défendu par l’équipe 0 (z positif) -> point équipe 1');
  assert.equal(H.goalScorer({ x: 0, z: -L2 - r - 0.01 }, c), 0);
  assert.equal(H.goalScorer({ x: 0, z: L2 + r - 0.05 }, c), -1, 'pas encore entièrement franchi');
  assert.equal(H.goalScorer({ x: 0, z: L2 }, c), -1, 'centre sur la ligne : pas de but');
  assert.equal(H.goalScorer({ x: c.goalWidth / 2 - r + 0.05, z: L2 + 2 }, c), -1, 'touche le poteau');
  assert.equal(H.goalScorer({ x: c.goalWidth / 2 - r - 0.05, z: L2 + 2 }, c), 1, 'juste dans l’ouverture');
  assert.equal(H.goalScorer({ x: 8, z: L2 + 2 }, c), -1, 'hors de l’ouverture');
});

test('palet sorti : filet de sécurité', () => {
  const c = cfg();
  assert.equal(H.puckOut({ x: 0, y: 0.2, z: 0 }, c), false);
  assert.equal(H.puckOut({ x: 0, y: 0.2, z: c.arenaL / 2 + c.goalDepth }, c), false, 'au fond du but');
  assert.equal(H.puckOut({ x: 15, y: 0.2, z: 0 }, c), true);
  assert.equal(H.puckOut({ x: 0, y: -5, z: 0 }, c), true);
});

test('match : compte à rebours 3 s puis jeu ; le chrono ne tourne qu’en temps effectif', () => {
  const m = H.createMatch(cfg());
  assert.equal(m.phase, 'countdown'); assert.equal(H.isLocked(m), true);
  const ev = tick(m, 3.05);
  assert.ok(ev.some((e) => e.type === 'release')); assert.equal(m.phase, 'play'); assert.equal(H.isLocked(m), false);
  assert.ok(Math.abs(m.clock - 10) < 0.1, 'le chrono n’a pas bougé pendant le compte à rebours');
  tick(m, 2); assert.ok(Math.abs(m.clock - 8) < 0.05);
});

test('match : but -> pause, repositionnement, compte à rebours, reprise ; le chrono est arrêté', () => {
  const m = play(H.createMatch(cfg())), goal = { x: 0, y: 0.15, z: 17.5, speed: 8 };
  const ev = H.stepMatch(m, 0.01, goal);
  assert.deepEqual(ev[0], { type: 'goal', team: 1 }); assert.deepEqual(m.score, [0, 1]); assert.equal(m.phase, 'goal');
  const clock = m.clock; const ev2 = tick(m, 1.5);
  assert.ok(ev2.some((e) => e.type === 'faceoff')); assert.equal(m.phase, 'countdown'); assert.equal(m.clock, clock, 'chrono figé');
  assert.ok(tick(m, 3.1).some((e) => e.type === 'release')); assert.equal(m.phase, 'play');
});

test('match : le score cible met fin au match immédiatement', () => {
  const m = play(H.createMatch(cfg({ winningScore: 2 }))); m.score = [0, 1];
  const ev = H.stepMatch(m, 0.01, { x: 0, y: 0, z: 17.5, speed: 5 });
  assert.equal(m.phase, 'ended'); assert.equal(m.winner, 1); assert.ok(ev.some((e) => e.type === 'end'));
});

test('match : 3 périodes avec pauses, victoire au score à la fin de la période 3', () => {
  const m = play(H.createMatch(cfg({ periodDuration: 5 }))); m.score = [1, 0];
  let periodEnds = 0;
  for (let i = 0; i < 4000 && m.phase !== 'ended'; i++) {
    for (const e of H.stepMatch(m, 0.01, still)) if (e.type === 'periodEnd') periodEnds++;
    if (m.phase === 'countdown' && m.t < 0.02) m.t = 0;   // accélère les remises en jeu
    if (m.stall > 5) m.stall = 0;                        // palet immobile ignoré dans ce test
  }
  assert.equal(periodEnds, 2); assert.equal(m.phase, 'ended'); assert.equal(m.winner, 0); assert.equal(m.period, 3);
});

test('match : égalité -> prolongation en but en or, puis nul si personne ne marque', () => {
  const m = play(H.createMatch(cfg({ periodDuration: 5, overtimeDuration: 4 })));
  m.period = 3; m.clock = 0.02;                          // fin de la 3e période, 0-0
  let ev = H.stepMatch(m, 0.05, still);
  assert.ok(ev.some((e) => e.type === 'periodEnd')); assert.equal(m.overtime, true); assert.equal(m.clock, 4);
  assert.equal(m.phase, 'intermission'); tick(m, 4.1); assert.equal(m.phase, 'countdown'); tick(m, 3.1); assert.equal(m.phase, 'play');
  m.stall = 0; ev = H.stepMatch(m, 4.01, { ...still, speed: 5 });
  assert.equal(m.phase, 'ended'); assert.equal(m.winner, -1);
  const m2 = play(H.createMatch(cfg())); m2.overtime = true; m2.period = 4; m2.clock = 3;
  H.stepMatch(m2, 0.01, { x: 0, y: 0, z: -17.5, speed: 5 });
  assert.equal(m2.phase, 'ended'); assert.equal(m2.winner, 0, 'but en or');
});

test('match : palet immobile 6 s ou sorti du jeu -> remise en jeu sans point', () => {
  const m = play(H.createMatch(cfg())); const slow = { x: 3, y: 0.15, z: 3, speed: 0.1 };
  const ev = tick(m, 6.1, slow);
  assert.ok(ev.some((e) => e.type === 'stall')); assert.equal(m.phase, 'countdown'); assert.deepEqual(m.score, [0, 0]);
  const m2 = play(H.createMatch(cfg()));
  const ev2 = H.stepMatch(m2, 0.01, { x: 30, y: 0.2, z: 0, speed: 5 });
  assert.ok(ev2.some((e) => e.type === 'out')); assert.equal(m2.phase, 'countdown');
});

test('IA : sens de rotation et de marche cohérents avec la conduite du jeu', () => {
  const arena = H.arenaFor(1, BASE);
  // robot en (0,0), crochets vers +z ; palet à +x : il faut un yaw positif (+z vers +x) -> t < 0
  const right = H.aiCommand({ self: { x: 0, z: 0, fx: 0, fz: 1 }, team: 1, slot: 0, n: 1, role: 'chase', puck: { x: 8, z: 2 }, arena });
  assert.ok(right.t < 0, 'tourne vers +x'); assert.ok(right.f <= 0, 'f négatif = crochets en avant');
  const left = H.aiCommand({ self: { x: 0, z: 0, fx: 0, fz: 1 }, team: 1, slot: 0, n: 1, role: 'chase', puck: { x: -8, z: 2 }, arena });
  assert.ok(left.t > 0, 'tourne vers -x');
  const ahead = H.aiCommand({ self: { x: 0, z: -9, fx: 0, fz: 1 }, team: 1, slot: 0, n: 1, role: 'chase', puck: { x: 0, z: 0 }, arena });
  assert.ok(ahead.f < -0.9 && Math.abs(ahead.t) < 0.05, 'palet dans l’axe : fonce droit');
  const behind = H.aiCommand({ self: { x: 0, z: 0, fx: 0, fz: 1 }, team: 1, slot: 0, n: 1, role: 'chase', puck: { x: 0, z: -9 }, arena });
  assert.ok(behind.f === 0 && Math.abs(behind.t) > 0.5, 'palet derrière : pivote d’abord');
  const guard = H.aiCommand({ self: { x: 0, z: -arena.length * 0.32, fx: 0, fz: 1 }, team: 1, slot: 0, n: 1, role: 'guard', puck: { x: 0, z: 5 }, arena });
  assert.deepEqual(guard, { f: 0, t: 0 }, 'défenseur déjà en place : immobile');
});
