import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERISTICS, createCharacter, getCharacterName, getExperienceAvailable, normalizeCharacter, validateCharacter } from '../src/models/character.js';
import { createBackupExport, createCharacterExport, parseImportPayload, prepareImportedCharacters } from '../src/services/import-export.js';
import { renderCharacterDetail } from '../src/views/character-detail.js';

test('une nouvelle fiche possède les sections attendues sans valeurs de règles inventées', () => {
  const character = createCharacter();
  assert.equal(character.schemaVersion, 4);
  assert.equal(character.identity.status, 'Actif');
  assert.equal(character.characteristics.CC, null);
  assert.equal(Object.keys(character.characteristics).length, 10);
  assert.equal(character.characteristicAdvances.CC, 0);
  assert.deepEqual(character.skills, []);
  assert.deepEqual(character.equipment.weapons, []);
  assert.deepEqual(character.experience.history, []);
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

  const levelLinked = normalizeCharacter({ identity: {
    career: 'Soldat', careerId: 'builtin:career:soldat',
    careerLevel: 'Recrue', careerLevelId: 'builtin:career:soldat:level:1'
  } });
  assert.equal(levelLinked.identity.careerLevel, 'Recrue');
  assert.equal(levelLinked.identity.careerLevelId, 'builtin:career:soldat:level:1');
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

test('l’export et le rechargement JSON conservent les identifiants de carrière et de niveau', () => {
  const character = createCharacter({ identity: {
    career: 'Gardien des archives', careerId: 'custom:career:archives',
    careerLevel: 'Archiviste', careerLevelId: 'career-level:archives-2'
  } });
  const payload = createCharacterExport(character);
  const imported = prepareImportedCharacters(parseImportPayload(payload).characters)[0].character;
  assert.equal(imported.identity.careerId, 'custom:career:archives');
  assert.equal(imported.identity.careerLevelId, 'career-level:archives-2');
  assert.equal(imported.identity.careerLevel, 'Archiviste');
});

test('la fiche détaillée affiche les informations du niveau référencé par identifiant', () => {
  const career = {
    id: 'custom:career:scribe', kind: 'careers', name: 'Scribe', className: 'Lettrés',
    levels: [{
      id: 'career-level:scribe:1', careerId: 'custom:career:scribe', name: 'Copiste', rank: 1,
      skills: ['Écriture'], talents: ['Lecture rapide'], advancements: ['Intelligence'],
      entryConditions: ['Savoir lire'], equipment: ['Plume']
    }]
  };
  const character = createCharacter({ identity: {
    firstName: 'Marta', career: 'Scribe', careerId: career.id,
    careerLevel: 'Copiste', careerLevelId: 'career-level:scribe:1'
  } });
  const html = renderCharacterDetail(character, [career]);
  assert.match(html, /Progression et niveau/);
  assert.match(html, /Copiste/);
  assert.match(html, /Écriture/);
  assert.match(html, /Lecture rapide/);
  assert.match(html, /Savoir lire/);
});

test('la normalisation préserve compétences, talents, équipement et historique XP lors des imports', () => {
  const character = normalizeCharacter({
    experience: { total: 500, spent: 100, history: [{ id: 'xp-1', type: 'gain', amount: 500, note: 'Session' }] },
    characteristicAdvances: { CC: 3 },
    skills: [{ id: 'skill-1', name: 'Esquive', characteristic: 'Ag', advances: 2, advancementCost: 25, career: true }],
    talents: [{ id: 'talent-1', name: 'Réflexes', rank: 2, effects: [{ type: 'characteristicBonus', characteristic: 'Ag', value: 5, verified: true }] }],
    equipment: { weapons: [{ id: 'weapon-1', name: 'Épée', damage: 'SB+4', encumbrance: 1, quantity: 2 }] },
    resources: { corruptionPoints: 4 },
    rules: { corruptionThreshold: 3, encumbranceCapacity: 1 }
  });
  const exported = createCharacterExport(character);
  const [{ character: restored }] = prepareImportedCharacters(parseImportPayload(exported).characters);
  assert.equal(restored.characteristicAdvances.CC, 3);
  assert.equal(restored.skills[0].id, 'skill-1');
  assert.equal(restored.talents[0].effects[0].verified, true);
  assert.equal(restored.equipment.weapons[0].quantity, 2);
  assert.equal(restored.experience.history[0].note, 'Session');
  assert.equal(restored.resources.corruptionPoints, 4);
  assert.equal(restored.rules.corruptionThreshold, 3);
});
