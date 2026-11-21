import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeReference, validateReferenceEntries } from '../src/services/reference-catalog.js';
import {
  createTalentCatalogExport,
  filterTalentCatalog,
  findTalentNameConflict,
  findTalentReference,
  mergeCharacterTalentEntries,
  normalizeTalentText,
  parseTalentPack,
  prepareTalentPack
} from '../src/services/talents.js';
import { normalizeCharacter } from '../src/models/character.js';
import { calculateCharacteristics } from '../src/rules/character-calculations.js';
import { renderTalentCards, renderTalentEditor, renderReferenceManager } from '../src/views/reference-manager.js';
import { renderTalentPicker } from '../src/components/talent-picker.js';

const dataset = JSON.parse(await readFile(new URL('../data/talents.json', import.meta.url), 'utf8'));
const builtins = dataset.entries.map((entry) => normalizeReference('talents', entry, { source: 'builtin' }));

test('le catalogue livré contient 180 identifiants stables et n’invente pas de propriétés de règle', () => {
  assert.equal(dataset.kind, 'talents');
  assert.equal(dataset.schemaVersion, 1);
  assert.equal(dataset.version, 2);
  assert.equal(dataset.entries.length, 180);
  assert.equal(new Set(dataset.entries.map((entry) => entry.id)).size, 180);
  assert.ok(dataset.entries.every((entry) => /^builtin:talent:[a-z0-9-]+$/.test(entry.id)));
  assert.ok(dataset.entries.every((entry) => entry.verification_status === 'community'));
  assert.ok(dataset.entries.every((entry) => entry.description === '' && entry.category === '' && entry.effects.length === 0));
  assert.ok(dataset.entries.every((entry) => entry.max_rank === null && entry.tests.length === 0 && entry.prerequisites.length === 0));
  const validation = validateReferenceEntries(dataset.entries.map((entry) => ({ ...entry, kind: 'talents' })));
  assert.equal(validation.valid, true, validation.errors.join('; '));
});

test('la normalisation conserve les noms français/originaux, rangs, effets vérifiés et sources', () => {
  const talent = normalizeReference('talents', {
    id: 'custom:talent:polyglotte', name: 'Linguistics', name_fr: 'Polyglotte', name_original: 'Linguistics',
    aliases: ['Langues'], category: 'Social', tests: ['Int'], max_rank: 3,
    effects: [{ type: 'skillBonus', skillName: 'Lire/Écrire', value: 10, verified: true, reference: 'Livre, p. 123' }],
    prerequisites: ['Condition précise'], availability: 'restricted', verification_status: 'verified',
    source_info: { title: 'Livre de base', publisher: 'Cubicle 7', page: '123', note: 'Contrôlé' }
  });
  assert.equal(talent.name_fr, 'Polyglotte');
  assert.equal(talent.name_original, 'Linguistics');
  assert.equal(talent.maxRank, 3);
  assert.equal(talent.effects[0].verified, true);
  assert.equal(talent.sourceInfo.page, '123');
  assert.equal(talent.verificationStatus, 'verified');
  const linkedReferences = [
    { id: 'builtin:species:dwarf', kind: 'species' },
    { id: 'builtin:career:guard', kind: 'careers', levels: [{ id: 'level:guard' }] }
  ];
  const linkedTalent = normalizeReference('talents', {
    ...talent,
    species: ['builtin:species:dwarf'],
    careerIds: ['builtin:career:guard'],
    careerLevelIds: ['level:guard']
  });
  assert.equal(validateReferenceEntries([linkedTalent], { existingEntries: linkedReferences }).valid, true);
  assert.equal(validateReferenceEntries([linkedTalent]).valid, false);
});

test('la recherche reconnaît les accents, les noms originaux et les alias sans ambiguïté', () => {
  const talent = normalizeReference('talents', {
    id: 'custom:talent:etiquette', name: 'Etiquette', name_fr: 'Étiquette', name_original: 'Etiquette', aliases: ['Politesse']
  });
  const catalog = [...builtins, talent];
  assert.equal(normalizeTalentText('ÉTIQUETTE'), 'etiquette');
  assert.equal(findTalentReference(catalog, '', 'Politesse').id, talent.id);
  assert.equal(findTalentReference(catalog, '', 'Étiquette').id, talent.id);
  assert.equal(findTalentReference(catalog, talent.id, 'nom historique').id, talent.id);
  assert.equal(findTalentNameConflict(catalog, { name: 'Autre', aliases: ['Politesse'] })?.id, talent.id);
  assert.equal(findTalentNameConflict(catalog, { name: 'Étiquette mise à jour' }, talent.id), null);
});

test('le sélecteur fournit une zone de recherche accessible et un aperçu de la source', () => {
  const talent = builtins[0];
  const markup = renderTalentPicker({ id: 'talent-row-1', name: talent.name }, builtins);
  assert.match(markup, /role="combobox"/);
  assert.match(markup, /aria-autocomplete="list"/);
  assert.match(markup, /role="listbox"/);
  assert.match(markup, /WFRP4e Wikidot/);
  assert.match(markup, /data-talent-clear/);
});

test('les répétitions d’un même talent sont regroupées sur un seul rang de fiche', () => {
  const entries = mergeCharacterTalentEntries([
    { id: 'row-one', referenceId: 'talent:etiquette', name: 'Étiquette', rank: 1, maxRank: 3, acquired: false, status: 'selected' },
    { id: 'row-two', referenceId: 'talent:etiquette', name: 'Etiquette', rank: 2, acquired: true, status: 'acquired', references: ['Livre p. 42'] },
    { id: 'row-three', name: 'Chance', rank: 1, acquired: false }
  ]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].id, 'row-one');
  assert.equal(entries[0].rank, 2);
  assert.equal(entries[0].maxRank, 3);
  assert.equal(entries[0].acquired, true);
  assert.deepEqual(entries[0].references, ['Livre p. 42']);
  const distinct = mergeCharacterTalentEntries([
    { id: 'distinct-one', referenceId: 'talent:one', name: 'Tradition', nameFr: 'Tradition', rank: 1 },
    { id: 'distinct-two', referenceId: 'talent:two', name: 'Tradition', nameFr: 'Tradition', rank: 1 }
  ]);
  assert.equal(distinct.length, 2);
});

test('les filtres du catalogue se combinent sur catégorie, espèce, carrière, test et statut', () => {
  const entry = normalizeReference('talents', {
    id: 'custom:talent:resistance', name: 'Résistance', category: 'Combat',
    tests: ['F'], skills: ['Endurance'], species: ['builtin:species:dwarf'], career_ids: ['builtin:career:guard'], career_level_ids: ['level:guard'],
    availability: 'available', verification_status: 'verified'
  });
  const career = { kind: 'careers', id: 'builtin:career:guard', className: 'Combattants', levels: [{ id: 'level:guard', name: 'Garde' }] };
  const other = normalizeReference('talents', { id: 'custom:talent:rapidite', name: 'Rapidité', category: 'Physique' });
  const uncategorized = normalizeReference('talents', { id: 'custom:talent:sans-categorie', name: 'Sans catégorie' });
  const catalog = [...builtins, entry, other, uncategorized, career];
  const results = filterTalentCatalog(catalog, {
    query: 'résistance', category: 'Combat', speciesId: 'builtin:species:dwarf',
    careerId: 'builtin:career:guard', careerClass: 'Combattants', careerLevelId: 'level:guard', characteristic: 'F', skill: 'endurance',
    availability: 'available', verification: 'verified', source: 'custom'
  });
  assert.deepEqual(results.map((item) => item.id), [entry.id]);
  assert.deepEqual(filterTalentCatalog(catalog, { category: '__none' }).map((item) => item.id), [uncategorized.id, ...builtins.map((item) => item.id)].sort((a, b) => {
    const first = catalog.find((item) => item.id === a);
    const second = catalog.find((item) => item.id === b);
    return (first.name_fr || first.name).localeCompare(second.name_fr || second.name, 'fr');
  }));
  assert.equal(filterTalentCatalog(catalog, { speciesId: '__none' }).length, 182);
});

test('export et import de pack détectent les collisions sans écraser le catalogue existant', () => {
  const custom = normalizeReference('talents', {
    id: 'custom:talent:custom-one', name: 'Talent personnel', name_fr: 'Talent personnel',
    category: 'Personnel', verification_status: 'custom'
  });
  const exported = createTalentCatalogExport([builtins[0], custom], '2026-11-20T00:00:00.000Z');
  assert.equal(exported.pack.entries.length, 2);
  assert.equal(Object.hasOwn(exported.pack.entries[0], 'source'), false);
  const parsed = parseTalentPack(exported, builtins);
  assert.equal(parsed.entries.length, 2);
  assert.equal(parsed.conflicts.length, 1);
  assert.equal(parsed.conflicts[0].reason, 'Identifiant déjà utilisé');
  const prepared = prepareTalentPack(parsed, builtins);
  assert.equal(prepared.additions.length, 1);
  assert.equal(prepared.skipped.length, 1);
  assert.equal(prepared.additions[0].source, 'pack');
  assert.notEqual(prepared.additions[0].id, custom.id);
  assert.equal(builtins.some((entry) => entry.id === custom.id), false);
});

test('un pack remappe les associations espèce, carrière et niveau par leurs noms si les ID ont changé', () => {
  const sourceSpecies = { id: 'source:species:dwarf', kind: 'species', name: 'Nain' };
  const sourceCareer = { id: 'source:career:guard', kind: 'careers', name: 'Garde', levels: [{ id: 'source:level:guard', name: 'Soldat' }] };
  const talent = normalizeReference('talents', {
    id: 'source:talent:watchful', name: 'Vigilance', species: [sourceSpecies.id],
    careerIds: [sourceCareer.id], careerLevelIds: ['source:level:guard']
  }, { source: 'custom' });
  const exported = createTalentCatalogExport([sourceSpecies, sourceCareer, talent]);
  const targetSpecies = { id: 'target:species:dwarf', kind: 'species', name: 'Nain' };
  const targetCareer = { id: 'target:career:guard', kind: 'careers', name: 'Garde', levels: [{ id: 'target:level:guard', name: 'Soldat' }] };
  const parsed = parseTalentPack(exported, [targetSpecies, targetCareer]);
  const prepared = prepareTalentPack(parsed, [targetSpecies, targetCareer]);
  assert.equal(prepared.unresolvedAssociations, 0);
  assert.deepEqual(prepared.additions[0].species, [targetSpecies.id]);
  assert.deepEqual(prepared.additions[0].careerIds, [targetCareer.id]);
  assert.deepEqual(prepared.additions[0].careerLevelIds, ['target:level:guard']);
});

test('un pack conserve les talents mais retire une association devenue introuvable', () => {
  const payload = {
    app: 'warhammer-character-manager', type: 'talent-pack', version: 1,
    pack: { entries: [{ id: 'source:talent:one', name: 'Talent lié', species: ['source:species:unknown'] }] }
  };
  const parsed = parseTalentPack(payload, []);
  const prepared = prepareTalentPack(parsed, []);
  assert.equal(prepared.additions.length, 1);
  assert.equal(prepared.unresolvedAssociations, 1);
  assert.deepEqual(prepared.additions[0].species, []);
});

test('un import refuse les identifiants dupliqués au sein du même fichier', () => {
  const payload = {
    app: 'warhammer-character-manager', type: 'talent-pack', version: 1,
    pack: { entries: [
      { id: 'same', name: 'Premier' },
      { id: 'same', name: 'Second' }
    ] }
  };
  assert.throws(() => parseTalentPack(payload, []), /identifiant dupliqué/i);
});

test('un import refuse aussi les collisions d’alias entre talents du même pack', () => {
  const payload = {
    app: 'warhammer-character-manager', type: 'talent-pack', version: 1,
    pack: { entries: [
      { id: 'one', name: 'Premier', aliases: ['Alias partagé'] },
      { id: 'two', name: 'Second', aliases: ['Alias partagé'] }
    ] }
  };
  assert.throws(() => parseTalentPack(payload, []), /nom ou alias.*en double/i);
});

test('les personnages conservent le lien et un instantané du talent référencé', () => {
  const character = normalizeCharacter({
    talents: [{
      id: 'character-talent-1', referenceId: builtins[0].id, name: builtins[0].name,
      nameFr: 'Nom local', nameOriginal: builtins[0].name, category: 'Historique',
      rank: 2, maxRank: 3, verificationStatus: 'community',
      prerequisites: ['Prérequis conservé'],
      tests: ['Force'], skills: ['Endurance'],
      effects: [
        { type: 'skillBonus', skillId: 'skill:endurance', skillName: 'Endurance', value: 10, verified: true, condition: 'Une condition', reference: 'Livre p. 12' },
        { type: 'resourceChange', target: 'fortune', resource: 'fortune', operation: 'add', value: 1, formula: 'future rule', verified: false }
      ],
      sourceInfo: { title: 'Source mémorisée', page: '12' }
    }]
  });
  const talent = character.talents[0];
  assert.equal(talent.referenceId, builtins[0].id);
  assert.equal(talent.nameFr, 'Nom local');
  assert.equal(talent.maxRank, 3);
  assert.deepEqual(talent.prerequisites, ['Prérequis conservé']);
  assert.deepEqual(talent.tests, ['Force']);
  assert.deepEqual(talent.skills, ['Endurance']);
  assert.equal(talent.effects[0].type, 'skillBonus');
  assert.equal(talent.effects[0].skillId, 'skill:endurance');
  assert.equal(talent.effects[1].type, 'resourceChange');
  assert.equal(talent.effects[1].resource, 'fortune');
  assert.equal(talent.effects[1].verified, false);
  assert.equal(talent.sourceInfo.title, 'Source mémorisée');
});

test('la normalisation des anciennes fiches fusionne les rangs sans dupliquer un effet', () => {
  const verifiedEffect = { type: 'characteristicBonus', characteristic: 'F', value: 5, verified: true, reference: 'Livre p. 50' };
  const character = normalizeCharacter({ talents: [
    { id: 'talent-row-a', referenceId: 'builtin:talent:linguistics', name: 'Polyglotte', nameOriginal: 'Linguistics', rank: 1, maxRank: 3, effects: [verifiedEffect] },
    { id: 'talent-row-b', referenceId: 'builtin:talent:linguistics', name: 'Linguistics', nameFr: 'Polyglotte', rank: 2, acquired: true, effects: [verifiedEffect] }
  ] });
  assert.equal(character.talents.length, 1);
  assert.equal(character.talents[0].rank, 2);
  assert.equal(character.talents[0].acquired, true);
  assert.equal(character.talents[0].effects.length, 1);
  const calculated = calculateCharacteristics({
    ...character,
    characteristics: { F: 40 },
    characteristicSpeciesModifiers: { F: 0 }
  });
  assert.equal(calculated.F.talentBonus, 5);
});

test('les vues du référentiel séparent les talents et affichent le statut de vérification', () => {
  const markup = renderTalentCards(builtins.slice(0, 1));
  assert.match(markup, /Source communautaire|Communautaire/);
  assert.match(markup, /Entrée intégrée protégée/);
  const editor = renderTalentEditor(null, []);
  assert.match(editor, /Nom français/);
  assert.match(editor, /Effets mécaniques/);
  assert.match(editor, /Références précises/);
  const manager = renderReferenceManager(builtins.slice(0, 1));
  assert.match(manager, /Catalogue des talents/);
  assert.match(manager, /1 talent\(s\) indexé\(s\)/);
});

