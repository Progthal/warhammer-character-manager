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

  return entries.filter((entry) => {
    if (entry.kind !== 'talents') return false;
    const searchable = [
      ...talentNames(entry), entry.category, entry.description,
      ...(entry.tests || []), ...(entry.skills || []), ...(entry.prerequisites || []),
      entry.sourceInfo?.title, entry.sourceInfo?.publisher
    ].map(normalizeTalentText).join(' ');
    if (query && !searchable.includes(query)) return false;
    if (category === '__none' && normalizeTalentText(entry.category)) return false;
    if (category && category !== '__none' && normalizeTalentText(entry.category) !== category) return false;
    if (speciesId && entry.species?.length && !entry.species.includes(speciesId)) return false;
    if (careerId && !(entry.careerIds || []).includes(careerId)) return false;
    if (careerLevelId && !(entry.careerLevelIds || []).includes(careerLevelId)) return false;
    if (careerClass) {
      const matchingCareers = entries.filter((career) => career.kind === 'careers' && normalizeTalentText(career.className) === careerClass);
      const matchingCareerIds = new Set(matchingCareers.map((career) => career.id));
      const matchingLevelIds = new Set(matchingCareers.flatMap((career) => (career.levels || []).map((level) => level.id)));
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

export function createTalentCatalogExport(entries, exportedAt = new Date().toISOString()) {
  return {
    app: TALENT_PACK_APP,
    type: 'talent-pack',
    version: TALENT_PACK_VERSION,
    exportedAt,
    pack: {
      name: 'Catalogue de talents WFRP4e',
      entries: entries.filter((entry) => entry.kind === 'talents').map((entry) => {
        const copy = { ...entry };
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
  const validation = validateReferenceEntries(entries);
  if (!validation.valid) throw new Error(validation.errors.slice(0, 8).join('\n'));

  const seenIds = new Set();
  const seenNames = new Set();
  for (const [index, entry] of entries.entries()) {
    if (seenIds.has(entry.id)) throw new Error(`Identifiant dupliqué dans le pack : ${entry.id}.`);
    seenIds.add(entry.id);
    const key = normalizeTalentText(entry.name_fr || entry.name_original || entry.name);
    if (key && seenNames.has(key)) throw new Error(`Talent en double dans le pack : ${entry.name}.`);
    if (key) seenNames.add(key);
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
  const usedIds = new Set(existingTalents.map((entry) => entry.id));
  const usedNames = new Set(existingTalents.flatMap(talentNames));
  const packId = createId();
  const additions = [];
  const skipped = [];
  for (const [index, raw] of pack.entries.entries()) {
    const names = talentNames(raw);
    if (usedIds.has(raw.id) || names.some((name) => usedNames.has(name))) {
      skipped.push(raw);
      continue;
    }
    const id = `pack:talent:${packId}:${index + 1}`;
    const entry = normalizeReference('talents', { ...raw, id, custom: true }, { source: 'pack', packId });
    additions.push(entry);
    usedIds.add(entry.id);
    talentNames(entry).forEach((name) => usedNames.add(name));
  }
  return { additions, skipped, packId };
}

