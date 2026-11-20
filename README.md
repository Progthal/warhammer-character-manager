# Warhammer Character Manager

Application web personnelle pour créer et conserver des personnages de **Warhammer Fantasy Roleplay – 4e édition**.

L'application est composée de fichiers statiques HTML, CSS et JavaScript natif. Elle ne nécessite ni PHP, ni serveur applicatif, ni compte utilisateur, ni base de données distante. Les fiches sont enregistrées dans IndexedDB sur l'appareil utilisé.

## Fonctionnalités de la fondation

- Tableau de bord des personnages avec recherche, tri et indicateurs.
- Création d'une fiche, modification avec sauvegarde automatique, duplication et suppression après confirmation.
- Fiche détaillée : identité, carrière, expérience, caractéristiques principales et secondaires, chronique personnelle.
- Génération facultative des dix caractéristiques principales depuis l’icône de dé : deux dés à dix faces par caractéristique, auxquels s’ajoute le modificateur de l’espèce.
- Export JSON d'une fiche ou de l'ensemble du registre.
- Import JSON versionné avec validation et protection contre l'écrasement des identifiants existants. En cas de collision, la fiche importée est ajoutée comme une copie.
- Stockage IndexedDB versionné avec index de recherche et point d'entrée pour les migrations.
- PWA avec manifeste et Service Worker pour mettre en cache l'application et permettre son ouverture hors ligne après le premier chargement.
- Interface responsive pour ordinateur, tablette et smartphone.
- Création guidée en neuf étapes avec brouillon sauvegardé et reprise après fermeture.
- Vérification finale séparant les erreurs bloquantes, les avertissements et les informations non bloquantes.
- Historique temporaire des jets de caractéristiques, avec annulation du dernier jet confirmé.

## Référentiels locaux (phase 2)

Les fiches de personnage utilisent des référentiels intégrés pour les religions, les divinités, les carrières et les espèces. Les champs correspondants sont des sélecteurs avec recherche, navigation au clavier, sélection au toucher ou à la souris, informations complémentaires et effacement explicite. La divinité est filtrée selon la religion ; en cas de changement incompatible, l’application demande confirmation avant de l’effacer. Une carrière affiche sa classe et ses informations disponibles ; ses niveaux sont récupérés par identifiant stable, sélectionnables dans une liste déroulante et enregistrés avec leur nom et leur identifiant.

Les fichiers de départ sont `data/religions.json`, `data/deities.json`, `data/careers.json`, `data/species.json` et `data/talents.json`. Les religions et divinités intégrées forment une base synthétique et partielle de dix cultes humains du Vieux Monde ; elles ne prétendent pas couvrir tous les panthéons. Les 64 noms de carrières et leurs classes sont repris d’une aide de jeu française secondaire, référencée dans `data/careers.json` : les intitulés français peuvent varier suivant la traduction et doivent être vérifiés dans l’ouvrage utilisé. La structure WFRP4e comprend quatre niveaux pour chaque carrière (référence de vérification : [Le Livre de base révisé](https://www.lecoupcritique.fr/catalogue/warhammer-jdr-livre-de-base/)). Les 64 carrières intègrent donc quatre rangs stables intitulés provisoirement « Rang I » à « Rang IV ». Ces noms sont des repères génériques, pas les titres officiels propres à chaque carrière. Les statuts sociaux et les intitulés spécifiques restent à vérifier dans l’édition française utilisée ; aucun profil de compétences, talent, avancement, condition ou équipement n’est inventé.

Le référentiel des espèces contient les profils de caractéristiques pour Humain, Nain, Halfling, Haut Elfe et Elfe sylvain. Les modificateurs sont ceux de la table « Attributes Table » du livre de base WFRP4e anglais (Character II, p. 33) : les deux profils elfiques sont identiques pour les dix caractéristiques. Les modificateurs intégrés peuvent être vérifiés et ajustés dans **Référentiels → Espèces → Configurer**. Les profils personnalisés peuvent enregistrer leurs alias, particularités, compétences, talents et identifiants de référence. Les anciennes fiches indiquant simplement « Elfe » sont reconnues comme Haut Elfe ; leurs jets restent identiques à ceux d’un Elfe sylvain.

Chaque carrière contient désormais quatre objets `levels` initiaux. Chaque niveau possède son propre `id`, le `careerId` parent, un nom, un rang, ses compétences et talents (noms et identifiants), ses avancements, conditions d’accès/de sortie, équipement, description, références et informations complémentaires. Les intitulés génériques peuvent être remplacés dans **Référentiels → Gérer les niveaux** par les titres correspondant à l’édition utilisée, sans changer les identifiants stables. Les compétences et talents peuvent aussi être importés sous forme d’objets nommés avec identifiant, caractéristique, type base/avancée, rang, conditions, coût ou références. Le gestionnaire affiche leurs noms dans ses champs multilignes et préserve les métadonnées structurées lors d’une édition qui ne change que les noms. Dans Référentiels, les carrières intégrées proposent l’action **Gérer les niveaux** : leur nom et leur classe restent protégés, mais les niveaux peuvent être modifiés, supprimés après confirmation et réordonnés. Les carrières personnalisées disposent des mêmes contrôles.

La base IndexedDB est passée à la version 5. La migration ajoute les magasins de référentiels si nécessaire, convertit les anciennes listes de niveaux texte en objets identifiés, ajoute `careerLevelId` et `speciesId` aux personnages sans effacer leurs anciens champs texte, puis initialise les nouvelles sections de progression, compétences, talents, équipement, ressources et création guidée. Les magasins existants et les fiches de personnages sont préservés. Les nouveaux modificateurs d’espèce sont initialisés à zéro pour les anciennes fiches afin de ne pas modifier rétroactivement leurs valeurs numériques. Les référentiels intégrés sont versionnés et initialisés automatiquement. Leur installation est append-only : une mise à jour peut ajouter de nouveaux niveaux intégrés aux carrières déjà présentes sans remplacer les niveaux existants. Les identifiants de carrière, de niveau et d’espèce sont stables ; les liens restent basés sur ces identifiants, pas sur les noms.

Ouvrez **Référentiels** dans la navigation pour ajouter ou modifier des données personnalisées, associer religions et divinités, compléter les niveaux et détails des carrières, configurer les dix modificateurs d’une espèce, supprimer une entrée personnalisée ou exporter vos données. Dans une carrière, ajoutez plusieurs niveaux puis renseignez leurs compétences, talents, avancements, conditions et informations complémentaires. Les niveaux sont réordonnables ; leur rang suit leur position. Les imports sont ajoutés comme un nouveau pack avec des identifiants propres ; les identifiants de carrière et de niveau sont remappés et les niveaux restent associés à leur carrière importée. Les imports ne remplacent jamais les entrées déjà présentes. Les cartes distinguent les sources intégrées, personnalisées et importées. L’export inclut les données personnalisées, les packs et les profils d’espèce intégrés que vous avez ajustés, mais exclut les données intégrées non modifiées.

### Catalogue des talents

`data/talents.json` contient 162 noms issus de l’index communautaire WFRP4e Wikidot ([index des talents](https://wfrp4e.wikidot.com/talents)). Ce fichier est un index de départ, pas une transcription certifiée du livre de règles : les noms français, catégories, tests, rangs maximum, prérequis, restrictions, liens d’espèce/carrière et effets ne sont pas renseignés lorsqu’ils n’ont pas été vérifiés. Chaque entrée affiche un statut de provenance « communautaire » et porte la source de l’index. Les données intégrées sont protégées ; les compléments personnels et packs peuvent être ajoutés, modifiés, exportés ou supprimés.

L’éditeur de personnage propose une recherche de talents par nom principal, nom français, nom original et alias, avec navigation clavier et affichage progressif des résultats. Le lien stable `referenceId` est conservé dans la fiche ; les métadonnées utiles (nom original, catégorie, rang maximal, prérequis, vérification et source) sont également copiées dans la fiche pour préserver son affichage si le référentiel change. Les suggestions de carrière et d’espèce combinent les listes historiques de ces référentiels avec les talents explicitement associés dans le catalogue. Aucune association n’est déduite automatiquement à partir d’un nom de carrière ou d’espèce.

La section **Catalogue des talents** de Référentiels permet de filtrer par texte, catégorie, espèce, carrière, test/caractéristique, compétence, disponibilité, origine et statut de vérification. L’import/export utilise un format `talent-pack` versionné distinct des packs généraux. Les imports remappent les identifiants, détectent les doublons et ignorent les conflits après confirmation ; ils ne remplacent jamais un talent existant. Une entrée personnalisée peut contenir plusieurs effets structurés, mais un bonus de caractéristique n’est appliqué au calcul que s’il est explicitement marqué vérifié et accompagné d’une référence. Les autres types d’effets restent conservés comme documentation et ne sont pas exécutés.

Le format d’un pack est versionné indépendamment des sauvegardes de personnages :

```json
{
  "app": "warhammer-character-manager",
  "type": "reference-pack",
  "version": 1,
  "exportedAt": "2026-11-20T12:00:00.000Z",
  "pack": {
    "name": "Mes référentiels",
    "entries": []
  }
}
```

Les anciennes fiches qui ne contiennent que les champs texte `religion`, `deity`, `career` et `careerLevel` restent valides. Si le nom d’une carrière ou d’un niveau correspond sans ambiguïté à une entrée, l’éditeur peut la relier à son identifiant stable. Sinon, l’ancienne valeur textuelle est conservée et affichée comme valeur à réassocier ; elle n’est pas supprimée lors de la migration. Les champs texte restent présents dans le format des personnages pour compatibilité avec les sauvegardes existantes. Le nouveau champ `identity.careerLevelId` est enregistré en plus de `identity.careerLevel`.

La création guidée propose neuf étapes : identité, espèce, caractéristiques, carrière/niveau, religion, compétences, talents, ressources et vérification. Chaque déplacement sauvegarde le brouillon dans IndexedDB ; fermer la fenêtre conserve l’étape en cours et la fiche de brouillon permet de reprendre l’assistant depuis le tableau de bord. Les étapes religion, compétences, talents et ressources peuvent être ignorées. La vérification finale renvoie directement aux étapes contenant des erreurs bloquantes ou avertissements. L’identité, une espèce référencée, les dix caractéristiques et une carrière référencée sont obligatoires. Un niveau est également requis lorsque la carrière en contient au moins un ; une carrière sans niveau dans le référentiel produit un avertissement et reste sélectionnable afin de permettre de compléter les données plus tard.

Les caractéristiques restent vides à la création et peuvent toujours être saisies à la main. Le bouton représentant un dé génère un aperçu des dix jets de base avec `2d10`. Le modificateur propre à l’espèce est présenté et conservé séparément ; il n’est donc pas fusionné dans le jet initial ni appliqué deux fois lors des recalculs. La fiche conserve les deux dés de chaque caractéristique, le profil d’espèce référencé et la date de génération. Une confirmation est demandée si des valeurs sont déjà présentes ; **Relancer** remplace uniquement l’aperçu, **Annuler** conserve les champs et **Confirmer** applique les jets et leurs modificateurs séparés. Un historique temporaire des cinq dernières générations confirmées est disponible dans l’éditeur ; **Annuler la dernière génération** restaure les valeurs précédant le dernier jet et demande confirmation si elles ont été modifiées depuis. Changer d’espèce actualise le modificateur sans remplacer la valeur initiale ; si un modificateur n’est pas renseigné, la valeur actuelle correspondante reste non calculée au lieu de supposer un bonus nul. Les champs restent ensuite modifiables. L’expérience n’est pas modifiée automatiquement. Les étapes optionnelles de réarrangement et d’allocation de points ne sont pas incluses dans ce générateur.

## Fiche enrichie, calculs et progression

La fiche distingue désormais, pour chaque caractéristique, la valeur initiale, les bonus structurés provenant de talents, les augmentations achetées, la valeur actuelle et le bonus correspondant au chiffre des dizaines. Les anciennes fiches sont migrées sans changement de leur valeur : leurs caractéristiques deviennent les valeurs initiales et leurs augmentations commencent à zéro. Les effets de talent ne sont appliqués que lorsqu’ils sont définis comme bonus de caractéristique, associés à une caractéristique, explicitement marqués comme vérifiés et accompagnés d’une référence de règle renseignée.

Les compétences peuvent être liées à une caractéristique. Leur valeur est calculée à partir de la caractéristique actuelle et des augmentations saisies ; une base manuelle reste possible pour les compétences qui ne doivent pas reprendre automatiquement une caractéristique. Le type « Base » ou « Avancée » et la caractéristique peuvent être récupérés depuis les entrées structurées de référentiel ; les champs restent modifiables dans le personnage. Les compétences et talents déclarés dans les données d’espèce, de carrière ou de niveau sont proposés dans l’assistant ; le joueur choisit explicitement de les ajouter. Ils restent marqués « sélectionnés, non acquis » jusqu’à confirmation explicite via la case Acquise/Acquis. Une suggestion non acquise ne peut pas recevoir d’achat d’avancement XP. Les entrées conservent leur identifiant et leur provenance lorsqu’ils sont disponibles. Les carrières disposent de quatre rangs génériques, mais leurs intitulés propres, compétences, talents et statuts sociaux ne sont pas encore documentés de manière exhaustive ; l’assistant ne complète pas les données absentes par des suppositions. Les talents disposent d’un rang, de conditions d’acquisition documentables, d’une description, d’un coût d’avancement configurable et, si nécessaire, d’un effet mécanique structuré avec sa référence. Les conditions sont affichées pour contrôle manuel : aucune condition n’est évaluée automatiquement sans règle codée et vérifiée. Les compétences et talents peuvent être ajoutés et supprimés depuis l’éditeur.

L’équipement est réparti entre armes, armures, possessions, sorts et prières. L’encombrement total est la somme des encombrements unitaires multipliés par les quantités. La capacité peut être renseignée dans la fiche afin d’afficher le dépassement éventuel. Les points de corruption et leur seuil peuvent également être suivis et comparés. Ces valeurs de capacité et de seuil restent explicites et configurables : aucune formule d’encombrement ou de corruption non vérifiée n’est appliquée.

Les gains d’XP et les achats de progression sont inscrits dans un historique. L’application contrôle le solde avant un achat de caractéristique, de compétence ou de rang de talent. Le coût doit être renseigné explicitement pour la caractéristique, la compétence ou le talent à progresser ; aucun barème ni coût WFRP4e n’est inventé ou prérempli. **Annuler le dernier achat** restaure la progression et les XP dépensés, avec un contrôle qui refuse l’annulation si la valeur cible a changé depuis l’achat.

Le sélecteur de thème en haut de page bascule entre une ambiance anthracite et un thème parchemin. Le choix est conservé dans LocalStorage. Les polices médiévales sont recherchées localement avec des alternatives système (Georgia/Palatino) ; aucune police distante n’est requise pour fonctionner hors ligne.

Les blessures maximales, le mouvement, la Résistance, le Destin, la Chance, la Résilience et la Motivation restent des valeurs manuelles. Le bonus de Force et le bonus d’Endurance sont dérivés des dizaines des caractéristiques F et E lorsque celles-ci sont renseignées ; une valeur manuelle de secours reste possible en l’absence de caractéristique calculable. Les autres formules dépendant de l’espèce, les coûts par palier WFRP4e, les conditions d’accès aux carrières et les effets mécaniques non structurés doivent encore être vérifiés avant de les automatiser. Les effets de talents non vérifiés sont ignorés dans les calculs.

## Lancer l'application

L'application doit être servie depuis une origine locale ou HTTPS pour activer IndexedDB et le Service Worker. Depuis la racine du dépôt, avec Python 3 :

```bash
python3 -m http.server 8000
```

Ouvrir ensuite <http://localhost:8000> dans un navigateur moderne.

Il est aussi possible de publier directement les fichiers sur un hébergement statique.

## Stockage et sauvegardes

Les personnages sont conservés dans la base IndexedDB `warhammer-character-manager`, dans le navigateur et sur l'origine du site. Effacer les données du site ou changer de navigateur/appareil peut supprimer ou rendre inaccessibles ces fiches. Utilisez **Exporter** pour télécharger régulièrement un fichier de sauvegarde JSON et conservez-le ailleurs.

Le format d'échange utilise les propriétés suivantes :

```json
{
  "app": "warhammer-character-manager",
  "type": "backup",
  "version": 1,
  "exportedAt": "2026-11-20T12:00:00.000Z",
  "characters": []
}
```

Un export individuel utilise `type: "character"` et contient un objet `character`. Les changements de format devront augmenter `version` et être traités explicitement à l'import.

## Publication sur GitHub Pages

Le workflow `.github/workflows/pages.yml` publie automatiquement le contenu statique à chaque mise à jour de la branche `main`.

1. Dans les paramètres du dépôt GitHub, ouvrir **Settings → Pages**.
2. Choisir **GitHub Actions** comme source de publication.
3. Envoyer les commits sur `main` ou lancer manuellement le workflow **Publier sur GitHub Pages**.

Les chemins de ressources, le manifeste et le périmètre du Service Worker sont relatifs à la racine de déploiement. L'application peut donc être hébergée dans un sous-répertoire GitHub Pages.

## Vérifications locales

Node.js 20 ou une version récente suffit ; aucune dépendance npm n'est requise.

```bash
npm test
npm run check
```

Les tests couvrent le modèle de personnage, les calculs de caractéristiques et de compétences, la séparation des bonus d’espèce, les talents vérifiés, l’encombrement, le seuil de corruption, les gains et achats d’XP, le refus d’achat pour une suggestion non acquise, l’annulation d’un achat, les étapes de l’assistant, les suggestions et la validation finale, la migration des niveaux structurés, l’import/export, les référentiels et la validation des imports. La persistance IndexedDB réelle, la fermeture/réouverture du navigateur et l'installation PWA doivent également être vérifiées dans un navigateur.

Les tests de génération injectent une source aléatoire déterministe et vérifient les vingt dés, les dix caractéristiques, les cinq profils intégrés, les alias, les limites et le rejet des profils incomplets.

## Architecture

```text
index.html
manifest.json
service-worker.js
assets/
  css/app.css
  icons/
src/
  app.js
  router.js
  database/
    indexeddb.js
    migrations.js
  components/
    reference-picker.js
    talent-picker.js
  models/
    character.js
  rules/
    characteristic-generator.js
    character-calculations.js
  services/
    import-export.js
    reference-catalog.js
    talents.js
    creation-wizard.js
    progression.js
    theme.js
  utils/
    format.js
  views/
    dashboard.js
    character-detail.js
    reference-manager.js
data/
  religions.json
  deities.json
  careers.json
  species.json
  talents.json
tests/character.test.mjs
tests/creation-wizard.test.mjs
tests/characteristic-generator.test.mjs
tests/character-calculations.test.mjs
tests/progression.test.mjs
tests/reference-catalog.test.mjs
tests/talents.test.mjs
```

## Périmètre et prochaines étapes

Les référentiels de carrière contiennent les champs nécessaires pour accueillir compétences, talents, équipement et conditions, mais les valeurs officielles détaillées ne sont pas préremplies. Il n’existe pas encore de moteur de coûts d’avancement ou de combat. Toute extension devra être vérifiée avec les règles applicables et éviter de reproduire du contenu protégé. Le projet reste exclusivement consacré aux fiches individuelles : aucune gestion de campagne, de groupe ou de partie n'est prévue.
