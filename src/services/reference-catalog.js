import {
  getAllReferenceEntries,
  getReferenceMeta,
  saveReferenceBundle,
  seedReferenceEntries
} from '../database/indexeddb.js';
import { createId } from '../models/character.js';

export const REFERENCE_KINDS = Object.freeze(['religions', 'deities', 'careers', 'species', 'talents']);
export const REFERENCE_APP = 'warhammer-character-manager';
export const REFERENCE_FORMAT_VERSION = 1;
export const MAX_REFERENCE_IMPORT_SIZE = 10 * 1024 * 1024;

const KIND_SINGULAR = { religions: 'religion', deities: 'deity', careers: 'career', species: 'species', talents: 'talent' };
const CHARACTERISTIC_KEYS = ['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'];
const CHARACTERISTIC_KEY_SET = new Set(CHARACTERISTIC_KEYS);
const TEXT_LIMIT = 5000;
const now = () => new Date().toISOString();
const CAREER_LEVEL_LIST_FIELDS = [
  'skills', 'skillIds', 'talents', 'talentIds', 'advancements',
  'entryConditions', 'exitConditions', 'equipment', 'references'
];

function cleanText(value, limit = 500) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function cleanList(value, limit = 100) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanText(item, 300)).filter(Boolean))].slice(0, limit);
}

function cleanIdList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string' && item.length > 0 && item.length <= 180))].slice(0, 200);
}

function normalizeSkillKind(value) {
  const normalized = cleanText(value, 40).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');
  if (normalized.includes('basic') || normalized.includes('base')) return 'basic';
  if (normalized.includes('advanced') || normalized.includes('avancee')) return 'advanced';
  return '';
}

function cleanNamedList(value, kind = 'skills', limit = 100) {
  if (!Array.isArray(value)) return [];
  const entries = [];
  const seen = new Set();
  for (const item of value.slice(0, limit)) {
    if (typeof item === 'string') {
      const name = cleanText(item, 300);
      const key = name.toLocaleLowerCase('fr-FR');
      if (name && !seen.has(key)) { entries.push(name); seen.add(key); }
      continue;
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const name = cleanText(item.name, 300);
    const key = name.toLocaleLowerCase('fr-FR');
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const reference = {
      id: cleanText(item.id || item.referenceId, 180),
      name
    };
    if (kind === 'skills') {
      const characteristic = cleanText(item.characteristic || item.characteristicKey, 8);
      const type = normalizeSkillKind(item.skillType || item.type || item.category);
      const baseValue = item.baseValue === null || item.baseValue === undefined || item.baseValue === '' ? null : Number(item.baseValue);
      const advancementCost = item.advancementCost === null || item.advancementCost === undefined || item.advancementCost === '' ? null : Number(item.advancementCost);
      if (CHARACTERISTIC_KEY_SET.has(characteristic)) reference.characteristic = characteristic;
      if (type) reference.skillType = type;
      if (Number.isFinite(baseValue) && item.baseValueVerified === true) {
        reference.baseValue = baseValue;
        reference.baseValueVerified = true;
      }
      if (Number.isFinite(advancementCost) && advancementCost > 0 && item.advancementCostVerified === true) {
        reference.advancementCost = advancementCost;
        reference.advancementCostVerified = true;
      }
      reference.useCharacteristicBase = item.useCharacteristicBase !== false;
      reference.description = cleanText(item.description, TEXT_LIMIT);
      reference.references = cleanList(item.references, 20);
    } else {
      const rank = Number(item.rank);
      const advancementCost = item.advancementCost === null || item.advancementCost === undefined || item.advancementCost === '' ? null : Number(item.advancementCost);
      reference.rank = Number.isInteger(rank) && rank > 0 ? Math.min(rank, 999) : 1;
      reference.description = cleanText(item.description, TEXT_LIMIT);
      reference.conditions = cleanText(item.conditions || item.acquisitionConditions, TEXT_LIMIT);
      if (Number.isFinite(advancementCost) && advancementCost > 0 && item.advancementCostVerified === true) {
        reference.advancementCost = advancementCost;
        reference.advancementCostVerified = true;
      }
      reference.references = cleanList(item.references, 20);
      reference.effects = Array.isArray(item.effects) ? item.effects.slice(0, 20).filter((effect) => effect && typeof effect === 'object' && !Array.isArray(effect)).map((effect) => ({
        type: cleanText(effect.type, 40),
        characteristic: CHARACTERISTIC_KEY_SET.has(effect.characteristic) ? effect.characteristic : '',
        value: Number.isFinite(Number(effect.value)) ? Number(effect.value) : 0,
        verified: effect.verified === true,
        reference: cleanText(effect.reference, 500)
      })) : [];
    }
    if (reference.id) reference.referenceId = reference.id;
    entries.push(reference);
  }
  return entries;
}

function cleanTalentEffects(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).filter((effect) => effect && typeof effect === 'object' && !Array.isArray(effect)).map((effect) => ({
    type: cleanText(effect.type, 50) || 'none',
    target: cleanText(effect.target, 120),
    resource: cleanText(effect.resource, 80),
    operation: cleanText(effect.operation, 30),
    formula: cleanText(effect.formula, 500),
    characteristic: CHARACTERISTIC_KEY_SET.has(effect.characteristic) ? effect.characteristic : '',
    skillId: cleanText(effect.skillId, 180),
    skillName: cleanText(effect.skillName, 160),
    value: Number.isFinite(Number(effect.value)) ? Number(effect.value) : null,
    condition: cleanText(effect.condition, 1000),
    verified: effect.verified === true,
    reference: cleanText(effect.reference, 500)
  }));
}

function normalizeTalentReference(input, common, source) {
  const maxRank = input?.max_rank ?? input?.maxRank;
  const normalizedMaxRank = maxRank === '' || maxRank === null || maxRank === undefined
    ? null
    : Number(maxRank);
  const verification = cleanText(input?.verification_status || input?.verificationStatus, 40);
  const availability = cleanText(input?.availability, 40);
  const sourceInfo = input?.source_info || input?.sourceInfo;
  const sourceRecord = sourceInfo && typeof sourceInfo === 'object' && !Array.isArray(sourceInfo) ? sourceInfo : {};
  const advancementCost = input?.advancementCost === null || input?.advancementCost === undefined || input?.advancementCost === ''
    ? null
    : Number(input.advancementCost);
  return {
    ...common,
    name_fr: cleanText(input?.name_fr || input?.nameFr, 160),
    name_original: cleanText(input?.name_original || input?.nameOriginal, 160),
    aliases: cleanList(input?.aliases, 100),
    category: cleanText(input?.category, 120),
    tests: cleanList(input?.tests, 30),
    skills: cleanList(input?.skills, 50),
    maxRank: Number.isInteger(normalizedMaxRank) && normalizedMaxRank > 0 ? Math.min(normalizedMaxRank, 999) : null,
    ...(Number.isInteger(advancementCost) && advancementCost > 0 && input?.advancementCostVerified === true
      ? { advancementCost, advancementCostVerified: true }
      : {}),
    effects: cleanTalentEffects(input?.effects),
    prerequisites: cleanList(input?.prerequisites, 50),
    species: cleanIdList(input?.species),
    careerIds: cleanIdList(input?.career_ids || input?.careerIds),
    careerLevelIds: cleanIdList(input?.career_level_ids || input?.careerLevelIds),
    availability: ['available', 'restricted', 'unavailable', 'unknown'].includes(availability) ? availability : 'unknown',
    verificationStatus: ['verified', 'incomplete', 'community', 'custom'].includes(verification) ? verification : (source === 'custom' ? 'custom' : 'incomplete'),
    sourceInfo: {
      title: cleanText(sourceRecord.title, 240),
      publisher: cleanText(sourceRecord.publisher, 160),
      page: cleanText(sourceRecord.page, 80),
      url: cleanText(sourceRecord.url, 1000),
      note: cleanText(sourceRecord.note, TEXT_LIMIT)
    },
    custom: source === 'custom' || input?.custom === true
  };
}

export function preserveNamedMetadata(lines, previous, kind = 'skills') {
  const oldItems = Array.isArray(previous) ? previous : [];
  const byName = new Map(oldItems.map((item) => [
    (typeof item === 'string' ? item : item?.name || '').trim().toLocaleLowerCase('fr-FR'), item
  ]));
  return lines.map((line) => byName.get(line.trim().toLocaleLowerCase('fr-FR')) || line);
}

function isValidNamedEntry(value, kind) {
  if (typeof value === 'string') return value.trim().length > 0 && value.length <= 300;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 300) return false;
  if (kind === 'skills') {
    const characteristic = value.characteristic || value.characteristicKey;
    if (characteristic !== undefined && !CHARACTERISTIC_KEY_SET.has(characteristic)) return false;
    const type = value.skillType || value.type || value.category;
    if (type !== undefined && !normalizeSkillKind(type)) return false;
    if (value.baseValue !== undefined && value.baseValue !== null && !Number.isFinite(Number(value.baseValue))) return false;
    if (value.baseValueVerified !== undefined && typeof value.baseValueVerified !== 'boolean') return false;
    if (value.advancementCost !== undefined && value.advancementCost !== null && !Number.isFinite(Number(value.advancementCost))) return false;
    if (value.advancementCostVerified !== undefined && typeof value.advancementCostVerified !== 'boolean') return false;
    return true;
  }
  if (value.rank !== undefined && (!Number.isInteger(Number(value.rank)) || Number(value.rank) < 1 || Number(value.rank) > 999)) return false;
  if (value.advancementCost !== undefined && value.advancementCost !== null && !Number.isFinite(Number(value.advancementCost))) return false;
  if (value.advancementCostVerified !== undefined && typeof value.advancementCostVerified !== 'boolean') return false;
  return true;
}

function normalizeCareerLevel(careerId, input, index) {
  const raw = typeof input === 'string' ? { name: input } : input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const fallbackRank = index + 1;
  const rankValue = Number(raw.rank);
  const rank = Number.isInteger(rankValue) && rankValue > 0 ? Math.min(rankValue, 99) : fallbackRank;
  const levelId = cleanText(raw.id, 180) || `${careerId}:level:${fallbackRank}`;
  return {
    id: levelId,
    careerId,
    name: cleanText(raw.name, 160),
    rank,
    description: cleanText(raw.description, TEXT_LIMIT),
    skills: cleanNamedList(raw.skills, 'skills'),
    skillIds: cleanIdList(raw.skillIds),
    talents: cleanNamedList(raw.talents, 'talents'),
    talentIds: cleanIdList(raw.talentIds),
    advancements: cleanList(raw.advancements),
    entryConditions: cleanList(raw.entryConditions),
    exitConditions: cleanList(raw.exitConditions),
    equipment: cleanList(raw.equipment),
    additionalInformation: cleanText(raw.additionalInformation, TEXT_LIMIT),
    references: cleanList(raw.references)
  };
}

export function createCareerLevel(careerId, rank = 1) {
  return normalizeCareerLevel(careerId, {
    id: `career-level:${createId()}`,
    careerId,
    name: '',
    rank
  }, rank - 1);
}

function normalizeCareerLevels(levels, careerId) {
  if (!Array.isArray(levels)) return [];
  const seen = new Set();
  return levels.map((level, index) => {
    const normalized = normalizeCareerLevel(careerId, level, index);
    if (seen.has(normalized.id)) normalized.id = `${careerId}:level:${index + 1}`;
    seen.add(normalized.id);
    return normalized;
  }).sort((a, b) => a.rank - b.rank);
}

export function normalizeReference(kind, input, options = {}) {
  if (!REFERENCE_KINDS.includes(kind)) throw new Error(`Type de référentiel inconnu : ${kind}.`);
  const source = options.source || input?.source || 'custom';
  const timestamp = now();
  const common = {
    id: cleanText(input?.id, 180) || `custom:${KIND_SINGULAR[kind]}:${createId()}`,
    kind,
    name: cleanText(input?.name, 160),
    description: cleanText(input?.description, TEXT_LIMIT),
    references: cleanList(input?.references),
    source,
    packId: options.packId ?? input?.packId ?? null,
    createdAt: cleanText(input?.createdAt, 40) || timestamp,
    updatedAt: timestamp
  };

  if (kind === 'religions') {
    return {
      ...common,
      deityIds: cleanIdList(input?.deityIds),
      particularities: cleanList(input?.particularities),
      origin: cleanText(input?.origin, 240)
    };
  }
  if (kind === 'deities') {
    return {
      ...common,
      religionIds: cleanIdList(input?.religionIds),
      domains: cleanList(input?.domains),
      symbols: cleanList(input?.symbols),
      additionalInformation: cleanText(input?.additionalInformation, TEXT_LIMIT)
    };
  }
  if (kind === 'species') {
    const modifiers = input?.characteristicModifiers && typeof input.characteristicModifiers === 'object'
      ? input.characteristicModifiers
      : {};
    return {
      ...common,
      aliases: cleanList(input?.aliases),
      particularities: cleanList(input?.particularities),
      skills: cleanNamedList(input?.skills, 'skills'),
      skillIds: cleanIdList(input?.skillIds),
      talents: cleanNamedList(input?.talents, 'talents'),
      talentIds: cleanIdList(input?.talentIds),
      customized: source === 'builtin' && Boolean(input?.customized),
      characteristicModifiers: Object.fromEntries(CHARACTERISTIC_KEYS.map((key) => {
        const value = modifiers[key];
        const number = value === '' || value === null || value === undefined ? null : Number(value);
        return [key, Number.isInteger(number) && number >= 0 && number <= 99 ? number : null];
      }))
    };
  }
  if (kind === 'talents') return normalizeTalentReference(input, common, source);
  return {
    ...common,
    className: cleanText(input?.className, 120),
    levels: normalizeCareerLevels(input?.levels, common.id),
    skills: cleanNamedList(input?.skills, 'skills'),
    skillIds: cleanIdList(input?.skillIds),
    talents: cleanNamedList(input?.talents, 'talents'),
    talentIds: cleanIdList(input?.talentIds),
    advancements: cleanList(input?.advancements),
    entryConditions: cleanList(input?.entryConditions),
    exitConditions: cleanList(input?.exitConditions),
    equipment: cleanList(input?.equipment)
  };
}

export function validateReferenceEntries(entries, { existingEntries = [], allowMissingTalentLinks = false } = {}) {
  const errors = [];
  if (!Array.isArray(entries) || entries.length > 1000) {
    return { valid: false, errors: ['Le paquet doit contenir un tableau de 1 000 entrées maximum.'] };
  }
  const seen = new Set();
  const seenIds = new Set();
  const seenLevelIds = new Set();
  for (const [index, entry] of entries.entries()) {
    const location = `Entrée ${index + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${location} : objet invalide.`);
      continue;
    }
    if (!REFERENCE_KINDS.includes(entry.kind)) {
      errors.push(`${location} : type absent ou inconnu.`);
      continue;
    }
    if (typeof entry.id !== 'string' || !entry.id.trim() || entry.id.length > 180) errors.push(`${location} : identifiant absent ou trop long.`);
    if (typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 160) errors.push(`${location} : nom absent ou trop long.`);
    const key = `${entry.kind}:${entry.id}`;
    if (seen.has(key)) errors.push(`${location} : identifiant dupliqué dans le paquet.`);
    if (typeof entry.id === 'string' && seenIds.has(entry.id)) errors.push(`${location} : identifiant global déjà utilisé dans le paquet.`);
    seen.add(key);
    if (typeof entry.id === 'string') seenIds.add(entry.id);
    for (const field of ['references']) {
      if (entry[field] !== undefined && (!Array.isArray(entry[field]) || entry[field].some((value) => typeof value !== 'string'))) {
        errors.push(`${location} : champ « ${field} » invalide.`);
      }
    }
    const listFields = entry.kind === 'religions'
      ? ['deityIds', 'particularities']
      : entry.kind === 'deities'
        ? ['religionIds', 'domains', 'symbols']
        : entry.kind === 'species'
          ? ['aliases', 'particularities', 'skills', 'skillIds', 'talents', 'talentIds']
          : entry.kind === 'talents'
            ? ['aliases', 'tests', 'skills', 'prerequisites', 'species', 'career_ids', 'career_level_ids', 'careerIds', 'careerLevelIds']
            : ['skills', 'skillIds', 'talents', 'talentIds', 'advancements', 'entryConditions', 'exitConditions', 'equipment'];
    for (const field of listFields) {
      const namedKind = field === 'skills' ? 'skills' : field === 'talents' ? 'talents' : '';
      if (entry[field] !== undefined && (!Array.isArray(entry[field]) || entry[field].some((value) => namedKind ? !isValidNamedEntry(value, namedKind) : typeof value !== 'string'))) {
        errors.push(`${location} : champ « ${field} » invalide.`);
      }
    }
    if (entry.description !== undefined && typeof entry.description !== 'string') errors.push(`${location} : description invalide.`);
    if (entry.kind === 'talents') {
      const maxRank = entry.max_rank ?? entry.maxRank;
      if (maxRank !== undefined && maxRank !== null && maxRank !== '' && (!Number.isInteger(Number(maxRank)) || Number(maxRank) < 1 || Number(maxRank) > 999)) {
        errors.push(`${location} : rang maximal invalide.`);
      }
      const verification = entry.verification_status || entry.verificationStatus;
      if (verification !== undefined && !['verified', 'incomplete', 'community', 'custom'].includes(verification)) {
        errors.push(`${location} : statut de vérification inconnu.`);
      }
      if (entry.availability !== undefined && !['available', 'restricted', 'unavailable', 'unknown'].includes(entry.availability)) {
        errors.push(`${location} : disponibilité inconnue.`);
      }
      const effects = entry.effects ?? [];
      if (!Array.isArray(effects) || effects.length > 30 || effects.some((effect) => !effect || typeof effect !== 'object' || Array.isArray(effect))) {
        errors.push(`${location} : effets invalides.`);
      }
      for (const field of ['name_fr', 'name_original', 'category']) {
        if (entry[field] !== undefined && typeof entry[field] !== 'string') errors.push(`${location} : champ « ${field} » invalide.`);
      }
    }
    if (entry.kind === 'species' && entry.characteristicModifiers !== undefined) {
      if (!entry.characteristicModifiers || typeof entry.characteristicModifiers !== 'object' || Array.isArray(entry.characteristicModifiers)) {
        errors.push(`${location} : modificateurs de caractéristiques invalides.`);
      } else {
        for (const key of CHARACTERISTIC_KEYS) {
          const value = entry.characteristicModifiers[key];
          if (value !== undefined && value !== null && (!Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > 99)) {
            errors.push(`${location} : modificateur invalide pour « ${key} » (entier de 0 à 99 attendu).`);
          }
        }
      }
    }
    if (entry.kind === 'careers' && entry.levels !== undefined) {
      if (!Array.isArray(entry.levels) || entry.levels.length > 100) {
        errors.push(`${location} : la liste des niveaux est invalide (100 maximum).`);
      } else {
        entry.levels.forEach((level, levelIndex) => {
          if (typeof level === 'string') return; // Compatibilité avec les anciens référentiels.
          if (!level || typeof level !== 'object' || Array.isArray(level)) {
            errors.push(`${location}, niveau ${levelIndex + 1} : objet invalide.`);
            return;
          }
          if (typeof level.id !== 'string' || !level.id.trim() || level.id.length > 180) {
            errors.push(`${location}, niveau ${levelIndex + 1} : identifiant absent ou invalide.`);
          } else if (seenLevelIds.has(level.id)) {
            errors.push(`${location}, niveau ${levelIndex + 1} : identifiant de niveau dupliqué.`);
          } else {
            seenLevelIds.add(level.id);
          }
          if (typeof level.name !== 'string' || !level.name.trim() || level.name.length > 160) {
            errors.push(`${location}, niveau ${levelIndex + 1} : nom absent ou invalide.`);
          }
          if (level.careerId !== undefined && level.careerId !== entry.id) {
            errors.push(`${location}, niveau ${levelIndex + 1} : le niveau est associé à une autre carrière.`);
          }
          if (level.rank !== undefined && (!Number.isInteger(Number(level.rank)) || Number(level.rank) < 1 || Number(level.rank) > 99)) {
            errors.push(`${location}, niveau ${levelIndex + 1} : rang invalide.`);
          }
          for (const field of CAREER_LEVEL_LIST_FIELDS) {
            const namedKind = field === 'skills' ? 'skills' : field === 'talents' ? 'talents' : '';
            if (level[field] !== undefined && (!Array.isArray(level[field]) || level[field].some((value) => namedKind ? !isValidNamedEntry(value, namedKind) : typeof value !== 'string'))) {
              errors.push(`${location}, niveau ${levelIndex + 1} : champ « ${field} » invalide.`);
            }
          }
          for (const field of ['description', 'additionalInformation']) {
            if (level[field] !== undefined && typeof level[field] !== 'string') {
              errors.push(`${location}, niveau ${levelIndex + 1} : champ « ${field} » invalide.`);
            }
          }
        });
      }
    }
  }

  const knownTypes = new Map(existingEntries.map((entry) => [entry.id, entry.kind]));
  const knownCareerLevels = new Map();
  for (const entry of [...existingEntries, ...entries]) {
    if (entry?.kind !== 'careers' || !Array.isArray(entry.levels)) continue;
    for (const level of entry.levels) {
      if (level && typeof level === 'object' && typeof level.id === 'string') {
        knownCareerLevels.set(level.id, entry.id);
      }
    }
  }
  entries.forEach((entry) => {
    if (entry && typeof entry === 'object' && typeof entry.id === 'string') knownTypes.set(entry.id, entry.kind);
  });
  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== 'object') continue;
    const relationFields = entry.kind === 'religions'
      ? { deityIds: 'deities' }
      : entry.kind === 'deities' ? { religionIds: 'religions' }
        : entry.kind === 'talents' ? {
          species: 'species',
          careerIds: 'careers',
          career_ids: 'careers',
          careerLevelIds: 'careerLevels',
          career_level_ids: 'careerLevels'
        } : {};
    for (const [field, expectedKind] of Object.entries(relationFields)) {
      if (entry[field] === undefined) continue;
      if (!Array.isArray(entry[field])) errors.push(`Entrée ${index + 1} : champ « ${field} » invalide.`);
      else if (entry[field].some((id) => {
        if (typeof id !== 'string') return true;
        const linked = expectedKind === 'careerLevels' ? knownCareerLevels.has(id) : knownTypes.get(id) === expectedKind;
        if (linked) return false;
        const missing = expectedKind === 'careerLevels' ? !knownCareerLevels.has(id) : !knownTypes.has(id);
        return !(entry.kind === 'talents' && allowMissingTalentLinks && missing);
      })) {
        errors.push(`Entrée ${index + 1} : relation absente ou de type incompatible dans « ${field} ».`);
      }
    }
    if (entry.kind === 'talents') {
      const careerIdsValue = entry.careerIds || entry.career_ids || [];
      const levelIdsValue = entry.careerLevelIds || entry.career_level_ids || [];
      const careerIds = Array.isArray(careerIdsValue) ? careerIdsValue : [];
      const levelIds = Array.isArray(levelIdsValue) ? levelIdsValue : [];
      if (careerIds.length && levelIds.some((id) => knownCareerLevels.has(id) && !careerIds.includes(knownCareerLevels.get(id)))) {
        errors.push(`Entrée ${index + 1} : un niveau associé ne dépend pas d’une carrière déclarée dans « careerIds ».`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

async function fetchDataset(kind) {
  const response = await fetch(new URL(`../../data/${kind}.json`, import.meta.url));
  if (!response.ok) throw new Error(`Impossible de charger le référentiel intégré « ${kind} » (${response.status}).`);
  return response.json();
}

export async function loadBuiltInReferenceData() {
  const datasets = await Promise.all(REFERENCE_KINDS.map(fetchDataset));
  const allEntries = datasets.flatMap((dataset) => (dataset.entries || []).map((entry) => ({ ...entry, kind: dataset.kind })));
  for (const kind of REFERENCE_KINDS) {
    const dataset = datasets.find((item) => item.kind === kind);
    const expectedSchemaVersion = kind === 'careers' ? 2 : 1;
    if (!dataset || dataset.schemaVersion !== expectedSchemaVersion || !Number.isInteger(dataset.version) || dataset.version < 1) {
      throw new Error(`En-tête invalide pour le référentiel intégré « ${kind} ».`);
    }
    if (!Array.isArray(dataset.entries)) throw new Error(`La liste du référentiel « ${kind} » est absente.`);
    const invalidKind = dataset.entries.some((entry) => !entry || entry.kind && entry.kind !== kind || !String(entry.id || '').startsWith(`builtin:${KIND_SINGULAR[kind]}:`));
    if (invalidKind) throw new Error(`Un identifiant ou un type est invalide dans « ${kind} ».`);
    const validation = validateReferenceEntries(dataset.entries.map((entry) => ({ ...entry, kind })), { existingEntries: allEntries });
    if (!validation.valid) throw new Error(`Référentiel intégré « ${kind} » invalide : ${validation.errors.slice(0, 3).join(' ')}`);
  }
  return datasets;
}

export async function initializeBuiltInReferences() {
  const datasets = await loadBuiltInReferenceData();
  for (const dataset of datasets) {
    const metadata = await getReferenceMeta(`seed:${dataset.kind}`);
    if (metadata?.version >= dataset.version) continue;
    const entries = dataset.entries.map((entry) => normalizeReference(dataset.kind, entry, { source: 'builtin', packId: null }));
    await seedReferenceEntries(entries, {
      key: `seed:${dataset.kind}`,
      version: dataset.version,
      schemaVersion: dataset.schemaVersion,
      updatedAt: now()
    });
  }
  return getAllReferenceEntries();
}

export function getReferenceOptions(entries, kind, { religionId = '' } = {}) {
  const values = entries.filter((entry) => entry.kind === kind);
  if (kind !== 'deities' || !religionId) return values.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const religion = entries.find((entry) => entry.kind === 'religions' && entry.id === religionId);
  return values
    .filter((entry) => entry.religionIds?.includes(religionId) || religion?.deityIds?.includes(entry.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function getCareerLevels(career) {
  return normalizeCareerLevels(career?.levels, career?.id || 'career:unknown');
}

export function findCareerLevel(career, levelId = '', legacyName = '') {
  const levels = getCareerLevels(career);
  if (levelId) {
    const byId = levels.find((level) => level.id === levelId);
    if (byId) return byId;
  }
  const normalizedName = cleanText(legacyName, 160).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');
  if (!normalizedName) return null;
  const matches = levels.filter((level) => level.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR') === normalizedName);
  return matches.length === 1 ? matches[0] : null;
}

function normalizeReferenceName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('fr-FR');
}

function verifiedCost(candidates) {
  const costs = [...new Set(candidates
    .filter((entry) => entry?.advancementCostVerified === true && (
      String(entry.advancementCostReference || '').trim()
      || (Array.isArray(entry.references) && entry.references.some((reference) => String(reference || '').trim()))
      || (String(entry.sourceInfo?.title || '').trim() && String(entry.sourceInfo?.page || '').trim())
    ))
    .map((entry) => Number(entry.advancementCost))
    .filter((cost) => Number.isInteger(cost) && cost > 0 && cost <= 9999))];
  return costs.length === 1 ? costs[0] : null;
}

/** Renvoie uniquement un coût de compétence explicitement marqué comme vérifié. */
export function getSkillAdvancementCost(skill, entries = []) {
  const direct = verifiedCost([skill]);
  if (direct) return direct;
  const name = normalizeReferenceName(skill?.name);
  const referenceId = String(skill?.referenceId || '');
  const candidates = [];
  for (const reference of entries) {
    if (!['careers', 'species'].includes(reference.kind)) continue;
    if (skill?.sourceCareerId && reference.kind === 'careers' && reference.id !== skill.sourceCareerId) continue;
    if (skill?.sourceSpeciesId && reference.kind === 'species' && reference.id !== skill.sourceSpeciesId) continue;
    const lists = [reference.skills || []];
    for (const level of reference.levels || []) {
      if (skill?.sourceCareerLevelId && level?.id !== skill.sourceCareerLevelId) continue;
      lists.push(level?.skills || []);
    }
    for (const list of lists) {
      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const matchesId = referenceId && String(item.id || item.referenceId || '') === referenceId;
        const matchesName = name && normalizeReferenceName(item.name) === name;
        if (matchesId || matchesName) candidates.push(item);
      }
    }
  }
  return verifiedCost(candidates);
}

/** Renvoie uniquement un coût de talent explicitement validé dans le référentiel. */
export function getTalentAdvancementCost(talent, entries = []) {
  const direct = verifiedCost([talent]);
  if (direct) return direct;
  const referenceId = String(talent?.referenceId || '');
  const names = new Set([talent?.name, talent?.nameFr, talent?.nameOriginal]
    .map(normalizeReferenceName).filter(Boolean));
  const matches = entries.filter((entry) => entry.kind === 'talents' && (
    (referenceId && entry.id === referenceId)
    || names.has(normalizeReferenceName(entry.name))
    || names.has(normalizeReferenceName(entry.name_fr))
    || names.has(normalizeReferenceName(entry.name_original))
    || (entry.aliases || []).some((alias) => names.has(normalizeReferenceName(alias)))
  ));
  return verifiedCost(matches);
}

export function createCustomReference(kind, values = {}) {
  return normalizeReference(kind, { ...values, id: values.id || `custom:${KIND_SINGULAR[kind]}:${createId()}` }, { source: 'custom', packId: null });
}

export function buildReferenceSaveBundle(entries, nextEntry) {
  const updated = new Map(entries.map((entry) => [entry.id, entry]));
  const previous = updated.get(nextEntry.id);
  const next = normalizeReference(nextEntry.kind, nextEntry, {
    source: nextEntry.source || previous?.source || 'custom',
    packId: nextEntry.packId ?? previous?.packId ?? null
  });
  updated.set(next.id, next);

  // Les relations inverses ne sont synchronisées que sur les fiches modifiables.
  // Une fiche intégrée reste strictement intacte, même lorsqu'un contenu perso lui est lié.
  if (next.kind === 'religions') {
    const oldIds = new Set(previous?.deityIds || []);
    const newIds = new Set(next.deityIds || []);
    for (const deity of updated.values()) {
      if (deity.kind !== 'deities' || deity.source === 'builtin') continue;
      const religionIds = new Set(deity.religionIds || []);
      if (oldIds.has(deity.id) && !newIds.has(deity.id)) religionIds.delete(next.id);
      if (newIds.has(deity.id)) religionIds.add(next.id);
      updated.set(deity.id, { ...deity, religionIds: [...religionIds], updatedAt: now() });
    }
  } else if (next.kind === 'deities') {
    const oldIds = new Set(previous?.religionIds || []);
    const newIds = new Set(next.religionIds || []);
    for (const religion of updated.values()) {
      if (religion.kind !== 'religions' || religion.source === 'builtin') continue;
      const deityIds = new Set(religion.deityIds || []);
      if (oldIds.has(religion.id) && !newIds.has(religion.id)) deityIds.delete(next.id);
      if (newIds.has(religion.id)) deityIds.add(next.id);
      updated.set(religion.id, { ...religion, deityIds: [...deityIds], updatedAt: now() });
    }
  }
  return [...updated.values()];
}

export function buildReferenceDeleteBundle(entries, id) {
  const deleted = entries.find((entry) => entry.id === id);
  if (!deleted) return { entries, deletedIds: [] };
  if (deleted.source === 'builtin') throw new Error('Les données intégrées à l’application ne peuvent pas être supprimées.');
  const remaining = entries.filter((entry) => entry.id !== id).map((entry) => {
    if (entry.source === 'builtin') return entry;
    if (entry.kind === 'religions' && deleted.kind === 'deities') {
      return { ...entry, deityIds: (entry.deityIds || []).filter((value) => value !== id) };
    }
    if (entry.kind === 'deities' && deleted.kind === 'religions') {
      return { ...entry, religionIds: (entry.religionIds || []).filter((value) => value !== id) };
    }
    return entry;
  });
  return { entries: remaining, deletedIds: [id] };
}

export function exportCustomReferencePack(entries, exportedAt = now()) {
  const exportable = entries.filter((entry) => (
    entry.source !== 'builtin' || (entry.kind === 'species' && entry.customized)
  )).map((entry) => {
    const copy = { ...entry };
    delete copy.source;
    delete copy.packId;
    delete copy.createdAt;
    delete copy.updatedAt;
    delete copy.customized;
    return copy;
  });
  return {
    app: REFERENCE_APP,
    type: 'reference-pack',
    version: REFERENCE_FORMAT_VERSION,
    exportedAt,
    pack: { name: 'Référentiels personnalisés', entries: exportable }
  };
}

export function parseReferencePack(payload, existingEntries = []) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Le fichier doit contenir un objet JSON.');
  if (payload.app !== REFERENCE_APP || payload.type !== 'reference-pack') throw new Error('Ce fichier n’est pas un paquet de référentiels Warhammer Character Manager.');
  if (payload.version !== REFERENCE_FORMAT_VERSION) throw new Error(`Version de paquet non prise en charge : ${payload.version ?? 'inconnue'}.`);
  if (!payload.pack || typeof payload.pack !== 'object' || !Array.isArray(payload.pack.entries) || payload.pack.entries.length === 0) {
    throw new Error('Le paquet est vide ou mal structuré.');
  }
  const result = validateReferenceEntries(payload.pack.entries, { existingEntries });
  if (!result.valid) throw new Error(result.errors.slice(0, 6).join('\n'));
  return payload.pack;
}

export function prepareImportedReferencePack(pack, existingEntries = []) {
  const packId = createId();
  const idMap = new Map(pack.entries.map((entry, index) => [entry.id, `pack:${packId}:${index + 1}`]));
  const levelIdMap = new Map();
  pack.entries.forEach((entry, entryIndex) => {
    if (entry.kind !== 'careers' || !Array.isArray(entry.levels)) return;
    entry.levels.forEach((level, levelIndex) => {
      if (level && typeof level === 'object' && typeof level.id === 'string') {
        levelIdMap.set(level.id, `pack-level:${packId}:${entryIndex + 1}:${levelIndex + 1}`);
      }
    });
  });
  const existingIds = new Set(existingEntries.map((entry) => entry.id));
  return pack.entries.map((raw) => {
    const mapped = { ...raw, id: idMap.get(raw.id) };
    if (Array.isArray(mapped.deityIds)) mapped.deityIds = mapped.deityIds.map((id) => idMap.get(id) || (existingIds.has(id) ? id : null)).filter(Boolean);
    if (Array.isArray(mapped.religionIds)) mapped.religionIds = mapped.religionIds.map((id) => idMap.get(id) || (existingIds.has(id) ? id : null)).filter(Boolean);
    if (raw.kind === 'careers' && Array.isArray(raw.levels)) {
      mapped.levels = raw.levels.map((level) => {
        if (typeof level === 'string') return level;
        return {
          ...level,
          id: levelIdMap.get(level.id) || `pack-level:${packId}:${raw.levels.indexOf(level) + 1}`,
          careerId: mapped.id
        };
      });
    }
    return normalizeReference(raw.kind, mapped, { source: 'pack', packId });
  });
}

export async function saveReferenceEntry(entry, currentEntries) {
  const validation = validateReferenceEntries([entry], { existingEntries: currentEntries });
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const bundle = buildReferenceSaveBundle(currentEntries, entry);
  await saveReferenceBundle(bundle);
  return bundle;
}
