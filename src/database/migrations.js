export const DATABASE_NAME = 'warhammer-character-manager';
export const DATABASE_VERSION = 2;

export function upgradeDatabase(database, transaction, oldVersion) {
  if (oldVersion < 1 && !database.objectStoreNames.contains('characters')) {
    const characters = database.createObjectStore('characters', { keyPath: 'id' });
    characters.createIndex('updatedAt', 'updatedAt', { unique: false });
    characters.createIndex('species', 'identity.species', { unique: false });
    characters.createIndex('career', 'identity.career', { unique: false });
  }

  if (oldVersion < 2) {
    if (!database.objectStoreNames.contains('referenceEntries')) {
      const references = database.createObjectStore('referenceEntries', { keyPath: 'id' });
      references.createIndex('kind', 'kind', { unique: false });
      references.createIndex('source', 'source', { unique: false });
      references.createIndex('packId', 'packId', { unique: false });
      references.createIndex('updatedAt', 'updatedAt', { unique: false });
    }
    if (!database.objectStoreNames.contains('referenceMeta')) {
      database.createObjectStore('referenceMeta', { keyPath: 'key' });
    }
  }

  // Les prochaines évolutions de schéma seront ajoutées ici sans supprimer
  // les fiches déjà enregistrées dans le navigateur. La migration 2 ajoute
  // uniquement les magasins de référentiels : le magasin characters reste intact.
  void transaction;
}
