import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter, createId, normalizeCharacter } from '../src/models/character.js';

test('une fiche vierge est sauvegardée, rechargée puis dupliquée indépendamment', async (context) => {
  const previousIndexedDB = globalThis.indexedDB;
  const records = new Map();
  const clone = (value) => value === undefined ? undefined : structuredClone(value);
  const database = {
    transaction(storeName, mode) {
      assert.equal(storeName, 'characters');
      const transaction = {
        mode,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore() {
          return {
            put(character) {
              records.set(character.id, clone(character));
              return { result: character.id };
            },
            get(id) { return { result: clone(records.get(id)) }; },
            getAll() { return { result: [...records.values()].map(clone) }; }
          };
        }
      };
      queueMicrotask(() => transaction.oncomplete?.());
      return transaction;
    },
    close() {}
  };

  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        request.onsuccess?.();
      });
      return request;
    }
  };

  context.after(() => {
    if (previousIndexedDB === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previousIndexedDB;
  });

  const { getAllCharacters, getCharacter, saveCharacter } = await import('../src/database/indexeddb.js?character-sheet-roundtrip');
  const blank = createCharacter();
  assert.equal(blank.identity.firstName, '');
  assert.equal(blank.identity.lastName, '');
  assert.equal(blank.isDraft, false);
  await saveCharacter(blank);

  const reopened = await getCharacter(blank.id);
  assert.equal(reopened.id, blank.id);
  assert.equal(reopened.identity.firstName, '');
  assert.equal(reopened.characteristics.CC, null);

  const edited = normalizeCharacter({
    ...reopened,
    identity: { ...reopened.identity, firstName: 'Marta', lastName: 'Weiss' },
    profile: { ...reopened.profile, notes: 'Modification enregistrée' }
  });
  await saveCharacter(edited);

  const reloaded = await getCharacter(blank.id);
  assert.equal(reloaded.identity.firstName, 'Marta');
  assert.equal(reloaded.profile.notes, 'Modification enregistrée');

  const duplicate = normalizeCharacter({
    ...reloaded,
    id: createId(),
    identity: { ...reloaded.identity, lastName: `${reloaded.identity.lastName} (copie)` }
  });
  await saveCharacter(duplicate);
  assert.notEqual(duplicate.id, reloaded.id);
  assert.equal((await getAllCharacters()).length, 2);

  const editedDuplicate = normalizeCharacter({
    ...duplicate,
    identity: { ...duplicate.identity, firstName: 'Alaric' }
  });
  await saveCharacter(editedDuplicate);
  assert.equal((await getCharacter(reloaded.id)).identity.firstName, 'Marta');
  assert.equal((await getCharacter(duplicate.id)).identity.firstName, 'Alaric');
});

test('un import groupé est écrit dans une transaction unique et annulé en cas d’échec', async (context) => {
  const previousIndexedDB = globalThis.indexedDB;
  const transactions = [];
  const committedBatches = [];
  let failingId = '';

  const database = {
    transaction(storeNames, mode) {
      const pendingWrites = [];
      const record = { storeNames, mode, aborted: false };
      transactions.push(record);
      const transaction = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        abort() {
          record.aborted = true;
          queueMicrotask(() => transaction.onabort?.());
        },
        objectStore(name) {
          assert.equal(name, 'characters');
          return {
            put(character) {
              if (character.id === failingId) throw new Error('Écriture IndexedDB simulée impossible.');
              pendingWrites.push(character);
              return { result: character.id };
            }
          };
        }
      };
      queueMicrotask(() => {
        if (record.aborted) return;
        committedBatches.push(pendingWrites);
        transaction.oncomplete?.();
      });
      return transaction;
    }
  };

  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = database;
        request.onsuccess?.();
      });
      return request;
    }
  };

  context.after(() => {
    if (previousIndexedDB === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previousIndexedDB;
  });

  const { saveCharacters } = await import('../src/database/indexeddb.js?atomic-test');
  const batch = [{ id: 'character-one' }, { id: 'character-two' }];
  assert.equal(await saveCharacters(batch), batch);
  assert.equal(transactions.length, 1);
  assert.equal(transactions[0].mode, 'readwrite');
  assert.deepEqual(committedBatches, [batch]);

  failingId = 'character-fail';
  await assert.rejects(
    saveCharacters([{ id: 'character-three' }, { id: failingId }]),
    /Écriture IndexedDB simulée impossible/
  );
  assert.equal(transactions.length, 2);
  assert.equal(transactions[1].aborted, true);
  assert.equal(committedBatches.length, 1);

  const transactionCount = transactions.length;
  assert.throws(() => saveCharacters([{ id: 'duplicate' }, { id: 'duplicate' }]), /dupliqué/);
  assert.equal(transactions.length, transactionCount);
  assert.throws(() => saveCharacters([{ name: 'Sans identifiant' }]), /identifiant valide/);
  assert.equal(transactions.length, transactionCount);
});

test('une ouverture IndexedDB bloquée ne conserve pas une promesse rejetée pour les tentatives suivantes', async (context) => {
  const previousIndexedDB = globalThis.indexedDB;
  let openCount = 0;
  let blockedRequest;
  let lateDatabaseClosed = false;
  const database = {
    transaction() {
      const transaction = {
        oncomplete: null,
        objectStore() {
          return {
            getAll() { return { result: [] }; }
          };
        }
      };
      queueMicrotask(() => transaction.oncomplete?.());
      return transaction;
    }
  };

  globalThis.indexedDB = {
    open() {
      openCount += 1;
      const request = {};
      queueMicrotask(() => {
        if (openCount === 1) {
          blockedRequest = request;
          request.onblocked?.();
          return;
        }
        request.result = database;
        request.onsuccess?.();
      });
      return request;
    }
  };

  context.after(() => {
    if (previousIndexedDB === undefined) delete globalThis.indexedDB;
    else globalThis.indexedDB = previousIndexedDB;
  });

  const { getAllCharacters } = await import('../src/database/indexeddb.js?blocked-retry-test');
  await assert.rejects(getAllCharacters(), /utilisée par un autre onglet/);
  assert.deepEqual(await getAllCharacters(), []);
  assert.equal(openCount, 2);
  blockedRequest.result = { close() { lateDatabaseClosed = true; } };
  blockedRequest.onsuccess();
  assert.equal(lateDatabaseClosed, true);
});
