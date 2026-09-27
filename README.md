# PH@NON EVENT — SaaS pour photographes, vidéastes et organisateurs d'événements

Cycle géré : **Client → Événement → Devis → Contrat → Paiement → Production → Livraison**, plus Planning, Paramètres et Abonnements (paiement CinetPay).

## Ce qui est inclus dans ce code
- Authentification (inscription/connexion) via Supabase.
- Base PostgreSQL avec RLS : chaque utilisateur ne voit que ses propres données.
- Clients, Événements (avec statut et lieu), Paiements manuels des prestations.
- **Devis** : création de prestations ligne par ligne, total automatique, statut (brouillon/envoyé/accepté), **aperçu et export PDF** (impression navigateur, aucune dépendance externe).
- **Contrats** : génération à partir de 3 modèles (Mariage, Anniversaire, Prestation générale), fusion automatique avec les données client/événement/profil, aperçu et export PDF, suivi du statut (brouillon/envoyé/signé).
- **Livraison** : enregistrement d'un lien (Google Drive, WeTransfer…) par événement, partage direct par WhatsApp.
- **Planning** : calendrier mensuel des événements.
- **Paramètres** : profil professionnel (nom, téléphone, adresse) utilisé sur les devis/contrats.
- **Abonnements** : paiement CinetPay (starter/pro/studio), activé uniquement après vérification serveur du paiement (jamais par simple redirection navigateur).

## Ce que je n'ai pas pu faire moi-même, et pourquoi
Je n'ai pas d'accès réseau depuis cet environnement de travail, et je n'ai ni vos identifiants Supabase/CinetPay ni le pouvoir de créer un compte marchand en votre nom (CinetPay exige une vérification d'identité/entreprise). Je ne peux donc pas :
- créer le projet Supabase ni le compte marchand CinetPay,
- déployer le site sur un domaine public,
- lancer de vraies transactions de test.

Tout le code est prêt : il vous suffit de suivre les étapes ci-dessous (environ 20-30 minutes) pour que la plateforme soit en ligne et testable par vos professionnels.

## 1. Créer et connecter Supabase (10 min)
1. Allez sur https://supabase.com → **New project**. Notez le mot de passe base de données.
2. Dans **SQL Editor**, collez tout le contenu de `supabase/schema.sql` et exécutez-le (une seule fois).
3. Dans **Authentication → Providers**, vérifiez qu'*Email* est activé.
4. Dans **Authentication → URL Configuration**, renseignez votre future URL de production (ex. `https://phanon-event.vercel.app`) en *Site URL* et en *Redirect URLs*.
5. Dans **Project Settings → API**, copiez : `Project URL`, `anon public key`, `service_role key` (secrète, jamais côté navigateur).

## 2. Créer le compte marchand CinetPay (peut prendre plus longtemps — vérification KYC)
1. Créez un compte sur https://cinetpay.com et complétez la vérification de votre entreprise (obligatoire pour encaisser en XOF).
2. Dans le tableau de bord CinetPay, récupérez **API KEY** et **SITE ID**.
3. Une fois le site déployé (étape 3), renseignez dans CinetPay :
   - URL de notification : `https://VOTRE-DOMAINE/api/webhook`
   - URL de retour : `https://VOTRE-DOMAINE/payment-return`

## 3. Déployer sur Vercel (5 min)
1. Créez un dépôt Git (GitHub/GitLab) et poussez ce dossier.
2. Sur https://vercel.com, **Add New Project**, importez le dépôt.
3. Dans **Environment Variables**, ajoutez :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CINETPAY_API_KEY`
   - `CINETPAY_SITE_ID`
   - `NEXT_PUBLIC_SITE_URL` (l'URL Vercel finale, en `https://`)
4. Déployez. Revenez ensuite mettre à jour, si besoin, `NEXT_PUBLIC_SITE_URL` et les URLs Supabase/CinetPay avec le domaine définitif.

## 4. Développement local (optionnel)
```
npm install
cp .env.example .env.local   # puis renseignez les valeurs
npm run dev
```

## 5. Checklist de test de bout en bout (avant d'ouvrir aux professionnels)
- [ ] Inscription d'un compte test, connexion, déconnexion.
- [ ] Ajout d'un client, d'un événement (avec lieu et montant).
- [ ] Création d'un devis à plusieurs lignes → aperçu PDF → impression/enregistrement PDF correct.
- [ ] Génération d'un contrat (les 3 modèles) → vérifier que les données client/événement/profil sont bien fusionnées.
- [ ] Enregistrement d'un paiement manuel (Wave, Orange Money…) → le "reste à encaisser" se met à jour.
- [ ] Enregistrement d'une livraison → le lien WhatsApp s'ouvre avec le bon message.
- [ ] Vérification du calendrier Planning sur plusieurs mois.
- [ ] Paramètres : modification du profil, vérifier qu'il apparaît sur un nouveau devis/contrat.
- [ ] **Abonnement** : lancer un paiement CinetPay réel de faible montant (ou mode test si CinetPay vous l'autorise), vérifier que la formule ne s'active qu'après confirmation serveur (`/api/webhook`), pas au simple retour navigateur.
- [ ] Renvoyer deux fois la même notification CinetPay (rejouer le webhook) → vérifier qu'aucun doublon n'est créé (idempotence déjà gérée en base).
- [ ] Créer un deuxième compte utilisateur → vérifier qu'il ne voit aucune donnée du premier (isolation RLS).
- [ ] Tester sur mobile (le design s'adapte automatiquement).

## Précautions
- Le paiement d'abonnement n'est activé **qu'après vérification serveur** auprès de CinetPay.
- `SUPABASE_SERVICE_ROLE_KEY` et `CINETPAY_API_KEY` restent côté serveur uniquement.
- Le module « paiements des événements » est un registre manuel : il n'encaisse pas automatiquement les clients de vos utilisateurs.
- L'abonnement couvre 30 jours par achat ; ce n'est pas un prélèvement automatique récurrent.
- Avant ouverture publique : ajouter limitation de requêtes, politique de confidentialité, conformité locale, sauvegardes régulières.
