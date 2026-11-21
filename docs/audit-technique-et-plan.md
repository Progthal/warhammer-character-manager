# Audit technique et plan de développement

**Projet :** Warhammer Character Manager – WFRP4e  
**Dépôt audité :** `/var/www/html/archive/perso/warhammer-character-manager`  
**Date de l’audit :** 21 novembre 2026  
**Version déclarée :** `0.1.0`  
**Révision observée :** `3c5ac89` (`main`, alignée sur `origin/main`)

## 1. Synthèse exécutive

Le projet dispose d’une base technique sérieuse pour une application personnelle hors ligne : interface statique, JavaScript natif en modules ES, persistance IndexedDB, migrations, sauvegardes JSON, référentiels locaux, calculs séparés du DOM et tests automatisés. Les commandes de contrôle existantes passent et les données intégrées sont syntaxiquement valides et cohérentes au regard du validateur métier du projet.

Le logiciel n’est toutefois pas encore un gestionnaire WFRP4e exhaustif. Il s’agit d’une fondation de fiche de personnage enrichie, dont plusieurs domaines de règles et de données sont explicitement incomplets. Les principaux risques techniques à traiter avant d’ajouter beaucoup de fonctionnalités sont la concurrence entre onglets, la garantie de sauvegarde lors de la fermeture, la duplication des déploiements GitHub Pages et l’absence de tests de bout en bout dans un vrai navigateur.

**Avis global :** fondation exploitable et bien structurée sur le plan métier, mais à stabiliser sur la persistance et la livraison, puis à rendre testable dans un navigateur avant une extension importante des règles ou de l’interface.

### État par domaine

| Domaine | Évaluation | Commentaire |
|---|---|---|
| Architecture générale | Bon socle, à modulariser | Modules métier séparés, mais contrôleur principal très volumineux. |
| Interface et navigation | Fonctionnelle sur le papier | Responsive et plusieurs attributs d’accessibilité présents ; pas de validation navigateur réalisée. |
| Modèle personnage | Bon | Normalisation, champs historiques, validation et valeurs par défaut structurés. |
| Persistance | À sécuriser | IndexedDB et transactions présentes ; conflits d’édition entre onglets non arbitrés. |
| Sauvegarde / restauration | Bon socle | JSON versionné, limites de taille et import groupé atomique ; scénarios navigateur à tester. |
| Référentiels | Structure solide, contenu incomplet | Identifiants stables et validation ; carrières et talents restent essentiellement des index. |
| Règles WFRP4e | Partiel | Quelques calculs et coûts automatisés ; de nombreuses règles sont volontairement manuelles ou non vérifiées. |
| Tests | Bons tests unitaires, couverture fonctionnelle incomplète | Pas de tests E2E de l’application réelle, du cycle PWA ou d’IndexedDB réelle. |
| Livraison | À corriger | Deux workflows publient simultanément GitHub Pages sans coordination commune. |
| Sécurité / confidentialité | Adaptée à un outil local personnel, limites à documenter | Pas de backend ni de dépendances runtime ; données locales et exports non chiffrés. |

## 2. Périmètre et méthode

L’audit a porté sur l’arborescence, le manifeste PWA, le Service Worker, les workflows GitHub Actions, le modèle de personnage, les règles, les services, les composants, les vues, IndexedDB, les migrations, les imports/exports, les jeux de données JSON, le README et les tests.

Contrôles effectivement réalisés :

- `npm test` : **10 suites/fichiers exécutés, 0 échec**.
- `npm run check` : **terminé avec le code de retour 0**.
- `node --test --experimental-test-coverage` : **84,01 % de lignes, 73,40 % de branches et 84,28 % de fonctions** sur les fichiers inclus par le runner.
- Lecture et parsing des cinq jeux JSON intégrés ; validation croisée avec `validateReferenceEntries` : **valide, aucune erreur**.
- Inspection du graphe d’import du point d’entrée `src/app.js` et comparaison avec les fichiers JavaScript du dépôt.
- Vérification de l’état Git initial : arbre de travail propre, branche `main` alignée sur `origin/main`.

Limites de l’audit : le navigateur n’a pas pu être lancé dans l’environnement d’exécution. L’ouverture d’un serveur HTTP local a été refusée par les permissions réseau, puis le lancement headless de Chrome s’est terminé sur une erreur système. En conséquence, aucun parcours E2E, test visuel, contrôle réel d’IndexedDB, test de Service Worker ou test hors ligne n’est déclaré réussi. Les règles du jeu n’ont pas été certifiées par confrontation exhaustive aux ouvrages officiels : l’audit vérifie l’implémentation et les limites documentées, pas l’exactitude éditoriale de chaque règle.

## 3. Architecture constatée

L’application est un site statique sans backend ni dépendance npm runtime. `index.html` charge `src/app.js`, qui orchestre l’interface, les événements, les formulaires, l’import/export et le cycle de vie de l’application.

| Zone | Fichiers principaux | Responsabilité |
|---|---|---|
| Entrée et navigation | `index.html`, `src/app.js`, `src/router.js` | Initialisation, navigation hash, interactions et vues. |
| Modèle métier | `src/models/character.js` | Création, normalisation, validation et représentation d’un personnage. |
| Règles | `src/rules/*` | Génération de caractéristiques, calculs dérivés et coûts XP. |
| Services | `src/services/*` | Progression, catalogue, suggestions, thèmes et échanges JSON. |
| Persistance | `src/database/indexeddb.js`, `src/database/migrations.js` | Ouverture de la base, transactions et migrations jusqu’à la version 7. |
| Interface | `src/components/*`, `src/views/*`, `assets/css/app.css` | Sélecteurs, catalogue, tableau de bord et présentation des fiches. |
| Données | `data/*.json` | Référentiels de départ chargés localement. |
| PWA | `manifest.json`, `service-worker.js` | Installation et cache hors ligne. |

### Points positifs

- La logique de calcul est séparée du rendu HTML et plusieurs fonctions métier sont pures, injectables et faciles à tester.
- Le modèle centralise la normalisation des textes, nombres, collections, talents et historiques.
- IndexedDB possède un schéma versionné, des migrations et des transactions. Les imports de personnages sont enregistrés en un lot atomique.
- Les formats d’échange sont versionnés ; les imports contrôlent la taille, la structure et les identifiants en collision.
- Les référentiels s’appuient sur des identifiants stables, des relations contrôlées et une stratégie d’ajout des données intégrées qui évite d’écraser les personnalisations.
- L’interface utilise une fonction d’échappement HTML pour les données injectées dans ses gabarits. La recherche statique n’a pas identifié d’appel à `eval` ou `new Function`.
- Le code d’exécution ne dépend pas d’un framework ou d’un service tiers chargé à distance.
- Le CSS comporte des états `focus-visible`, des mises en page responsive et une règle `prefers-reduced-motion`.

## 4. Constats et risques

Les priorités sont définies ainsi : **P1** = à corriger avant une extension majeure ou une livraison fiable ; **P2** = important à traiter dans les étapes suivantes ; **P3** = amélioration non bloquante.

### P1 — Deux workflows publient le même site

**Fichiers :** `.github/workflows/pages.yml:3-15,17-38` et `.github/workflows/static.yml:4-22,24-43`.

Les deux workflows se déclenchent sur un push vers `main` et manuellement. Ils construisent puis déploient tous les deux GitHub Pages. Ils utilisent des groupes de concurrence différents (`github-pages` et `pages`) : GitHub ne les coordonne donc pas comme un seul déploiement. Ils référencent aussi des versions différentes de `actions/deploy-pages` (`v4` et `v5`).

**Risque :** déploiements redondants, courses entre publications et diagnostic plus difficile lorsqu’une mise en production échoue.

**Recommandation :** conserver un seul workflow de publication. Transformer l’autre en workflow de validation (`npm test`, `npm run check`, validation JSON), ou le supprimer. Le déploiement doit dépendre de la réussite des contrôles.

### P1 — Une édition simultanée dans deux onglets peut écraser des modifications

**Fichiers :** `src/database/indexeddb.js:45-62,73-75` et `src/app.js:928-945`.

Chaque sauvegarde écrit le personnage complet par `store.put(character)`. Le code gère la fermeture d’une connexion lors d’un changement de version de base, mais ne détecte pas qu’un même personnage est édité en parallèle dans deux onglets. Il n’existe pas de numéro de révision, de comparaison atomique avec la version persistée, ni de notification de conflit entre onglets.

**Risque :** le dernier onglet qui enregistre peut écraser silencieusement les changements de l’autre onglet.

**Recommandation :** introduire une révision monotone par personnage et une sauvegarde conditionnelle transactionnelle. À défaut, détecter les changements externes (par exemple avec `BroadcastChannel`) et afficher un conflit explicite avant tout écrasement.

### P1 — La sauvegarde au moment de fermer l’onglet n’est pas garantie

**Fichiers :** `src/app.js:951-965,1927-1943`.

La sauvegarde automatique est déclenchée après 450 ms d’inactivité. `visibilitychange` et `pagehide` lancent également `queueEditorSave()`, mais le navigateur n’attend pas la résolution d’une promesse retournée par un gestionnaire `pagehide`. L’écriture IndexedDB peut donc être interrompue si le processus ou l’onglet est fermé immédiatement, notamment avant le prochain déclenchement de sauvegarde.

**Risque :** perte des dernières modifications en cas de fermeture brutale, arrêt du navigateur ou terminaison du processus.

**Recommandation :** réduire le temps pendant lequel des données modifiées ne sont pas persistées, rendre l’état « sauvegarde en attente » explicite, déclencher une tentative immédiate lors du passage en arrière-plan et tester les fermetures réelles. Ne pas considérer `pagehide` comme une garantie transactionnelle. Prévoir aussi un avertissement lorsque des changements ne sont pas confirmés comme enregistrés.

### P1 — Les tests ne couvrent pas le véritable parcours utilisateur

**Fichiers :** `tests/*.test.mjs`, `package.json:7-9`, `.github/workflows/*.yml`.

Les tests couvrent bien plusieurs fonctions métier, mais `src/app.js` et `service-worker.js` ne sont pas couverts par le rapport de couverture. Les composants interactifs ont une couverture de lignes faible dans le rapport observé (`reference-picker.js` : 22,18 %, `talent-picker.js` : 25,17 %). Les tests IndexedDB remplacent l’API par des objets simulés ; ils ne valident donc pas le comportement réel du navigateur. Aucun workflow ne lance actuellement `npm test` ou `npm run check` avant le déploiement.

**Risque :** des régressions dans les formulaires, dialogues, événements, migrations réelles, sauvegardes et scénarios hors ligne peuvent passer malgré des tests unitaires verts.

**Recommandation :** ajouter une suite de tests navigateur automatisés et rendre les tests unitaires et contrôles statiques obligatoires dans CI avant toute publication.

### P2 — Le contrôleur principal concentre trop de responsabilités

**Fichier :** `src/app.js` (environ 130 Ko et 1 994 lignes au moment de l’audit).

Le fichier prend en charge l’initialisation, la navigation, le rendu de fiche, la collecte des formulaires, les événements, les référentiels, les talents, les imports/exports, les modales et les interactions de progression. Les services et vues existent déjà, mais la logique de présentation et de coordination reste très concentrée dans ce fichier.

**Risque :** modifications coûteuses, dépendances implicites entre fonctions, difficulté à tester une fonctionnalité sans initialiser le DOM et risque de régression lors de l’ajout de nouvelles sections.

**Recommandation :** extraire progressivement des contrôleurs fonctionnels, sans réécrire l’application en une fois : registre, fiche personnage, progression, référentiels, import/export et cycle de vie. Garder `app.js` comme point de composition.

### P2 — Une vue de fiche semble orpheline

**Fichier :** `src/views/character-detail.js`.

L’inspection du graphe d’import depuis `src/app.js` montre que `character-detail.js` n’est pas importé dans le parcours actif. La fiche affichée est rendue par le contrôleur principal. Le module orphelin reste cependant présent dans le dépôt, dans la documentation d’architecture et dans les contrôles/tests.

**Risque :** deux implémentations de présentation de la fiche peuvent évoluer différemment et rendre l’architecture trompeuse.

**Recommandation :** décider si cette vue doit devenir la vue officielle et être réintégrée, ou si elle doit être supprimée après vérification. Ne pas maintenir deux rendus concurrents.

### P2 — Les référentiels structurés sont plus complets que leur contenu métier

**Fichiers :** `data/careers.json`, `data/talents.json`, `data/religions.json`, `data/deities.json`, `data/species.json`.

Constats de contenu :

- **Carrières :** 64 entrées et 256 niveaux, mais les 256 niveaux n’ont aucun contenu renseigné dans les champs compétences, talents, avancements, conditions d’accès/sortie ou équipement. Les quatre rangs sont des repères génériques.
- **Talents :** 180 entrées ; les 180 sont marquées communautaires. Aucune n’a de nom français, catégorie, effet mécanique, association documentée à une espèce/carrière/niveau ou statut vérifié.
- **Espèces :** 5 profils présents et complets pour les dix modificateurs de caractéristiques.
- **Religions et divinités :** 10 entrées dans chaque référentiel, avec associations cohérentes ; le README précise que ce jeu de données est synthétique et partiel.

Le validateur confirme que les entrées actuellement intégrées sont structurellement valides. Cela ne signifie pas que leur contenu constitue une base complète ou certifiée des règles WFRP4e.

**Risque :** les utilisateurs peuvent interpréter la présence d’une entrée dans le catalogue comme une validation officielle ou une couverture complète alors que les données sont volontairement partielles.

**Recommandation :** garder le statut de vérification visible et compléter les données à partir des ouvrages de l’édition ciblée. Enregistrer la source, la page, l’édition et le statut de validation pour chaque donnée ; ne jamais déduire automatiquement une règle manquante.

### P2 — Les règles automatisées ne couvrent pas encore toute la fiche WFRP4e

**Fichiers :** `src/rules/character-calculations.js`, `src/rules/progression-costs.js`, `src/services/progression.js` et README, sections « Fiche enrichie, calculs et progression » et « Périmètre et prochaines étapes ».

Les calculs de caractéristiques, bonus de Force/Endurance, compétences, encombrement et corruption sont présents. Les coûts XP sont centralisés. En revanche, plusieurs valeurs secondaires et règles liées aux carrières restent manuelles ; les conditions d’acquisition et une grande partie des effets ne sont pas exécutées automatiquement. Le code applique certains effets de talents uniquement lorsqu’ils sont explicitement marqués comme vérifiés et sourcés.

**Risque :** une automatisation ajoutée sans source précise peut transformer une hypothèse en règle présentée comme certaine.

**Recommandation :** établir une matrice « règle / édition / source / page / statut / implémentation / tests » avant d’automatiser davantage. Faire valider les coûts, limites et conditions par l’édition française effectivement utilisée.

### P2 — Le cache PWA dépend d’une incrémentation manuelle

**Fichier :** `service-worker.js:1-3,38-53,56-90`.

Le Service Worker utilise un cache versionné (`v18`) et une stratégie cache-first pour les ressources GET de même origine. Cette stratégie est adaptée à un site statique, mais une mise à jour des fichiers applicatifs doit être accompagnée d’une mise à jour de `CACHE_VERSION` pour invalider l’ancien cache.

**Risque :** oublier l’incrémentation peut laisser les utilisateurs sur une ancienne version des ressources après publication.

**Recommandation :** intégrer le changement de version du cache au processus de livraison, ou faire évoluer la stratégie vers des ressources versionnées/hashées. Ajouter un test de mise à jour et de reprise hors ligne.

### P2 — La portée de confidentialité doit rester explicite

**Fichiers :** `src/database/indexeddb.js`, `src/services/import-export.js`, README, section « Stockage et sauvegardes ».

Les personnages sont stockés dans IndexedDB sur l’origine et le profil du navigateur. Les sauvegardes sont exportées en JSON standard. Aucun chiffrement applicatif ou mot de passe de base n’est prévu ; ce choix est cohérent avec une application personnelle locale, mais ne constitue pas un coffre-fort sécurisé ni un système multi-utilisateur.

**Risque :** un utilisateur peut croire que « local » signifie chiffré ou protégé contre une personne ayant accès au profil du navigateur ou au fichier JSON exporté.

**Recommandation :** l’indiquer clairement dans l’aide. Si le chiffrement des sauvegardes devient une exigence, le concevoir comme une fonctionnalité distincte avec gestion explicite des clés et tests de récupération ; ne pas improviser un chiffrement propriétaire.

### P3 — Les contrôles statiques sont maintenus par une liste manuelle

**Fichier :** `package.json:7-9`.

`npm run check` énumère les fichiers JavaScript un par un. Cette liste peut oublier un nouveau module ; `src/models/character.js` n’y figure pas actuellement, même s’il est chargé par les tests. L’ajout de fichiers augmente le risque de divergence.

**Recommandation :** remplacer la liste manuelle par un contrôle récursif de tous les fichiers JavaScript, ou adopter un lint/configuration centralisée qui découvre les fichiers automatiquement.

## 5. Évaluation fonctionnelle

| Fonctionnalité | État observé | Suite recommandée |
|---|---|---|
| Registre des personnages | Recherche, tri, ouverture, duplication, suppression documentés et rendus. | Tests navigateur complets, gros volumes et erreurs IndexedDB. |
| Création vierge | Modèle dédié et création immédiate documentés. | Tester persistance immédiate, navigation et rechargement. |
| Fiche permanente | Sections d’identité, caractéristiques, compétences, talents, équipement, ressources et notes. | Tests de formulaire par section, clavier et petits écrans. |
| Autosave | Temporisation de 450 ms et indicateurs visibles. | Durcir fermeture, erreurs, onglets concurrents et changements rapides de route. |
| Génération de caractéristiques | 2d10 + modificateur d’espèce, hasard injectable, données complètes contrôlées. | Vérification finale de la règle par édition et tests navigateur. |
| Progression XP | Gains, achats, coûts par palier, remboursements et annulation historisés. | Recettes de tests issues des sources officielles ; tests multi-opérations en navigateur. |
| Référentiels | CRUD, relations, packs, identifiants stables et protections des entrées intégrées. | Compléter les données et tester import/export sur de vraies bases anciennes. |
| Talents | Recherche, associations, statut de vérification et effets structurés. | Traduction et enrichissement sourcé avant usage comme catalogue de règles. |
| PWA / hors ligne | Manifeste et Service Worker présents ; shell statique précaché. | Tests réels d’installation, mise à jour, navigation hors ligne et stockage. |
| Combat | Non développé comme moteur de règles complet. | À planifier seulement après validation du périmètre et des règles sources. |

## 6. Plan de développement recommandé

L’ordre proposé vise d’abord à protéger les données et à fiabiliser les livraisons. La modularisation et l’enrichissement métier viennent ensuite, car les tests navigateur permettront de vérifier que ces changements ne modifient pas les comportements existants.

### Étape 1 — Fiabiliser l’intégration et le déploiement (priorité P1)

**Travaux :**

1. Fusionner les deux workflows GitHub Pages en un seul workflow de publication.
2. Ajouter un workflow de validation sur pull request et push : `npm test`, `npm run check`, parse JSON et validation des référentiels intégrés.
3. Faire dépendre la publication de la réussite des validations.
4. Rendre la version applicative et la version du cache PWA cohérentes dans le processus de release.

**Critères d’acceptation :** un seul déploiement Pages est déclenché par commit ; un test en échec bloque la publication ; les cinq fichiers JSON sont validés automatiquement ; une release actualise correctement le cache PWA.

### Étape 2 — Garantir l’intégrité et la récupération des données (priorité P1)

**Travaux :**

1. Introduire une révision par personnage et détecter les écritures concurrentes.
2. Informer les autres onglets des changements, ou imposer un mode lecture seule lorsqu’un conflit existe.
3. Fiabiliser le cycle autosave : état sale/en cours/enregistré/échec, tentative dès le passage en arrière-plan et traitement des erreurs.
4. Vérifier les scénarios de suppression, duplication, import groupé et restauration complète.
5. Constituer des bases IndexedDB de test pour chaque version historique prise en charge et tester les migrations réelles.
6. Ajouter une vérification d’intégrité d’une sauvegarde avant import et préciser le comportement en cas de base pleine ou indisponible.

**Critères d’acceptation :** deux onglets ne peuvent plus s’écraser silencieusement ; une fiche modifiée reste disponible après rechargement dans les parcours normaux ; une migration préserve les données ; un import incomplet n’écrit aucune partie du lot ; une sauvegarde exportée peut être restaurée sur un profil vierge.

### Étape 3 — Installer une véritable stratégie de tests navigateur (priorité P1)

**Travaux :**

1. Ajouter Playwright ou un outil E2E équivalent, exécuté avec Chromium dans CI.
2. Tester les parcours essentiels : création, modification, autosave, rechargement, duplication, suppression, import et export.
3. Tester la création et l’édition des référentiels, des talents et des progressions XP.
4. Tester IndexedDB réelle, les migrations, les onglets concurrents et les erreurs de transaction.
5. Tester l’installation PWA, la première mise en cache, le redémarrage hors ligne et la mise à jour d’une version.
6. Ajouter des tests d’accessibilité automatisés et quelques scénarios clavier manuels documentés.

**Critères d’acceptation :** les parcours critiques passent dans un navigateur réel en CI ; les scénarios de persistance et de hors ligne sont reproductibles ; les défauts critiques d’accessibilité sont bloquants.

### Étape 4 — Modulariser progressivement l’interface (priorité P2)

**Travaux :**

1. Définir les responsabilités et contrats d’état des contrôleurs UI.
2. Extraire le registre et ses filtres/actions.
3. Extraire l’éditeur de personnage, la collecte/validation des formulaires et l’autosave.
4. Extraire la gestion des référentiels et des talents.
5. Extraire les flux import/export et progression.
6. Supprimer ou réintégrer `src/views/character-detail.js` après décision explicite.
7. Réduire `src/app.js` à l’assemblage des contrôleurs et à l’initialisation.

**Contraintes :** aucune réécriture visuelle ou changement de règle dans cette étape ; conserver les routes hash, les formats JSON et les données persistées.

**Critères d’acceptation :** chaque domaine possède un module isolable et testable ; les tests existants et E2E restent verts ; les migrations et formats d’échange ne changent pas sans version dédiée.

### Étape 5 — Fiabiliser et enrichir les référentiels WFRP4e (priorité P2)

**Travaux :**

1. Choisir explicitement l’édition et la traduction de référence.
2. Remplacer les intitulés génériques des niveaux de carrière par les titres validés et renseigner classes/statuts sociaux selon les sources retenues.
3. Renseigner les compétences, talents, avancements, conditions et équipements des carrières et de leurs niveaux, sans compléter par supposition.
4. Enrichir les talents : nom français, catégorie, tests, rang maximal, prérequis, associations et références vérifiées.
5. Ajouter ou structurer un catalogue des compétences si le périmètre le nécessite.
6. Compléter les cultes et divinités selon les sources autorisées et conserver la distinction entre données intégrées, personnelles et communautaires.
7. Ajouter des tests de cohérence des identifiants et relations à chaque modification de données.

**Critères d’acceptation :** chaque donnée présentée comme vérifiée possède une source traçable ; les données communautaires restent explicitement étiquetées ; aucune association n’est inférée automatiquement ; les imports conservent leurs relations.

### Étape 6 — Formaliser et étendre le moteur de règles (priorité P2)

**Travaux :**

1. Créer un registre des règles avec édition, source/page, statut de validation et cas de test.
2. Faire vérifier les coûts XP, les limites d’avancement, les talents et les changements de carrière.
3. Définir quelles caractéristiques secondaires sont calculées ou restent configurables.
4. Ajouter les règles validées une par une, avec tests unitaires de cas simples, limites et interactions.
5. Séparer les effets documentaires des effets réellement exécutés par le moteur.
6. Préparer ensuite les domaines complémentaires : combat, blessures, états, magie, prières et effets d’équipement, suivant le périmètre confirmé.

**Critères d’acceptation :** aucun calcul automatisé n’est activé sans règle sourcée ; chaque règle ajoutée possède des tests ; les anciennes fiches restent compatibles ; les données non vérifiées restent visibles mais ne modifient pas les calculs.

### Étape 7 — Polir l’expérience utilisateur et préparer une version stable (priorité P3)

**Travaux :**

1. Contrôler contrastes, focus, navigation clavier, lecteurs d’écran, dialogues et formulaires sur mobile.
2. Tester performances avec un registre important et des référentiels enrichis.
3. Clarifier les états hors ligne et la différence entre connexion réseau et disponibilité réelle du service.
4. Ajouter une aide intégrée sur la portée locale des données, les sauvegardes et les limites de sécurité.
5. Définir une politique de version, changelog, migration et compatibilité des exports.
6. Préparer une recette de publication et un jeu de données de démonstration non personnel.

**Critères d’acceptation :** les parcours principaux sont utilisables au clavier et sur mobile ; les performances restent correctes avec les volumes cibles ; une nouvelle version est documentée et les sauvegardes antérieures restent importables ou migrables.

## 7. Ordre conseillé et décisions

| Ordre | Étape | Motif |
|---:|---|---|
| 1 | Intégration et déploiement | Éliminer les publications concurrentes et empêcher une version non testée d’être publiée. |
| 2 | Intégrité des données | Les personnages sont les données les plus importantes du logiciel. |
| 3 | Tests navigateur | Créer le filet de sécurité avant de modifier l’interface. |
| 4 | Modularisation UI | Réduire le coût et le risque des évolutions futures. |
| 5 | Référentiels | Compléter la valeur métier du logiciel à partir de sources fiables. |
| 6 | Moteur de règles | Automatiser progressivement uniquement ce qui est vérifié. |
| 7 | Finition et stabilisation | Préparer une version durable et testable par les utilisateurs. |

### Décisions à conserver pendant le développement

- Préserver le fonctionnement sans backend et le stockage local tant qu’un besoin de synchronisation n’est pas confirmé.
- Ne pas introduire de règle WFRP4e supposée ou non sourcée.
- Préserver les formats d’export et l’historique des personnages ; toute rupture doit passer par une migration explicite.
- Ne pas combiner une refonte d’architecture avec une refonte visuelle ou une modification des règles dans le même lot.
- Ne pas considérer un test unitaire réussi comme une preuve suffisante du fonctionnement de l’interface ou de la PWA.

## 8. Conclusion

La base existante mérite d’être consolidée plutôt que remplacée. Le meilleur investissement immédiat est de fiabiliser le pipeline, prévenir les pertes et écrasements de données, puis ajouter des tests navigateur réels. La modularisation du contrôleur principal doit être réalisée ensuite, sous la protection de ces tests. Enfin, la complétude WFRP4e dépendra surtout du travail de vérification et de structuration des données et des règles, et non d’une simple extension du code.

Cet audit décrit l’état observé du dépôt à la date indiquée. Il ne certifie ni la conformité juridique des contenus, ni l’exactitude exhaustive des règles de jeu, ni le comportement sur tous les navigateurs et appareils.
