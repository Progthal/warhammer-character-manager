# Warhammer Character Manager

Application web personnelle pour créer et conserver des personnages de **Warhammer Fantasy Roleplay – 4e édition**.

L'application est composée de fichiers statiques HTML, CSS et JavaScript natif. Elle ne nécessite ni PHP, ni serveur applicatif, ni compte utilisateur, ni base de données distante. Les fiches sont enregistrées dans IndexedDB sur l'appareil utilisé.

## Fonctionnalités de la fondation

- Tableau de bord des personnages avec recherche, tri et indicateurs.
- Création d'une fiche, modification avec sauvegarde automatique, duplication et suppression après confirmation.
- Fiche détaillée : identité, carrière, expérience, caractéristiques principales et secondaires, chronique personnelle.
- Export JSON d'une fiche ou de l'ensemble du registre.
- Import JSON versionné avec validation et protection contre l'écrasement des identifiants existants. En cas de collision, la fiche importée est ajoutée comme une copie.
- Stockage IndexedDB versionné avec index de recherche et point d'entrée pour les migrations.
- PWA avec manifeste et Service Worker pour mettre en cache l'application et permettre son ouverture hors ligne après le premier chargement.
- Interface responsive pour ordinateur, tablette et smartphone.

## Référentiels locaux (phase 2)

Les fiches de personnage utilisent maintenant des référentiels intégrés pour les religions, les divinités et les carrières. Les champs correspondants sont des sélecteurs avec recherche, navigation au clavier, sélection au toucher ou à la souris, informations complémentaires et effacement explicite. La divinité est filtrée selon la religion ; en cas de changement incompatible, l’application demande confirmation avant de l’effacer. Une carrière affiche sa classe et ses informations disponibles ; ses niveaux sont récupérés par identifiant stable, sélectionnables dans une liste déroulante et enregistrés avec leur nom et leur identifiant.

Les fichiers de départ sont `data/religions.json`, `data/deities.json` et `data/careers.json`. Les religions et divinités intégrées forment une base synthétique et partielle de dix cultes humains du Vieux Monde ; elles ne prétendent pas couvrir tous les panthéons. Les 64 noms de carrières et leurs classes sont repris d’une aide de jeu française secondaire, référencée dans `data/careers.json` et dans la page des Référentiels : les intitulés français peuvent varier suivant la traduction et doivent être vérifiés dans l’ouvrage utilisé. La source consultée ne contient pas les niveaux détaillés des carrières. Aucun niveau officiel, profil de compétences, talent, avancement, condition ou équipement n’est inventé : l’application permet désormais de saisir ces éléments manuellement à partir de sources vérifiées.

Chaque carrière contient désormais une liste d’objets `levels`. Chaque niveau possède son propre `id`, le `careerId` parent, un nom, un rang, ses compétences et talents (noms et identifiants), ses avancements, conditions d’accès/de sortie, équipement, description, références et informations complémentaires. Les identifiants des niveaux ne dépendent pas de leur nom. Dans Référentiels, les carrières intégrées proposent l’action **Gérer les niveaux** : leur nom et leur classe restent protégés, mais les niveaux personnalisés peuvent être ajoutés, modifiés, supprimés après confirmation et réordonnés. Les carrières personnalisées disposent des mêmes contrôles.

La base IndexedDB est passée à la version 3. La migration ajoute les magasins de référentiels si nécessaire, convertit les anciennes listes de niveaux texte en objets identifiés, et ajoute `careerLevelId` aux personnages sans effacer leur ancien champ texte `careerLevel`. Les magasins existants et les fiches de personnages sont préservés. Les référentiels intégrés sont versionnés et initialisés automatiquement. Leur installation est append-only : une mise à jour peut ajouter de nouveaux niveaux intégrés aux carrières déjà présentes sans remplacer les niveaux existants. Les identifiants de carrière et de niveau sont stables ; les liens restent basés sur ces identifiants, pas sur les noms.

Ouvrez **Référentiels** dans la navigation pour ajouter ou modifier des données personnalisées, associer religions et divinités, compléter les niveaux et détails des carrières, supprimer une entrée personnalisée ou exporter vos données. Dans une carrière, ajoutez plusieurs niveaux puis renseignez leurs compétences, talents, avancements, conditions et informations complémentaires. Les niveaux sont réordonnables ; leur rang suit leur position. Les imports sont ajoutés comme un nouveau pack avec des identifiants propres ; les identifiants de carrière et de niveau sont remappés et les niveaux restent associés à leur carrière importée. Les imports ne remplacent jamais les entrées déjà présentes. Les cartes distinguent les sources intégrées, personnalisées et importées. L’export inclut les données personnalisées et les packs, mais exclut les données intégrées.

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

Les valeurs de caractéristiques sont laissées vides à la création. Cette version ne prétend pas calculer les règles de création WFRP4e : aucun profil de départ ni coût d'avancement arbitraire n'est injecté.

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

Les tests couvrent le modèle de personnage, la validation et la migration des niveaux structurés, les niveaux multiples, leurs identifiants stables, l’import/export des packs, la fusion append-only des référentiels, les valeurs de personnages historiques et la validation des imports. La persistance IndexedDB réelle, la fermeture/réouverture du navigateur et l'installation PWA doivent également être vérifiées dans un navigateur.

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
  models/
    character.js
  services/
    import-export.js
    reference-catalog.js
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
tests/character.test.mjs
tests/reference-catalog.test.mjs
```

## Périmètre et prochaines étapes

Les référentiels de carrière contiennent les champs nécessaires pour accueillir compétences, talents, équipement et conditions, mais les valeurs officielles détaillées ne sont pas préremplies. Il n’existe pas encore de moteur de coûts d’avancement ou de combat. Toute extension devra être vérifiée avec les règles applicables et éviter de reproduire du contenu protégé. Le projet reste exclusivement consacré aux fiches individuelles : aucune gestion de campagne, de groupe ou de partie n'est prévue.
