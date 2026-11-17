# Robot Push Lab Mobile

Le jeu détecte automatiquement un téléphone ou un écran tactile.

- Téléphone : boutons tactiles ZQSD, bouton R pour remettre le robot et bouton N pour recommencer. Les indications clavier sont retirées.
- Ordinateur : ZQSD/flèches, R pour remettre le robot et N pour recommencer.

Dépose les quatre fichiers à la racine de ton dépôt GitHub Pages.

La rotation utilise maintenant une vitesse angulaire limitée et freinée afin d’éviter que le robot continue de tourner ou pivote trop brutalement.

- Vitesse avant et arrière multipliée par 2.
- Q et D font pivoter le robot sur son centre, même à l'arrêt.


## V2
- Ajout d'une pente physique dans l'arène.
- Ajout du mode caméra ISO fixe, en hauteur et légèrement de côté.
- Bouton CAM sur téléphone et touche C sur ordinateur pour alterner SUIVI / ISO.
- Numéro de version visible dans le titre.


## V3
- Menu d'accueil avant le chargement du jeu.
- Bouton JOUER : contrôle manuel identique à la V2.
- Bouton MODE IA : le robot sélectionne la caisse active la plus proche, pivote vers elle et avance pour la pousser.
- Le mode IA démarre avec la caméra isométrique pour observer toute l'arène.


## V4
- Le robot reste entièrement soumis à la gravité Rapier (-9,81 m/s²).
- Le moteur et la rotation sont coupés quand le robot est renversé ou ne touche plus le sol.
- La vitesse horizontale est limitée pendant une chute ou un renversement pour éviter les départs incontrôlés.
- Ajout du CCD Rapier pour limiter les traversées et impulsions extrêmes lors des chocs rapides.
- Amortissement linéaire et angulaire renforcé.


## V5
- Retour du joystick analogique sur téléphone.
- Vitesse maximale de l'IA réduite à 9 m/s, contre 21 m/s pour le joueur.
- Force moteur de l'IA divisée par deux.
- L'IA change aléatoirement de direction toutes les 0,45 à 1,60 secondes afin de provoquer davantage de rotations, chocs et renversements observables.


## V6
- Frein actif au relâchement : la vitesse horizontale tombe rapidement à zéro quand le joueur lâche le joystick.
- Frein de rotation renforcé : la rotation résiduelle est stoppée au relâchement.
- La vitesse verticale reste libre pour conserver la gravité Rapier et les chutes naturelles.
- Les freins ne s'appliquent fortement que lorsque le robot touche le sol.


## V7 — reconstruction physique
- Contrôleur réécrit depuis zéro avec constantes centralisées.
- Simulation à 120 Hz et solveur renforcé.
- Rapier conserve la gravité, la vitesse verticale, les collisions, le tangage et le roulis.
- Le contrôleur ne pilote que la vitesse au sol et le lacet.
- Freinage par convergence vers zéro, indépendant du nombre d'images par seconde.
- Contrôle aérien limité à 8 %, au lieu d'appliquer des corrections violentes.
- IA limitée à 6 m/s avec changements aléatoires progressifs.
- État SOL / AIR / RENVERSÉ visible dans le HUD.
