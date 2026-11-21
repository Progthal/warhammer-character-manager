import { DATABASE_NAME, DATABASE_VERSION, upgradeDatabase } from './migrations.js';

let databasePromise;

function openDatabase() {
  if (!('indexedDB' in globalThis)) {
    return Promise.reject(new Error('IndexedDB n’est pas disponible dans ce navigateur.'));
  }
  if (databasePromise) return databasePromise;

  let opening;
  let wasBlocked = false;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      upgradeDatabase(request.result, request.transaction, event.oldVersion);
    };
    request.onsuccess = () => {
      const database = request.result;
      if (wasBlocked) {
        database.close();
        return;
      }
      database.onversionchange = () => {
        database.close();
        if (databasePromise === opening) databasePromise = undefined;
      };
      resolve(database);
    };
    request.onerror = () => {
      if (databasePromise === opening) databasePromise = undefined;
      reject(request.error || new Error('Impossible d’ouvrir la base locale.'));
    };
    request.onblocked = () => {
      wasBlocked = true;
      if (databasePromise === opening) databasePromise = undefined;
      reject(new Error('La base locale est utilisée par un autre onglet. Fermez les autres onglets de l’application.'));
    };
  });

  databasePromise = opening;
  return opening;
}

function runTransaction(storeNames, mode, operation) {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    const transaction = database.transaction(storeNames, mode);
    const stores = Array.isArray(storeNames)
      ? Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]))
      : transaction.objectStore(storeNames);
    let result;
    try {
      result = operation(stores, transaction);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(result?.result ?? result);
    transaction.onerror = () => reject(transaction.error || new Error('Échec de la transaction IndexedDB.'));
    transaction.onabort = () => reject(transaction.error || new Error('Transaction IndexedDB annulée.'));
  }));
}

export function getAllCharacters() {
  return runTransaction('characters', 'readonly', (store) => store.getAll());
}

export function getCharacter(id) {
  return runTransaction('characters', 'readonly', (store) => store.get(id));
}

export function saveCharacter(character) {
  return runTransaction('characters', 'readwrite', (store) => store.put(character)).then(() => character);
}

/** Enregistre un lot de fiches dans une seule transaction atomique. */
export function saveCharacters(characters) {
  if (!Array.isArray(characters)) throw new TypeError('Les personnages à enregistrer doivent former un tableau.');
  const ids = new Set();
  for (const character of characters) {
    if (!character || typeof character !== 'object' || Array.isArray(character)
      || typeof character.id !== 'string' || !character.id.trim()) {
      throw new TypeError('Chaque personnage doit posséder un identifiant valide.');
    }
    if (ids.has(character.id)) throw new Error(`Identifiant de personnage dupliqué dans le lot : ${character.id}.`);
    ids.add(character.id);
  }
  return runTransaction('characters', 'readwrite', (store) => {
    characters.forEach((character) => store.put(character));
  }).then(() => characters);
}

export function deleteCharacter(id) {
  return runTransaction('characters', 'readwrite', (store) => store.delete(id));
}

export async function countCharacters() {
  return runTransaction('characters', 'readonly', (store) => store.count());
}

export function getAllReferenceEntries() {
  return runTransaction('referenceEntries', 'readonly', (store) => store.getAll());
}

export function getReferenceEntry(id) {
  return runTransaction('referenceEntries', 'readonly', (store) => store.get(id));
}

export function saveReferenceEntries(entries) {
  if (!Array.isArray(entries)) throw new TypeError('Les référentiels doivent être un tableau.');
  return runTransaction('referenceEntries', 'readwrite', (store) => {
    entries.forEach((entry) => store.put(entry));
  }).then(() => entries);
}

export function deleteReferenceEntry(id) {
  return runTransaction('referenceEntries', 'readwrite', (store) => store.delete(id));
}

export function getReferenceMeta(key) {
  return runTransaction('referenceMeta', 'readonly', (store) => store.get(key));
}

export function saveReferenceMeta(record) {
  return runTransaction('referenceMeta', 'readwrite', (store) => store.put(record));
}

export function mergeBuiltInCareerLevels(existing, incoming) {
  if (!existing || existing.source !== 'builtin' || incoming?.kind !== 'careers' || !Array.isArray(incoming.levels)) return existing;
  const currentLevels = Array.isArray(existing.levels) ? existing.levels : [];
  const knownIds = new Set(currentLevels.map((level) => typeof level === 'object' ? level.id : '').filter(Boolean));
  const additions = incoming.levels.filter((level) => level?.id && !knownIds.has(level.id));
  if (!additions.length) return existing;
  return {
    ...existing,
    levels: [...currentLevels, ...additions].sort((a, b) => (a.rank || 0) - (b.rank || 0))
  };
}

export function mergeBuiltInTalentReferences(existing, incoming) {
  if (!existing || existing.source !== 'builtin' || incoming?.kind !== 'talents' || existing.id !== incoming.id) return existing;
  const aliases = [...new Set([...(existing.aliases || []), ...(incoming.aliases || [])])];
  const references = [...new Set([...(existing.references || []), ...(incoming.references || [])])];
  const sourceInfo = { ...(existing.sourceInfo || {}) };
  for (const [key, value] of Object.entries(incoming.sourceInfo || {})) {
    if (!sourceInfo[key] && value) sourceInfo[key] = value;
  }
  const changed = aliases.length !== (existing.aliases || []).length
    || references.length !== (existing.references || []).length
    || Object.keys(sourceInfo).some((key) => sourceInfo[key] !== existing.sourceInfo?.[key]);
  return changed ? { ...existing, aliases, references, sourceInfo } : existing;
}

export function seedReferenceEntries(entries, metaRecord) {
  return runTransaction(['referenceEntries', 'referenceMeta'], 'readwrite', (stores) => {
    // Les jeux de données intégrés restent append-only. Pour une carrière déjà
    // installée, les nouveaux niveaux stables sont ajoutés sans remplacer ceux
    // qui existent déjà ni toucher aux champs personnalisés éventuels.
    entries.forEach((entry) => {
      const request = stores.referenceEntries.get(entry.id);
      request.onsuccess = () => {
        const existing = request.result;
        if (!existing) {
          stores.referenceEntries.add(entry);
          return;
        }
        const merged = mergeBuiltInTalentReferences(mergeBuiltInCareerLevels(existing, entry), entry);
        if (merged !== existing) stores.referenceEntries.put({ ...merged, updatedAt: metaRecord.updatedAt });
      };
    });
    stores.referenceMeta.put(metaRecord);
  }).then(() => entries);
}

export function saveReferenceBundle(entries, deletedIds = []) {
  return runTransaction('referenceEntries', 'readwrite', (store) => {
    deletedIds.forEach((id) => store.delete(id));
    entries.forEach((entry) => store.put(entry));
  }).then(() => entries);
}
