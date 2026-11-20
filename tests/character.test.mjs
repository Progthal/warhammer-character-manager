import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERISTICS, createCharacter, getCharacterName, getExperienceAvailable, normalizeCharacter, validateCharacter } from '../src/models/character.js';
import { createBackupExport, createCharacterExport, parseImportPayload, prepareImportedCharacters } from '../src/services/import-export.js';

test('une nouvelle fiche possède les sections attendues sans valeurs de règles inventées', () => {
  const character = createCharacter();
  assert.equal(character.schemaVersion, 1);
  assert.equal(character.identity.status, 'Actif');
  assert.equal(character.characteristics.CC, null);
  assert.equal(Object.keys(character.characteristics).length, 10);
  assert.equal(CHARACTERISTICS.length, 10);
  assert.equal(validateCharacter(character).valid, true);
});

test('la normalisation protège les champs et calcule le nom et le solde XP', () => {
  const character = normalizeCharacter({
    identity: { firstName: '  Alaric ', lastName: ' von Kessel ' },
    experience: { total: 1200, spent: 350 }
  });
  assert.equal(getCharacterName(character), 'Alaric von Kessel');
  assert.equal(getExperienceAvailable(character), 850);
  assert.equal(character.characteristics.FM, null);
});

test('les identifiants de référentiel sont ajoutés sans perdre les anciennes valeurs textuelles', () => {
  const legacy = normalizeCharacter({ identity: { religion: 'Culte de Sigmar', deity: 'Sigmar', career: 'Soldat' } });
  assert.equal(legacy.identity.religion, 'Culte de Sigmar');
  assert.equal(legacy.identity.deity, 'Sigmar');
  assert.equal(legacy.identity.career, 'Soldat');
  assert.equal(legacy.identity.religionId, '');
  assert.equal(legacy.identity.deityId, '');
  assert.equal(legacy.identity.careerId, '');

  const linked = normalizeCharacter({ identity: { religionId: 'builtin:religion:sigmar', deityId: 'builtin:deity:sigmar', careerId: 'builtin:career:soldat' } });
  assert.equal(linked.identity.religionId, 'builtin:religion:sigmar');
  assert.equal(linked.identity.deityId, 'builtin:deity:sigmar');
  assert.equal(linked.identity.careerId, 'builtin:career:soldat');
});

test('une dépense supérieure au total ne produit pas un solde négatif', () => {
  const character = createCharacter({ experience: { total: 100, spent: 150 } });
  assert.equal(getExperienceAvailable(character), 0);
});

test('les exports individuels et complets sont versionnés puis validés', () => {
  const character = createCharacter({ identity: { firstName: 'Marta', lastName: 'Weiss' } });
  const single = createCharacterExport(character, '2026-11-20T12:00:00.000Z');
  const backup = createBackupExport([character]);
  assert.equal(parseImportPayload(single).characters.length, 1);
  assert.equal(parseImportPayload(backup).characters.length, 1);
  assert.throws(() => parseImportPayload({ ...single, version: 99 }), /non prise en charge/);
});

test('un import ne remplace jamais un identifiant déjà présent', () => {
  const character = createCharacter();
  const [result] = prepareImportedCharacters([character], new Set([character.id]));
  assert.equal(result.copiedBecauseOfIdCollision, true);
  assert.notEqual(result.character.id, character.id);
  assert.equal(result.character.isDraft, false);
});

test('un import malformé ou avec des valeurs numériques invalides est rejeté', () => {
  const character = createCharacter();
  character.characteristics.CC = -10;
  assert.throws(() => parseImportPayload(createCharacterExport(character)), /Valeur numérique invalide/);
  assert.throws(() => parseImportPayload('{not-json}'), /objet JSON/);
});
