import {
  getAllReferenceEntries,
  getReferenceMeta,
  saveReferenceBundle,
  seedReferenceEntries
} from '../database/indexeddb.js';
import { createId } from '../models/character.js';

export const REFERENCE_KINDS = Object.freeze(['religions', 'deities', 'careers']);
export const REFERENCE_APP = 'warhammer-character-manager';
export const REFERENCE_FORMAT_VERSION = 1;
export const MAX_REFERENCE_IMPORT_SIZE = 10 * 1024 * 1024;

const KIND_SINGULAR = { religions: 'religion', deities: 'deity', careers: 'career' };
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
    skills: cleanList(raw.skills),
    skillIds: cleanIdList(raw.skillIds),
    talents: cleanList(raw.talents),
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
  return {
    ...common,
    className: cleanText(input?.className, 120),
    levels: normalizeCareerLevels(input?.levels, common.id),
    skills: cleanList(input?.skills),
    skillIds: cleanIdList(input?.skillIds),
    talents: cleanList(input?.talents),
    talentIds: cleanIdList(input?.talentIds),
    advancements: cleanList(input?.advancements),
    entryConditions: cleanList(input?.entryConditions),
    exitConditions: cleanList(input?.exitConditions),
    equipment: cleanList(input?.equipment)
  };
}

export function validateReferenceEntries(entries, { existingEntries = [] } = {}) {
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
        : ['skills', 'skillIds', 'talents', 'talentIds', 'advancements', 'entryConditions', 'exitConditions', 'equipment'];
    for (const field of listFields) {
      if (entry[field] !== undefined && (!Array.isArray(entry[field]) || entry[field].some((value) => typeof value !== 'string'))) {
        errors.push(`${location} : champ « ${field} » invalide.`);
      }
    }
    if (entry.description !== undefined && typeof entry.description !== 'string') errors.push(`${location} : description invalide.`);
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
            if (level[field] !== undefined && (!Array.isArray(level[field]) || level[field].some((value) => typeof value !== 'string'))) {
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
  entries.forEach((entry) => {
    if (entry && typeof entry === 'object' && typeof entry.id === 'string') knownTypes.set(entry.id, entry.kind);
  });
  for (const [index, entry] of entries.entries()) {
    if (!entry || typeof entry !== 'object') continue;
    const relationFields = entry.kind === 'religions'
      ? { deityIds: 'deities' }
      : entry.kind === 'deities' ? { religionIds: 'religions' } : {};
    for (const [field, expectedKind] of Object.entries(relationFields)) {
      if (entry[field] === undefined) continue;
      if (!Array.isArray(entry[field])) errors.push(`Entrée ${index + 1} : champ « ${field} » invalide.`);
      else if (entry[field].some((id) => typeof id !== 'string' || knownTypes.get(id) !== expectedKind)) {
        errors.push(`Entrée ${index + 1} : relation absente ou de type incompatible dans « ${field} ».`);
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
  const exportable = entries.filter((entry) => entry.source !== 'builtin').map((entry) => {
    const copy = { ...entry };
    delete copy.source;
    delete copy.packId;
    delete copy.createdAt;
    delete copy.updatedAt;
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
