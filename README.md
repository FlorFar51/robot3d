# Robot Push Lab V13

## Reconstruction fiable
Les paramètres sont encodés dans l'URL au clic sur JOUER/IA, puis la page recharge et construit directement les vrais meshes, colliders, roues et crochets avec ces valeurs. Le visuel et la physique utilisent donc les mêmes dimensions.

## Diagnostic
Bouton DIAG : rayons des deux roues, contacts vert/rouge, centre de masse rouge, flèche de force moteur, compteur de contacts et état du robot.

## Palets
Paramètres : diamètre, hauteur, rebondissement, glissement/friction et nombre de palets. Les palets sont des cylindres dynamiques Rapier avec CCD.
