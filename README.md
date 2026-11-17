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
