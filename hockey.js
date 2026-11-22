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
export function arenaFor(n, { fieldWidth, fieldLength }) {
  const scale = fieldScale(n);
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
  return Math.abs(p.x) > c.arenaW / 2 + 1 || Math.abs(p.z) > c.arenaL / 2 + c.goalDepth + 1
    || p.y < -2 || p.y > c.wallH + 8;
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
    m.stall = Math.abs(puck.z) <= c.arenaL / 2 && puck.speed < RULES.stallSpeed ? m.stall + dt : 0;   // pas de « palet bloqué » au fond d'un but
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
export function aiCommand({ self, team, slot, n, role, puck, arena, profile = aiProfile(10), aimNoise = 0 }) {
  const attack = team === 0 ? -1 : 1, own = -attack;
  let tx, tz;
  if (role === 'chase') {
    const px = puck.x, pz = puck.z;
    const gz = attack * arena.length / 2;
    let dx = -px, dz = gz - pz; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const rx = px - self.x, rz = pz - self.z;
    const along = rx * dx + rz * dz, lateral = Math.abs(rx * dz - rz * dx);
    if (!profile.smart) { tx = px; tz = pz; }                                  // débutant : fonce droit sur le palet
    else if (along > 0.5 && lateral < 1.4) { tx = px + dx * 2; tz = pz + dz * 2; }
    else { tx = px - dx * 2.2; tz = pz - dz * 2.2; }
  } else {
    const lim = arena.width / 2 - 2;
    tx = Math.max(-lim, Math.min(lim, puck.x * 0.5 + (slot - (n - 1) / 2) * 4));
    tz = own * arena.length * 0.32;
  }
  const dx = tx - self.x, dz = tz - self.z, dist = Math.hypot(dx, dz);
  if (role !== 'chase' && dist < 2) return { f: 0, t: 0 };
  // angle signé (yaw positif = de +z vers +x) entre les crochets et la cible
  const ang = Math.atan2(self.fz * dx - self.fx * dz, self.fx * dx + self.fz * dz) + aimNoise;
  const t = Math.max(-1, Math.min(1, -2 * ang));
  const f = -(Math.abs(ang) > 1.2 ? 0 : (1 - Math.abs(ang) / 1.2) * (role === 'chase' ? 1 : 0.8)) * profile.throttle;
  return { f, t };
}
