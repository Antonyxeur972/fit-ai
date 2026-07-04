# FIT AI - publication, mises a jour et croissance

## Mises a jour apres publication

- Petites modifications JS, textes, visuels et ecrans Expo : publier avec `npm run update:production` depuis `frontend`.
- Changements natifs, permissions, achats, login Apple, camera, capteurs : refaire un build avec `npm run build:ios` ou `npm run build:android`, puis soumettre avec `npm run submit:ios` ou `npm run submit:android`.
- Incrementer les builds est automatise par EAS (`autoIncrement`).

## Login et App Store

- Le login actuel Emergent/Google affiche bien `FIT AI`.
- Pour App Store, ajouter un vrai bouton "Continuer avec Apple" si Google reste une option de creation de compte.
- Garder les cles et secrets uniquement cote backend, jamais dans l'app mobile.

## IA, depenses et limites

- Les appels Claude partent de la cle serveur `ANTHROPIC_API_KEY`.
- Les limites serveur disponibles :
  - `FITAI_AI_DAILY_LIMIT` : limite quotidienne par utilisateur.
  - `FITAI_AI_MONTHLY_LIMIT` : limite mensuelle par utilisateur.
  - `FITAI_AI_ESTIMATED_CENTS_PER_CALL` : estimation interne du cout.
  - `FITAI_ALGORITHM_ONLY=true` : coupe l'IA externe et privilegie les algorithmes internes.
- Endpoint de suivi : `GET /api/ai/usage`.
- Les recherches alimentaires utilisent d'abord la base interne. L'IA est appelee uniquement si aucun resultat local n'est trouve.

## Compatibilite mobile

- iOS : identifiant `com.globalaistudio.fitai`.
- Android : package `com.globalaistudio.fitai`.
- Permissions Android nettoyees : camera, images, activite physique, notifications.
- Achats in-app deja prevus via RevenueCat, avec les produits `fitai_premium_monthly` et `fitai_premium_annual`.

## Partage a des amis

- Avant publication : utiliser TestFlight pour iOS et une piste de test interne Google Play pour Android.
- Apres publication : partager le lien App Store/Google Play + un code coach ou parrainage.

## Affiliation coach

- Creer un code : `POST /api/affiliates`.
- Appliquer un code : `POST /api/affiliates/apply`.
- Voir ses codes : `GET /api/affiliates/me`.
- Voir les stats d'un code : `GET /api/affiliates/{code}/stats`.
- La commission reelle devra etre reliee aux evenements d'abonnement RevenueCat ou Stripe.

## Influenceurs musculation

- Preparer une page courte avec : promesse, captures, prix, lien de tracking, code personnel, commission.
- Donner un code unique par influenceur.
- Demander un test reel de 7 jours avant promotion.
- Prevoir un message de transparence publicitaire pour respecter les regles de partenariat.
