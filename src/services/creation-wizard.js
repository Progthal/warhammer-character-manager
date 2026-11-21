import { CHARACTERISTICS } from '../models/character.js';
import { findCareerLevel } from './reference-catalog.js';

export const CREATION_STEPS = Object.freeze([
  { id: 'identity', title: 'Identité', shortTitle: 'Identité', description: 'Donnez un nom à votre personnage.' },
  { id: 'species', title: 'Espèce', shortTitle: 'Espèce', description: 'Choisissez son espèce et consultez ses particularités.' },
  { id: 'characteristics', title: 'Caractéristiques', shortTitle: 'Caractéristiques', description: 'Générez ou saisissez les dix caractéristiques.' },
  { id: 'career', title: 'Carrière', shortTitle: 'Carrière', description: 'Sélectionnez une carrière et un niveau présent dans vos référentiels.' },
  { id: 'religion', title: 'Religion', shortTitle: 'Religion', description: 'Choisissez éventuellement un culte et une divinité.' },
  { id: 'skills', title: 'Compétences', shortTitle: 'Compétences', description: 'Examinez les compétences associées à votre carrière.' },
  { id: 'talents', title: 'Talents', shortTitle: 'Talents', description: 'Choisissez les talents documentés de votre personnage.' },
  { id: 'resources', title: 'Ressources', shortTitle: 'Ressources', description: 'Renseignez les ressources et informations facultatives.' },
  { id: 'review', title: 'Vérification', shortTitle: 'Vérification', description: 'Vérifiez les données avant de créer la fiche.' }
]);

const normalizeName = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('fr-FR');
const characteristicKeys = new Set(CHARACTERISTICS.map(({ key }) => key));

function normalizeSkillType(value) {
  const type = normalizeName(value);
  if (type.includes('advanced') || type.includes('avancee') || type === 'avancée') return 'advanced';
  if (type.includes('basic') || type.includes('base')) return 'basic';
  return '';
}

function listNames(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return { name: item, id: '' };
    if (!item || typeof item !== 'object') return null;
    return {
      name: String(item.name || ''),
      id: String(item.id || item.referenceId || ''),
      characteristic: String(item.characteristic || item.characteristicKey || ''),
      skillType: normalizeSkillType(item.skillType || item.type || item.category || item.kind),
      baseValue: item.baseValue !== null && item.baseValue !== undefined && Number.isFinite(Number(item.baseValue)) ? Number(item.baseValue) : null,
      baseValueVerified: item.baseValueVerified === true,
      useCharacteristicBase: item.useCharacteristicBase !== false,
      advancementCost: item.advancementCost !== null && item.advancementCost !== undefined && Number.isFinite(Number(item.advancementCost)) ? Number(item.advancementCost) : null,
      advancementCostVerified: item.advancementCostVerified === true,
      rank: Number.isInteger(Number(item.rank)) && Number(item.rank) > 0 ? Number(item.rank) : 1,
      maxRank: Number.isInteger(Number(item.maxRank ?? item.max_rank)) && Number(item.maxRank ?? item.max_rank) > 0 ? Number(item.maxRank ?? item.max_rank) : null,
      nameFr: String(item.name_fr || item.nameFr || ''),
      nameOriginal: String(item.name_original || item.nameOriginal || ''),
      category: String(item.category || ''),
      verificationStatus: String(item.verificationStatus || item.verification_status || ''),
      description: String(item.description || ''),
      conditions: String(item.conditions || item.acquisitionConditions || ''),
      prerequisites: Array.isArray(item.prerequisites) ? item.prerequisites.map((value) => String(value || '')).filter(Boolean) : [],
      effects: Array.isArray(item.effects) ? item.effects : [],
      references: Array.isArray(item.references) ? item.references : []
    };
  }).filter((item) => item?.name.trim());
}

function uniqueSuggestions(entries) {
  const seen = new Set();
  return entries.filter((entry) => {
    const key = entry.id || normalizeName(entry.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getCreationSuggestions({ species = null, career = null, level = null } = {}) {
  return {
    skills: uniqueSuggestions([
      ...listNames(species?.skills),
      ...listNames(species?.speciesSkills),
      ...listNames(career?.skills),
      ...listNames(level?.skills)
    ]),
    talents: uniqueSuggestions([
      ...listNames(species?.talents),
      ...listNames(species?.speciesTalents),
      ...listNames(career?.talents),
      ...listNames(level?.talents)
    ]),
    careerId: career?.id || '',
    careerLevelId: level?.id || '',
    speciesId: species?.id || ''
  };
}

export function mergeSuggestedEntries(existingEntries, suggestions, metadata = {}) {
  const existing = Array.isArray(existingEntries) ? [...existingEntries] : [];
  const known = new Set(existing.map((entry) => normalizeName(entry?.name)).filter(Boolean));
  const knownReferences = new Set(existing.map((entry) => String(entry?.referenceId || '')).filter(Boolean));
  const knownNamesWithoutReference = new Set(existing.filter((entry) => !entry?.referenceId).map((entry) => normalizeName(entry?.name)).filter(Boolean));
  const additions = [];
  for (const suggestion of listNames(suggestions)) {
    const key = normalizeName(suggestion.name);
    if (!key || (suggestion.id ? (knownReferences.has(suggestion.id) || knownNamesWithoutReference.has(key)) : known.has(key))) continue;
    known.add(key);
    if (suggestion.id) knownReferences.add(suggestion.id);
    additions.push({
      id: `suggested:${metadata.sourceCareerLevelId || metadata.sourceCareerId || metadata.sourceSpeciesId || 'species'}:${additions.length + 1}:${key.replace(/[^a-z0-9]+/g, '-')}`,
      referenceId: suggestion.id,
      name: suggestion.name.trim(),
      status: 'selected',
      acquired: false,
      ...(metadata.collection === 'skills' ? {
        characteristic: characteristicKeys.has(suggestion.characteristic) ? suggestion.characteristic : '',
        skillType: suggestion.skillType,
        baseValue: suggestion.baseValueVerified ? suggestion.baseValue : null,
        useCharacteristicBase: suggestion.useCharacteristicBase && characteristicKeys.has(suggestion.characteristic),
        advancementCost: suggestion.advancementCostVerified ? suggestion.advancementCost : null,
        advancementCostVerified: suggestion.advancementCostVerified,
        career: Boolean(metadata.sourceCareerId)
      } : {}),
      ...(metadata.collection === 'talents' ? {
        rank: suggestion.rank,
        maxRank: suggestion.maxRank,
        nameFr: suggestion.nameFr,
        nameOriginal: suggestion.nameOriginal,
        category: suggestion.category,
        verificationStatus: suggestion.verificationStatus,
        description: suggestion.description,
        conditions: suggestion.conditions,
        effects: suggestion.effects,
        advancementCost: suggestion.advancementCostVerified ? suggestion.advancementCost : null,
        advancementCostVerified: suggestion.advancementCostVerified,
        references: suggestion.references,
        prerequisites: suggestion.prerequisites,
        prerequisitesVerified: false
      } : {}),
      sourceCareerId: metadata.sourceCareerId || '',
      sourceCareerLevelId: metadata.sourceCareerLevelId || '',
      sourceSpeciesId: metadata.sourceSpeciesId || ''
    });
  }
  return { entries: [...existing, ...additions], additions };
}

function referenceByIdentity(references, kind, id, name) {
  const entries = references.filter((entry) => entry.kind === kind);
  if (id) {
    const match = entries.find((entry) => entry.id === id);
    if (match) return match;
  }
  const normalized = normalizeName(name);
  if (!normalized) return null;
  const matches = entries.filter((entry) => normalizeName(entry.name) === normalized || (entry.aliases || []).some((alias) => normalizeName(alias) === normalized));
  return matches.length === 1 ? matches[0] : null;
}

function addMessage(list, severity, step, message) {
  list.push({ severity, step, message });
}

export function validateCharacterCreation(character, references = []) {
  const errors = [];
  const warnings = [];
  const information = [];
  const identity = character?.identity || {};
  const species = referenceByIdentity(references, 'species', identity.speciesId, identity.species);
  const career = referenceByIdentity(references, 'careers', identity.careerId, identity.career);
  const level = career ? findCareerLevel(career, identity.careerLevelId, identity.careerLevel) : null;

  if (!String(identity.firstName || '').trim() && !String(identity.lastName || '').trim()) {
    addMessage(errors, 'error', 'identity', 'Renseignez au moins un prénom ou un nom.');
  }
  if (!species) addMessage(errors, 'error', 'species', 'Sélectionnez une espèce présente dans les référentiels.');

  const missingCharacteristics = CHARACTERISTICS.filter(({ key }) => character?.characteristics?.[key] === null || character?.characteristics?.[key] === undefined || character?.characteristics?.[key] === '').map(({ shortLabel }) => shortLabel);
  if (missingCharacteristics.length) {
    addMessage(errors, 'error', 'characteristics', `Renseignez les caractéristiques suivantes : ${missingCharacteristics.join(', ')}.`);
  }
  for (const { key, shortLabel } of CHARACTERISTICS) {
    const value = Number(character?.characteristics?.[key]);
    if (Number.isFinite(value) && value > 100) addMessage(warnings, 'warning', 'characteristics', `${shortLabel} dépasse 100 ; vérifiez cette valeur.`);
  }

  if (!career) addMessage(errors, 'error', 'career', identity.career
    ? 'La carrière saisie n’est pas reliée à une entrée de référentiel. Sélectionnez une carrière référencée.'
    : 'Sélectionnez une carrière présente dans les référentiels.');
  else if (!Array.isArray(career.levels) || career.levels.length === 0) {
    addMessage(warnings, 'warning', 'career', `La carrière « ${career.name} » ne contient aucun niveau documenté. Vous pourrez compléter le référentiel plus tard.`);
  } else if (!level) {
    addMessage(errors, 'error', 'career', `Choisissez un niveau de carrière parmi les ${career.levels.length} niveau(x) renseigné(s).`);
  }
  if (level) {
    if (!(level.skills || []).length && !(career.skills || []).length) addMessage(information, 'info', 'skills', 'Aucune compétence n’est encore renseignée pour ce niveau de carrière.');
    if (!(level.talents || []).length && !(career.talents || []).length) addMessage(information, 'info', 'talents', 'Aucun talent n’est encore renseigné pour ce niveau de carrière.');
    if ((level.entryConditions || []).length) addMessage(information, 'info', 'career', 'Des conditions d’accès sont documentées pour ce niveau ; leur satisfaction doit être vérifiée manuellement.');
  }

  const religion = referenceByIdentity(references, 'religions', identity.religionId, identity.religion);
  const deity = referenceByIdentity(references, 'deities', identity.deityId, identity.deity);
  if (identity.religion && !religion) addMessage(warnings, 'warning', 'religion', 'La religion saisie n’est pas reliée à un référentiel.');
  if (identity.deity && !deity) addMessage(warnings, 'warning', 'religion', 'La divinité saisie n’est pas reliée à un référentiel.');
  if (religion && deity && !((deity.religionIds || []).includes(religion.id) || (religion.deityIds || []).includes(deity.id))) {
    addMessage(warnings, 'warning', 'religion', 'La divinité sélectionnée n’est pas associée à la religion choisie.');
  }

  const skills = Array.isArray(character?.skills) ? character.skills : [];
  const talents = Array.isArray(character?.talents) ? character.talents : [];
  const duplicateSkills = duplicateNames(skills);
  const duplicateTalents = duplicateNames(talents);
  if (duplicateSkills.length) addMessage(warnings, 'warning', 'skills', `Compétences en double : ${duplicateSkills.join(', ')}.`);
  if (duplicateTalents.length) addMessage(warnings, 'warning', 'talents', `Talents en double : ${duplicateTalents.join(', ')}.`);
  for (const skill of skills) {
    if (skill.status !== 'acquired' && skill.acquired !== true) addMessage(information, 'info', 'skills', `« ${skill.name} » est sélectionnée mais pas marquée comme acquise.`);
  }
  for (const talent of talents) {
    if (talent.status !== 'acquired' && talent.acquired !== true) addMessage(information, 'info', 'talents', `« ${talent.name} » est sélectionné mais pas marqué comme acquis.`);
    if (talent.conditions) addMessage(information, 'info', 'talents', `Les conditions du talent « ${talent.name} » sont documentées et doivent être vérifiées manuellement.`);
    if (talent.maxRank && Number(talent.rank) > talent.maxRank) {
      addMessage(warnings, 'warning', 'talents', `Le rang ${talent.rank} du talent « ${talent.name} » dépasse son maximum documenté (${talent.maxRank}).`);
    }
  }

  const secondary = character?.secondary || {};
  if (secondary.woundsCurrent !== null && secondary.woundsMax !== null && Number(secondary.woundsCurrent) > Number(secondary.woundsMax)) {
    addMessage(warnings, 'warning', 'resources', 'Les blessures actuelles dépassent les blessures maximales.');
  }
  if ((character?.experience?.spent || 0) > (character?.experience?.total || 0)) {
    addMessage(warnings, 'warning', 'resources', 'Les points d’expérience dépensés dépassent le total acquis.');
  }
  if (secondary.movement === null || secondary.woundsMax === null) {
    addMessage(information, 'info', 'resources', 'Le mouvement et les blessures maximales restent à renseigner : aucune formule non vérifiée n’est appliquée.');
  }
  if (character?.characteristics?.F === null || character?.characteristics?.F === undefined || character?.characteristics?.E === null || character?.characteristics?.E === undefined) {
    addMessage(information, 'info', 'resources', 'Les bonus de Force et d’Endurance seront calculés lorsque F et E seront renseignées ; à défaut, leurs valeurs manuelles restent disponibles.');
  }
  if (species && Object.values(species.characteristicModifiers || {}).some((value) => value === null || value === undefined)) {
    addMessage(warnings, 'warning', 'species', 'Le profil d’espèce ne contient pas les dix modificateurs nécessaires.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    information,
    selected: { species, career, level, religion, deity },
    counts: { skills: skills.length, talents: talents.length }
  };
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function hasNamedEntries(entries) {
  return Array.isArray(entries) && entries.some((entry) => hasValue(entry?.name));
}

function hasResourceDetails(character) {
  const secondary = character?.secondary || {};
  const experience = character?.experience || {};
  const resources = character?.resources || {};
  const rules = character?.rules || {};
  const profile = character?.profile || {};
  const equipment = character?.equipment || {};

  return Object.values(secondary).some(hasValue)
    || Number(experience.total) > 0
    || Number(experience.spent) > 0
    || Number(resources.corruptionPoints) > 0
    || hasValue(rules.corruptionThreshold)
    || hasValue(rules.encumbranceCapacity)
    || Object.values(profile).some(hasValue)
    || ['weapons', 'armour', 'possessions', 'spells', 'prayers'].some((key) => hasNamedEntries(equipment[key]));
}

/**
 * Source unique de vérité de la progression : les étapes obligatoires sont
 * validées à partir du personnage et les étapes facultatives le sont soit par
 * leurs données, soit par une action explicite « Passer cette étape ».
 * La simple navigation n'est jamais assimilée à une validation.
 */
export function getCompletedCreationSteps(character, references = [], skippedSteps = []) {
  const validation = validateCharacterCreation(character, references);
  const blockedSteps = new Set(validation.errors.map(({ step }) => step));
  const skipped = new Set(skippedSteps);
  const completed = new Set();

  for (const step of ['identity', 'species', 'characteristics', 'career']) {
    if (!blockedSteps.has(step)) completed.add(step);
  }

  const identity = character?.identity || {};
  const hasReligion = hasValue(identity.religionId) || hasValue(identity.religion);
  const hasDeity = hasValue(identity.deityId) || hasValue(identity.deity);
  const religionReferencesValid = (!hasReligion || Boolean(validation.selected.religion))
    && (!hasDeity || Boolean(validation.selected.deity));
  const deityRelationshipValid = !validation.selected.religion || !validation.selected.deity
    || validation.selected.deity.religionIds?.includes(validation.selected.religion.id)
    || validation.selected.religion.deityIds?.includes(validation.selected.deity.id);
  if ((hasReligion || hasDeity) && religionReferencesValid && deityRelationshipValid) completed.add('religion');

  if (hasNamedEntries(character?.skills)) completed.add('skills');
  if (hasNamedEntries(character?.talents)) completed.add('talents');
  const resourceWarnings = validation.warnings.some(({ step }) => step === 'resources');
  if (hasResourceDetails(character) && !resourceWarnings) completed.add('resources');

  for (const step of ['religion', 'skills', 'talents', 'resources']) {
    if (skipped.has(step)) completed.add(step);
  }

  return completed;
}

/**
 * Sépare explicitement la sélection courante de l'état de complétude.
 * Une étape peut donc être simultanément active et complète : le rendu garde
 * le jaune de sélection tout en affichant le marqueur de validation vert.
 */
export function getCreationStepStates(character, references = [], { currentStep = '', skippedSteps = [] } = {}) {
  const completed = getCompletedCreationSteps(character, references, skippedSteps);
  return CREATION_STEPS.map(({ id }) => ({
    id,
    isCurrent: id === currentStep,
    isComplete: completed.has(id),
    state: id === currentStep ? 'current' : completed.has(id) ? 'complete' : 'pending'
  }));
}

function duplicateNames(entries) {
  const seen = new Set();
  const duplicates = new Set();
  for (const entry of entries) {
    const name = entry?.referenceId || normalizeName(entry?.name);
    if (!name) continue;
    if (seen.has(name)) duplicates.add(entry.name);
    seen.add(name);
  }
  return [...duplicates];
}

export function getStepIndex(stepId) {
  const index = CREATION_STEPS.findIndex((step) => step.id === stepId);
  return index < 0 ? 0 : index;
}
