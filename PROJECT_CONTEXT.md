# PROJECT_CONTEXT — Robot Push Lab

Dernière mise à jour : 21/11/2026 (Hockey 1v1 / 2v2 / 3v3 ; réinitialisation du palet ; reprise sans blocage après un but ; HUD Diffusion ; difficulté d'IA 1-10 ; refonte de l'interface).

## 1. Architecture

Projet web sans build ni `package.json`. Three.js 0.181.1 et Rapier 0.19.3 sont chargés depuis `esm.sh`.

| Fichier | Rôle |
|---|---|
| `index.html` | Menus, panneau COMMANDES, HUD. Charge `main.js` en module. |
| `main.js` | Tout le jeu : réglages, monde Rapier, robots, laboratoire, hockey, contrôles, boucle. |
| `hockey.js` | **Nouveau.** Règles du hockey en logique pure (terrain, départs, buts, match, IA). Seul fichier ajouté, car il est testable sans navigateur. |
| `hockey.test.js` | **Nouveau.** 14 tests unitaires : `node --test hockey.test.js` (Node 20+, aucune dépendance). |
| `style.css` | Styles (non modifié). |

Flux : `index.html` → `main.js` lit les réglages dans l'URL (`?mode=human|ai|hockey&clé=valeur…`) → crée le monde et les robots → `start()` → `loop()`. Les réglages se changent dans le menu puis s'appliquent au prochain lancement (la page se recharge avec les réglages en paramètres d'URL).

Dans `main.js` : `createRobot(team,color,spawn)` construit un robot (caisse, crochets, plaque, véhicule à 2 roues). `robots[]` contient tous les robots, `robots[0]` est le robot « principal » (caméra, diagnostic, touche R). Les constantes `robot`, `vehicle`, `wheelPos`… désignent `robots[0]`. `hockeyTick(dt)` est appelé à chaque pas physique (1/120 s) et fait avancer le match.

## 2. Hockey : règles

Sources : IIHF Official Rule Book 2026/27 v1.0 (juin 2026). Lu : règle 1 (patinoire, buts, palet), 76 (remises en jeu), 77 (chrono), 78 (buts), 85 (palet sorti). Non lu en détail : règles de contact (41, 42, 56, 69), 84 (prolongation), 86, annexe VI (position des lignes bleues, zone de but).

| Règle IIHF | Adaptation | Statut |
|---|---|---|
| 3 × 20 min de temps effectif, chrono arrêté au but | 3 périodes de `periodDuration` s (défaut 120, réglable 30-300), temps effectif, pause de 4 s | Fait |
| But : palet entièrement franchi, entre les poteaux | Centre du palet au-delà de la ligne + rayon, palet entièrement dans l'ouverture. Testé à chaque pas physique (1/120 s) | Fait |
| But contre son camp compte pour l'adversaire | Équipe 0 défend z = +L/2, équipe 1 défend z = −L/2 | Fait |
| Remise en jeu après un but | Réglage `puckReset` (Configuration › Match – Hockey). **1** : le palet remonte à 4,5 m au centre pendant `goalResetDelay` (1,4 s) puis est lâché. **0** : le palet reste où il est et le jeu continue ; un palet resté dans le but ne marque qu'une fois, il doit ressortir. Dans les deux cas les robots **ne sont ni bloqués, ni repositionnés, ni ralentis** et le chrono s'arrête seulement pendant le retour du palet | Fait |
| Palet sorti / coincé (3 s) | Bandes pleines : le palet ne sort pas. Palet immobile (< 0,4 m/s) 6 s sur le terrain (pas au fond d'un but) ou hors du terrain → le palet revient au centre comme après un but, sans point et sans toucher aux robots | Fait |
| Départ de match et de période | Seul moment où les commandes sont verrouillées : robots replacés, décompte 3-2-1, puis lâcher | Fait |
| Mode solo (1v0) | Un seul robot, sans adversaire (section 4) | Fait |
| Prolongation | But en or, `overtimeDuration` s (défaut 120), puis match nul | Fait (règle 84 non lue : choix personnel) |
| Gardien, hors-jeu, icing, pénalités, changements | Pas en V1 | Reporté |
| Contacts autorisés, interférence | Contacts libres. Un robot renversé plus de 3 s est replacé à son départ | Fait (non issu des règles IIHF) |

`winningScore` (défaut 5, existant) reste un score cible : le match s'arrête dès qu'une équipe l'atteint.

## 3. Dimensions

Référence IIHF : patinoire 60 m × 26-30 m, coins arrondis 7-8,5 m, ligne de but à 4,0 m du fond, but 1,83 × 1,22 m, cercle de remise en jeu rayon 4,5 m, palet 7,6 cm × 2,5 cm. Soit 150 m² par joueur sur la patinoire officielle (12 joueurs), beaucoup trop pour des robots.

Robot actuel : 2,3 m de large, châssis 1,9 m + crochets 1,55 m. Palet actuel : 0,9 m de diamètre, 0,22 m de haut.

| | 1v1 | 2v2 | 3v3 |
|---|---|---|---|
| Terrain (l × L) | 20 × 33 m | 24 × 39,6 m | 28 × 46,2 m |
| Aire par robot | 330 m² | 238 m² | 216 m² |
| But (ouverture × profondeur) | 6,5 × 3,5 m | idem | idem |
| Départ des robots | z = ±0,3 L, répartis sur la largeur | idem | idem |

Choix : le 1v1 garde le terrain et le but **déjà réglés** (20 × 33 m ; but 6,5 m ≈ 2,8 largeurs de robot, proche de l'hypothèse « 3 robots »). Chaque robot supplémentaire par équipe ajoute 20 % aux deux dimensions (`fieldScale`). Les chiffres des formats 2v2 et 3v3 sont une hypothèse de départ, à ajuster en jouant. Non fait : coins arrondis (équivalent des 7-8,5 m officiels), cercles de remise en jeu, lignes bleues.

## 4. Contrôleurs

Les joueurs humains sont les `humanPlayers` premiers robots (équipe 0 / équipe 1 en alternance) ; les autres sont pilotés par l'IA de `hockey.js` (niveau `aiLevel`, section 9).

**Attribution par joueur** (menu › Hockey, une ligne par joueur humain, transmise par le paramètre d'URL `devices`) :
- **Automatique** (défaut) : joueur 1 = clavier A (touches de COMMANDES, modifiables) + manette 1 ; joueur 2 = manette 2 + clavier B ; joueur 3 et suivants = manette de même numéro, sinon IA.
- **Clavier A** (Z S Q D, modifiable), **Clavier B** (flèches, fixes), **Manette 1 à 4** (n-ième manette connectée) : le joueur n'utilise que ce périphérique.
- Pas de conflit : un périphérique choisi par un joueur est grisé chez les autres, et un joueur en « Automatique » n'empiète pas sur un périphérique choisi par un autre. Une manette choisie mais absente laisse le robot immobile (le menu affiche « non détectée »).
- Toutes les manettes partagent la même configuration d'axes et d'inversions (panneau COMMANDES). Les boutons reset/caméra/diagnostic viennent de la première manette connectée.

**Mode solo (1v0)** : bouton « Solo » du menu (réglage `solo`). Un seul robot (équipe bleue), terrain 1v1, aucun adversaire ni IA. Un but dans le but adverse compte pour le joueur ; un but contre son camp compte pour l'équipe rouge absente. Les règles de match (périodes, prolongation, score cible) restent celles du hockey.

## 5. Physique

**Aucun paramètre physique modifié.** Mesures sur l'ancien code (banc d'essai Node avec le vrai Rapier) :

- Robot : atteint ≈ 23 m/s en 0,5 s, ≈ 26 m/s au maximum.
- Palet libre : décélération ≈ 6,5 m/s² (10 m/s → arrêt en ≈ 1,5 s ; 6 m/s → 2,8 m).
- Rebond palet sur mur : 13 % de la vitesse à 25 m/s.
- Ces deux valeurs sont cohérentes avec une moyenne des coefficients palet/sol (0,1 et 1,2 → 0,65) et palet/mur (0,25 et 0 → 0,125), ce qui est la règle de combinaison par défaut de Rapier (non vérifiée dans le code Rapier lui-même). Si c'est bien le cas, `hockeyPuckSlide` et `hockeyPuckBounce` agissent bien moins que leur valeur affichée. **À décider avec toi** après essais à la main : changer ces valeurs modifie nettement la sensation du palet.

Seule correction de comportement : `driveRobot` réveille le robot (`wakeUp`) dès qu'il reçoit une commande, et le palet est réveillé au lâcher.
- Problème : un robot immobile depuis plus de 2 s ne réagissait pas à la touche S (reculer = crochets en avant) tant qu'une autre entrée ne le réveillait pas. Défaut déjà présent dans le code d'origine (mesuré : 0,00 m en 1 s). Pendant le compte à rebours de 3 s, robots et palet s'endormaient aussi.
- Résultat observé : S déplace maintenant le robot de 3,43 m en 1 s ; trajectoires du laboratoire identiques à l'ancien code.

## 6. Tests réalisés (banc d'essai Node : vrai `main.js`, vrai Rapier et Three, DOM simulé)

- 21 tests unitaires de `hockey.js` : 21/21 réussis (dont les deux options de réinitialisation, la continuité après un but, le départ de match/période, la difficulté de l'IA).
- Continuité après un but, vrai moteur, 1v1/2v2/3v3 × `puckReset` 1 et 0 : aucun robot téléporté, vitesse non remise à zéro, commandes actives pendant tout le but, palet au centre au lâcher (option 1) ou resté dans le but sans double but (option 0), chrono cohérent.
- Laboratoire (modes manuel et IA) : trajectoires ancien/nouveau code identiques sur 8 s simulées (57 lignes, 18 objets physiques inclus).
- Matchs IA contre IA (périodes de 60 s, score cible 9, une partie déterministe par ligne, donc indicatif et non statistique) :

| Format | Buts/min | Remises sans but | Robot renversé | Palet max |
|---|---|---|---|---|
| 1v1 | 20,8 | 0 | 0 % | 24,5 m/s |
| 2v2 | 6,5 | 4 | 2,8 % | 32,7 m/s |
| 3v3 | 12,9 | 1 | 0 % | 27,1 m/s |

- Vrai navigateur (Chromium headless, rendu logiciel, `esm.sh` redirigé vers les copies npm) : le jeu démarre en 1v1 et 2v2, le HUD s'affiche et se met à jour (décompte, score, chrono, bandeau de but), aucune erreur de console.
- Attribution des périphériques, 15 scénarios avec de fausses manettes branchées sur le vrai moteur (clavier A/B, manettes 1-2, échange des rôles, conflit, manette absente, « Automatique ») : tous conformes.
- Mode solo, avec et sans remise du palet : 8 contrôles chacun (un seul robot, normalisation d'une URL contradictoire, pilotage, buts dans les deux sens).
- Tous les réglages listés dans les menus existent et se transmettent par l'URL.

**Non testé** : le rendu en 3v3 et sur de grands écrans, le cadrage des caméras en 2v2/3v3 (voir section 8), commandes tactiles, vraies manettes, sensations et équilibrage avec des humains, performances sur appareil lent.

## 7. Problèmes connus, non corrigés

- Touche « avancer » (Z) : le robot roule côté opposé aux crochets (mesuré). L'attaque se fait en marche arrière (S) ; l'IA utilise donc `f < 0`. Conservé tel quel pour garder les sensations.
- `base.scale.set(baseWidth/2.3, baseHeight/.65, baseLength/3.25)` dans `tuneRobot` : avec les valeurs par défaut (largeur 2,3, hauteur 0,55, longueur 1,9) le châssis visible est réduit à 85 % en hauteur et 58 % en longueur par rapport à sa boîte physique. Visuel seulement, à vérifier à l'écran.
- `goalResetDelay` n'était lu par aucun code. Il règle maintenant la durée du retour du palet après un but (défaut 1,4 s ; l'ancien code figeait 0,85 s).
- README « V15 » et `index.html` « V20 » : numéros de version incohérents.
- L'IA reste simple : elle ne sait pas tirer, passer ni défendre intelligemment. Le niveau 10 est « le plus fort de cette IA », pas un expert (voir section 9).
- Avec `puckReset = 0`, l'IA récupère mal un palet resté dans le but : 3 buts en 3 minutes de jeu observés en IA contre IA, contre 2 à 7 buts/min avec `puckReset = 1`. Un joueur humain peut le sortir.
- Les robots non principaux n'ont pas de diagnostic visuel (raycasts) : réservé à `robots[0]`.

## 8. Interface

**Refonte faite** dans l'esprit Apple classique, clair ou sombre selon le système : `style.css` entièrement réécrit (jetons, boutons avec retour d'appui `scale(.97)` en 160 ms, listes groupées, contrôles segmentés, interrupteur, feuilles translucides, états de focus clavier, mouvement/transparence/contraste réduits). Classes manipulées par le JS conservées (`hidden`, `waiting`, `connected`, `started`, `phone`, `ai`).

- **Menu** (`index.html`) : configuration de match intégrée (format 1v1/2v2/3v3, joueurs humains, difficulté IA, palet remis au centre) qui pilote les vrais réglages ; laboratoire en liste. Tient en 1280 × 720 sans défilement.
- **Configuration** : feuille avec recherche, sections groupées, 32 réglages.
- **Commandes**, **navigation en jeu**, **statistiques du laboratoire**, **commandes tactiles** : même système. Textes en casse normale (JS et HTML).
- **HUD hockey « Diffusion »** : inchangé, conservé en fin de `style.css`.

**Vérifié dans Chromium** (clair et sombre) : menu, clics de la configuration de match (les réglages réels changent, les joueurs humains sont ramenés à 2 en repassant en 1v1), recherche de réglages (11 lignes pour « palet »), feuille des commandes, navigation et HUD en jeu, plus petite police 13 px, aucune erreur de console.

**Contrastes (WCAG AA, texte)** : mesurés sur les pixels rendus dans Chromium, clair et sombre. Avant correctifs : 58 textes sous 4,5:1 sur 172 (texte secondaire gris et texte bleu en clair, blanc sur bleu du bouton principal en sombre). Après : 252 textes d'interface (menu en 3 états, configuration, commandes) et 52 textes en jeu, dont le pire cas sur fond blanc, **0 sous le seuil**. Correctifs : texte secondaire plus foncé, bleu d'accent dédié au texte (`--accent-text`), fond de bouton dédié (`--accent-btn`), matières translucides plus opaques en jeu, tuile sombre derrière le décompte. Non mesuré : contrastes des composants non textuels (bordures, interrupteur, anneau de focus), menu déroulant natif des sélecteurs, mesure sur l'ensemble des images d'une partie (une seule image par écran).

**Non vérifié** : lecteur d'écran, navigation complète au clavier, commandes tactiles sur téléphone, passe `break-ui` (noms très longs, valeurs extrêmes), écrans plus petits que 1280 × 720.

**Reste à faire** : profil de commandes par manette ; boutons reset/caméra par joueur ; cadrage de la caméra par défaut en 2v2/3v3 (le fond du terrain sort de l'écran en vue Iso suivie).

## 9. IA et difficulté

Réglage `aiLevel` (1 à 10, défaut 5), dans le menu et dans Configuration › Match – Hockey. `aiProfile(niveau)` dans `hockey.js` :

| | Niveau 1 | Niveau 10 |
|---|---|---|
| Vitesse maximale (commande) | 0,3 | 0,6 |
| Délai de réaction | 0,30 s | 0 |
| Erreur de visée | 0,35 rad | 0 |
| Approche « derrière le palet » | non (fonce droit) | oui (à partir du niveau 6) |

**Mesures** (vrai moteur, parties de 3 × 30 s, 3 graines × 2 côtés, donc 6 parties par comparaison : tendance, pas statistique) :
- Délai de réaction : le levier le plus fort (délai 0 : 28 buts contre 18 ; délai 0,3 : 7 contre 12).
- Vitesse : gain régulier de 0,3 à 0,6 ; au-delà de ≈ 0,65 la poussée sature (le robot plafonne à ≈ 25 m/s) et l'IA perd le contrôle du palet (0,85 : 17 buts contre 28 ; 1,0 : nettement perdant). D'où le plafond à 0,6.
- Anticipation de la vitesse du palet : faisait perdre dans les deux réglages testés, supprimée.
- Approche derrière le palet : neutre en 1v1, décisive en équipe (sans elle 7-17 en 2v2 et 9-16 en 3v3), donc réservée aux niveaux 6+.
- Ordre de force obtenu en 1v1 : 10 bat 8 (5-1), 8 bat 6 (5-1), 6 bat 4 (4-1), 10 bat 5 (5-0), 10 bat 1 (5-1) ; 4 contre 1 à égalité (3-3). En 2v2 et 3v3, le niveau 10 bat les niveaux 5 et 2 à chaque fois (5-0 ou 6-0).
- Première version (vitesse jusqu'à 1,0, anticipation) : le niveau 10 perdait contre le niveau 3. Corrigée par ces mesures.

## 10. Réglages supprimés (audit de simplification)

Méthode : chacun des 55 réglages physiques, de caméra et de terrain a été mis à son minimum puis à son maximum, dans 3 scénarios identiques et reproductibles (laboratoire manuel, laboratoire IA, hockey avec tirs dans le but et contre le mur), en comparant l'état complet des corps (position, rotation, vitesse) ; un 4e scénario fait chuter un robot de 10 kg sous gravité maximale. Les 9 réglages de match (format, durées, IA, palet…) n'ont pas été testés : ils ne sont pas physiques.

**Supprimés (64 → 58), sans aucun effet sur toute leur plage :**

| Réglage | Preuve |
|---|---|
| `goalHeight` (hauteur des buts) | Lu par aucune ligne de code ; aucun effet mesuré. |
| `playerForce` (force moteur joueur) | Bornait une force qui ne dépasse jamais 595 N (accélération max 59,5 × masse max 10) alors que le curseur commençait à 1 020 N : ne pouvait jamais agir. Min, max et 10⁷ N identiques ; seule la valeur 1 N, hors curseur, change quelque chose. |
| `brake` (frein au relâchement) | Effet seulement sous ≈ 10 N ; curseur de 30 à 270 N : inerte. |
| `brakeDeceleration` et `brakePower` (frein en marche arrière) | Effet seulement sous ≈ 32 N au total ; curseurs ≥ 61 N pour toute masse : inertes. `brakePower` n'était qu'un plafond dans un `min()`. |
| `maxSuspensionForce` | Min (1 500), max et 10⁷ N identiques, y compris dans la chute d'un robot de 10 kg ; seule la valeur 1 N change. |

Remplacés par une constante de 75 N par roue pour les deux freins (au-dessus des seuils mesurés) ; la suspension garde la valeur par défaut de la bibliothèque.

**Preuve d'équivalence** : ancien et nouveau code donnent des états physiques strictement identiques sur 11 configurations (4 scénarios, masses 2, 4 et 10 kg, accélération et vitesse maximales), et le laboratoire reste identique au code d'origine.

**Conservés** : tous les autres réglages physiques ont un effet mesuré (au moins dans un scénario). Les 6 réglages de caméra n'ont aucun effet physique (vérifié) mais règlent la vue : conservés. `aiForce` n'agit que sous ≈ 96 N (le curseur va de 35 à 295 N) : conservé car il agit dans une partie de sa plage.

**Limite** : « aucun effet » est établi dans ces scénarios et sur la plage des curseurs ; une situation non couverte pourrait exister. Les anciennes configurations exportées qui contiennent les clés supprimées restent chargeables (clés ignorées).

## 11. Simplification des réglages (58 → 32)

Principe : seuls les vrais leviers de jeu restent des curseurs ; le reste devient une constante égale à l'ancienne valeur par défaut, donc la physique par défaut ne change pas. Les constantes se modifient dans la ligne `Object.assign(settings,{…})` de `main.js` (juste après la lecture de l'URL) ; elles ne sont plus réglables depuis l'interface ni par l'URL.

**Suspension : 7 réglages → 2.** `stiffness` (raideur) et `damping` (amortissement unique : détente = `damping`, compression = 0,75 × `damping`, le rapport des anciens défauts 6 et 4,5). Fixés : `suspensionRest` 0,16, `wheelHeight` 0,18, `wheelRadius` 0,29. `grip` (adhérence des roues) reste.

**Autres réglages fixés** (valeur = ancien défaut) : `baseHeight`, `hookThickness`, `centerOfMassX`, `centerOfMassZ`, `aiForce`, `aiSpin`, `gravity`, `restitution`, `timestep` (120 Hz), `wallHeight`, `wallThickness`, `goalDepth`, `hockeyPuckHeight`, `puckHeight`, `puckRestitution`, `puckFriction`, et les 6 réglages de caméra.

**Réglages conservés (32)** : Match – Hockey (9) ; Terrain – Hockey : `fieldWidth`, `fieldLength`, `goalWidth` ; Palet – Hockey : diamètre, masse, rebond, glissement ; Robot : `baseWidth`, `baseLength`, `hookLength`, `mass`, `centerOfMassY` ; Moteurs : `maxSpeed`, `acceleration`, `playerSpin` ; Suspension et roues : `stiffness`, `damping`, `grip` ; Physique : `friction`, `linearDamping`, `angularDamping` ; Palets – laboratoire : diamètre, nombre.

**Preuve d'équivalence** : la version à 58 réglages et celle à 32 donnent des états physiques strictement identiques sur 23 configurations (laboratoire manuel et IA, hockey, chute d'un robot de 10 kg ; masses, raideur, amortissement 3 / 9 / 10 avec l'ancien couple compression-détente correspondant, adhérence, vitesses, dimensions du robot et du terrain, palets). Laboratoire identique au code d'origine ; 21 tests unitaires, continuité, solo et périphériques inchangés ; 32 lignes dans la feuille de configuration, sans erreur de console.

**Limite** : la physique est identique aux valeurs par défaut et aux valeurs testées des curseurs conservés ; les valeurs figées ne peuvent plus être explorées sans modifier le code.

## Calibrage Hockey Micro (règlement Robocore 15/01/2024) — ajouté par Claude

Tout est maintenant en mètres réels (SI). Source : `Regras - Hockey.pdf` (§2.2, 2.8.5, 2.8.6, 3.2).

| Élément | Valeur | Origine |
|---|---|---|
| Robot | 454 g, châssis 0,18 × 0,13 m + nez 0,07 m (≤ 0,20 m) | règlement §2.2 |
| Ring | 3,3 × 1,65 m (45 % du Pro), fixe quel que soit le format | §3.2.1 (2,93–3,66 × 1,46–1,83) |
| Buts / murs / coins | 0,52 m, 0,18 m de haut, coins de rayon 0,135 m | §3.2.2, 3.2.3, 3.2.1 |
| Palet | Ø 31,7 × 12,7 mm, **12 g (estimation, non fixée par le règlement)** | §3.2.5 |
| Vitesse max / accélération | 3 m/s / 6 m/s² commandés (≈ 3,2 m/s² mesurés) | **hypothèse**, à vérifier sur un vrai robot |
| Rotation | ≈ 8 rad/s après 1 s (playerSpin 0,5) | **hypothèse** |
| Grip roues / friction palet / rebond | 1,1 / 0,25 / 0,4 | **hypothèse** (caoutchouc sur sol dur) |

- `hockeyPuckSlide` et `hockeyPuckBounce` sont maintenant les coefficients réels (friction = minimum, rebond = maximum des deux surfaces).
- Nez arrondi : `hockey.js` → `scoopShape` (règles §2.8.5 : creux ≤ ½ palet ; §2.8.6 : ouverture ≥ 40 mm), `noseParts` (collisions, polygones convexes) et `noseOutline` (affichage). Réglages `scoopRadius`, `scoopDepth`. `microCheck` affiche la conformité dans le menu.
- Centre de gravité avant/arrière : réglage `centerOfMassZ` rétabli (0 = sur l'essieu ; > 0 charge le nez et réduit la traction : à +6 cm le robot ne démarre plus).
- Robot importé (à faire) : fournir à `noseParts` les polygones convexes issus du modèle ; la boucle de collision de `createRobot` les utilise déjà.
- Corrigé : `tuneRobot` mettait le châssis visuel à l'échelle de l'ancien modèle (÷2,3) ; il utilise maintenant `chassisSize`.
- IA réglée pour le Micro (causes trouvées au banc : le correcteur de cap n'avait pas d'amortissement et faisait tourner le robot en rond ; le point d'approche tombait hors du ring près des murs ; le robot renvoyait le palet à pleine vitesse). Corrections : gain proportionnel sur l'angle (la rotation est asservie en vitesse, voir ci-dessous), point d'approche ramené dans le ring (on attaque le palet s'il est déjà atteint), vitesse × 0,8 à moins de 30 cm du palet (`NEAR_PUCK_SLOW`), sortie d'impasse dans `thinkAI` (recul de 0,6 s après 0,8 s bloqué).
  Mesures sur 12 min simulées : IA seule niv. 10 ≈ 1,1 but/min ; IA contre IA niv. 10 : 1v1 1,8, 2v2 0,7, 3v3 1,1 but/min ; niv. 6-8 : 0,3 à 1,2. Niv. 5 et moins : marque rarement, par conception (pas de visée vers le but). Ancien terrain : ≈ 2,5 but/min en 1v1. Pas de mesure contre un humain.
- Le laboratoire (caisses, murs, rampe) a été réduit d'un facteur 10 ; démarrage vérifié, comportement non testé en détail.

## Import d'un robot (STEP, IGES, STL, OBJ, GLB/GLTF, PLY) — ajouté par Claude

- `robotimport.js` (pur, testable) : `readParts` (lecture), `unitScale`/`scaleParts`, `splitComponents` (pièce unique → composants connexes), `detectRoles` (roues = corps de révolution par paires coaxiales, nom « wheel/roue/… » favorisé, moyeux et vis coaxiaux rattachés), `buildModel` (orientation : essieu = axe latéral, haut = côté où les roues touchent le sol, avant = côté où le châssis dépasse le plus des roues ; centre de gravité par volume ; hitboxes), `modelCheck` (gabarit 20 × 20 cm, 454 g), `applyToSettings`.
- `robotimport-ui.js` : zone « Robot importé » dans la Configuration (unité, inversion avant / haut-bas, masse, rôle de chaque partie modifiable, aperçu de dessus avec l'avant en haut) et stockage dans IndexedDB (clé `robotModel`). « Utiliser ce robot » recharge la page ; « Revenir au robot paramétrique » efface le modèle.
- Dans le jeu : le châssis et le nez paramétriques sont remplacés par le modèle ; collisions = une enveloppe convexe par pièce pleine, ou des tranches de 1 cm (coupe exacte des triangles) pour une pièce creusée (nez arrondi) ; les roues sont des roues de véhicule (nombre quelconque, rayon et position du modèle) ; les dimensions, le centre de gravité et la masse du modèle écrasent les réglages (le curseur de centre de gravité reste réglable ensuite).
- Lecteurs : STEP/IGES/BREP via `occt-import-js` (chargé depuis jsDelivr), les autres via les chargeurs Three.js (esm.sh). Hors ligne, seul un format déjà en cache fonctionne.
- Limites : pièce unique dont les roues sont soudées au châssis (STEP « fusionné ») → roues non détectables, tout est châssis, roues par défaut ; la forme du nez importé n'est pas contrôlée (§2.8.5/2.8.6) ; GLTF avec fichiers externes non résolu ; FBX, 3MF, DAE non pris en charge.
- Corrigé au passage : l'inertie était plafonnée à 0,01 kg·m² (≈ 5× la valeur réelle) ; la friction du châssis est maintenant le coefficient réel (règle « minimum » avec le sol) ; la rotation est asservie en vitesse (`maxTurnRate` 9 rad/s, force limitée par `playerSpin`), donc indépendante de l'inertie et du centre de gravité.
- Fichiers de test : `test-robots/` (robot de référence en STEP, STL, OBJ, GLB, script `gen.py` cadquery). `robotimport.test.js` ignore les tests de fichiers si `occt-import-js` et `three` ne sont pas installés.

## Terrain hockey et maniabilité (26/11/2026)

- Terrain : sol de 2 cm (dessus à y = 0, sol extérieur à y = -2 cm), arêtes noires des murs de 1 cm, sol visible à coins arrondis de même rayon que la face intérieure des murs, buts ouverts (le bloc noir de 12 cm qui les recouvrait est supprimé). Collider du sol : un seul cuboïde continu sous terrain et buts ; un `convexHull` plat laisse traverser le palet dans Rapier, et deux colliders jointifs font décoller le palet à la ligne de but.
- Freinage (hockey uniquement) : `setWheelBrake` n'a aucun effet mesurable (3 à 75 N identiques) et provoque un coup de lacet de plusieurs rad/s au relâchement. Le robot freine donc avec le moteur (`HOCKEY_BRAKE_GAIN`) : arrêt depuis 2,2 m/s en 0,5 s sur 0,4 m, au lieu de plus de 1,6 s et 2 m. L'inversion de commande passe aussi par le moteur. Le mode laboratoire garde l'ancien comportement.
- Valeurs réelles (mesurées, robot Micro 454 g) : accélération réelle ≈ min(0,95 × annoncée ; 1,55 × vitesse max), vitesse réelle ≈ 0,9 × vitesse max. Au défaut, 6 m/s² annoncés donnent ≈ 4,7 m/s² et 3 m/s donnent ≈ 2,7 m/s. L'interface l'affiche sous les curseurs « Moteurs ».
- Réglages inertes ou limites : `acceleration` n'agit plus au-delà de 1,55 × vitesse max / 0,95 ; `grip` n'agit que sous ≈ 0,45 ; `playerSpin` < 0,3 est instable ; `maxSpeed` ≥ 3,5 retourne le robot en virage serré ; `maxTurnRate` n'a pas d'effet net sur les retournements.
- Retournements : encore 1 cas sur 10 en conduite aléatoire de 12 s aux réglages par défaut (4 sur 10 avant le freinage moteur), au contact du mur de fond en rotation rapide. Un robot renversé plus de 3 s est replacé à son départ.
- Adhérence latérale (hockey) : la rigidité du frottement latéral Rapier valait 1 (défaut), donc le robot glissait comme sur de la glace (0,5 m/s de vitesse latérale ne perdait que 0,16 m/s en 0,5 s) ; `grip` ne la modifie pas. `HOCKEY_SIDE_GRIP` = 15 : arrêt latéral en 0,25 s (0,04 m) et 0 retournement sur 30 conduites aléatoires de 12 s (contre 4 à 6 sur 30 avant). Les deux roues du robot par défaut sont aussi alignées sur le même essieu en hockey (la roue droite était décalée de 4,2 cm vers l'arrière) : la rotation sur place pivote autour du centre sans glissement des roues (0,37 m/s avant, 0 après). Le robot importé garde les roues de son modèle.
