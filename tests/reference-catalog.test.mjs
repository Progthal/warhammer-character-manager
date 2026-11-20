import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildReferenceDeleteBundle,
  buildReferenceSaveBundle,
  createCustomReference,
  exportCustomReferencePack,
  getCareerLevels,
  getReferenceOptions,
  loadBuiltInReferenceData,
  normalizeReference,
  parseReferencePack,
  prepareImportedReferencePack,
  validateReferenceEntries
} from '../src/services/reference-catalog.js';
import { filterReferenceOptions, findReferenceByLegacyValue, isDeityCompatibleWithReligion } from '../src/components/reference-picker.js';
import { upgradeDatabase, DATABASE_VERSION } from '../src/database/migrations.js';

const kinds = ['religions', 'deities', 'careers'];
const datasets = Object.fromEntries(await Promise.all(kinds.map(async (kind) => [
  kind,
  JSON.parse(await readFile(new URL(`../data/${kind}.json`, import.meta.url), 'utf8'))
])));
const builtins = kinds.flatMap((kind) => datasets[kind].entries.map((entry) => ({ ...entry, kind, source: 'builtin' })));

test('les trois référentiels initiaux sont lisibles, structurés et identifiés de façon stable', () => {
  assert.equal(datasets.religions.entries.length, 10);
  assert.equal(datasets.deities.entries.length, 10);
  assert.equal(datasets.careers.entries.length, 64);
  for (const kind of kinds) {
    const result = validateReferenceEntries(datasets[kind].entries.map((entry) => ({ ...entry, kind })), { existingEntries: builtins });
    assert.equal(result.valid, true, result.errors.join('; '));
  }
  assert.ok(datasets.careers.entries.every((career) => career.levels === undefined || Array.isArray(career.levels)));
});

test('le chargement automatique récupère les trois jeux JSON versionnés', async () => {
  const originalFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => {
    const kind = String(url).split('/').at(-1).replace(/\.json$/, '');
    requested.push(kind);
    return { ok: true, json: async () => datasets[kind] };
  };
  try {
    const loaded = await loadBuiltInReferenceData();
    assert.deepEqual(requested.sort(), ['careers', 'deities', 'religions']);
    assert.equal(loaded.find((dataset) => dataset.kind === 'careers').version, 1);
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

test('une carrière personnalisée peut stocker ses niveaux et ses relations vers compétences et talents', () => {
  const career = normalizeReference('careers', {
    id: 'custom:career:test', name: 'Gardien des archives', className: 'Lettrés',
    levels: ['Apprenti', 'Archiviste'], skills: ['Érudition'], skillIds: ['skill:lore'],
    talents: ['Mémoire prodigieuse'], talentIds: ['talent:memory']
  });
  assert.deepEqual(career.levels, ['Apprenti', 'Archiviste']);
  assert.deepEqual(getCareerLevels(career), ['Apprenti', 'Archiviste']);
  assert.deepEqual(career.skillIds, ['skill:lore']);
  assert.deepEqual(career.talentIds, ['talent:memory']);
  assert.deepEqual(filterReferenceOptions([career], 'careers', 'archiv'), [career]);
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
  upgradeDatabase(database, null, 0);
  assert.equal(DATABASE_VERSION, 2);
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
  upgradeDatabase(database, null, 1);
  assert.equal(stores.get('characters'), existingCharactersStore);
  assert.ok(stores.has('referenceEntries'));
  assert.ok(stores.has('referenceMeta'));
});
