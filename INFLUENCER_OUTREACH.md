# FIT AI - prospection coachs et influenceurs musculation

## Cibles prioritaires

- Coachs musculation avec communaute entre 5 000 et 150 000 abonnes.
- Createurs TikTok/Reels avec formats transformation, nutrition, prise de muscle, perte de gras.
- Youtubeurs musculation qui testent des apps, routines, challenges 30 jours.
- Coachs independants qui vendent deja du coaching mais veulent un outil de suivi client.

## Offre simple

- Code personnel : `PRENOMFIT` ou nom de chaine.
- Commission : 20% par abonnement attribue, ajustable pour les meilleurs profils.
- Option forfait : paiement fixe pour une video dediee + commission sur ventes.
- Bonus utilisateur : reduction ou bonus XP/coffre/mascotte speciale selon le code.

## Message DM court

Salut {prenom}, je lance FIT AI, une app fitness gamifiee avec programme, nutrition, suivi et recompenses.

Je cherche quelques coachs/createurs muscu pour tester l'app avant lancement public. Je peux te creer un code personnel avec commission sur chaque abonne amene, et un acces complet pour tester.

Tu serais partant pour jeter un oeil et me dire si ca peut interesser ta communaute ?

## Email plus complet

Objet : Partenariat FIT AI x {nom}

Bonjour {prenom},

Je developpe FIT AI, une app fitness orientee progression : programme personnalise, calories/macros, suivi des seances, XP, badges, defis et mascotte.

Je cherche des coachs et createurs musculation pour un lancement propre, avec un modele gagnant-gagnant :

- un code personnel pour ta communaute ;
- une commission sur chaque abonnement attribue ;
- possibilite de forfait fixe pour contenu dedie ;
- acces complet gratuit pour tester l'app avant d'en parler.

L'idee n'est pas de faire une promo froide, mais un vrai test honnete : ce qui est utile, ce qui manque, et comment l'app peut aider tes abonnes a etre plus constants.

Si ca t'interesse, je peux t'envoyer un acces test + ton code.

Bonne journee,
{ton nom}

## Suivi

- Creer un code via `POST /api/affiliates`.
- Appliquer le code depuis le champ code promo de l'app.
- Lire les stats via `GET /api/affiliates/{code}/stats`.
- Ajouter ensuite le suivi de conversion payante via RevenueCat/Stripe.
