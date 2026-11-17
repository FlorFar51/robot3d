# Robot Push Lab V8

Reconstruction autour du contrôleur de véhicule raycast officiel de Rapier.

- Un châssis dynamique de 22 kg.
- Quatre roues raycast avec suspension, adhérence, moteur et frein.
- Conduite différentielle : les roues gauche et droite reçoivent des forces opposées pour pivoter.
- Aucun `setLinvel` ou `setAngvel` pendant la conduite.
- Gravité, chutes, collisions et renversements gérés par Rapier.
- Frein de roue au relâchement.
- Joystick téléphone, clavier ZQSD, caméra ISO et IA de test.

Dépose les quatre fichiers à la racine de GitHub Pages. Une connexion Internet est nécessaire pour charger Three.js et Rapier depuis esm.sh.
