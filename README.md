# Robot Push Lab

Mini-jeu 3D autonome utilisant **Three.js** pour l'affichage et **Rapier 3D** pour la physique.

## But
Pousse les dix caisses hors de l'arène avec ton robot. La rampe et les masses différentes permettent de tester les chocs, l'inertie et le basculement.

## Commandes
- ZQSD ou flèches : conduire
- Espace : coup de bélier (recharge 0,9 s)
- R : remettre le robot droit
- N : recréer les caisses
- Commandes tactiles incluses sur mobile

## Mise en ligne GitHub Pages
1. Crée un nouveau dépôt public sur GitHub.
2. Ajoute `index.html`, `main.js`, `style.css` et ce `README.md` à la racine.
3. Dans **Settings > Pages**, sélectionne **Deploy from a branch**.
4. Choisis la branche `main` et le dossier `/ (root)`, puis enregistre.
5. Ouvre l'adresse GitHub Pages affichée après le déploiement.

Le jeu charge Three.js et Rapier depuis esm.sh : une connexion Internet est nécessaire au lancement.
