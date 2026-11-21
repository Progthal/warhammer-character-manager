import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter, normalizeCharacter } from '../src/models/character.js';
import {
  CREATION_STEPS, getCompletedCreationSteps, getCreationStepStates, getCreationSuggestions, mergeSuggestedEntries, validateCharacterCreation
} from '../src/services/creation-wizard.js';

const references = [
  { id: 'species:human', kind: 'species', name: 'Humain', characteristicModifiers: Object.fromEntries(['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((key) => [key, 20])) },
  { id: 'career:scribe', kind: 'careers', name: 'Scribe', className: 'Lettrés', skills: ['Lire/Écrire'], talents: ['Etiquette'], levels: [{ id: 'career:scribe:1', careerId: 'career:scribe', name: 'Apprenti', rank: 1, skills: ['Langue (Reikspiel)', 'Lire/Écrire'], talents: ['Etiquette'] }] },
  { id: 'religion:sigmar', kind: 'religions', name: 'Culte de Sigmar', deityIds: ['deity:sigmar'] },
  { id: 'deity:sigmar', kind: 'deities', name: 'Sigmar', religionIds: ['religion:sigmar'] }
];

test('l’assistant expose les neuf étapes demandées dans leur ordre', () => {
  assert.deepEqual(CREATION_STEPS.map(({ id }) => id), [
    'identity', 'species', 'characteristics', 'career', 'religion', 'skills', 'talents', 'resources', 'review'
  ]);
});

test('les suggestions combinent les référentiels et conservent leurs identifiants sources', () => {
  const suggestions = getCreationSuggestions({
    species: { id: 'species:human', skills: ['Survie'] },
    career: references[1],
    level: references[1].levels[0]
  });
  assert.deepEqual(suggestions.skills.map(({ name }) => name), ['Survie', 'Lire/Écrire', 'Langue (Reikspiel)']);
  assert.deepEqual(suggestions.talents.map(({ name }) => name), ['Etiquette']);

  const merged = mergeSuggestedEntries([{ name: 'Survie', acquired: true }], suggestions.skills, {
    collection: 'skills', sourceCareerId: 'career:scribe', sourceCareerLevelId: 'career:scribe:1', sourceSpeciesId: 'species:human'
  });
  assert.equal(merged.additions.length, 2);
  assert.equal(merged.entries[1].status, 'selected');
  assert.equal(merged.entries[1].acquired, false);
  assert.equal(merged.entries[1].sourceCareerLevelId, 'career:scribe:1');
  assert.equal(merged.entries[1].sourceSpeciesId, 'species:human');
});

test('une suggestion déjà présente sous un autre nom mais le même identifiant ne crée pas de doublon', () => {
  const merged = mergeSuggestedEntries(
    [{ id: 'owned-talent', referenceId: 'talent:etiquette', name: 'Étiquette', rank: 2, acquired: true }],
    [{ id: 'talent:etiquette', name: 'Etiquette' }],
    { collection: 'talents', sourceCareerId: 'career:scribe' }
  );
  assert.equal(merged.additions.length, 0);
  assert.equal(merged.entries.length, 1);
});

test('la validation sépare les erreurs bloquantes, avertissements et informations', () => {
  const incomplete = validateCharacterCreation(createCharacter(), references);
  assert.equal(incomplete.valid, false);
  assert.ok(incomplete.errors.some(({ step }) => step === 'identity'));
  assert.ok(incomplete.errors.some(({ step }) => step === 'species'));
  assert.ok(incomplete.errors.some(({ step }) => step === 'characteristics'));

  const ready = normalizeCharacter({
    identity: { firstName: 'Marta', species: 'Humain', speciesId: 'species:human', career: 'Scribe', careerId: 'career:scribe', careerLevel: 'Apprenti', careerLevelId: 'career:scribe:1', religion: 'Culte de Sigmar', religionId: 'religion:sigmar', deity: 'Sigmar', deityId: 'deity:sigmar' },
    characteristics: Object.fromEntries(['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((key) => [key, 32]))
  });
  const result = validateCharacterCreation(ready, references);
  assert.equal(result.valid, true);
  assert.equal(result.selected.level.id, 'career:scribe:1');
  assert.equal(result.errors.length, 0);
});

test('la progression visuelle suit immédiatement les champs requis et revient en attente si une valeur est effacée', () => {
  const character = createCharacter({
    identity: {
      firstName: 'Marta', species: 'Humain', speciesId: 'species:human',
      career: 'Scribe', careerId: 'career:scribe', careerLevel: 'Apprenti', careerLevelId: 'career:scribe:1'
    },
    characteristics: Object.fromEntries(['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((key) => [key, 32]))
  });

  let completed = getCompletedCreationSteps(character, references);
  for (const step of ['identity', 'species', 'characteristics', 'career']) assert.ok(completed.has(step));
  assert.ok(!completed.has('religion'));

  character.characteristics.CC = null;
  completed = getCompletedCreationSteps(character, references, ['identity', 'species', 'characteristics', 'career']);
  assert.ok(!completed.has('characteristics'), 'une étape obligatoire redevient incomplète même après avoir été parcourue');

  character.characteristics.CC = 32;
  completed = getCompletedCreationSteps(character, references);
  assert.ok(completed.has('characteristics'));
});

test('les étapes facultatives passent au vert avec des données ou après un abandon explicite', () => {
  const character = createCharacter({
    identity: { religion: 'Culte de Sigmar', religionId: 'religion:sigmar' },
    skills: [{ name: 'Lire/Écrire' }],
    talents: [{ name: 'Etiquette' }],
    profile: { history: 'Ancien scribe impérial.' }
  });

  const completed = getCompletedCreationSteps(character, references);
  for (const step of ['religion', 'skills', 'talents', 'resources']) assert.ok(completed.has(step));

  const skipped = getCompletedCreationSteps(createCharacter(), references, ['religion', 'skills', 'talents', 'resources']);
  for (const step of ['religion', 'skills', 'talents', 'resources']) assert.ok(skipped.has(step));
});

test('une simple navigation ne valide plus une étape facultative vide', () => {
  const empty = createCharacter({ creationWizard: { step: 'review', completedSteps: ['religion', 'skills', 'talents', 'resources'] } });
  const completed = getCompletedCreationSteps(empty, references);
  for (const step of ['religion', 'skills', 'talents', 'resources']) assert.ok(!completed.has(step));
});

test('le choix actif et la complétude sont indépendants', () => {
  const character = createCharacter({ identity: { firstName: 'Marta' } });
  const activeAndComplete = getCreationStepStates(character, references, { currentStep: 'identity' });
  assert.deepEqual(activeAndComplete.find(({ id }) => id === 'identity'), {
    id: 'identity', isCurrent: true, isComplete: true, state: 'current'
  });

  const anotherStepActive = getCreationStepStates(character, references, { currentStep: 'species' });
  assert.deepEqual(anotherStepActive.find(({ id }) => id === 'identity'), {
    id: 'identity', isCurrent: false, isComplete: true, state: 'complete'
  });
  assert.equal(anotherStepActive.find(({ id }) => id === 'species').state, 'current');
});

test('une étape facultative renseignée avec une référence invalide reste incomplète', () => {
  const character = createCharacter({ identity: { religion: 'Culte inconnu' } });
  assert.ok(!getCompletedCreationSteps(character, references).has('religion'));
  assert.ok(getCompletedCreationSteps(character, references, ['religion']).has('religion'));
});

test('les niveaux non documentés, ressources manuelles et incohérences sont signalés sans bloquer', () => {
  const noLevelCareer = { id: 'career:empty', kind: 'careers', name: 'Carrière vide', levels: [] };
  const character = normalizeCharacter({
    identity: { firstName: 'Otto', species: 'Humain', speciesId: 'species:human', career: 'Carrière vide', careerId: 'career:empty' },
    characteristics: Object.fromEntries(['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((key) => [key, 30])),
    secondary: { woundsCurrent: 8, woundsMax: 5 },
    talents: [{ name: 'Concentration', rank: 1 }, { name: 'Concentration', rank: 1 }, { name: 'Vigilance', rank: 3 }]
  });
  const result = validateCharacterCreation(character, [...references, noLevelCareer]);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(({ message }) => message.includes('aucun niveau')));
  assert.ok(result.warnings.some(({ message }) => message.includes('blessures actuelles')));
  assert.equal(character.talents.filter(({ name }) => name === 'Concentration').length, 1);
  assert.ok(!result.warnings.some(({ message }) => message.includes('Talents en double')));
  assert.ok(result.information.some(({ message }) => message.includes('restent à renseigner')));
});

test('un talent dont le rang dépasse le maximum documenté est signalé', () => {
  const character = normalizeCharacter({
    identity: { firstName: 'Marta', species: 'Humain', speciesId: 'species:human', career: 'Scribe', careerId: 'career:scribe', careerLevel: 'Apprenti', careerLevelId: 'career:scribe:1' },
    characteristics: Object.fromEntries(['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((key) => [key, 32])),
    talents: [{ id: 'talent-limited', referenceId: 'talent:limited', name: 'Talent limité', rank: 3, maxRank: 2, acquired: true }]
  });
  const result = validateCharacterCreation(character, references);
  assert.ok(result.warnings.some(({ step, message }) => step === 'talents' && message.includes('dépasse son maximum documenté')));
});

test('un référentiel d’espèce incomplet est signalé sans inventer ses modificateurs', () => {
  const incompleteSpecies = {
    id: 'species:incomplete', kind: 'species', name: 'Espèce incomplète',
    characteristicModifiers: Object.fromEntries(['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((key) => [key, null]))
  };
  const character = normalizeCharacter({
    identity: { firstName: 'Lena', species: 'Espèce incomplète', speciesId: 'species:incomplete', career: 'Scribe', careerId: 'career:scribe', careerLevel: 'Apprenti', careerLevelId: 'career:scribe:1' },
    characteristics: Object.fromEntries(['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((key) => [key, 30])),
    characteristicSpeciesModifiers: Object.fromEntries(['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((key) => [key, null]))
  });
  const result = validateCharacterCreation(character, [...references, incompleteSpecies]);
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some(({ step, message }) => step === 'species' && message.includes('modificateurs')));
});

test('les carrières avec niveaux configurés exigent un niveau et conservent les métadonnées des suggestions', () => {
  const career = {
    id: 'career:watchman', kind: 'careers', name: 'Garde', levels: [{ id: 'career:watchman:1', careerId: 'career:watchman', name: 'Recrue', rank: 1, skills: [{ id: 'skill:athletics', name: 'Athlétisme', characteristic: 'Ag', type: 'basic' }] }]
  };
  const character = normalizeCharacter({
    identity: { firstName: 'Greta', species: 'Humain', speciesId: 'species:human', career: 'Garde', careerId: 'career:watchman' },
    characteristics: Object.fromEntries(['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((key) => [key, 30]))
  });
  const result = validateCharacterCreation(character, [...references, career]);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(({ step, message }) => step === 'career' && message.includes('Choisissez un niveau')));

  const suggestion = { id: 'skill:athletics', name: 'Athlétisme', characteristic: 'Ag', skillType: 'basic', advancementCost: 10 };
  const merged = mergeSuggestedEntries([], [suggestion], { collection: 'skills', sourceCareerId: 'career:watchman', sourceCareerLevelId: 'career:watchman:1' });
  assert.equal(merged.entries[0].referenceId, 'skill:athletics');
  assert.equal(merged.entries[0].characteristic, 'Ag');
  assert.equal(merged.entries[0].skillType, 'basic');
  assert.equal(merged.entries[0].career, true);
  assert.equal(merged.entries[0].acquired, false);
  assert.equal(merged.entries[0].advancementCost, null, 'un coût sans validation explicite ne doit pas être prérempli');
  const verifiedCost = mergeSuggestedEntries([], [{ ...suggestion, advancementCostVerified: true }], { collection: 'skills' });
  assert.equal(verifiedCost.entries[0].advancementCost, 10);
});

test('la normalisation conserve le brouillon, les étapes ignorées, le jet et les bonus d’espèce', () => {
  const character = normalizeCharacter({
    identity: { species: 'Humain', speciesId: 'species:human' },
    characteristicSpeciesModifiers: { CC: 20 },
    characteristicGeneration: { method: '2d10', speciesProfileId: 'species:human', speciesName: 'Humain', modifiers: { CC: 20 }, rolls: { CC: [4, 8] } },
    creationWizard: { step: 'career', skippedSteps: ['religion', 'skills', 'review'] },
    isDraft: true
  });
  assert.equal(character.characteristicSpeciesModifiers.CC, 20);
  assert.deepEqual(character.characteristicGeneration.rolls.CC, [4, 8]);
  assert.equal(character.characteristicGeneration.modifiers.CC, 20);
  assert.equal(character.creationWizard.step, 'career');
  assert.deepEqual(character.creationWizard.skippedSteps, ['religion', 'skills']);
  assert.equal(character.isDraft, true);
});

test('les anciens brouillons ne transforment pas leur historique de navigation en étapes ignorées', () => {
  const legacy = normalizeCharacter({ creationWizard: { step: 'talents', completedSteps: ['religion', 'skills'] } });
  assert.deepEqual(legacy.creationWizard, { step: 'talents', skippedSteps: [] });
});
