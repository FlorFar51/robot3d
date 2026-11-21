# PROJECT_CONTEXT — Robot Push Lab

Dernière mise à jour : 21/11/2026 (première version du Hockey 1v1 / 2v2 / 3v3).

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
| Remise en jeu au centre après un but | Robots replacés, palet suspendu 4,5 m, compte à rebours 3-2-1, robots verrouillés, lâcher | Fait |
| Palet sorti / coincé (3 s) | Bandes pleines : le palet ne sort pas. Palet immobile (< 0,4 m/s) 6 s ou hors du terrain → remise en jeu au centre, sans point | Fait |
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

Joueurs humains = les `humanPlayers` premiers robots (ordre : équipe 0 / équipe 1 en alternance). Les autres sont pilotés par l'IA de `hockey.js`.

- Joueur 1 : clavier A (touches de COMMANDES, modifiables) + manette 1. Inchangé.
- Joueur 2 : manette 2 si présente, + clavier B (flèches, fixes).
- Joueur 3+ : manette de même numéro, sinon IA.
- Toutes les manettes partagent la même configuration (axes, inversions) : celle du panneau COMMANDES.

Non fait : choix manuel du périphérique par joueur, profil par manette, boutons reset/caméra pour les joueurs 2+.

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

- 14 tests unitaires de `hockey.js` : 14/14 réussis.
- Laboratoire (modes manuel et IA) : trajectoires ancien/nouveau code identiques sur 8 s simulées (57 lignes, 18 objets physiques inclus).
- Matchs IA contre IA (périodes de 60 s, score cible 9, une partie déterministe par ligne, donc indicatif et non statistique) :

| Format | Buts/min | Remises sans but | Robot renversé | Palet max |
|---|---|---|---|---|
| 1v1 | 20,8 | 0 | 0 % | 24,5 m/s |
| 2v2 | 6,5 | 4 | 2,8 % | 32,7 m/s |
| 3v3 | 12,9 | 1 | 0 % | 27,1 m/s |

- Deux manettes indépendantes, clavier A et clavier B séparés, avec 0, 1 ou 2 manettes branchées.
- Tous les réglages listés dans les menus existent et se transmettent par l'URL.

**Non testé** : rendu et HUD dans un vrai navigateur, cadrage des caméras en 2v2/3v3 (distances multipliées par l'échelle du terrain), commandes tactiles, vraies manettes, sensations et équilibrage avec des humains, performances sur appareil lent.

## 7. Problèmes connus, non corrigés

- Touche « avancer » (Z) : le robot roule côté opposé aux crochets (mesuré). L'attaque se fait en marche arrière (S) ; l'IA utilise donc `f < 0`. Conservé tel quel pour garder les sensations.
- `base.scale.set(baseWidth/2.3, baseHeight/.65, baseLength/3.25)` dans `tuneRobot` : avec les valeurs par défaut (largeur 2,3, hauteur 0,55, longueur 1,9) le châssis visible est réduit à 85 % en hauteur et 58 % en longueur par rapport à sa boîte physique. Visuel seulement, à vérifier à l'écran.
- `goalResetDelay` n'était lu par aucun code. Il règle maintenant la durée du retour du palet après un but (défaut 1,4 s ; l'ancien code figeait 0,85 s).
- README « V15 » et `index.html` « V20 » : numéros de version incohérents.
- L'IA (`aiThrottle = 1` dans `RULES`) charge à pleine vitesse ; les collisions frontales à ≈ 23 m/s peuvent projeter un robot.
- Les robots non principaux n'ont pas de diagnostic visuel (raycasts) : réservé à `robots[0]`.
