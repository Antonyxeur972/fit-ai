# FIT AI - dossier de conformité Google Play

Dernière mise à jour : 10 août 2026

## URLs publiques à déclarer

- Centre juridique : `https://fit-ai-4ujg.onrender.com/legal`
- Politique de confidentialité : `https://fit-ai-4ujg.onrender.com/privacy`
- Conditions d'utilisation : `https://fit-ai-4ujg.onrender.com/terms`
- Suppression de compte : `https://fit-ai-4ujg.onrender.com/delete-account`
- Exercice des droits : `https://fit-ai-4ujg.onrender.com/privacy-request`

Ces URLs ne seront actives qu'après déploiement du backend contenant les nouvelles routes.

## Déclarations Play Console recommandées

### Santé

Dans « Contenu de l'application > Applications de santé », déclarer :

- Activité et fitness ;
- Nutrition et gestion du poids.

FIT AI n'est pas un dispositif médical, ne pose pas de diagnostic et ne fournit pas de traitement. Cette mention figure dans l'app, les CGU et le centre juridique.

### Audience

- Cible : 18 ans et plus.
- Ne pas sélectionner les tranches d'âge enfants.
- Aucun contenu publicitaire destiné aux enfants.

### Accès à l'application

L'app est protégée par une connexion et un paywall. Un accès réservé aux examinateurs est disponible depuis « Accès examen Google Play » sur l'écran de connexion :

- identifiant stable : `fitai-google-review` ;
- mot de passe réutilisable : enregistré uniquement dans la déclaration privée Play Console ;
- accès Premium sans achat, sans essai et sans validation en deux étapes ;
- profil de démonstration adulte préconfiguré.

Le dépôt contient seulement le condensat SHA-256 du mot de passe. Pour faire tourner les identifiants sans modifier le code, définir `FITAI_PLAY_REVIEW_USERNAME` et `FITAI_PLAY_REVIEW_PASSWORD_HASH` côté serveur, puis mettre à jour la déclaration Play Console.

### Abonnements

- Produits Google Play Billing : `fitai_premium_monthly` et `fitai_premium_annual`.
- Configurer dans Play Console les offres correspondant exactement aux essais annoncés : 3 jours pour le mensuel et 7 jours pour l'annuel, ou retirer ces mentions de l'app.
- Le prix, la période, l'essai, le renouvellement automatique et la résiliation sont visibles avant achat.
- La restauration des achats est disponible.
- Le profil ouvre le centre de gestion des abonnements Google Play.
- Les achats numériques ne doivent jamais contourner Google Play Billing.
- Les promotions Android doivent être créées dans Play Console et appliquées dans la fenêtre Google Play ; aucun code local ne débloque l'abonnement.

## Brouillon Data safety

Répondre à partir des données réellement activées en production et des contrats prestataires. FIT AI traite actuellement :

| Catégorie Google | Données | Finalité principale | Facultatif | Suppression |
| --- | --- | --- | --- | --- |
| Informations personnelles | nom, e-mail, photo de profil, identifiant utilisateur | compte et authentification | compte requis | oui |
| Santé et fitness | âge, taille, poids, mensurations, objectif, activité, pas, sommeil, hydratation, performances | personnalisation et suivi | certaines mesures sont facultatives | oui |
| Photos | photos de repas choisies par l'utilisateur | analyse nutritionnelle demandée | oui | oui |
| Activité dans l'app | séances, exercices, repas, défis, points, préférences | fonctions de l'app et adaptation du plan | non pour le service principal | oui |
| Informations financières | statut et produit d'abonnement | achat, restauration et contrôle d'accès | abonnement requis | selon obligations Store |
| Identifiants | identifiant de compte et identifiant d'achat | sécurité, session et abonnement | non | oui |

- Données chiffrées en transit : oui, via HTTPS.
- Suppression dans l'app : oui, Profil > Confidentialité et compte.
- Suppression hors app : oui, URL publique ci-dessus.
- Vente de données : non.
- Publicité comportementale : non.
- Localisation : non collectée.
- Contacts, micro, historique d'appels et SMS : non collectés.

Prestataires à prendre en compte dans la déclaration : Google/authentification, Anthropic, hébergement/base de données, RevenueCat, Google Play, Apple et Expo. Vérifier dans Data safety si chaque transfert relève d'un « partage » ou d'un prestataire agissant pour le compte de l'éditeur.

## Permissions Android attendues

- `CAMERA` : photo de repas ou fond de carte de partage, uniquement après une action de l'utilisateur.
- `ACTIVITY_RECOGNITION` : nombre de pas, sans localisation.
- `POST_NOTIFICATIONS` : rappels de séances, motivation et offres annoncées avant la demande système.
- `READ_CALENDAR` et `WRITE_CALENDAR` : uniquement après l'action « Synchroniser », pour trouver/créer le calendrier FIT AI et ajouter les séances. Les autres événements ne quittent pas le téléphone.

Les permissions générales de lecture de galerie, vidéo, audio, stockage externe, micro et superposition système sont bloquées. Le sélecteur système permet à l'utilisateur de choisir seulement une photo de repas ou un fond de partage. Les photos corporelles d'évolution ne sont plus proposées. La sauvegarde Android de l'app est désactivée afin d'éviter la restauration de données supprimées.

## Points à finaliser avant envoi en examen

- [x] Éditeur déclaré : `Global AI Studio incorporation` (valeur par défaut de `FITAI_LEGAL_PUBLISHER`).
- [ ] Organiser le traitement des demandes enregistrées dans `privacy_requests` sous 30 jours.
- [x] Package `com.globalaistudio.fitai` enregistré dans la validation développeur Android.
- [ ] Créer et activer les deux abonnements dans Play Console.
- [ ] Faire correspondre exactement prix, périodes et essais entre Play Console, RevenueCat et le paywall.
- [ ] Configurer `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` dans EAS et vérifier l'entitlement Premium.
- [x] Compléter les déclarations Publicité, Gouvernement, Fonctionnalités financières et Applications de santé.
- [ ] Finaliser Data safety après Cible et contenu.
- [ ] Finaliser Audience 18+, Accès à l'application et Classification du contenu avec le nouveau build d'examen.
- [ ] Importer l'AAB signé puis réaliser un test interne complet sur un appareil Android physique.
- [ ] Si le compte Play personnel est concerné, terminer le test fermé requis avec au moins 12 testeurs inscrits pendant 14 jours consécutifs avant la demande d'accès à la production.
- [ ] Vérifier que les captures, l'icône, la courte description et la description complète ne promettent aucun résultat médical ou garanti.
