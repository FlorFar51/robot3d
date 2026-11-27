// Lancer : node --test hockey.test.js   (Node 20 ou plus, aucune dépendance)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from './hockey.js';

const BASE = { fieldWidth: 20, fieldLength: 33 };       // terrain 1v1 d'origine
const ROBOT = { w: 2.3, l: 1.9 + 1.55 };                // largeur du châssis ; longueur châssis + crochets
const cfg = (o = {}) => ({
  periodDuration: 10, winningScore: 0, goalDelay: 1.4,
  arenaW: 20, arenaL: 33, goalWidth: 6.5, goalDepth: 3.5, wallH: 2, puckRadius: 0.45, resetPuck: true, ...o,
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

test('match : le score cible met fin au match immédiatement', () => {
  const m = play(H.createMatch(cfg({ winningScore: 2 }))); m.score = [0, 1];
  const ev = H.stepMatch(m, 0.01, { x: 0, y: 0, z: 17.5, speed: 5 });
  assert.equal(m.phase, 'ended'); assert.equal(m.winner, 1); assert.ok(ev.some((e) => e.type === 'end'));
});

test('match : un seul temps sans périodes ni pauses, victoire au score à la fin', () => {
  const m = play(H.createMatch(cfg({ periodDuration: 5 }))); m.score = [1, 0];
  const seen = new Set();
  for (let i = 0; i < 800 && m.phase !== 'ended'; i++) {
    for (const e of H.stepMatch(m, 0.01, still)) seen.add(e.type);
    seen.add('phase:' + m.phase);
    if (m.stall > 5) m.stall = 0;                        // palet immobile ignoré dans ce test
  }
  assert.equal(m.phase, 'ended'); assert.equal(m.winner, 0); assert.equal(m.period, 1);
  assert.ok(!seen.has('phase:intermission') && !seen.has('overtime'), 'aucune pause ni prolongation quand il y a un vainqueur');
  assert.equal(H.RULES.periods, 1);
});

test('match : sans score cible, 9 buts d’écart ne terminent pas le match avant la fin du temps', () => {
  const m = play(H.createMatch(cfg())); m.score = [0, 9];
  H.stepMatch(m, 0.01, { x: 0, y: 0, z: 17.5, speed: 5 });
  assert.equal(m.score[1], 10); assert.equal(m.phase, 'goal', 'le match continue');
});

test('match : égalité -> mort subite sans limite de temps, le premier but gagne ; jamais de nul', () => {
  const m = play(H.createMatch(cfg({ periodDuration: 5 })));
  m.clock = 0.02;                                        // fin du temps réglementaire, 0-0
  let ev = H.stepMatch(m, 0.05, still);
  assert.ok(ev.some((e) => e.type === 'overtime')); assert.equal(m.overtime, true); assert.equal(m.clock, 0);
  assert.equal(m.phase, 'intermission'); tick(m, 4.1); assert.equal(m.phase, 'countdown'); tick(m, 3.1); assert.equal(m.phase, 'play');
  for (let i = 0; i < 600; i++) { m.stall = 0; H.stepMatch(m, 1, still); }      // 10 minutes sans but
  assert.equal(m.phase, 'play', 'pas de limite de temps'); assert.ok(m.clock > 590, 'le chrono compte le temps écoulé');
  H.stepMatch(m, 0.01, { x: 0, y: 0, z: -17.5, speed: 5 });
  assert.equal(m.phase, 'ended'); assert.equal(m.winner, 0, 'but en or');
  const m2 = play(H.createMatch(cfg())); m2.overtime = true; m2.period = 2;
  H.stepMatch(m2, 0.01, { x: 0, y: 0, z: 17.5, speed: 5 });
  assert.equal(m2.phase, 'ended'); assert.equal(m2.winner, 1);
});

test('IA : sens de rotation et de marche cohérents avec la conduite du jeu', () => {
  const arena = H.arenaFor(1, BASE);
  // robot en (0,0), crochets vers +z ; palet à +x : il faut un yaw positif (+z vers +x) -> t < 0
  const right = H.aiCommand({ self: { x: 0, z: 0, fx: 0, fz: 1 }, team: 1, slot: 0, n: 1, role: 'chase', puck: { x: 8, z: 2 }, arena });
  assert.ok(right.t < 0, 'tourne vers +x'); assert.ok(right.f <= 0, 'f négatif = crochets en avant');
  const left = H.aiCommand({ self: { x: 0, z: 0, fx: 0, fz: 1 }, team: 1, slot: 0, n: 1, role: 'chase', puck: { x: -8, z: 2 }, arena });
  assert.ok(left.t > 0, 'tourne vers -x');
  const ahead = H.aiCommand({ self: { x: 0, z: -9, fx: 0, fz: 1 }, team: 1, slot: 0, n: 1, role: 'chase', puck: { x: 0, z: 0 }, arena });
  assert.ok(ahead.f < -0.55 && Math.abs(ahead.t) < 0.05, 'palet dans l’axe : fonce droit');
  const behind = H.aiCommand({ self: { x: 0, z: 0, fx: 0, fz: 1 }, team: 1, slot: 0, n: 1, role: 'chase', puck: { x: 0, z: -9 }, arena });
  assert.ok(behind.f === 0 && Math.abs(behind.t) > 0.5, 'palet derrière : pivote d’abord');
  const guard = H.aiCommand({ self: { x: 0, z: -arena.length * 0.32, fx: 0, fz: 1 }, team: 1, slot: 0, n: 1, role: 'guard', puck: { x: 0, z: 5 }, arena });
  assert.deepEqual(guard, { f: 0, t: 0 }, 'défenseur déjà en place : immobile');
});

const inGoal = { x: 0, y: 0.15, z: 17.5, speed: 0 };    // palet au fond du but défendu par l'équipe 0
const onIce = { x: 0, y: 0.15, z: 10, speed: 5 };

test('phases : seuls le départ, les pauses et la fin verrouillent les commandes', () => {
  for (const [phase, locked] of [['countdown', true], ['intermission', true], ['ended', true], ['play', false], ['goal', false], ['reset', false]])
    assert.equal(H.isLocked({ phase }), locked, phase);
});

test('but, palet remis au centre : les robots restent libres, aucun repositionnement, chrono arrêté, puis lâcher', () => {
  const m = play(H.createMatch(cfg({ resetPuck: true })));
  let ev = H.stepMatch(m, 0.01, inGoal);
  assert.deepEqual(ev[0], { type: 'goal', team: 1 }); assert.ok(ev.some((e) => e.type === 'puckReturn'));
  assert.deepEqual(m.score, [0, 1]); assert.equal(m.phase, 'goal'); assert.equal(H.isLocked(m), false);
  const clock = m.clock, during = tick(m, 1.3, inGoal);        // pendant le retour, le palet est encore au fond du but
  assert.deepEqual(m.score, [0, 1], 'pas de second but pendant le retour'); assert.equal(m.phase, 'goal');
  assert.equal(m.clock, clock, 'chrono figé pendant le retour du palet');
  const all = [...during, ...tick(m, 0.2, onIce)];            // puis il est au centre et lâché
  assert.ok(all.some((e) => e.type === 'release')); assert.ok(!all.some((e) => e.type === 'faceoff'), 'jamais de repositionnement des robots après un but');
  assert.equal(m.phase, 'play'); assert.deepEqual(m.score, [0, 1]);
});

test('but, palet laissé en place : le jeu continue sans interruption, chrono en marche, pas de double but', () => {
  const m = play(H.createMatch(cfg({ resetPuck: false })));
  const ev = H.stepMatch(m, 0.01, inGoal);
  assert.deepEqual(ev[0], { type: 'goal', team: 1 }); assert.ok(!ev.some((e) => e.type === 'puckReturn'));
  assert.equal(m.phase, 'play'); assert.equal(H.isLocked(m), false);
  const clock = m.clock, more = tick(m, 8, inGoal);          // le palet reste au fond du but
  assert.deepEqual(m.score, [0, 1], 'un palet qui reste dans le but ne marque qu’une fois');
  assert.ok(!more.some((e) => ['stall', 'out', 'puckReturn', 'faceoff'].includes(e.type)), 'palet immobile dans le but : pas de remise en jeu');
  assert.ok(Math.abs(m.clock - (clock - 8)) < 0.05, 'chrono en marche');
  tick(m, 0.1, onIce);                                        // le palet ressort : le but est de nouveau actif
  H.stepMatch(m, 0.01, inGoal); assert.deepEqual(m.score, [0, 2]);
});

test('but et score cible / prolongation : même résultat avec ou sans remise du palet', () => {
  for (const resetPuck of [true, false]) {
    const m = play(H.createMatch(cfg({ resetPuck, winningScore: 2 }))); m.score = [0, 1];
    H.stepMatch(m, 0.01, inGoal); assert.equal(m.phase, 'ended'); assert.equal(m.winner, 1);
    const o = play(H.createMatch(cfg({ resetPuck }))); o.overtime = true; o.period = 2; o.clock = 3;
    H.stepMatch(o, 0.01, { x: 0, y: 0, z: -17.5, speed: 5 }); assert.equal(o.phase, 'ended'); assert.equal(o.winner, 0);
  }
});

test('palet immobile 6 s ou sorti du jeu : le palet revient au centre, les robots restent libres et en place', () => {
  const m = play(H.createMatch(cfg())), slow = { x: 3, y: 0.15, z: 3, speed: 0.1 };
  const ev = tick(m, 6.1, slow);
  assert.ok(ev.some((e) => e.type === 'stall') && ev.some((e) => e.type === 'puckReturn'));
  assert.ok(!ev.some((e) => e.type === 'faceoff')); assert.equal(m.phase, 'reset'); assert.equal(H.isLocked(m), false);
  assert.deepEqual(m.score, [0, 0]);
  assert.ok(tick(m, 1.5, slow).some((e) => e.type === 'release')); assert.equal(m.phase, 'play');
  const m2 = play(H.createMatch(cfg()));
  const ev2 = H.stepMatch(m2, 0.01, { x: 30, y: 0.2, z: 0, speed: 5 });
  assert.ok(ev2.some((e) => e.type === 'out') && ev2.some((e) => e.type === 'puckReturn')); assert.equal(m2.phase, 'reset');
});

test('départ de match et de mort subite : commandes verrouillées et robots replacés (faceoff)', () => {
  const m = H.createMatch(cfg({ periodDuration: 5 })); assert.equal(H.isLocked(m), true);
  const m2 = play(H.createMatch(cfg({ periodDuration: 5 })));   // 0-0 à la fin du temps
  const ev = tick(m2, 5.1, onIce);
  assert.ok(ev.some((e) => e.type === 'overtime')); assert.equal(m2.phase, 'intermission'); assert.equal(H.isLocked(m2), true);
  const ev2 = tick(m2, 4.1, onIce);
  assert.ok(ev2.some((e) => e.type === 'faceoff')); assert.equal(m2.phase, 'countdown'); assert.equal(H.isLocked(m2), true);
});

test('bandeau BUT : visible un court instant, avec ou sans remise du palet', () => {
  for (const resetPuck of [true, false]) {
    const m = play(H.createMatch(cfg({ resetPuck })));
    H.stepMatch(m, 0.01, inGoal); assert.ok(m.flash > 1); assert.equal(m.lastScorer, 1);
    tick(m, 2.5, onIce); assert.equal(m.flash, 0);
  }
});

test('difficulté IA : de 1 à 10, plus rapide, plus réactive et plus précise (vitesse plafonnée à 0,6)', () => {
  const p = (l) => H.aiProfile(l);
  for (let l = 1; l < 10; l++) {
    assert.ok(p(l + 1).throttle > p(l).throttle, `vitesse croissante ${l}->${l + 1}`);
    assert.ok(p(l + 1).delay < p(l).delay, `réaction plus rapide ${l}->${l + 1}`);
    assert.ok(p(l + 1).noise < p(l).noise, `visée plus précise ${l}->${l + 1}`);
  }
  assert.ok(Math.abs(p(10).throttle - 0.6) < 1e-9 && p(10).delay === 0 && p(10).noise === 0 && p(10).smart === true);
  assert.ok(p(1).smart === false && p(5).smart === false && p(6).smart === true && Math.abs(p(1).throttle - 0.3) < 1e-9);
  assert.deepEqual(p(0), p(1)); assert.deepEqual(p(11), p(10)); assert.deepEqual(p(5.4), p(5)); assert.deepEqual(p(NaN), p(5));
});

test('difficulté IA : plafond de vitesse et erreur de visée', () => {
  const arena = H.arenaFor(1, BASE), self = { x: 0, z: -9, fx: 0, fz: 1 }, puck = { x: 0, z: 0 };
  const run = (level, extra = {}) => H.aiCommand({ self, team: 1, slot: 0, n: 1, role: 'chase', puck, arena, profile: H.aiProfile(level), ...extra });
  assert.ok(Math.abs(run(1).f) <= H.aiProfile(1).throttle + 1e-9, 'niveau 1 : vitesse plafonnée');
  assert.ok(Math.abs(run(10).f) > 0.55 && Math.abs(run(10).f) <= 0.6 + 1e-9, 'niveau 10 : 0,6 au maximum');
  assert.ok(Math.abs(run(10).t) < 0.05 && Math.abs(run(10, { aimNoise: 0.5 }).t) > 0.3, 'une erreur de visée fait dévier la rotation');
  const aside = { x: 3, z: 8 }, c = (profile) => H.aiCommand({ self: { x: 0, z: 0, fx: 0, fz: 1 }, team: 1, slot: 0, n: 1, role: 'chase', puck: aside, arena, profile });
  assert.notDeepEqual(c(H.aiProfile(10)), c({ ...H.aiProfile(10), smart: false }), 'à vitesse égale, « smart » se place derrière le palet au lieu de foncer droit');
});

// ---- Hockey Micro (règlement Robocore 15/01/2024) ----
const MICRO = { fieldWidth: 1.65, fieldLength: 3.3, fieldGrow: 0 };
const microSettings = { mass: 0.454, baseWidth: 0.18, baseLength: 0.13, hookLength: 0.07, hockeyPuckDiameter: 0.0317, scoopRadius: 0.0185, scoopDepth: 0.0158 };

test('Micro : le ring ne grandit pas avec le format (un seul ring dans le règlement)', () => {
  for (const n of [1, 2, 3]) assert.deepEqual(H.arenaFor(n, MICRO), { width: 1.65, length: 3.3, scale: 1 });
});

test('Micro : palet sorti et palet immobile suivent l\'échelle (unit)', () => {
  const c = { arenaW: 1.65, arenaL: 3.3, goalDepth: 0.18, wallH: 0.18, unit: 0.1 };
  assert.equal(H.puckOut({ x: 0, y: 0.01, z: 3.3 / 2 + 0.18 }, c), false, 'au fond du but');
  assert.equal(H.puckOut({ x: 1.0, y: 0.01, z: 0 }, c), true, '1,0 m > demi-largeur 0,825 + marge 0,1 m');
  const m = H.createMatch({ ...cfg({ arenaW: 1.65, arenaL: 3.3, goalWidth: 0.52, goalDepth: 0.18, wallH: 0.18, puckRadius: 0.016, unit: 0.1 }) });
  m.phase = 'play';
  const ev = []; for (let t = 0; t < 6.2; t += 0.01) ev.push(...H.stepMatch(m, 0.01, { x: 0, y: 0.01, z: 0, speed: 0.03 }));
  assert.ok(ev.some(e => e.type === 'stall'), '0,03 m/s < 0,04 m/s : palet immobile -> remise en jeu');
});

test('nez arrondi : creux limité à la moitié du palet et ouverture >= 40 mm (§2.8.5, 2.8.6)', () => {
  const base = { baseWidth: 0.18, noseLength: 0.07, puckDiameter: 0.0317 };
  const deep = H.scoopShape({ ...base, radius: 0.02, depth: 0.05 });
  assert.ok(deep.depth <= 0.0317 / 2 + 1e-12, 'profondeur ramenée au rayon du palet');
  const narrow = H.scoopShape({ ...base, radius: 0.017, depth: 0.0158 });
  assert.ok(narrow.opening >= 0.04 - 1e-9, 'rayon agrandi pour garder 40 mm');
  assert.ok(narrow.radius >= 0.0317 / 2, 'le palet tient dans le creux');
  const huge = H.scoopShape({ ...base, radius: 0.3, depth: 0.0158 });
  assert.ok(huge.opening <= 0.18 - 0.02 + 1e-9, 'ouverture limitée à la largeur du robot moins les parois');
});

test('nez arrondi : polygones convexes, creux symétrique, rien devant la pointe', () => {
  const sh = H.scoopShape({ baseWidth: 0.18, noseLength: 0.07, puckDiameter: 0.0317, radius: 0.0185, depth: 0.0158 });
  const parts = H.noseParts(sh, 10);
  assert.equal(parts.length, 12);
  for (const poly of parts) for (const [x, z] of poly) assert.ok(z >= -1e-12 && z <= 0.07 + 1e-12 && Math.abs(x) <= 0.09 + 1e-12);
  const area = poly => Math.abs(poly.reduce((a, [x, z], i) => { const [x2, z2] = poly[(i + 1) % poly.length]; return a + x * z2 - x2 * z; }, 0)) / 2;
  const total = parts.reduce((a, p) => a + area(p), 0), full = 0.18 * 0.07;
  assert.ok(total < full && total > full * 0.8, 'le creux retire de la matière, mais pas tout');
  const left = parts.slice(2, 7).reduce((a, p) => a + area(p), 0), right = parts.slice(7).reduce((a, p) => a + area(p), 0);
  assert.ok(Math.abs(left - right) < 1e-9, 'symétrique');
});

test('Micro : contrôle de conformité', () => {
  assert.deepEqual(H.microCheck(microSettings), []);
  assert.ok(H.microCheck({ ...microSettings, mass: 0.6 }).includes('masse > 454 g'));
  assert.ok(H.microCheck({ ...microSettings, hookLength: 0.1 }).includes('longueur > 20 cm'));
  assert.ok(H.microCheck({ ...microSettings, baseWidth: 0.25 }).includes('largeur > 20 cm'));
  assert.ok(H.microCheck({ ...microSettings, scoopDepth: 0.03 }).includes('creux plus profond que la moitié du palet'));
});

test('IA à l\'échelle Micro : mêmes décisions que sur l\'ancien terrain, distances ×0,1', () => {
  const big = H.aiCommand({ self: { x: 0, z: -9, fx: 0, fz: 1 }, team: 0, slot: 0, n: 1, role: 'chase', puck: { x: 0, z: 0 }, arena: H.arenaFor(1, BASE) });
  const small = H.aiCommand({ self: { x: 0, z: -0.9, fx: 0, fz: 1 }, team: 0, slot: 0, n: 1, role: 'chase', puck: { x: 0, z: 0 }, arena: { ...H.arenaFor(1, { fieldWidth: 2, fieldLength: 3.3 }), unit: 0.1 } });
  assert.equal(Math.sign(big.f), Math.sign(small.f)); assert.equal(Math.sign(big.t), Math.sign(small.t));
});

test('nez arrondi : le contour d\'affichage a la même surface que les polygones de collision', () => {
  const sh = H.scoopShape({ baseWidth: 0.18, noseLength: 0.07, puckDiameter: 0.0317, radius: 0.0185, depth: 0.0158 });
  const area = poly => Math.abs(poly.reduce((a, [x, z], i) => { const [x2, z2] = poly[(i + 1) % poly.length]; return a + x * z2 - x2 * z; }, 0)) / 2;
  const a = area(H.noseOutline(sh, 10)), b = H.noseParts(sh, 10).reduce((t, p) => t + area(p), 0);
  assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
});

test('IA : le point d\'approche reste dans le ring et on attaque le palet collé au mur', () => {
  const arena = { width: 1.65, length: 3.3, unit: 0.1 };
  const c = H.aiCommand({ self: { x: 0.72, z: 0.75, fx: 0, fz: 1 }, team: 1, slot: 0, n: 1, role: 'chase', puck: { x: 0.8, z: 0.89 }, arena, profile: H.aiProfile(10) });
  assert.ok(c.f < 0 && Math.abs(c.t) < 1, 'déjà au point d\'approche : va sur le palet au lieu de tourner sur place');
});

test('IA : ralentit près du palet pour le conduire', () => {
  const arena = { width: 1.65, length: 3.3, unit: 0.1 }, mk = z => H.aiCommand({ self: { x: 0, z, fx: 0, fz: 1 }, team: 1, slot: 0, n: 1, role: 'chase', puck: { x: 0, z: 0 }, arena, profile: H.aiProfile(10) });
  assert.ok(Math.abs(mk(-0.2).f) < Math.abs(mk(-1.0).f), 'plus lent à 20 cm qu\'à 1 m');
});
