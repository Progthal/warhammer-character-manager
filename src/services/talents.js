import { createId } from '../models/character.js';
import { normalizeReference, validateReferenceEntries } from './reference-catalog.js';

export const TALENT_PACK_APP = 'warhammer-character-manager';
export const TALENT_PACK_VERSION = 1;

export function normalizeTalentText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('fr-FR');
}

function talentNames(entry) {
  return [entry?.name, entry?.name_fr, entry?.name_original, ...(entry?.aliases || [])]
    .map(normalizeTalentText)
    .filter(Boolean);
}

export function findTalentReference(entries, id = '', name = '') {
  const talents = entries.filter((entry) => entry.kind === 'talents');
  if (id) {
    const byId = talents.find((entry) => entry.id === id);
    if (byId) return byId;
  }
  const normalized = normalizeTalentText(name);
  if (!normalized) return null;
  const matches = talents.filter((entry) => talentNames(entry).includes(normalized));
  return matches.length === 1 ? matches[0] : null;
}

export function findTalentNameConflict(entries, candidate, ignoreId = '') {
  const candidateNames = new Set(talentNames(candidate));
  if (!candidateNames.size) return null;
  return entries.find((entry) => entry.kind === 'talents'
    && entry.id !== ignoreId
    && talentNames(entry).some((name) => candidateNames.has(name))) || null;
}

export function filterTalentCatalog(entries, filters = {}) {
  const query = normalizeTalentText(filters.query);
  const category = normalizeTalentText(filters.category);
  const speciesId = String(filters.speciesId || '');
  const careerId = String(filters.careerId || '');
  const careerLevelId = String(filters.careerLevelId || '');
  const careerClass = normalizeTalentText(filters.careerClass);
  const characteristic = normalizeTalentText(filters.characteristic);
  const availability = String(filters.availability || 'all');
  const source = String(filters.source || 'all');
  const verification = String(filters.verification || 'all');
  const skill = normalizeTalentText(filters.skill);
  const matchingCareers = careerClass
    ? entries.filter((career) => career.kind === 'careers' && normalizeTalentText(career.className) === careerClass)
    : [];
  const matchingCareerIds = new Set(matchingCareers.map((career) => career.id));
  const matchingLevelIds = new Set(matchingCareers.flatMap((career) => (career.levels || []).map((level) => level.id)));

  return entries.filter((entry) => {
    if (entry.kind !== 'talents') return false;
    const searchable = [
      ...talentNames(entry), entry.category, entry.description,
      ...(entry.tests || []), ...(entry.skills || []), ...(entry.prerequisites || []),
      ...(entry.references || []), entry.sourceInfo?.title, entry.sourceInfo?.publisher,
      entry.sourceInfo?.page, entry.sourceInfo?.url, entry.sourceInfo?.note
    ].map(normalizeTalentText).join(' ');
    if (query && !searchable.includes(query)) return false;
    if (category === '__none' && normalizeTalentText(entry.category)) return false;
    if (category && category !== '__none' && normalizeTalentText(entry.category) !== category) return false;
    if (speciesId === '__none' && (entry.species || []).length > 0) return false;
    if (speciesId && speciesId !== '__none' && !(entry.species || []).includes(speciesId)) return false;
    if (careerId && !(entry.careerIds || []).includes(careerId)) return false;
    if (careerLevelId && !(entry.careerLevelIds || []).includes(careerLevelId)) return false;
    if (careerClass) {
      if (!(entry.careerIds || []).some((id) => matchingCareerIds.has(id)) && !(entry.careerLevelIds || []).some((id) => matchingLevelIds.has(id))) return false;
    }
    if (characteristic && !(entry.tests || []).some((test) => normalizeTalentText(test) === characteristic)) return false;
    if (skill && !(entry.skills || []).some((name) => normalizeTalentText(name).includes(skill))) return false;
    if (availability !== 'all' && (entry.availability || 'unknown') !== availability) return false;
    if (source !== 'all' && entry.source !== source) return false;
    if (verification !== 'all' && (entry.verificationStatus || 'incomplete') !== verification) return false;
    return true;
  }).sort((a, b) => (a.name_fr || a.name).localeCompare(b.name_fr || b.name, 'fr'));
}

export function mergeCharacterTalentEntries(entries) {
  const byReference = new Map();
  const byName = new Map();
  const merged = [];
  for (const talent of Array.isArray(entries) ? entries : []) {
    const referenceId = String(talent.referenceId || '');
    const name = normalizeTalentText(talent.name);
    const nameMatch = name && byName.get(name);
    const existing = (referenceId && byReference.get(referenceId))
      || (nameMatch && (!referenceId || !nameMatch.referenceId || referenceId === nameMatch.referenceId) ? nameMatch : null);
    if (!existing) {
      merged.push(talent);
      if (referenceId) byReference.set(referenceId, talent);
      if (name) byName.set(name, talent);
      continue;
    }
    existing.rank = Math.max(Number(existing.rank) || 1, Number(talent.rank) || 1);
    existing.maxRank ??= talent.maxRank;
    existing.acquired = existing.acquired === true || talent.acquired === true;
    existing.status = existing.acquired ? 'acquired' : 'selected';
    existing.advancementCost ??= talent.advancementCost;
    existing.description ||= talent.description;
    existing.conditions ||= talent.conditions;
    existing.prerequisites = [...new Set([...(existing.prerequisites || []), ...(talent.prerequisites || [])])];
    existing.references = [...new Set([...(existing.references || []), ...(talent.references || [])])];
    existing.effects ||= [];
    const effectKeys = new Set(existing.effects.map((effect) => JSON.stringify(effect)));
    for (const effect of talent.effects || []) {
      const key = JSON.stringify(effect);
      if (!effectKeys.has(key)) {
        existing.effects.push(effect);
        effectKeys.add(key);
      }
    }
    if (referenceId) byReference.set(referenceId, existing);
    if (name) byName.set(name, existing);
  }
  return merged;
}

export function createTalentCatalogExport(entries, exportedAt = new Date().toISOString()) {
  const speciesById = new Map(entries.filter((entry) => entry.kind === 'species').map((entry) => [entry.id, entry]));
  const careersById = new Map(entries.filter((entry) => entry.kind === 'careers').map((entry) => [entry.id, entry]));
  const careerLevelsById = new Map(entries.filter((entry) => entry.kind === 'careers').flatMap((career) => (
    (career.levels || []).filter((level) => level && typeof level === 'object' && level.id)
      .map((level) => [level.id, { ...level, careerId: career.id, careerName: career.name }])
  )));
  return {
    app: TALENT_PACK_APP,
    type: 'talent-pack',
    version: TALENT_PACK_VERSION,
    exportedAt,
    pack: {
      name: 'Catalogue de talents WFRP4e',
      entries: entries.filter((entry) => entry.kind === 'talents').map((entry) => {
        const copy = { ...entry };
        copy.speciesReferences = (entry.species || []).map((id) => speciesById.get(id)).filter(Boolean).map((species) => ({ id: species.id, name: species.name }));
        copy.careerReferences = (entry.careerIds || []).map((id) => careersById.get(id)).filter(Boolean).map((career) => ({ id: career.id, name: career.name }));
        copy.careerLevelReferences = (entry.careerLevelIds || []).map((id) => careerLevelsById.get(id)).filter(Boolean).map((level) => ({
          id: level.id,
          name: level.name,
          careerId: level.careerId,
          careerName: level.careerName
        }));
        delete copy.source;
        delete copy.packId;
        delete copy.createdAt;
        delete copy.updatedAt;
        return copy;
      })
    }
  };
}

export function parseTalentPack(payload, existingEntries = []) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Le fichier doit contenir un objet JSON.');
  if (payload.app !== TALENT_PACK_APP || payload.type !== 'talent-pack') throw new Error('Ce fichier n’est pas un pack de talents Warhammer Character Manager.');
  if (payload.version !== TALENT_PACK_VERSION) throw new Error(`Version de pack de talents non prise en charge : ${payload.version ?? 'inconnue'}.`);
  if (!payload.pack || typeof payload.pack !== 'object' || !Array.isArray(payload.pack.entries) || !payload.pack.entries.length || payload.pack.entries.length > 1000) {
    throw new Error('Le pack est vide ou contient plus de 1 000 talents.');
  }
  const entries = payload.pack.entries.map((entry) => ({ ...entry, kind: 'talents' }));
  for (const [index, entry] of entries.entries()) {
    for (const [field, maximum, required] of [
      ['speciesReferences', 100, ['id', 'name']],
      ['careerReferences', 500, ['id', 'name']],
      ['careerLevelReferences', 2000, ['id', 'name', 'careerName']]
    ]) {
      const snapshots = entry[field];
      if (snapshots === undefined) continue;
      if (!Array.isArray(snapshots) || snapshots.length > maximum || snapshots.some((snapshot) => (
        !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
        || required.some((key) => typeof snapshot[key] !== 'string' || snapshot[key].length > 500)
      ))) {
        throw new Error(`Talent ${index + 1} : références associées invalides (${field}).`);
      }
    }
  }
  const validation = validateReferenceEntries(entries, { existingEntries, allowMissingTalentLinks: true });
  if (!validation.valid) throw new Error(validation.errors.slice(0, 8).join('\n'));

  const seenIds = new Set();
  const seenNames = new Set();
  for (const [index, entry] of entries.entries()) {
    if (seenIds.has(entry.id)) throw new Error(`Identifiant dupliqué dans le pack : ${entry.id}.`);
    seenIds.add(entry.id);
    const names = talentNames(entry);
    const duplicate = names.find((name) => seenNames.has(name));
    if (duplicate) throw new Error(`Nom ou alias de talent en double dans le pack : ${duplicate}.`);
    names.forEach((name) => seenNames.add(name));
    if (index > 4999) throw new Error('Le pack dépasse la limite autorisée.');
  }
  const existingTalents = existingEntries.filter((entry) => entry.kind === 'talents');
  const conflicts = entries.flatMap((entry) => {
    const sameId = existingTalents.find((existing) => existing.id === entry.id);
    const incomingNames = talentNames(entry);
    const sameName = existingTalents.find((existing) => talentNames(existing).some((name) => incomingNames.includes(name)));
    const conflict = sameId || sameName;
    return conflict ? [{ incoming: entry, existing: conflict, reason: sameId ? 'Identifiant déjà utilisé' : 'Nom déjà présent' }] : [];
  });
  return { name: String(payload.pack.name || 'Pack de talents').slice(0, 120), entries, conflicts };
}

export function prepareTalentPack(pack, existingEntries = []) {
  const existingTalents = existingEntries.filter((entry) => entry.kind === 'talents');
  const existingSpecies = existingEntries.filter((entry) => entry.kind === 'species');
  const existingCareers = existingEntries.filter((entry) => entry.kind === 'careers');
  const existingLevels = existingCareers.flatMap((career) => (career.levels || []).filter((level) => level && typeof level === 'object' && level.id).map((level) => ({ ...level, careerId: career.id, careerName: career.name })));
  const findUniqueByName = (items, name) => {
    const key = normalizeTalentText(name);
    if (!key) return null;
    const matches = items.filter((entry) => normalizeTalentText(entry.name) === key);
    return matches.length === 1 ? matches[0] : null;
  };
  const speciesSnapshots = pack.entries.flatMap((entry) => entry.speciesReferences || []);
  const careerSnapshots = pack.entries.flatMap((entry) => entry.careerReferences || []);
  const levelSnapshots = pack.entries.flatMap((entry) => entry.careerLevelReferences || []);
  const snapshotById = (items, id) => items.find((entry) => entry.id === id) || null;
  const resolveSpecies = (id) => existingSpecies.find((entry) => entry.id === id) || findUniqueByName(existingSpecies, snapshotById(speciesSnapshots, id)?.name) || null;
  const resolveCareer = (id) => existingCareers.find((entry) => entry.id === id) || findUniqueByName(existingCareers, snapshotById(careerSnapshots, id)?.name) || null;
  const resolveCareerLevel = (id) => {
    const direct = existingLevels.find((level) => level.id === id);
    if (direct) return direct;
    const snapshot = snapshotById(levelSnapshots, id);
    if (!snapshot) return null;
    const career = resolveCareer(snapshot.careerId) || findUniqueByName(existingCareers, snapshot.careerName);
    if (!career) return null;
    const levels = (career.levels || []).filter((level) => level && typeof level === 'object' && level.id);
    const level = findUniqueByName(levels, snapshot.name);
    return level ? { ...level, careerId: career.id, careerName: career.name } : null;
  };
  const usedIds = new Set(existingTalents.map((entry) => entry.id));
  const usedNames = new Set(existingTalents.flatMap(talentNames));
  const packId = createId();
  const additions = [];
  const skipped = [];
  let unresolvedAssociations = 0;
  for (const [index, raw] of pack.entries.entries()) {
    const names = talentNames(raw);
    if (usedIds.has(raw.id) || names.some((name) => usedNames.has(name))) {
      skipped.push(raw);
      continue;
    }
    const id = `pack:talent:${packId}:${index + 1}`;
    const species = (raw.species || []).flatMap((sourceId) => {
      const resolved = resolveSpecies(sourceId);
      if (!resolved) unresolvedAssociations += 1;
      return resolved ? [resolved.id] : [];
    });
    const careerIds = new Set((raw.careerIds || raw.career_ids || []).flatMap((sourceId) => {
      const resolved = resolveCareer(sourceId);
      if (!resolved) unresolvedAssociations += 1;
      return resolved ? [resolved.id] : [];
    }));
    const careerLevelIds = (raw.careerLevelIds || raw.career_level_ids || []).flatMap((sourceId) => {
      const resolved = resolveCareerLevel(sourceId);
      if (!resolved) unresolvedAssociations += 1;
      if (resolved) careerIds.add(resolved.careerId);
      return resolved ? [resolved.id] : [];
    });
    const entry = normalizeReference('talents', {
      ...raw,
      id,
      species,
      careerIds: [...careerIds],
      careerLevelIds,
      custom: true
    }, { source: 'pack', packId });
    additions.push(entry);
    usedIds.add(entry.id);
    talentNames(entry).forEach((name) => usedNames.add(name));
  }
  return { additions, skipped, unresolvedAssociations, packId };
}

