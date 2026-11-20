import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildReferenceDeleteBundle,
  buildReferenceSaveBundle,
  createCareerLevel,
  createCustomReference,
  exportCustomReferencePack,
  findCareerLevel,
  getCareerLevels,
  getReferenceOptions,
  loadBuiltInReferenceData,
  normalizeReference,
  parseReferencePack,
  preserveNamedMetadata,
  prepareImportedReferencePack,
  validateReferenceEntries
} from '../src/services/reference-catalog.js';
import { filterReferenceOptions, findReferenceByLegacyValue, isDeityCompatibleWithReligion } from '../src/components/reference-picker.js';
import { upgradeDatabase, DATABASE_VERSION, migrateCareerReferenceRecord, migrateCharacterRecord } from '../src/database/migrations.js';
import { mergeBuiltInCareerLevels } from '../src/database/indexeddb.js';
import { renderCareerLevelsEditor, renderReferenceEditor, renderReferenceManager } from '../src/views/reference-manager.js';

const kinds = ['religions', 'deities', 'careers', 'species', 'talents'];
const datasets = Object.fromEntries(await Promise.all(kinds.map(async (kind) => [
  kind,
  JSON.parse(await readFile(new URL(`../data/${kind}.json`, import.meta.url), 'utf8'))
])));
const builtins = kinds.flatMap((kind) => datasets[kind].entries.map((entry) => ({ ...entry, kind, source: 'builtin' })));

test('les référentiels initiaux sont lisibles, structurés et identifiés de façon stable', () => {
  assert.equal(datasets.religions.entries.length, 10);
  assert.equal(datasets.deities.entries.length, 10);
  assert.equal(datasets.careers.entries.length, 64);
  assert.equal(datasets.careers.schemaVersion, 2);
  assert.equal(datasets.careers.version, 3);
  assert.equal(datasets.species.entries.length, 5);
  assert.equal(datasets.species.schemaVersion, 1);
  assert.equal(datasets.species.version, 1);
  for (const kind of kinds) {
    const result = validateReferenceEntries(datasets[kind].entries.map((entry) => ({ ...entry, kind })), { existingEntries: builtins });
    assert.equal(result.valid, true, result.errors.join('; '));
  }
  assert.ok(datasets.careers.entries.every((career) => Array.isArray(career.levels) && career.levels.length === 4));
  for (const career of datasets.careers.entries) {
    assert.deepEqual(career.levels.map((level) => level.rank), [1, 2, 3, 4]);
    assert.deepEqual(career.levels.map((level) => level.name), ['Rang I', 'Rang II', 'Rang III', 'Rang IV']);
    assert.ok(career.levels.every((level, index) => level.id === `${career.id}:level:${index + 1}` && level.careerId === career.id));
  }
  assert.ok(datasets.species.entries.every((species) => Object.keys(species.characteristicModifiers).length === 10));
});

test('le chargement automatique récupère les cinq jeux JSON versionnés', async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    const kind = String(url).split('/').at(-1).replace(/\.json$/, '');
    requested.push(kind);
    return { ok: true, json: async () => datasets[kind] };
  };
  try {
    const loaded = await loadBuiltInReferenceData();
    assert.deepEqual(requested.sort(), ['careers', 'deities', 'religions', 'species', 'talents']);
    assert.equal(loaded.find((dataset) => dataset.kind === 'careers').version, 3);
    assert.equal(loaded.find((dataset) => dataset.kind === 'species').version, 1);
    assert.equal(loaded.find((dataset) => dataset.kind === 'talents').entries.length, 162);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('les divinités sont filtrées selon la religion liée, sans masquer les autres si aucun filtre n’est actif', () => {
  const manann = builtins.find((entry) => entry.id === 'builtin:religion:manann');
  const all = getReferenceOptions(builtins, 'deities');
  const filtered = getReferenceOptions(builtins, 'deities', { religionId: manann.id });
  assert.equal(all.length, 10);
  assert.deepEqual(filtered.map((entry) => entry.name), ['Manann']);
});

test('le changement de religion détecte les incompatibilités et la recherche est insensible aux accents', () => {
  const sigmarReligion = builtins.find((entry) => entry.id === 'builtin:religion:sigmar');
  const morrReligion = builtins.find((entry) => entry.id === 'builtin:religion:morr');
  const sigmar = builtins.find((entry) => entry.id === 'builtin:deity:sigmar');
  const manann = builtins.find((entry) => entry.id === 'builtin:deity:manann');
  assert.equal(isDeityCompatibleWithReligion(sigmar, sigmarReligion), true);
  assert.equal(isDeityCompatibleWithReligion(sigmar, morrReligion), false);
  assert.equal(isDeityCompatibleWithReligion(manann, null), true);
  assert.deepEqual(filterReferenceOptions(builtins, 'deities', 'SIGMAR').map((entry) => entry.id), [sigmar.id]);
  assert.deepEqual(filterReferenceOptions(builtins, 'careers', 'sorciere').map((entry) => entry.name), ['Chasseur de sorcières', 'Sorcière', 'Sorcière des taillis']);
  assert.deepEqual(filterReferenceOptions(builtins, 'deities', 'eaux', { religionId: sigmarReligion.id }), []);
});

test('une carrière personnalisée stocke plusieurs niveaux structurés avec des identifiants stables', () => {
  const careerId = 'custom:career:test';
  const career = normalizeReference('careers', {
    id: careerId, name: 'Gardien des archives', className: 'Lettrés',
    levels: [
      { id: 'career-level:archives-1', careerId, name: 'Apprenti', rank: 1, skills: ['Érudition'], skillIds: ['skill:lore'] },
      { id: 'career-level:archives-2', careerId, name: 'Archiviste', rank: 2, talents: ['Mémoire prodigieuse'], talentIds: ['talent:memory'], advancements: ['Intelligence'], entryConditions: ['Être apprenti'], additionalInformation: 'Niveau supérieur' }
    ],
    talents: ['Mémoire prodigieuse'], talentIds: ['talent:memory']
  });
  assert.deepEqual(getCareerLevels(career).map((level) => level.name), ['Apprenti', 'Archiviste']);
  assert.ok(career.levels.every((level) => level.careerId === careerId && level.id));
  assert.deepEqual(career.levels[1].entryConditions, ['Être apprenti']);
  assert.deepEqual(career.levels[0].skillIds, ['skill:lore']);
  assert.deepEqual(career.talentIds, ['talent:memory']);
  assert.equal(findCareerLevel(career, 'career-level:archives-2').name, 'Archiviste');
  assert.equal(findCareerLevel(career, '', 'Archiviste').id, 'career-level:archives-2');
  assert.deepEqual(filterReferenceOptions([career], 'careers', 'archiv'), [career]);

  const created = createCareerLevel(careerId, 3);
  assert.ok(created.id);
  assert.equal(created.careerId, careerId);
  assert.equal(created.rank, 3);
});

test('les anciennes listes de niveaux texte sont converties en objets sans perdre les intitulés', () => {
  const migrated = migrateCareerReferenceRecord({
    id: 'custom:career:legacy', kind: 'careers', name: 'Carrière historique',
    levels: ['Apprenti', 'Compagnon']
  });
  assert.deepEqual(migrated.levels.map((level) => level.name), ['Apprenti', 'Compagnon']);
  assert.deepEqual(migrated.levels.map((level) => level.rank), [1, 2]);
  assert.ok(migrated.levels.every((level) => level.careerId === migrated.id && level.id));
  assert.deepEqual(migrateCareerReferenceRecord(migrated).levels.map((level) => level.id), migrated.levels.map((level) => level.id));
});

test('la migration ne tronque pas un référentiel historique contenant plus de vingt niveaux', () => {
  const oldLevels = Array.from({ length: 24 }, (_, index) => `Niveau ${index + 1}`);
  const migrated = migrateCareerReferenceRecord({ id: 'career:many', kind: 'careers', levels: oldLevels });
  assert.equal(migrated.levels.length, 24);
  assert.equal(migrated.levels[23].name, 'Niveau 24');
});

test('une mise à jour du seed ajoute les nouveaux niveaux intégrés sans remplacer les niveaux existants', () => {
  const careerId = 'builtin:career:test';
  const existing = {
    id: careerId, kind: 'careers', source: 'builtin', name: 'Carrière',
    levels: [{ id: 'builtin-level:1', careerId, name: 'Niveau existant', rank: 1 }]
  };
  const incoming = {
    id: careerId, kind: 'careers',
    levels: [
      { id: 'builtin-level:1', careerId, name: 'Niveau remplacé', rank: 1 },
      { id: 'builtin-level:2', careerId, name: 'Nouveau niveau', rank: 2 }
    ]
  };
  const merged = mergeBuiltInCareerLevels(existing, incoming);
  assert.equal(merged.levels.length, 2);
  assert.equal(merged.levels[0].name, 'Niveau existant');
  assert.equal(merged.levels[1].careerId, careerId);
  assert.equal(mergeBuiltInCareerLevels(merged, incoming), merged);
});

test('l’administration affiche la gestion des niveaux des carrières intégrées sans déverrouiller leur nom', () => {
  const career = { ...builtins.find((entry) => entry.kind === 'careers'), levels: [] };
  const html = renderReferenceManager([career]);
  const editor = renderReferenceEditor('careers', career, [career], { levelsOnly: true });
  assert.match(html, /Gérer les niveaux/);
  assert.match(editor, /Ajouter un niveau/);
  assert.match(editor, /nom et la classe de cette carrière intégrée sont protégés/);
  assert.doesNotMatch(editor, /name="className"/);
  assert.match(renderCareerLevelsEditor([]), /Aucun niveau renseigné/);
});

test('les profils intégrés d’espèce sont configurables sans déverrouiller leur nom', () => {
  const species = { ...builtins.find((entry) => entry.kind === 'species'), characteristicModifiers: { CC: 30 } };
  const html = renderReferenceManager([species]);
  const editor = renderReferenceEditor('species', species, [species]);
  assert.match(html, /Espèces/);
  assert.match(html, /Configurer/);
  assert.match(editor, /Modificateur à ajouter à 2d10/);
  assert.match(editor, /Le nom et la provenance de cette espèce restent protégés/);
  assert.match(editor, /type="hidden" name="name"/);
  assert.doesNotMatch(editor, /<input name="name"/);
  assert.match(editor, /name="characteristicModifier\.Soc"/);
});

test('un profil personnalisé d’espèce conserve ses dix modificateurs et ses alias', () => {
  const species = createCustomReference('species', {
    name: 'Gnome', aliases: ['Gnomes'],
    characteristicModifiers: Object.fromEntries(['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((key) => [key, 15]))
  });
  assert.equal(species.kind, 'species');
  assert.equal(species.aliases[0], 'Gnomes');
  assert.deepEqual(Object.values(species.characteristicModifiers), Array(10).fill(15));
});

test('un profil intégré ajusté est inclus dans un export de référentiels', () => {
  const species = normalizeReference('species', {
    ...datasets.species.entries[0],
    customized: true,
    characteristicModifiers: { ...datasets.species.entries[0].characteristicModifiers, CC: 25 }
  }, { source: 'builtin' });
  const exported = exportCustomReferencePack([species]);
  assert.equal(exported.pack.entries.length, 1);
  assert.equal(exported.pack.entries[0].kind, 'species');
  assert.equal(exported.pack.entries[0].characteristicModifiers.CC, 25);
  assert.equal(Object.hasOwn(exported.pack.entries[0], 'customized'), false);
  assert.equal(exportCustomReferencePack([builtins.find((entry) => entry.kind === 'species')]).pack.entries.length, 0);
});

test('les relations personnalisées se synchronisent sans modifier les entrées intégrées', () => {
  const builtInReligion = builtins.find((entry) => entry.id === 'builtin:religion:sigmar');
  const customReligion = createCustomReference('religions', { name: 'Confrérie locale', deityIds: [] });
  const customDeity = createCustomReference('deities', { name: 'Protecteur de la confrérie', religionIds: [] });
  let bundle = buildReferenceSaveBundle([...builtins, customReligion], { ...customReligion, deityIds: [customDeity.id] });
  bundle = buildReferenceSaveBundle([...bundle, customDeity], { ...customDeity, religionIds: [customReligion.id] });
  const linkedReligion = bundle.find((entry) => entry.id === customReligion.id);
  const linkedDeity = bundle.find((entry) => entry.id === customDeity.id);
  const unchangedBuiltIn = bundle.find((entry) => entry.id === builtInReligion.id);
  assert.ok(linkedReligion.deityIds.includes(customDeity.id));
  assert.ok(linkedDeity.religionIds.includes(customReligion.id));
  assert.deepEqual(unchangedBuiltIn, builtInReligion);
});

test('un pack exporté puis importé devient un pack distinct avec relations remappées', () => {
  const religionBase = createCustomReference('religions', { name: 'Culte personnel', deityIds: [] });
  const deity = createCustomReference('deities', { name: 'Divinité personnelle', religionIds: [religionBase.id] });
  const religion = { ...religionBase, deityIds: [deity.id] };
  const customEntries = [religion, deity];
  const exported = exportCustomReferencePack(customEntries, '2026-11-20T12:00:00.000Z');
  const parsed = parseReferencePack(exported, builtins);
  const imported = prepareImportedReferencePack(parsed, builtins);
  assert.equal(imported.length, 2);
  assert.ok(imported.every((entry) => entry.source === 'pack'));
  assert.ok(imported.every((entry) => entry.packId === imported[0].packId));
  assert.notEqual(imported[0].id, religion.id);
  const importedReligion = imported.find((entry) => entry.kind === 'religions');
  const importedDeity = imported.find((entry) => entry.kind === 'deities');
  assert.deepEqual(importedReligion.deityIds, [importedDeity.id]);
  assert.deepEqual(importedDeity.religionIds, [importedReligion.id]);
});

test('un pack importe les niveaux de carrière sous de nouveaux identifiants et les relie à la carrière copiée', () => {
  const career = normalizeReference('careers', {
    id: 'custom:career:bookkeeper', name: 'Comptable', className: 'Lettrés',
    levels: [{ id: 'career-level:bookkeeper:1', careerId: 'custom:career:bookkeeper', name: 'Aide-comptable', rank: 1 }]
  });
  const pack = parseReferencePack(exportCustomReferencePack([career]), builtins);
  const [imported] = prepareImportedReferencePack(pack, builtins);
  assert.notEqual(imported.id, career.id);
  assert.equal(imported.levels.length, 1);
  assert.notEqual(imported.levels[0].id, career.levels[0].id);
  assert.equal(imported.levels[0].careerId, imported.id);
  assert.equal(imported.levels[0].name, 'Aide-comptable');
});

test('les relations inconnues sont rejetées et une entrée intégrée ne peut pas être supprimée', () => {
  const invalid = validateReferenceEntries([{ kind: 'deities', id: 'custom:deity:x', name: 'Inconnue', religionIds: ['inconnue'] }]);
  assert.equal(invalid.valid, false);
  const wrongTargetType = validateReferenceEntries([
    { kind: 'religions', id: 'custom:religion:x', name: 'Mauvais lien', deityIds: ['custom:career:x'] },
    { kind: 'careers', id: 'custom:career:x', name: 'Carrière' }
  ]);
  assert.equal(wrongTargetType.valid, false);
  assert.throws(() => buildReferenceDeleteBundle(builtins, 'builtin:religion:sigmar'), /ne peuvent pas être supprimées/);
  const custom = createCustomReference('religions', { name: 'À retirer' });
  const result = buildReferenceDeleteBundle([...builtins, custom], custom.id);
  assert.deepEqual(result.deletedIds, [custom.id]);
});

test('les anciens noms de religion et de carrière sont associés par nom lors de la migration à l’éditeur', () => {
  const religion = findReferenceByLegacyValue(builtins, 'religions', '', 'Culte de Sigmar');
  const career = findReferenceByLegacyValue(builtins, 'careers', 'builtin:career:apothicaire', 'Ancien nom');
  assert.equal(religion.id, 'builtin:religion:sigmar');
  assert.equal(career.name, 'Apothicaire');
});

test('la migration IndexedDB v2 ajoute les référentiels sans supprimer le magasin des personnages', () => {
  const stores = new Map();
  const database = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(name, options) {
      const indexes = new Set();
      const store = { options, createIndex: (index) => indexes.add(index), indexes };
      stores.set(name, store);
      return store;
    }
  };
  const transaction = { objectStore: () => ({ openCursor() { const request = {}; queueMicrotask(() => { request.result = null; request.onsuccess?.(); }); return request; } }) };
  upgradeDatabase(database, transaction, 0);
  assert.equal(DATABASE_VERSION, 5);
  assert.ok(stores.has('characters'));
  assert.ok(stores.has('referenceEntries'));
  assert.ok(stores.has('referenceMeta'));
  assert.ok(stores.get('referenceEntries').indexes.has('kind'));
});

test('la migration depuis une base v1 conserve le magasin characters existant', () => {
  const existingCharactersStore = { marker: 'existing-personnages' };
  const stores = new Map([['characters', existingCharactersStore]]);
  const database = {
    objectStoreNames: { contains: (name) => stores.has(name) },
    createObjectStore(name, options) {
      const indexes = new Set();
      const store = { options, createIndex: (index) => indexes.add(index), indexes };
      stores.set(name, store);
      return store;
    }
  };
  const transaction = { objectStore: () => ({ openCursor() { const request = {}; queueMicrotask(() => { request.result = null; request.onsuccess?.(); }); return request; } }) };
  upgradeDatabase(database, transaction, 1);
  assert.equal(stores.get('characters'), existingCharactersStore);
  assert.ok(stores.has('referenceEntries'));
  assert.ok(stores.has('referenceMeta'));
});

test('la migration v3 conserve les valeurs de personnage et ajoute les identifiants de niveau', () => {
  const oldCharacter = {
    id: 'character-1', schemaVersion: 1,
    identity: { career: 'Soldat', careerId: 'builtin:career:soldat', careerLevel: 'Recrue' },
    profile: { notes: 'Notes conservées' }
  };
  const migrated = migrateCharacterRecord(oldCharacter);
  assert.equal(migrated.schemaVersion, 4);
  assert.equal(migrated.identity.careerLevel, 'Recrue');
  assert.equal(migrated.identity.careerLevelId, '');
  assert.equal(migrated.identity.speciesId, '');
  assert.equal(migrated.profile.notes, 'Notes conservées');
  assert.deepEqual(migrated.skills, []);
  assert.equal(migrated.characteristicAdvances.CC, 0);
  assert.equal(migrated.characteristicSpeciesModifiers.CC, 0);
  assert.deepEqual(migrated.creationWizard, { step: 'identity', skippedSteps: [] });
  assert.equal(migrated.experience.history.length, 0);
  assert.equal(oldCharacter.identity.careerLevel, 'Recrue');
});

test('la validation rejette les identifiants de niveau associés à une autre carrière', () => {
  const result = validateReferenceEntries([{
    kind: 'careers', id: 'custom:career:a', name: 'Carrière A',
    levels: [{ id: 'level:wrong', careerId: 'custom:career:b', name: 'Niveau', rank: 1 }]
  }]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /associé à une autre carrière/);
});

test('les référentiels de carrière conservent les métadonnées structurées des compétences et talents', () => {
  const career = normalizeReference('careers', {
    id: 'custom:career:scribe',
    name: 'Scribe',
    levels: [{
      id: 'custom:career:scribe:level:1',
      name: 'Apprenti',
      rank: 1,
      skills: [{ id: 'skill:read-write', name: 'Lire/Écrire', characteristic: 'Int', type: 'basic', advancementCost: 10, advancementCostVerified: true }],
      talents: [{ id: 'talent:linguistics', name: 'Polyglotte', rank: 2, conditions: 'Condition documentée', description: 'Description', references: ['Livre, page de référence'] }]
    }]
  });
  const level = career.levels[0];
  assert.equal(level.skills[0].name, 'Lire/Écrire');
  assert.equal(level.skills[0].characteristic, 'Int');
  assert.equal(level.skills[0].skillType, 'basic');
  assert.equal(level.skills[0].advancementCost, 10);
  assert.equal(level.skills[0].advancementCostVerified, true);
  assert.equal(level.talents[0].rank, 2);
  assert.equal(level.talents[0].conditions, 'Condition documentée');
  assert.deepEqual(level.talents[0].references, ['Livre, page de référence']);
  assert.equal(validateReferenceEntries([career]).valid, true);
});

test('les espèces personnalisées conservent particularités, compétences typées et talents référencés', () => {
  const species = normalizeReference('species', {
    id: 'custom:species:nomad',
    name: 'Nomade',
    particularities: ['Adaptation documentée'],
    characteristicModifiers: Object.fromEntries(['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((key) => [key, 10])),
    skills: [{ id: 'skill:survival', name: 'Survie', characteristic: 'Ag', skillType: 'advanced' }],
    talents: [{ id: 'talent:resistance', name: 'Résistance', rank: 2, conditions: 'Condition de test' }]
  });
  assert.deepEqual(species.particularities, ['Adaptation documentée']);
  assert.equal(species.skills[0].characteristic, 'Ag');
  assert.equal(species.skills[0].skillType, 'advanced');
  assert.equal(species.talents[0].rank, 2);
  assert.equal(validateReferenceEntries([species]).valid, true);
  const preserved = preserveNamedMetadata(['Survie', 'Discrétion'], species.skills, 'skills');
  assert.equal(typeof preserved[0], 'object');
  assert.equal(preserved[0].skillType, 'advanced');
  assert.equal(preserved[1], 'Discrétion');
});
