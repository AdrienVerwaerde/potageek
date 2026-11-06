# 🎃 Potageek

**Potageek veille sur notre serre.** Un petit boîtier ESP32, posé entre les plants, mesure la température et l'humidité de l'air toutes les 5 secondes. L'app les affiche en direct sur le téléphone, garde la trace de ce qui s'est passé, et nous prévient dès qu'un seuil est franchi trop longtemps : une serre qui chauffe au-delà de 30 °C empêche la pollinisation des tomates, sous 12 °C la croissance s'arrête, et au-dessus de 85 % d'humidité le mildiou s'installe.

Depuis l'app, on peut aussi allumer la LED du boîtier à distance, régler les seuils d'alerte, et tout continue de fonctionner sans réseau : ce qui a été mesuré reste lisible, et les ordres partent dès que la connexion revient.

```
boîtier ESP32  →  broker MQTT (TLS)  →  backend  →  app mobile
 température        sentinelle/…         Node        Expo
 humidité                                SQLite      Android
 LED                                     REST + WebSocket + push
```

```
backend/   Node 22.13+ · node:sqlite · MQTT → REST + WebSocket · push Expo · Sentry
app/       Expo SDK 57 · tableau de bord temps réel · journal · réglages · mode hors ligne
```

## Ce que fait Potageek

### Dans l'app, écran par écran

**Accueil**

- Les 5 derniers événements de la serre, et un raccourci vers le contrôle du capteur.

**Contrôle Capteur**

- **L'état du boîtier, sans mentir** : « En direct », « Capteur hors ligne depuis N min », ou « Dernier état connu » quand c'est le téléphone qui est coupé. Jamais un point vert ressorti du cache.
- **La dernière mesure** et son heure, en heure locale (tout reste en UTC jusqu'à l'affichage).
- **Une fenêtre glissante au choix** : 10 min, 1 h ou 3 h, avec des boutons en forme de citrouille.
- **Deux courbes**, température et humidité, une par unité plutôt qu'un graphique à deux axes. Elles avancent à chaque mesure reçue, se coupent là où des mesures manquent, s'atténuent quand elles viennent du cache. Un appui-glissé affiche la valeur et l'heure du point le plus proche.
- **Les alertes en cours** (Max-Temp, Min-Temp, Max-Hum, Min-Hum), avec la valeur et le seuil.
- **Le bouton LED** répond tout de suite : l'état demandé s'affiche en pointillé, « en attente » puis « envoyée », jusqu'à ce que le boîtier confirme ; si la commande échoue, le bouton revient en arrière avec un message.

**Journal**

- Toute l'histoire récente de la serre dans une seule liste : alertes et retours à la normale, boîtier en ligne / hors ligne, commandes LED et seuils avec leur statut (et la mention « rejouée » quand il a fallu insister), et les coupures du téléphone lui-même.
- Chaque ligne porte un symbole (`!`, `✓`, `…`, `·`) en plus de sa couleur.

**Réglages**

- **Connexion / déconnexion.** Regarder la serre ne demande aucun compte ; allumer la LED et modifier les seuils, si. Le jeton de session est rangé dans le Keychain / Keystore du téléphone (`expo-secure-store`).
- **Les seuils de la serre** (températures et humidités min / max, et le temps de maintien avant alerte) : vérifiés dans l'app avec les mêmes règles que le serveur, modifiables hors ligne. Un champ vide = borne non surveillée.
- **Les alertes sur ce téléphone** : la permission de notifier n'est demandée qu'au moment où l'on active l'interrupteur.
- **Un bouton de crash de test** pour Sentry, qui n'existe que si `EXPO_PUBLIC_SENTRY_CRASH_TEST=true`.

### Partout dans l'app

- **Une bannière réseau honnête** : « Hors ligne · dernières données à 14h02 », ou « Reconnexion · prochaine tentative dans N s ». Elle ne bloque jamais l'écran.
- **Le mode hors ligne** : les 3 dernières heures de mesures, le journal, les seuils et l'état du boîtier sont gardés sur le téléphone (SQLite). L'écran s'affiche depuis ce cache avant même d'interroger le réseau ; au retour de la connexion, seule la tranche manquante est rechargée.
- **Une file de commandes** : LED et seuils modifiés hors ligne partent au retour du réseau, dans l'ordre, sans jamais être exécutés deux fois, avec des essais de plus en plus espacés, et sont abandonnés après 5 échecs.
- **La batterie ménagée** : la connexion temps réel est fermée quand l'app passe en arrière-plan, et rouverte au retour avec un rattrapage de ce qui a été manqué.
- **Des alertes même app fermée**, par notification push envoyée par le serveur ; et une notification quand le boîtier ne répond plus depuis 3 minutes.
- **Les crashs remontés à Sentry**, et des **mises à jour à distance** (`eas update`) sans réinstaller l'app.
- **Thème clair / sombre**, formats français (`22,4 °C`, `14h02`), libellés d'accessibilité et contrastes vérifiés ; un état n'est jamais porté par la couleur seule.

### Côté serveur

- **Il écoute le boîtier en MQTT chiffré (TLS)** : mesures (`telemetry`), présence (`status`) et état réel de la LED (`state`). Un message mal formé est ignoré, jamais fatal.
- **Il se souvient de tout** dans une base SQLite (`node:sqlite`) : mesures, boîtiers, seuils, événements, commandes, téléphones à prévenir.
- **Il agrège l'historique en SQL** : une moyenne par tranche de `step` secondes, sans charger des milliers de lignes en mémoire.
- **Il juge les seuils** : une seule alerte par dépassement, seulement s'il dure, et un retour à la normale quand ça s'arrange.
- **Il remarque le silence** : un boîtier muet depuis 15 s passe hors ligne, et l'app le voit tout de suite.
- **Il pilote la LED sans doublon**, attend la confirmation du boîtier, et déclare la commande en échec après 30 s sans réponse.
- **Il pousse tout en temps réel** par WebSocket, et **envoie les alertes en push** par l'API Expo Push.
- **Il est fermé à clé** : jeton obligatoire pour toute action, mot de passe haché, limites de débit, CORS strict, et refus de démarrer s'il lui manque un secret.

## Lancer Potageek

Il faut Node **22.13 ou plus** (`node -v`), et un `.env` copié depuis `.env.example` dans `backend/` et dans `app/`.

```bash
cd backend && npm install && npm start
cd app && npm install && npx expo start
```

En développement, `npm run dev` relance le backend à chaque modification.

Dans `app/.env`, `EXPO_PUBLIC_API_URL` doit pointer vers l'**IP de l'ordinateur** qui fait tourner le backend, pas `localhost` : le téléphone n'est pas l'ordinateur.

Le backend refuse de démarrer sans ses secrets d'authentification. On les génère une fois, dans `backend/` :

```bash
npm run hash-password -- '<mot de passe>'                                       # → AUTH_PASSWORD_HASH
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # → JWT_SECRET
```

Pour vérifier que tout va bien :

```bash
cd backend && npm test              # la logique des seuils (Jest, base en mémoire)
cd app && npm test                  # la file de commandes (Jest, sans téléphone)
cd backend && npm run sentry-test   # envoie une erreur de test à Sentry
```

## L'API

```
POST /auth/login                                ← { "username", "password" }
     → 200 { "token", "expiresAt" }     JWT HS256, 15 min · 401 si identifiants faux

POST   /push-tokens                             ← { "token": "ExponentPushToken[…]" }   🔒 Bearer
DELETE /push-tokens                             ← même objet                              🔒 Bearer
     → 204 · 400 si ce n'est pas un jeton Expo · enregistrer deux fois le même jeton ne fait rien

GET  /devices                                   → [{ id, group, status, lastSeen, led }]
GET  /devices/:id/measurements?from=&to=&step=  → [{ ts, t, h }]
GET  /devices/:id/thresholds                    → { tMin, tMax, hMin, hMax, holdMinutes }
PUT  /devices/:id/thresholds                    ← même objet          🔒 Authorization: Bearer <token>
     → 400 si : t hors [-10, 50] °C · h hors [0, 100] % · tMin ≥ tMax · hMin ≥ hMax
                holdMinutes hors [0, 1440] · une borne à null n'est pas surveillée
GET  /devices/:id/events?from=&to=&limit=       → [{ eventId, device, ts, type, ...payload }]
     du plus ancien au plus récent · sans from : les `limit` derniers (200 par défaut, 1000 max)
     avec from : depuis from inclus, dédoublonner sur eventId
     type : alert | alert_cleared | status | command | command_status
POST /devices/:id/commands                      ← { "id": "c-7f3a…", "led": true }   🔒 Bearer
     → 202 { "id", "status": "sent" }   première fois : publié sur …/cmd
     → 200 { "id", "status" }           id déjà vu : rien n'est republié
     → 409                              id déjà vu pour un autre boîtier ou un autre état

WS   measurement    { device, ts, t, h }
     alert          { device, ts, kind, value, threshold }
     alert_cleared  { device, ts, kind }
     device_status  { device, status }
     device_state   { device, led }                 état réel publié par le boîtier
     command_status { id, device, status: "acked" } la dernière commande en attente est confirmée
     command_status { id, device, status: "failed", reason: "timeout" }
                    aucun état reçu du boîtier 30 s après l'envoi ; un rejeu de cet id répond 200 "failed"
```

Tous les `ts` sont en secondes epoch, UTC.

🔒 : sans jeton valide → **401**. Au-delà de la limite de débit → **429**. Les lectures (`GET`, WebSocket) restent ouvertes.

## Nos choix côté serveur

### Une commande n'est jamais exécutée deux fois

L'app choisit l'`id` de chaque commande, et le backend le garde en base (table `commands`) : un `id` déjà vu n'est jamais republié vers le boîtier, même après un redémarrage du serveur. L'app peut donc renvoyer une commande sans risque, autant de fois qu'il le faut.

Une commande décrit l'état voulu (`"led": true`), jamais une bascule : envoyer deux fois le même ordre laisse la LED au même endroit.

Un `id` réutilisé pour un autre boîtier ou un autre état répond **409** plutôt que 200 : c'est un bug de l'app, pas un renvoi, et le masquer le rendrait introuvable.

### C'est le boîtier qui confirme

Le backend écoute `…/<boîtier>/state`. À chaque état reçu, il note l'état de la LED et confirme (`acked`) la **dernière** commande en attente, à une condition : **que la LED soit vraiment dans l'état demandé**. Le message envoyé au démarrage du boîtier (LED éteinte) ne confirme donc pas une demande d'allumage en attente.

Un état **retenu** (retain), que le broker rejoue à chaque reconnexion du backend, met à jour la LED mais ne confirme rien : c'est le broker qui parle, pas le boîtier qui répond.

### Une commande sans réponse finit en échec

Une commande sans réponse du boîtier après **30 s** passe en `failed`. Un boîtier branché répond en une seconde environ ; 30 s laissent de la marge sans laisser l'app afficher « en attente » pour toujours. Seule l'horloge peut décider de l'échec : aucun message du boîtier ne dit « je n'ai rien reçu ».

Limite assumée : une commande partie pendant que le boîtier est débranché passe en `failed`, même si la LED finit par s'allumer à son retour. L'état réel reste visible (`device_state`, `GET /devices`).

### Seuils : la dernière modification gagne

`PUT /thresholds` remplace les seuils en entier, sans comparer de version. Si deux téléphones les modifient hors ligne, celui qui atteint le serveur en dernier l'emporte. Les seuils d'une serre changent rarement, et c'est la même personne qui s'en occupe : un conflit est peu probable, et le dernier choix est le plus pertinent.

Les valeurs par défaut sont celles d'une serre de tomates : 12 à 30 °C, 60 à 85 % d'humidité, 20 minutes de maintien avant alerte, parce que démarrer l'arrosage pour rien coûte plus cher que d'être prévenu quelques minutes plus tard. Les bornes plausibles (-10 à 50 °C, 0 à 100 %) arrêtent les fautes de frappe (300 pour 30,0), qui feraient sonner l'alerte en permanence ou jamais.

### Le journal

`GET /devices/:id/events` renvoie les alertes, les retours à la normale, les passages en ligne / hors ligne et chaque commande avec son statut. Avec `from`, l'app ne recharge que ce qui lui manque. `from` est inclus, parce que plusieurs événements peuvent tomber dans la même seconde : l'app dédoublonne sur `eventId`.

Un passage en ligne / hors ligne n'est noté que s'il change vraiment : le broker rejoue le dernier statut à chaque reconnexion, et ce n'est pas un événement.

## La sécurité

**Un seul compte, un jeton court.** `POST /auth/login` délivre un JWT HS256 valable 15 minutes. Rien ne permet de révoquer un jeton : c'est sa durée courte qui limite la vie d'un jeton volé. Le mot de passe n'est stocké nulle part, ni en base ni dans `.env` : seul son hachage scrypt (`AUTH_PASSWORD_HASH`) y figure, si bien qu'un `.env` qui fuit ne livre pas l'identifiant. La comparaison se fait en temps constant, et un nom d'utilisateur faux prend autant de temps qu'un mot de passe faux : le chronomètre ne dit pas lequel était bon.

**Toute action exige le jeton.** `POST /commands`, `PUT /thresholds` et `POST /push-tokens` répondent 401 sans `Authorization: Bearer <token>` valide. L'algorithme est imposé à la vérification (`HS256`) : accepter celui qu'annonce le jeton lui-même, c'est laisser passer les jetons `alg: none`. Chaque commande est journalisée avec son auteur.

**Les lectures restent ouvertes, et c'est un choix.** Le tableau de bord, l'historique et le WebSocket montrent des relevés de serre, pas de quoi piloter quoi que ce soit, et c'est ce que l'app affiche avant toute connexion. Risque résiduel : qui connaît l'adresse du serveur peut lire les mesures.

**Des limites de débit**, par IP et par minute : 10 commandes, 10 modifications de seuils, 5 tentatives de connexion. Une LED basculée plus de dix fois par minute, c'est un script, pas une personne ; cinq essais par minute rendent la devinette de mot de passe impraticable.

**Un CORS strict** : seules les origines listées dans `CORS_ORIGINS` reçoivent les en-têtes CORS. CORS n'est appliqué que par les navigateurs : l'app native et `curl` n'envoient pas d'`Origin`. Ce qui protège vraiment les actions, c'est le jeton.

**Pas de démarrage à moitié sécurisé.** S'il manque un secret, ou si `JWT_SECRET` fait moins de 32 caractères, le serveur refuse de démarrer plutôt que de tourner porte ouverte. Le corps des requêtes est plafonné à 10 ko, et l'en-tête `X-Powered-By` est retiré.

**Vers le broker**, la connexion MQTT vérifie le certificat TLS (comportement par défaut de `mqtt.js`, jamais désactivé), avec un identifiant propre au backend, distinct de celui du boîtier.

**Rien de secret dans l'app.** Elle ne connaît que l'adresse du serveur ; son jeton est dans le stockage sécurisé du téléphone, jamais dans un fichier lisible.

## Nos choix côté app

### Ce que le téléphone garde, et jusqu'où

Le cache local (SQLite, `expo-sqlite`) n'est pas une copie du serveur : c'est ce dont on a besoin quand on est coupé du réseau. Les tables `measurements`, `devices`, `thresholds` et `events`, plus la file de commandes, le journal des coupures et les préférences.

Les mesures sont gardées sur **la fenêtre la plus large que le tableau de bord sait afficher (3 h)**, plutôt qu'une durée ronde choisie à part : garder plus, ce serait garder ce qu'aucun écran ne peut dessiner ; garder moins ferait un trou dans la courbe hors ligne. À une mesure toutes les 5 s, cela fait environ 2 160 lignes : une courbe qui vaut la peine d'être ouverte au fond du jardin, et une table assez petite pour être relue d'un coup au démarrage.

Le ménage se fait au lancement de l'app et après chaque rattrapage, pas à chaque mesure : un `DELETE` toutes les 5 secondes coûterait bien plus que les quelques lignes qu'il récupère.

### Afficher d'abord, rafraîchir ensuite

À l'ouverture, l'écran se dessine depuis le cache avant de solliciter le réseau, puis la connexion temps réel remplace ce qu'elle peut. En mode avion, elle ne répond jamais, et l'écran est quand même là : c'est tout l'intérêt. Aucun écran blanc n'attend le réseau.

### Ne recharger que ce qui manque

Au retour du réseau, l'app ne redemande que la tranche qui suit sa mesure la plus récente (`from` = dernier `ts` connu + 1, la borne du serveur étant incluse). Si le cache est plus vieux que la fenêtre, elle repart du début de la fenêtre : un rattrapage partiel laisserait un trou. Élargir la fenêtre du graphique est le seul cas où tout est redemandé, puisque sa partie ancienne n'a jamais été téléchargée — et le cache répond en premier, si bien que le graphique s'élargit même hors ligne.

### La file de commandes

Chaque appui sur la LED crée une ligne en base (`id` choisi par l'app, boîtier, état voulu, statut, nombre d'essais, date) : elle survit à la fermeture de l'app. Statuts : `pending` → `sent` → `acked`, ou `failed` après 5 échecs réseau ou un refus du serveur.

L'app **n'attend pas le réseau pour accepter l'ordre**. Le bouton prend tout de suite l'état demandé, en pointillé, « en attente » puis « envoyée » ; il est confirmé quand le vrai boîtier répond, et revient en arrière avec un message en cas d'échec.

**Deux ordres contradictoires : seul le dernier compte.** Quand une commande entre dans la file, les commandes encore en attente du même boîtier sont supprimées : elles ne sont jamais parties, il n'y a rien à raconter. Les envoyer toutes ferait clignoter la LED pour finir au même endroit, et le serveur ne confirme de toute façon que la dernière : les précédentes finiraient en échec et afficheraient des erreurs qui n'en sont pas.

Au redémarrage, ce qui était `sent` repasse en `pending` : la confirmation a pu être manquée pendant que l'app était fermée. Le renvoi est sans risque puisque le serveur ne republie jamais deux fois le même `id` — s'il l'a déjà traité, il répond 200 avec son statut réel.

Un seul vidage à la fois : l'ouverture de la connexion et le retour du réseau arrivent souvent ensemble, et deux passes enverraient le même ordre deux fois. La file se vide dans l'ordre, en une passe, et s'arrête à la première erreur réseau pour reprendre après le délai.

### Les réglages

L'écran s'ouvre depuis le cache, puis se met à jour quand le serveur répond : on peut donc consulter et modifier les seuils hors ligne.

L'app applique les mêmes règles que le serveur — bornes plausibles, minimum sous le maximum, maintien entre 0 et 1440 minutes — pour qu'une faute de frappe soit refusée tout de suite, et pas trois heures plus tard au retour du réseau. Un champ vide vaut `null` : la borne n'est pas surveillée.

Les seuils modifiés passent par **la même file que les commandes LED**, avec les mêmes renvois et les mêmes délais. La file porte donc un type (`led` ou `thresholds`) et une charge utile JSON. Un `PUT` se confirme lui-même : il passe directement à `acked` quand le serveur répond 200, alors qu'une commande LED attend la réponse du boîtier. Les conflits se règlent par type : enregistrer de nouveaux seuils annule les seuils en attente, sans toucher à une commande LED qui attend elle aussi.

Le passage à cette file généralisée est protégé par `PRAGMA user_version`, sinon la recréation de la table tournerait à chaque démarrage. Une commande encore en attente au moment de la mise à jour est perdue, ce qui coûte un appui sur un bouton.

### Les notifications

**Deux raisons de nous prévenir** : une alerte de seuil, et un boîtier muet depuis plus de 3 minutes.

**App fermée, c'est le serveur qui prévient.** La connexion temps réel est fermée en arrière-plan, donc l'app n'apprend rien tant qu'elle n'est pas ouverte : c'est le backend qui envoie l'alerte en push (voir plus bas). Dès que le push est actif, l'app ne double pas l'alerte par une notification locale. Le boîtier muet reste une notification locale, déclenchée par l'app ouverte.

**Une notification par événement, jamais par mesure.** Le serveur n'envoie qu'une alerte par dépassement, après le temps de maintien. Le boîtier muet n'est signalé qu'une fois par période de silence, et seulement quand la connexion est ouverte : sinon, le silence peut être celui du téléphone plutôt que celui du boîtier. Le retour à la normale n'est pas notifié ; il apparaît dans l'app et dans le Journal.

**La permission au bon moment.** Elle n'est jamais demandée au lancement, seulement quand on active les alertes dans Réglages, sous une phrase qui dit pourquoi. Un refus ne casse rien : l'interrupteur reste éteint, et les alertes restent visibles dans l'app et dans le Journal.

**Les icônes.** Android dessine la petite icône de notification comme une silhouette d'une seule couleur : l'illustration de l'app y deviendrait un carré blanc. Les notifications portent donc une citrouille blanche (`notification-icon.png`) teintée en orange `#fe7f30` ; l'icône de l'app est l'illustration du potager (`icon.png`, 1024 × 1024 sans transparence, comme l'exige iOS), et l'icône thématique d'Android 13 reprend la citrouille. Ces icônes sont compilées dans l'app : il faut un nouveau build pour les changer.

**Expo Go sur Android.** Depuis le SDK 53, le simple import d'`expo-notifications` y lève une erreur. Le module est donc chargé à la demande, et l'interrupteur est désactivé dans Expo Go sur Android ; les notifications se testent avec un build installé.

### Reconnexion sans s'acharner

La connexion temps réel **et** la file de commandes réessaient au même rythme : 1 s, 2 s, 4 s… jusqu'à 30 s au plus, avec ±30 % de hasard, et le compteur repart de zéro au premier succès. Le plafond évite de réveiller la radio soixante fois par minute dans une zone sans réseau ; le hasard évite que tous les téléphones se reconnectent à la même seconde après un redémarrage du serveur.

Quand le téléphone annonce le retour du réseau (NetInfo), le délai en cours est abandonné et l'essai est immédiat. En arrière-plan, rien : ni connexion, ni envoi.

### Le Journal

Il réunit trois sources : les événements du serveur (mis en cache et dédoublonnés sur `eventId`), la file de commandes du téléphone, et les coupures du téléphone lui-même.

Ces coupures sont notées localement (50 lignes) parce que le serveur ne peut pas voir le téléphone perdre le réseau. Seul un vrai changement est noté — une connexion qui hésite donne une ligne « Hors ligne », pas une par essai — et la mise en arrière-plan n'en est pas un, puisque la connexion y est fermée volontairement.

Les commandes vues par le serveur ne sont **pas** affichées : la file du téléphone raconte la même chose en mieux — elle connaît le nombre d'essais, et elle existe hors ligne, quand le serveur n'a encore rien reçu. Les deux ensemble listeraient chaque commande en double.

Les événements n'arrivent jamais directement par la connexion temps réel : une alerte ou un changement de statut signale seulement qu'il s'est passé quelque chose, et déclenche un rattrapage depuis le dernier événement connu. Le serveur reste ainsi la seule source du journal, avec son `eventId` comme clé.

### Toujours dire de quand datent les données

Hors ligne, la bannière date la dernière mesure (« Hors ligne · dernières données à 14h02 ») et la carte passe de « Mesure à » à « Dernière mesure à ». Le statut du boîtier ne s'affiche jamais en vert tant que la connexion est fermée : ce qui vient du cache est annoncé comme « Dernier état connu », parce qu'un point vert ressorti de la veille est un mensonge. Les courbes s'atténuent quand elles viennent du cache ; leurs libellés, eux, gardent un contraste d'au moins 4,5:1.

## L'app installée sur le téléphone

### Configuration : `app.config.js` et variables EAS

`app.json` garde ce qui ne change jamais ; `app.config.js` y ajoute ce qui change d'une machine ou d'un build à l'autre, lu dans l'environnement : `app/.env` en local, les **variables EAS** pour un build dans le cloud. Chaque profil d'`eas.json` a son environnement EAS et son **canal** de mise à jour (`development`, `preview`, `production`).

| Variable                                                             | Où              | Rôle                                                          |
| -------------------------------------------------------------------- | --------------- | ------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WS_URL`, `EXPO_PUBLIC_DEVICE_ID` | app             | l'adresse du serveur, seule chose que l'app connaît           |
| `EXPO_PUBLIC_SENTRY_DSN`                                             | app             | où envoyer les crashs (public par nature)                     |
| `EXPO_PUBLIC_SENTRY_CRASH_TEST`                                      | app             | `true` affiche le bouton de crash de test dans Réglages       |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`                  | build seulement | envoi des source maps ; le jeton est une variable secrète EAS |
| `GOOGLE_SERVICES_JSON`                                               | build seulement | fichier Firebase, variable « fichier » EAS, jamais dans Git   |

Les `EXPO_PUBLIC_*` sont écrites en clair dans l'app : on n'y met que ce qui peut l'être. Un build cloud sans `EXPO_PUBLIC_API_URL` échoue tout de suite, plutôt que de produire une app qui ne joint rien.

```bash
npx eas-cli build --profile preview --platform android      # APK installable sans câble
npx eas-cli update --channel preview --environment preview --message "…"
```

**Joindre le serveur de partout : un tunnel HTTPS.** L'app installée embarque l'adresse du serveur ; une IP de réseau local casse dès que le Wi-Fi change, et n'offre ni TLS ni WSS. Le backend est donc exposé par un tunnel Cloudflare (`cloudflared tunnel --url http://localhost:8883`), qui fournit une adresse `https://…trycloudflare.com` avec un certificat valide : l'API en HTTPS, le temps réel en **WSS**, sur n'importe quel réseau. Le tunnel gratuit change d'adresse quand il redémarre ; comme l'adresse est une variable `EXPO_PUBLIC_*`, donc du JavaScript, il suffit de mettre la variable EAS à jour puis de publier un `eas update`, sans nouveau build.

**Le build ne dépend pas de Sentry.** Sans `SENTRY_AUTH_TOKEN`, l'envoi des source maps échoue à la fin du build ; `SENTRY_ALLOW_FAILURE=true` (dans `eas.json`) en fait un avertissement plutôt qu'un build perdu. Avec le jeton, les piles d'appels pointent vers le code source.

**`metro` est épinglé à la version exacte qu'utilise Expo** (`0.84.5`) : l'outil Metro de Sentry a besoin de le trouver à la racine de `node_modules`, et une seconde version, différente de celle d'Expo, casserait le bundler.

### Les notifications push

Le jeton push n'est demandé **qu'une fois les alertes activées** dans Réglages, la permission accordée, et l'utilisateur connecté. L'app l'envoie alors au serveur (`POST /push-tokens`) et le renvoie à chaque lancement : il peut changer après une réinstallation, et le serveur ignore les doublons. Désactiver les alertes le retire (`DELETE /push-tokens`).

Cette route est **protégée par le jeton** : ouverte, elle laisserait n'importe qui abonner son téléphone aux alertes de la serre.

À chaque alerte — une seule par dépassement, après le temps de maintien — le serveur appelle l'**API Expo Push** pour chaque téléphone enregistré, sur le canal Android `alerts`. Un téléphone qu'Expo déclare `DeviceNotRegistered` (app désinstallée) est oublié. Un échec d'envoi est journalisé et remonté à Sentry, sans jamais empêcher les mesures d'être enregistrées.

**Pourquoi Firebase.** Android ne laisse pas une app garder sa propre connexion ouverte en arrière-plan : une seule connexion, celle des services Google, reste ouverte pour tout le téléphone, et c'est par elle (Firebase Cloud Messaging) que passe toute notification push. Expo Push est un relais devant FCM. L'app embarque donc `google-services.json`, qui la rattache au projet Firebase et lui permet d'obtenir son jeton ; et la clé de compte de service FCM v1, déposée dans les identifiants EAS (`npx eas-cli credentials`), autorise Expo à envoyer par ce projet. Le push ne marche pas dans Expo Go : il se teste sur l'app installée.

### Sentry

- **App** : `@sentry/react-native`, démarré avant le premier rendu (un crash au lancement est capturé), autour de toute l'app (`Sentry.wrap`). Chaque rapport porte le canal et l'identifiant de la mise à jour : après un `eas update`, le numéro de build ne dit plus quel JavaScript tournait. `metro.config.js` ajoute les identifiants de débogage pour que la pile pointe vers le code source.
- **Backend** : `@sentry/node`, chargé par `node --import ./src/instrument.js` avant tout le reste, pour qu'il puisse instrumenter Express. Son gestionnaire d'erreurs est branché après toutes les routes. `npm run sentry-test` vérifie le DSN sans faire tomber le serveur.
- **Pas de données personnelles** (`sendDefaultPii: false`) : les requêtes contiennent des mots de passe et des jetons push.
- **Sans DSN, pas de Sentry** : une machine sans la variable fonctionne comme avant, et les tests n'envoient rien.
- **Le crash de test est un réglage, pas du code** : le bouton n'existe que si `EXPO_PUBLIC_SENTRY_CRASH_TEST=true`. On ne peut pas l'oublier dans l'app livrée par mégarde, et une mise à jour à distance suffit à le retirer.

### Les mises à jour à distance (`eas update`)

`runtimeVersion` suit la version de l'app (`policy: appVersion`). Une mise à jour à distance ne remplace que le **JavaScript** : elle ne peut pas ajouter une bibliothèque native. Ajouter ou retirer une dépendance native impose donc d'**incrémenter `version`** et de refaire un build ; les builds plus anciens ne reçoivent plus un JavaScript qu'ils ne sauraient pas exécuter.

L'app télécharge la mise à jour à son lancement et l'applique au lancement suivant : il faut la rouvrir deux fois pour voir le changement. Le canal de la mise à jour doit être celui du build installé (`preview`).

### Les tests (Jest)

On teste la logique pure, sans téléphone.

- **Les seuils** (`backend/test/alerts.test.js`), sur une base SQLite en mémoire, sans simulation : un dépassement plus court que le temps de maintien ne lève rien ; un dépassement maintenu lève **une seule** alerte, à la seconde près ; le retour dans la plage lève un retour à la normale, et le dépassement suivant attend à nouveau tout son délai ; une valeur égale au seuil n'est pas un dépassement ; une borne à `null` n'est pas surveillée.
- **La file de commandes** (`app/src/services/__tests__/command-queue.test.ts`), base et réseau simulés : renvoi dans l'ordre de création ; un nouvel essai garde le **même `id`**, et deux vidages simultanés n'envoient qu'une fois ; passage en `failed` après **5** échecs réseau, sans sixième essai ; un refus du serveur (4xx) échoue tout de suite, et la file continue.

## Qui a fait quoi

| Membre           | Couche                                                                                       | Branches                                             |
| ---------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Adrien Verwaerde | App (tableau de bord, historique, cycle de vie du WebSocket, bannière réseau, cache local)   | `frontend`, `frontend_graph`, `frontend_local-cache` |
| Samantha         | Backend (MQTT, stockage, historique, seuils, commandes, WebSocket, journal, mode hors ligne) | `backend`, `backend_offline_mode`                    |

**Sécurisation** — chacun a sécurisé une couche qu'il n'avait pas écrite :

| Membre           | Couche sécurisée                                                                   | Branches                |
| ---------------- | ---------------------------------------------------------------------------------- | ----------------------- |
| Adrien Verwaerde | Backend (JWT, limites de débit, CORS) et broker (identifiants, ACL, anonyme coupé) | `backend_cybersécurité` |
| Samantha         | App (`expo-secure-store`, config EAS, WSS) et firmware (`setCACert`, NTP)          | `frontend_auth`         |

**Livraison** :

| Membre           | Travail                                                                                              | Branches         |
| ---------------- | ---------------------------------------------------------------------------------------------------- | ---------------- |
| Adrien Verwaerde | `app.config.js` et variables EAS, push (app et backend), Sentry côté app, `expo-updates`, tests Jest | `backend_sentry` |
| Samantha         | Sentry côté backend (`instrument.js`, gestionnaire d'erreurs Express)                                | `backend_sentry` |
