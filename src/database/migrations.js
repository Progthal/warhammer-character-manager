export const DATABASE_NAME = 'warhammer-character-manager';
export const DATABASE_VERSION = 4;

export function migrateCareerReferenceRecord(record) {
  if (!record || record.kind !== 'careers' || !Array.isArray(record.levels)) return record;
  const usedIds = new Set();
  const levels = record.levels.map((value, index) => {
    const legacy = typeof value === 'string';
    const level = legacy ? { name: value } : value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    let id = typeof level.id === 'string' && level.id.trim()
      ? level.id
      : `${record.id}:level:${index + 1}`;
    if (usedIds.has(id)) id = `${record.id}:level:${index + 1}`;
    usedIds.add(id);
    const rank = Number.isInteger(Number(level.rank)) && Number(level.rank) > 0
      ? Math.min(Number(level.rank), 99)
      : index + 1;
    return {
      ...level,
      id,
      careerId: record.id,
      name: typeof level.name === 'string' ? level.name : '',
      rank,
      description: typeof level.description === 'string' ? level.description : '',
      skills: Array.isArray(level.skills) ? level.skills : [],
      skillIds: Array.isArray(level.skillIds) ? level.skillIds : [],
      talents: Array.isArray(level.talents) ? level.talents : [],
      talentIds: Array.isArray(level.talentIds) ? level.talentIds : [],
      advancements: Array.isArray(level.advancements) ? level.advancements : [],
      entryConditions: Array.isArray(level.entryConditions) ? level.entryConditions : [],
      exitConditions: Array.isArray(level.exitConditions) ? level.exitConditions : [],
      equipment: Array.isArray(level.equipment) ? level.equipment : [],
      additionalInformation: typeof level.additionalInformation === 'string' ? level.additionalInformation : '',
      references: Array.isArray(level.references) ? level.references : []
    };
  });
  return { ...record, levels };
}

export function migrateCharacterRecord(record) {
  if (!record || typeof record !== 'object') return record;
  const identity = record.identity && typeof record.identity === 'object' ? record.identity : {};
  const experience = record.experience && typeof record.experience === 'object' ? record.experience : {};
  const characteristics = record.characteristics && typeof record.characteristics === 'object' ? record.characteristics : {};
  const characteristicAdvances = record.characteristicAdvances && typeof record.characteristicAdvances === 'object'
    ? record.characteristicAdvances
    : {};
  return {
    ...record,
    schemaVersion: 3,
    identity: {
      ...identity,
      careerLevelId: typeof identity.careerLevelId === 'string' ? identity.careerLevelId : ''
    },
    characteristics: Object.fromEntries(['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((key) => [
      key, characteristics[key] ?? null
    ])),
    characteristicAdvances: Object.fromEntries(['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((key) => [
      key, characteristicAdvances[key] ?? 0
    ])),
    characteristicAdvancementCosts: Object.fromEntries(['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((key) => [
      key, record.characteristicAdvancementCosts?.[key] ?? null
    ])),
    experience: { ...experience, history: Array.isArray(experience.history) ? experience.history : [] },
    skills: Array.isArray(record.skills) ? record.skills : [],
    talents: Array.isArray(record.talents) ? record.talents : [],
    equipment: {
      weapons: Array.isArray(record.equipment?.weapons) ? record.equipment.weapons : [],
      armour: Array.isArray(record.equipment?.armour) ? record.equipment.armour : [],
      possessions: Array.isArray(record.equipment?.possessions) ? record.equipment.possessions : [],
      spells: Array.isArray(record.equipment?.spells) ? record.equipment.spells : [],
      prayers: Array.isArray(record.equipment?.prayers) ? record.equipment.prayers : []
    },
    resources: {
      ...(record.resources && typeof record.resources === 'object' && !Array.isArray(record.resources) ? record.resources : {}),
      corruptionPoints: record.resources?.corruptionPoints ?? 0
    },
    rules: {
      ...(record.rules && typeof record.rules === 'object' && !Array.isArray(record.rules) ? record.rules : {}),
      encumbranceCapacity: record.rules?.encumbranceCapacity ?? null,
      corruptionThreshold: record.rules?.corruptionThreshold ?? null
    }
  };
}

function migrateStoreRecords(store, migrate) {
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const migrated = migrate(cursor.value);
    if (migrated !== cursor.value) cursor.update(migrated);
    cursor.continue();
  };
}

export function upgradeDatabase(database, transaction, oldVersion) {
  if (oldVersion < 1 && !database.objectStoreNames.contains('characters')) {
    const characters = database.createObjectStore('characters', { keyPath: 'id' });
    characters.createIndex('updatedAt', 'updatedAt', { unique: false });
    characters.createIndex('species', 'identity.species', { unique: false });
    characters.createIndex('career', 'identity.career', { unique: false });
  }

  if (oldVersion < 2) {
    if (!database.objectStoreNames.contains('referenceEntries')) {
      const references = database.createObjectStore('referenceEntries', { keyPath: 'id' });
      references.createIndex('kind', 'kind', { unique: false });
      references.createIndex('source', 'source', { unique: false });
      references.createIndex('packId', 'packId', { unique: false });
      references.createIndex('updatedAt', 'updatedAt', { unique: false });
    }
    if (!database.objectStoreNames.contains('referenceMeta')) {
      database.createObjectStore('referenceMeta', { keyPath: 'key' });
    }
  }

  if (oldVersion < 3) {
    if (database.objectStoreNames.contains('referenceEntries')) {
      migrateStoreRecords(transaction.objectStore('referenceEntries'), migrateCareerReferenceRecord);
    }
    if (database.objectStoreNames.contains('characters')) {
      migrateStoreRecords(transaction.objectStore('characters'), migrateCharacterRecord);
    }
  }

  if (oldVersion >= 3 && oldVersion < 4 && database.objectStoreNames.contains('characters')) {
    migrateStoreRecords(transaction.objectStore('characters'), migrateCharacterRecord);
  }
}
