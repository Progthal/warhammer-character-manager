import { DATABASE_NAME, DATABASE_VERSION, upgradeDatabase } from './migrations.js';

let databasePromise;

function openDatabase() {
  if (!('indexedDB' in globalThis)) {
    return Promise.reject(new Error('IndexedDB n’est pas disponible dans ce navigateur.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = (event) => {
      upgradeDatabase(request.result, request.transaction, event.oldVersion);
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error || new Error('Impossible d’ouvrir la base locale.'));
    };
    request.onblocked = () => {
      reject(new Error('La base locale est utilisée par un autre onglet. Fermez les autres onglets de l’application.'));
    };
  });

  return databasePromise;
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

export function seedReferenceEntries(entries, metaRecord) {
  return runTransaction(['referenceEntries', 'referenceMeta'], 'readwrite', (stores) => {
    // Les jeux de données intégrés sont append-only : une nouvelle version peut
    // ajouter des identifiants, mais ne réécrit jamais une entrée déjà installée.
    entries.forEach((entry) => {
      const request = stores.referenceEntries.get(entry.id);
      request.onsuccess = () => {
        if (!request.result) stores.referenceEntries.add(entry);
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
