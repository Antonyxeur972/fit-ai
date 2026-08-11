"""Public legal pages for FIT AI.

These pages are served by the API so the Google Play listing and the mobile app
can point to the same stable, public URLs.
"""

import os
from html import escape


PUBLISHER = escape(
    os.environ.get("FITAI_LEGAL_PUBLISHER", "Global AI Studio incorporation").strip()
    or "Global AI Studio incorporation"
)
COUNTRY = escape(os.environ.get("FITAI_LEGAL_COUNTRY", "France").strip() or "France")
LAST_UPDATED = "10 août 2026"


def _layout(title: str, description: str, body: str, active: str = "") -> str:
    nav = [
        ("legal", "Centre juridique", "/legal"),
        ("privacy", "Confidentialité", "/privacy"),
        ("terms", "CGU", "/terms"),
        ("delete", "Supprimer mon compte", "/delete-account"),
    ]
    nav_html = "".join(
        f'<a class="nav-link {"active" if key == active else ""}" href="{href}">{label}</a>'
        for key, label, href in nav
    )
    return f"""<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="description" content="{escape(description)}" />
  <meta name="theme-color" content="#06150d" />
  <title>{escape(title)} · FIT AI</title>
  <style>
    :root {{ color-scheme: dark; --ink:#f5f7ef; --muted:#b8c4b9; --leaf:#b6ff3f; --line:rgba(255,255,255,.13); --surface:rgba(11,33,20,.86); }}
    * {{ box-sizing:border-box; }}
    html {{ scroll-behavior:smooth; }}
    body {{ margin:0; min-height:100vh; font-family:Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:#06150d; line-height:1.62; }}
    body:before {{ content:""; position:fixed; inset:0; z-index:-2; background:linear-gradient(180deg,rgba(4,18,11,.22),#06150d 68%), url('/legal-background') center/cover no-repeat; }}
    body:after {{ content:""; position:fixed; inset:0; z-index:-1; background:linear-gradient(90deg,rgba(2,12,7,.82),rgba(2,12,7,.40)); }}
    a {{ color:var(--leaf); }}
    .shell {{ width:min(980px,calc(100% - 32px)); margin:auto; }}
    header {{ padding:24px 0 12px; }}
    .brand {{ display:flex; align-items:center; gap:12px; color:#fff; text-decoration:none; font-weight:800; letter-spacing:.04em; }}
    .mark {{ width:42px; height:42px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.24); border-radius:50%; background:rgba(255,255,255,.08); color:var(--leaf); font-size:22px; }}
    nav {{ display:flex; gap:8px; overflow:auto; padding:18px 0 6px; scrollbar-width:none; }}
    .nav-link {{ flex:0 0 auto; padding:8px 11px; border-bottom:2px solid transparent; color:var(--muted); text-decoration:none; font-size:14px; }}
    .nav-link.active {{ color:#fff; border-color:var(--leaf); }}
    main {{ padding:46px 0 72px; }}
    .eyebrow {{ color:var(--leaf); text-transform:uppercase; font-size:12px; font-weight:800; letter-spacing:.12em; }}
    h1 {{ max-width:820px; margin:10px 0 14px; font-size:clamp(36px,7vw,66px); line-height:1.04; letter-spacing:0; }}
    .lead {{ max-width:720px; margin:0 0 32px; color:#d7dfd6; font-size:18px; }}
    .panel {{ margin:22px 0; padding:clamp(20px,4vw,34px); border:1px solid var(--line); border-radius:8px; background:var(--surface); backdrop-filter:blur(18px); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:14px; }}
    .tile {{ display:block; min-height:170px; padding:22px; border:1px solid var(--line); border-radius:8px; color:var(--ink); background:rgba(255,255,255,.055); text-decoration:none; transition:.18s ease; }}
    .tile:hover {{ transform:translateY(-2px); border-color:rgba(182,255,63,.55); }}
    .tile strong {{ display:block; margin:12px 0 6px; font-size:20px; }}
    .tile span, p, li {{ color:var(--muted); }}
    h2 {{ margin:34px 0 10px; font-size:25px; line-height:1.2; }}
    h3 {{ margin:24px 0 7px; font-size:18px; }}
    ul {{ padding-left:20px; }}
    .notice {{ padding:18px; border-left:3px solid var(--leaf); background:rgba(182,255,63,.08); }}
    .danger {{ border-left-color:#ff766f; background:rgba(255,118,111,.09); }}
    .meta {{ color:#91a095; font-size:13px; }}
    label {{ display:block; margin:15px 0 6px; color:#eef4ec; font-weight:700; }}
    input,select,textarea {{ width:100%; padding:13px 14px; border:1px solid rgba(255,255,255,.2); border-radius:6px; background:rgba(3,16,9,.82); color:#fff; font:inherit; }}
    textarea {{ min-height:110px; resize:vertical; }}
    .check {{ display:flex; align-items:flex-start; gap:10px; margin:18px 0; }}
    .check input {{ width:20px; height:20px; margin-top:3px; accent-color:var(--leaf); }}
    button,.button {{ display:inline-flex; align-items:center; justify-content:center; min-height:50px; padding:0 21px; border:0; border-radius:6px; background:var(--leaf); color:#102008; font-weight:850; font-size:15px; text-decoration:none; cursor:pointer; }}
    button:disabled {{ opacity:.55; cursor:wait; }}
    .secondary {{ border:1px solid rgba(182,255,63,.38); background:transparent; color:var(--leaf); }}
    #form-status {{ min-height:28px; margin-top:14px; color:#dbe5d9; }}
    footer {{ border-top:1px solid var(--line); padding:28px 0 44px; color:#91a095; font-size:13px; }}
    @media (max-width:600px) {{ main {{ padding-top:28px; }} .panel {{ margin-left:-4px; margin-right:-4px; }} }}
  </style>
</head>
<body>
  <header class="shell">
    <a class="brand" href="/legal"><span class="mark">◆</span><span>FIT AI</span></a>
    <nav aria-label="Navigation juridique">{nav_html}</nav>
  </header>
  <main class="shell">{body}</main>
  <footer><div class="shell">FIT AI est éditée par {PUBLISHER}, {COUNTRY}. · Mise à jour : {LAST_UPDATED}</div></footer>
</body>
</html>"""


def legal_home_html() -> str:
    return _layout(
        "Centre juridique",
        "Informations juridiques, confidentialité et suppression de compte FIT AI.",
        f"""
        <div class="eyebrow">Transparence FIT AI</div>
        <h1>Ton entraînement. Tes données. Tes choix.</h1>
        <p class="lead">Retrouve ici les règles qui encadrent FIT AI, la manière dont tes données de forme sont utilisées et les moyens de garder le contrôle sur ton compte.</p>
        <div class="grid">
          <a class="tile" href="/privacy"><span>01</span><strong>Confidentialité</strong><span>Données de santé, photos de repas, podomètre, IA et droits RGPD.</span></a>
          <a class="tile" href="/terms"><span>02</span><strong>Conditions d'utilisation</strong><span>Compte, abonnement, sécurité et responsabilités.</span></a>
          <a class="tile" href="/delete-account"><span>03</span><strong>Supprimer mon compte</strong><span>Suppression dans l'app ou demande depuis le Web.</span></a>
          <a class="tile" href="/privacy-request"><span>04</span><strong>Exercer mes droits</strong><span>Accès, rectification, portabilité ou opposition.</span></a>
        </div>
        <section class="panel">
          <h2>Une app de fitness, pas un dispositif médical</h2>
          <p>FIT AI fournit des estimations et recommandations de bien-être général. Elles ne remplacent ni diagnostic, ni traitement, ni conseil d'un professionnel de santé. En cas de douleur, malaise, grossesse, pathologie ou reprise après blessure, demande un avis médical adapté.</p>
        </section>
        """,
        "legal",
    )


def privacy_html() -> str:
    return _layout(
        "Politique de confidentialité",
        "Politique de confidentialité et traitement des données FIT AI.",
        f"""
        <div class="eyebrow">Politique de confidentialité</div>
        <h1>Des données utiles, jamais invisibles.</h1>
        <p class="lead">Cette politique explique quelles données FIT AI traite, pourquoi, pendant combien de temps et comment exercer tes droits. Responsable du traitement : {PUBLISHER}, {COUNTRY}.</p>
        <p class="meta">Version du {LAST_UPDATED}</p>

        <section class="panel">
          <h2>1. Données traitées</h2>
          <ul>
            <li><strong>Compte :</strong> nom, adresse e-mail, photo de profil et identifiant de connexion Google.</li>
            <li><strong>Profil de forme :</strong> âge (18 ans minimum), sexe renseigné, taille, poids, mensurations, niveau d'activité et objectifs.</li>
            <li><strong>Entraînement et bien-être :</strong> programmes, séances, exercices, charges, répétitions, récupération, sommeil saisi, hydratation, pas et activité.</li>
            <li><strong>Nutrition :</strong> repas, calories, macronutriments, favoris, recherches et photos de repas envoyées pour analyse.</li>
            <li><strong>Progression :</strong> poids, performances, adhérence et objectifs atteints.</li>
            <li><strong>Abonnement et usage :</strong> statut Premium, identifiants de produit, restauration d'achat, points, défis et diagnostics techniques essentiels.</li>
          </ul>

          <h2>2. Pourquoi nous les utilisons</h2>
          <p>Pour créer et ajuster ton programme, estimer tes besoins énergétiques, suivre ta progression, synchroniser les pas que tu choisis de partager, analyser les photos de repas demandées, sécuriser le compte, fournir l'abonnement et répondre à tes demandes.</p>
          <p>Les recommandations automatisées ont un rôle d'assistance fitness. Elles ne produisent pas de décision médicale ou juridique à ton égard.</p>

          <h2>3. Base légale et données de santé</h2>
          <p>L'exécution du service repose sur le contrat conclu lorsque tu acceptes les CGU. Les données relatives à la forme, au corps et au bien-être peuvent être sensibles : leur analyse repose sur ton consentement explicite lors de la création du programme. Tu peux retirer ce consentement en supprimant les données concernées ou ton compte. Certaines données minimales peuvent être conservées pour respecter une obligation légale ou défendre un droit.</p>

          <h2>4. Photos de repas, caméra et podomètre</h2>
          <p>FIT AI ouvre la caméra ou le sélecteur système uniquement après ton action. Seules les photos de repas que tu choisis pour une analyse sont envoyées au serveur et au prestataire d'IA. FIT AI ne parcourt pas ta galerie et ne propose pas de galerie de photos corporelles. Le podomètre est lu après autorisation ; seul le nombre de pas utile au suivi est synchronisé, sans localisation.</p>
          <p>Si tu déclenches la synchronisation d'agenda, FIT AI consulte la liste des calendriers uniquement pour trouver ou créer le calendrier FIT AI et y écrit les séances choisies. Le contenu de tes autres événements n'est pas envoyé à nos serveurs.</p>

          <h2>5. Destinataires</h2>
          <ul>
            <li>Google et le fournisseur d'authentification pour la connexion.</li>
            <li>Les prestataires d'hébergement et de base de données pour faire fonctionner FIT AI.</li>
            <li>Anthropic, lorsque tu déclenches une analyse IA de repas ou une recommandation compatible.</li>
            <li>Google Play, Apple et RevenueCat pour la vente, la restauration et la validation des abonnements.</li>
            <li>Expo pour la distribution technique des mises à jour de l'application.</li>
          </ul>
          <p>Nous ne vendons pas tes données personnelles et nous ne les utilisons pas pour de la publicité comportementale.</p>

          <h2>6. Durées de conservation</h2>
          <p>Les données du compte et de progression sont conservées tant que le compte reste actif, puis supprimées sur demande. Les détails et photos de repas sont automatiquement supprimés après 14 jours ; seul un résumé nutritionnel quotidien sans photo peut rester associé au suivi. Les jetons de session expirent après 7 jours. Les journaux d'usage IA sont limités à 12 mois. Les demandes relatives à la vie privée sont purgées au plus tard 6 mois après leur clôture. La disparition de copies de sauvegarde sécurisées peut prendre jusqu'à 90 jours.</p>
          <p>Après suppression du compte, Google Play, Apple et RevenueCat peuvent conserver les reçus et identifiants d'achat pseudonymes nécessaires à la gestion des abonnements, des remboursements, de la fraude et des obligations comptables selon leurs propres durées légales.</p>

          <h2>7. Sécurité et transferts</h2>
          <p>Les échanges utilisent HTTPS, les jetons sont stockés dans le stockage sécurisé du téléphone et l'accès aux données nécessite une session authentifiée. Certains prestataires peuvent traiter des données hors de l'Espace économique européen avec les garanties contractuelles applicables.</p>

          <h2>8. Tes droits</h2>
          <p>Tu peux demander l'accès, la rectification, l'effacement, la limitation, l'opposition ou la portabilité de tes données. Tu peux aussi saisir la CNIL. Utilise le <a href="/privacy-request">formulaire de confidentialité</a>. La suppression immédiate est disponible dans Profil › Confidentialité et compte.</p>

          <h2>9. Mineurs et évolutions</h2>
          <p>FIT AI est réservée aux personnes de 18 ans ou plus. Une modification importante de cette politique sera signalée dans l'app ou sur cette page avant son entrée en vigueur lorsque la loi l'exige.</p>
        </section>
        """,
        "privacy",
    )


def terms_html() -> str:
    return _layout(
        "Conditions générales d'utilisation",
        "Conditions générales d'utilisation et d'abonnement de FIT AI.",
        f"""
        <div class="eyebrow">Conditions générales</div>
        <h1>Un cadre clair pour progresser sereinement.</h1>
        <p class="lead">Les présentes conditions régissent l'utilisation de FIT AI, éditée par {PUBLISHER}, {COUNTRY}. En créant ton programme, tu confirmes avoir 18 ans et accepter ces conditions.</p>
        <p class="meta">Version du {LAST_UPDATED}</p>
        <section class="panel">
          <h2>1. Objet du service</h2>
          <p>FIT AI fournit des programmes d'entraînement, estimations nutritionnelles, outils de suivi, rappels, fonctions de gamification et recommandations assistées par IA. Le plan évolue à partir des informations que tu fournis ; il ne garantit pas un résultat physique précis.</p>

          <h2>2. Santé et sécurité</h2>
          <div class="notice danger"><strong>FIT AI n'est pas un dispositif médical.</strong> Les calories, la composition corporelle, la fatigue et les objectifs musculaires sont des estimations de bien-être général. Consulte un professionnel de santé avant de commencer si ta situation le nécessite. Arrête l'exercice en cas de douleur inhabituelle, vertige, gêne respiratoire ou malaise.</div>

          <h2>3. Compte</h2>
          <p>Tu dois fournir des informations exactes, protéger l'accès à ton compte et ne pas utiliser l'identité d'une autre personne. Tu peux corriger tes objectifs dans l'app et supprimer définitivement ton compte depuis le profil.</p>

          <h2>4. Abonnement Premium</h2>
          <p>L'accès au programme complet nécessite un abonnement. Le prix, la période de facturation et l'éventuel essai sont affichés sur le paywall et confirmés par Google Play ou l'App Store avant achat. Sauf résiliation, l'abonnement se renouvelle automatiquement à chaque période. Tu peux annuler dans les réglages d'abonnement de la boutique ; l'accès reste actif jusqu'à la fin de la période déjà payée. Les remboursements et droits de rétractation suivent la loi applicable et les règles de la boutique.</p>
          <p>Les promotions d'abonnement sont créées et appliquées par Google Play ou l'App Store. Les codes coach servent uniquement à attribuer un partenaire et ne débloquent pas l'accès payant. Le prix affiché par la boutique au moment de la confirmation prévaut.</p>

          <h2>5. Utilisation acceptable</h2>
          <p>Il est interdit de contourner le paywall, perturber le service, extraire massivement les contenus, introduire un code malveillant, revendre un accès ou utiliser FIT AI d'une manière illégale ou dangereuse.</p>

          <h2>6. Contenus et propriété intellectuelle</h2>
          <p>Tu conserves tes droits sur les photos de repas et informations que tu fournis et nous autorises à les traiter uniquement pour fournir les fonctions demandées. L'interface, la marque, les programmes éditoriaux, illustrations et logiciels FIT AI restent protégés.</p>

          <h2>7. Disponibilité et responsabilité</h2>
          <p>Nous cherchons à maintenir un service fiable, mais une maintenance, une indisponibilité de réseau, de boutique ou de prestataire peut interrompre certaines fonctions. Dans les limites permises par la loi, FIT AI n'est pas responsable d'une mauvaise exécution d'exercice, d'informations inexactes fournies par l'utilisateur ou d'un usage contraire aux avertissements de sécurité.</p>

          <h2>8. Suspension, suppression et évolution</h2>
          <p>Un compte peut être suspendu en cas de fraude, risque pour la sécurité ou violation grave. Tu peux résilier l'abonnement dans la boutique et supprimer le compte séparément. Les conditions peuvent évoluer ; les changements importants seront présentés avant leur application lorsque nécessaire.</p>

          <h2>9. Droit applicable</h2>
          <p>Ces conditions sont soumises au droit français, sans priver un consommateur des protections impératives de son pays de résidence. Pour toute demande, utilise le <a href="/privacy-request?type=other">formulaire de contact</a>.</p>
        </section>
        """,
        "terms",
    )


def delete_account_html() -> str:
    return _layout(
        "Suppression de compte",
        "Supprimer un compte FIT AI et les données associées.",
        """
        <div class="eyebrow">Contrôle du compte</div>
        <h1>Supprimer ton compte FIT AI.</h1>
        <p class="lead">La méthode la plus rapide se trouve dans l'app. Si tu n'y as plus accès, utilise la demande Web ci-dessous.</p>
        <section class="panel">
          <h2>Depuis l'application</h2>
          <ol>
            <li>Ouvre <strong>Profil</strong>.</li>
            <li>Choisis <strong>Confidentialité et compte</strong>.</li>
            <li>Appuie sur <strong>Supprimer mon compte et mes données</strong>, puis confirme.</li>
          </ol>
          <div class="notice danger"><strong>Action définitive.</strong> Le profil, les mensurations, repas, photos de repas, pas, séances, performances, programmes, défis et préférences sont supprimés. La suppression du compte n'annule pas automatiquement un abonnement : résilie-le aussi dans Google Play ou l'App Store.</div>
          <h2>Sans accès à l'application</h2>
          <p>Envoie une demande avec l'adresse e-mail utilisée pour FIT AI. Une vérification d'identité pourra être demandée. La demande est traitée dans un délai maximal de 30 jours, sauf obligation légale contraire.</p>
          <a class="button" href="/privacy-request?type=deletion">Demander la suppression</a>
          <h2>Données éventuellement conservées</h2>
          <p>Seules des preuves minimales imposées par la loi, la prévention de fraude ou la gestion d'un litige peuvent être conservées pendant la durée nécessaire. Les reçus d'achat sont gérés séparément par Google Play ou Apple.</p>
        </section>
        """,
        "delete",
    )


def privacy_request_html(default_type: str = "other") -> str:
    request_type = default_type if default_type in {"access", "rectification", "portability", "objection", "deletion", "other"} else "other"
    options = "".join(
        f'<option value="{value}" {"selected" if value == request_type else ""}>{label}</option>'
        for value, label in [
            ("access", "Accéder à mes données"),
            ("rectification", "Rectifier mes données"),
            ("portability", "Recevoir une copie portable"),
            ("objection", "Limiter ou refuser un traitement"),
            ("deletion", "Supprimer mon compte et mes données"),
            ("other", "Autre demande"),
        ]
    )
    return _layout(
        "Demande de confidentialité",
        "Formulaire d'exercice des droits sur les données FIT AI.",
        f"""
        <div class="eyebrow">Tes droits</div>
        <h1>Parlons de tes données.</h1>
        <p class="lead">Utilise l'adresse e-mail associée à FIT AI. Nous ne confirmerons jamais publiquement si un compte existe et pouvons demander une vérification d'identité.</p>
        <section class="panel">
          <form id="privacy-form">
            <label for="email">Adresse e-mail du compte</label>
            <input id="email" name="email" type="email" autocomplete="email" maxlength="254" required />
            <label for="request_type">Type de demande</label>
            <select id="request_type" name="request_type">{options}</select>
            <label for="message">Précisions utiles <span class="meta">(facultatif)</span></label>
            <textarea id="message" name="message" maxlength="1500"></textarea>
            <input id="website" name="website" type="text" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true" />
            <label class="check"><input id="confirmation" type="checkbox" required /><span>Je confirme être la personne concernée ou son représentant autorisé, et comprendre qu'une vérification peut être nécessaire.</span></label>
            <button id="submit" type="submit">Envoyer la demande</button>
            <p id="form-status" role="status" aria-live="polite"></p>
          </form>
        </section>
        <script>
          const form = document.getElementById('privacy-form');
          const button = document.getElementById('submit');
          const status = document.getElementById('form-status');
          form.addEventListener('submit', async (event) => {{
            event.preventDefault();
            button.disabled = true;
            status.textContent = 'Envoi sécurisé en cours…';
            try {{
              const response = await fetch('/api/privacy-requests', {{
                method: 'POST',
                headers: {{ 'Content-Type': 'application/json' }},
                body: JSON.stringify({{
                  email: document.getElementById('email').value,
                  request_type: document.getElementById('request_type').value,
                  message: document.getElementById('message').value,
                  website: document.getElementById('website').value,
                  confirmation: document.getElementById('confirmation').checked
                }})
              }});
              const data = await response.json();
              if (!response.ok) throw new Error(data.detail || 'La demande n’a pas pu être envoyée.');
              form.reset();
              status.textContent = `Demande reçue. Référence : ${{data.request_id}}. Conserve-la pour le suivi.`;
            }} catch (error) {{
              status.textContent = error.message || 'Une erreur est survenue. Réessaie plus tard.';
            }} finally {{ button.disabled = false; }}
          }});
        </script>
        """,
        "delete" if request_type == "deletion" else "privacy",
    )
