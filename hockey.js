// Règles du mode Hockey : logique pure (aucune dépendance à Three ni à Rapier).
// Testée par hockey.test.js (node --test). Repère : x = largeur, z = longueur, y = haut.
// Équipe 0 (bleue) défend le but z = +L/2 et attaque z = -L/2 ; équipe 1 (rouge) l'inverse.
// Les crochets du robot sont à l'avant du châssis (axe +z local) : « avancer » = crochets devant.

export const RULES = {
  countdown: 3,      // s : compte à rebours avant chaque remise en jeu (valeur d'origine : 3 s)
  intermission: 4,   // s : pause entre périodes
  stallSpeed: 0.4,   // m/s : en dessous, le palet est considéré immobile
  stallTime: 6,      // s : palet immobile -> remise en jeu au centre
  holdHeight: 4.5,   // m : hauteur où le palet attend la remise en jeu (valeur d'origine)
  periods: 3,
  goalBanner: 2,     // s : durée d'affichage du bandeau « BUT »
  flipTime: 3,       // s : un robot renversé aussi longtemps est replacé à sa position de départ
};

// Mise à l'échelle du terrain par format. Le réglage fieldWidth × fieldLength du 1v1 est la référence
// (c'est le terrain déjà réglé par l'utilisateur) ; chaque robot supplémentaire par équipe ajoute 20 %.
export function fieldScale(n) { return 1 + 0.2 * (n - 1); }
export function arenaFor(n, { fieldWidth, fieldLength, fieldGrow }) {
  const scale = fieldGrow === 0 ? 1 : fieldScale(n);   // fieldGrow = 0 : ring unique du règlement Micro, quel que soit le format
  return { width: fieldWidth * scale, length: fieldLength * scale, scale };
}

// Position de départ du robot `slot` (0..n-1) de l'équipe `team`. yaw = π : crochets vers -z.
export function startPose(team, slot, n, arena) {
  const side = team === 0 ? 1 : -1;
  const spacing = arena.width / (n + 1);
  return { x: (slot - (n - 1) / 2) * spacing, z: side * arena.length * 0.3, yaw: team === 0 ? Math.PI : 0 };
}

// Composante verticale de l'axe « haut » du robot (1 = à l'endroit, < 0.35 = renversé).
export function upY(q) { return 1 - 2 * (q.x * q.x + q.z * q.z); }

// Direction horizontale des crochets (axe +z local) à partir du quaternion {x,y,z,w}.
export function hookDir(q) {
  const fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  const l = Math.hypot(fx, fz) || 1;
  return { fx: fx / l, fz: fz / l };
}

// But : le palet doit avoir franchi entièrement la ligne (centre au-delà de ligne + rayon),
// entre les poteaux (palet entièrement dans l'ouverture). Renvoie l'équipe qui marque, ou -1.
export function goalScorer(p, c) {
  const r = c.puckRadius;
  if (Math.abs(p.x) + r >= c.goalWidth / 2) return -1;
  if (p.z > c.arenaL / 2 + r) return 1;
  if (p.z < -c.arenaL / 2 - r) return 0;
  return -1;
}

// Palet sorti du jeu (hors du terrain et des buts) : sert de filet de sécurité.
export function puckOut(p, c) {
  const u = c.unit || 1;
  return Math.abs(p.x) > c.arenaW / 2 + u || Math.abs(p.z) > c.arenaL / 2 + c.goalDepth + u
    || p.y < -2 * u || p.y > c.wallH + 8 * u;
}

export function createMatch(cfg) {
  return {
    cfg, phase: 'countdown', t: RULES.countdown, period: 1, clock: cfg.periodDuration,
    score: [0, 0], overtime: false, winner: null, stall: 0, pendingPeriod: 0, lastScorer: -1, armed: true, flash: 0,
  };
}

// Seuls le départ, les pauses entre périodes et la fin verrouillent les commandes : jamais après un but.
export function isLocked(m) { return m.phase === 'countdown' || m.phase === 'intermission' || m.phase === 'ended'; }

// Palet ramené au centre (phase 'goal' après un but, 'reset' sinon) : les robots restent libres.
function puckReturn(m, ev, phase) { m.phase = phase; m.t = m.cfg.goalDelay; m.stall = 0; ev.push({ type: 'puckReturn' }); }
function faceoff(m, ev) { m.phase = 'countdown'; m.t = RULES.countdown; m.stall = 0; ev.push({ type: 'faceoff' }); }
function finish(m, ev, winner) { m.phase = 'ended'; m.winner = winner; ev.push({ type: 'end', winner }); }

// Fait avancer le match de dt secondes de temps de jeu. Renvoie la liste des événements :
// goal{team}, out, stall, puckReturn, periodEnd, faceoff (départ de match/période), release, end{winner}.
// cfg.resetPuck : true = le palet revient au centre après un but ; false = il reste en place et le jeu continue.
export function stepMatch(m, dt, puck) {
  const ev = [], c = m.cfg;
  m.flash = Math.max(0, m.flash - dt);
  if (m.phase === 'play') {
    m.clock = Math.max(0, m.clock - dt);
    if (!m.armed && Math.abs(puck.z) < c.arenaL / 2 - c.puckRadius) m.armed = true;   // le palet est ressorti du but
    const team = m.armed ? goalScorer(puck, c) : -1;
    if (team >= 0) {
      m.score[team]++; m.lastScorer = team; m.flash = RULES.goalBanner; ev.push({ type: 'goal', team });
      if (m.overtime || m.score[team] >= c.winningScore) { finish(m, ev, team); return ev; }
      if (c.resetPuck) puckReturn(m, ev, 'goal'); else m.armed = false;   // sans remise : un palet resté dans le but ne marque qu'une fois
      return ev;
    }
    if (puckOut(puck, c)) { ev.push({ type: 'out' }); puckReturn(m, ev, 'reset'); return ev; }
    m.stall = Math.abs(puck.z) <= c.arenaL / 2 && puck.speed < RULES.stallSpeed * (c.unit || 1) ? m.stall + dt : 0;   // pas de « palet bloqué » au fond d'un but
    if (m.stall >= RULES.stallTime) { ev.push({ type: 'stall' }); puckReturn(m, ev, 'reset'); return ev; }
    if (m.clock <= 0) {
      if (m.overtime) { finish(m, ev, -1); return ev; }
      if (m.period < RULES.periods) {
        ev.push({ type: 'periodEnd', period: m.period });
        m.phase = 'intermission'; m.t = RULES.intermission; m.pendingPeriod = m.period + 1;
      } else if (m.score[0] !== m.score[1]) {
        finish(m, ev, m.score[0] > m.score[1] ? 0 : 1);
      } else {
        ev.push({ type: 'periodEnd', period: m.period });
        m.overtime = true; m.period = RULES.periods + 1; m.clock = c.overtimeDuration;
        m.phase = 'intermission'; m.t = RULES.intermission;
      }
    }
  } else if (m.phase === 'goal' || m.phase === 'reset') {
    m.t -= dt; if (m.t <= 0) { m.phase = 'play'; m.armed = true; ev.push({ type: 'release' }); }
  } else if (m.phase === 'intermission') {
    m.t -= dt;
    if (m.t <= 0) {
      if (m.pendingPeriod) { m.period = m.pendingPeriod; m.clock = c.periodDuration; m.pendingPeriod = 0; }
      faceoff(m, ev);
    }
  } else if (m.phase === 'countdown') {
    m.t -= dt; if (m.t <= 0) { m.phase = 'play'; ev.push({ type: 'release' }); }
  }
  return ev;
}

// Difficulté de l'IA, de 1 (débutant) à 10 (expert) : vitesse maximale, délai de réaction (s), erreur de visée (rad)
// et approche « derrière le palet » (smart) à partir du niveau 6. Réglé par mesures (voir PROJECT_CONTEXT.md) : le gain de
// vitesse est régulier de 0,3 à 0,6, puis la poussée sature et le contrôle du palet se dégrade ; l'anticipation du palet
// faisait perdre ; l'approche derrière le palet compte en 2v2/3v3.
export function aiProfile(level) {
  const l = Math.min(10, Math.max(1, Math.round(Number.isFinite(level) ? level : 5))), t = (l - 1) / 9;
  return { throttle: 0.3 + 0.3 * t, delay: 0.3 * (1 - t), noise: 0.35 * (1 - t), smart: l >= 6 };
}

// IA minimale : le robot le plus proche du palet l'attaque (il se place derrière le palet, sur l'axe
// palet -> but adverse, puis fonce), les autres défendent entre le palet et leur but.
// Renvoie {f,t} dans la convention du jeu : f < 0 = rouler crochets en avant ; t > 0 = tourner à droite
// (yaw négatif). self = {x,z,fx,fz} (fx,fz = direction des crochets).
const NEAR_PUCK_SLOW = 0.8;
export function aiCommand({ self, team, slot, n, role, puck, arena, profile = aiProfile(10), aimNoise = 0 }) {
  const attack = team === 0 ? -1 : 1, own = -attack, u = arena.unit || 1;   // u : échelle des distances (1 = ancien terrain)
  let tx, tz;
  if (role === 'chase') {
    const px = puck.x, pz = puck.z;
    const gz = attack * arena.length / 2;
    let dx = -px, dz = gz - pz; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const rx = px - self.x, rz = pz - self.z;
    const along = rx * dx + rz * dz, lateral = Math.abs(rx * dz - rz * dx);
    if (!profile.smart) { tx = px; tz = pz; }                                  // débutant : fonce droit sur le palet
    else if (along > 0.5 * u && lateral < 1.4 * u) { tx = px + dx * 2 * u; tz = pz + dz * 2 * u; }
    else {
      // point d'approche derrière le palet, ramené dans le ring ; si on y est déjà (palet collé à un mur), on attaque le palet
      const sx = Math.max(-arena.width / 2 + u, Math.min(arena.width / 2 - u, px - dx * 2.2 * u));
      const sz = Math.max(-arena.length / 2 + u, Math.min(arena.length / 2 - u, pz - dz * 2.2 * u));
      if (Math.hypot(sx - self.x, sz - self.z) < 0.8 * u) { tx = px; tz = pz; } else { tx = sx; tz = sz; }
    }
  } else {
    const lim = arena.width / 2 - 2 * u;
    tx = Math.max(-lim, Math.min(lim, puck.x * 0.5 + (slot - (n - 1) / 2) * 4 * u));
    tz = own * arena.length * 0.32;
  }
  tx = Math.max(-arena.width / 2 + u, Math.min(arena.width / 2 - u, tx));
  tz = Math.max(-arena.length / 2 + u, Math.min(arena.length / 2 - u, tz));
  const dx = tx - self.x, dz = tz - self.z, dist = Math.hypot(dx, dz);
  if (role !== 'chase' && dist < 2 * u) return { f: 0, t: 0 };
  // angle signé (yaw positif = de +z vers +x) entre les crochets et la cible
  const ang = Math.atan2(self.fz * dx - self.fx * dz, self.fx * dx + self.fz * dz) + aimNoise;
  // correcteur proportionnel + amortissement sur la vitesse de rotation (self.w) : sans lui le robot dépasse sa cible et tourne en rond
  const t = Math.max(-1, Math.min(1, -1.0 * ang + 0.5 * (self.w || 0)));
  // près du palet on ralentit : à pleine vitesse le nez le renvoie au lieu de le conduire
  const near = role === 'chase' && Math.hypot(puck.x - self.x, puck.z - self.z) < 3 * u ? NEAR_PUCK_SLOW : 1;
  const f = -(Math.abs(ang) > 1.2 ? 0 : (1 - Math.abs(ang) / 1.2) * (role === 'chase' ? 1 : 0.8)) * profile.throttle * near;
  return { f, t };
}

// Nez arrondi du robot (règlement Robocore 15/01/2024, §2.8.5 et 2.8.6). Repère local au nez : x = largeur,
// z = avant (0 = face avant du châssis, noseLength = pointe). Le creux est un arc de cercle (rayon `radius`) dont le
// fond est à `depth` de la pointe. Règles : le palet ne peut pas être retenu au-delà de la moitié de son diamètre
// (depth <= rayon du palet) ; ouverture à la pointe >= minOpening (40 mm en Micro, 80 mm en Pro/Mini).
export function scoopShape({ baseWidth, noseLength, puckDiameter, radius, depth, minOpening = 0.04 }) {
  const rp = puckDiameter / 2;
  let d = Math.max(0.001, Math.min(depth, rp, noseLength - 0.005));            // §2.8.5 + 5 mm de fond plein
  let r = Math.max(radius, rp);                                                  // le palet doit tenir dans le creux
  const need = (minOpening * minOpening / 4 + d * d) / (2 * d);                  // rayon donnant exactement l'ouverture minimale
  r = Math.max(r, need);
  const cap = (baseWidth - 0.02) / 2;                                            // 1 cm de paroi de chaque côté
  if (Math.sqrt(r * r - (r - d) * (r - d)) > cap) r = (cap * cap + d * d) / (2 * d);
  const half = Math.sqrt(Math.max(0, r * r - (r - d) * (r - d))), zc = noseLength - d + r;
  return { radius: r, depth: d, opening: 2 * half, half, zc, noseLength, baseWidth,
           clamped: r !== radius || d !== depth };
}

// Polygones convexes (x,z) du nez : un pour chaque côté plein, `steps` tranches dans le creux. Source unique pour
// l'affichage ET les collisions ; un robot importé fournira ses propres polygones convexes ici.
export function noseParts(sh, steps = 10) {
  const { baseWidth: W, noseLength: N, half, zc, radius: r } = sh, zArc = x => zc - Math.sqrt(Math.max(0, r * r - x * x));
  const parts = [[[-W / 2, 0], [-half, 0], [-half, N], [-W / 2, N]], [[half, 0], [W / 2, 0], [W / 2, N], [half, N]]];
  for (let i = 0; i < steps; i++) {
    const a = -half + 2 * half * i / steps, b = -half + 2 * half * (i + 1) / steps;
    parts.push([[a, 0], [b, 0], [b, zArc(b)], [a, zArc(a)]]);
  }
  return parts;
}

// Conformité au règlement Hockey Micro. Renvoie la liste des écarts (vide = conforme).
export function microCheck(s) {
  const bad = [], sh = scoopShape({ baseWidth: s.baseWidth, noseLength: s.hookLength, puckDiameter: s.hockeyPuckDiameter,
    radius: s.scoopRadius, depth: s.scoopDepth });
  if (s.mass > 0.454 + 1e-9) bad.push('masse > 454 g');
  if (s.baseWidth > 0.2 + 1e-9) bad.push('largeur > 20 cm');
  if (s.baseLength + s.hookLength > 0.2 + 1e-9) bad.push('longueur > 20 cm');
  if (sh.opening < 0.04 - 1e-9) bad.push('ouverture du nez < 40 mm');
  if (s.scoopDepth > s.hockeyPuckDiameter / 2 + 1e-9) bad.push('creux plus profond que la moitié du palet');
  return bad;
}

// Contour (x,z) fermé du nez, pour l'affichage : face arrière, côtés, pointes et arc du creux.
export function noseOutline(sh, steps = 10) {
  const { baseWidth: W, noseLength: N, half, zc, radius: r } = sh, pts = [[-W / 2, 0], [W / 2, 0], [W / 2, N], [half, N]];
  for (let i = 0; i <= steps; i++) { const x = half - 2 * half * i / steps; pts.push([x, zc - Math.sqrt(Math.max(0, r * r - x * x))]); }
  return pts.concat([[-half, N], [-W / 2, N]]);
}
