export const CHARACTERISTICS = [
  { key: 'CC', label: 'Capacité de Combat', shortLabel: 'CC' },
  { key: 'CT', label: 'Capacité de Tir', shortLabel: 'CT' },
  { key: 'F', label: 'Force', shortLabel: 'F' },
  { key: 'E', label: 'Endurance', shortLabel: 'E' },
  { key: 'I', label: 'Initiative', shortLabel: 'I' },
  { key: 'Ag', label: 'Agilité', shortLabel: 'Ag' },
  { key: 'Dex', label: 'Dextérité', shortLabel: 'Dex' },
  { key: 'Int', label: 'Intelligence', shortLabel: 'Int' },
  { key: 'FM', label: 'Force Mentale', shortLabel: 'FM' },
  { key: 'Soc', label: 'Sociabilité', shortLabel: 'Soc' }
];

export function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `wcm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function cleanText(value, maxLength = 2000) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(9999, Math.round(number))) : null;
}

function cleanDecimal(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(9999, Math.round(number * 100) / 100)) : null;
}

function cleanDate(value, fallback) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return fallback;
  return value;
}

function cleanId(value) {
  return cleanText(value, 120) || createId();
}

function cleanAdvancementList(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).map((item) => {
    const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
    return {
      id: cleanId(source.id),
      referenceId: cleanText(source.referenceId, 180),
      name: cleanText(source.name, 160),
      characteristic: CHARACTERISTICS.some(({ key }) => key === source.characteristic) ? source.characteristic : '',
      baseValue: cleanNumber(source.baseValue),
      useCharacteristicBase: source.useCharacteristicBase !== false,
      skillType: ['basic', 'advanced'].includes(source.skillType) ? source.skillType : '',
      advances: cleanNumber(source.advances) ?? 0,
      advancementCost: cleanNumber(source.advancementCost),
      career: Boolean(source.career),
      acquired: source.acquired !== false,
      status: ['suggested', 'selected', 'acquired'].includes(source.status) ? source.status : (source.acquired === false ? 'selected' : 'acquired'),
      sourceCareerId: cleanText(source.sourceCareerId, 180),
      sourceCareerLevelId: cleanText(source.sourceCareerLevelId, 180),
      sourceSpeciesId: cleanText(source.sourceSpeciesId, 180),
      notes: cleanText(source.notes, 2000)
    };
  }).filter((item) => item.name);
}

function cleanTalents(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).map((item) => {
    const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
    const effects = Array.isArray(source.effects) ? source.effects.slice(0, 50).map((effect) => {
      const entry = effect && typeof effect === 'object' && !Array.isArray(effect) ? effect : {};
      return {
        type: cleanText(entry.type, 50) || 'none',
        characteristic: CHARACTERISTICS.some(({ key }) => key === entry.characteristic) ? entry.characteristic : '',
        skillId: cleanText(entry.skillId, 180),
        skillName: cleanText(entry.skillName, 160),
        value: cleanNumber(entry.value) ?? 0,
        condition: cleanText(entry.condition, 1000),
        verified: Boolean(entry.verified),
        reference: cleanText(entry.reference, 500)
      };
    }) : [];
    return {
      id: cleanId(source.id),
      referenceId: cleanText(source.referenceId, 180),
      name: cleanText(source.name, 160),
      nameFr: cleanText(source.nameFr || source.name_fr, 160),
      nameOriginal: cleanText(source.nameOriginal || source.name_original, 160),
      category: cleanText(source.category, 120),
      tests: Array.isArray(source.tests) ? source.tests.slice(0, 30).map((item) => cleanText(item, 200)).filter(Boolean) : [],
      skills: Array.isArray(source.skills) ? source.skills.slice(0, 50).map((item) => cleanText(item, 200)).filter(Boolean) : [],
      rank: Math.max(1, cleanNumber(source.rank) ?? 1),
      maxRank: cleanNumber(source.maxRank ?? source.max_rank),
      description: cleanText(source.description, 3000),
      conditions: cleanText(source.conditions, 2000),
      prerequisites: Array.isArray(source.prerequisites)
        ? source.prerequisites.slice(0, 50).map((item) => cleanText(item, 500)).filter(Boolean)
        : [],
      verificationStatus: ['verified', 'incomplete', 'community', 'custom'].includes(source.verificationStatus)
        ? source.verificationStatus
        : '',
      sourceInfo: source.sourceInfo && typeof source.sourceInfo === 'object' && !Array.isArray(source.sourceInfo)
        ? {
          title: cleanText(source.sourceInfo.title, 240),
          publisher: cleanText(source.sourceInfo.publisher, 160),
          page: cleanText(source.sourceInfo.page, 80),
          url: cleanText(source.sourceInfo.url, 1000),
          note: cleanText(source.sourceInfo.note, 3000)
        }
        : null,
      references: Array.isArray(source.references)
        ? source.references.slice(0, 20).map((reference) => cleanText(reference, 500)).filter(Boolean)
        : [],
      effects,
      advancementCost: cleanNumber(source.advancementCost),
      acquired: source.acquired !== false,
      status: ['suggested', 'selected', 'acquired'].includes(source.status) ? source.status : (source.acquired === false ? 'selected' : 'acquired'),
      sourceCareerId: cleanText(source.sourceCareerId, 180),
      sourceCareerLevelId: cleanText(source.sourceCareerLevelId, 180),
      sourceSpeciesId: cleanText(source.sourceSpeciesId, 180),
      notes: cleanText(source.notes, 2000)
    };
  }).filter((item) => item.name);
}

function cleanEquipmentList(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 1000).map((item) => {
    const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
    return {
      id: cleanId(source.id),
      name: cleanText(source.name, 160),
      type: cleanText(source.type, 100),
      location: cleanText(source.location, 100),
      damage: cleanText(source.damage, 100),
      qualities: cleanText(source.qualities, 500),
      armourPoints: cleanNumber(source.armourPoints),
      quantity: Math.max(1, cleanNumber(source.quantity) ?? 1),
      encumbrance: cleanDecimal(source.encumbrance) ?? 0,
      description: cleanText(source.description, 2000)
    };
  }).filter((item) => item.name);
}

function cleanExperienceHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-1000).map((item) => {
    const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
    return {
      id: cleanId(source.id),
      type: ['gain', 'purchase', 'undo'].includes(source.type) ? source.type : 'gain',
      amount: cleanNumber(source.amount) ?? 0,
      note: cleanText(source.note, 500),
      date: cleanDate(source.date, new Date().toISOString()),
      targetPath: cleanText(source.targetPath, 300),
      previousValue: cleanNumber(source.previousValue),
      newValue: cleanNumber(source.newValue),
      reversedEntryId: cleanText(source.reversedEntryId, 120)
    };
  });
}

export function createCharacter(overrides = {}) {
  const now = new Date().toISOString();
  return normalizeCharacter({
    id: createId(),
    schemaVersion: 4,
    identity: {
      firstName: '', lastName: '', species: '', speciesId: '', gender: '', age: null,
      height: '', weight: '', eyeColor: '', hairColor: '', origin: '',
      religion: '', religionId: '', deity: '', deityId: '', career: '', careerId: '', careerLevel: '', careerLevelId: '', status: 'Actif'
    },
    characteristics: Object.fromEntries(CHARACTERISTICS.map(({ key }) => [key, null])),
    characteristicSpeciesModifiers: Object.fromEntries(CHARACTERISTICS.map(({ key }) => [key, 0])),
    characteristicGeneration: null,
    secondary: {
      movement: null, woundsCurrent: null, woundsMax: null, resistance: null,
      strengthBonus: null, enduranceBonus: null, fate: null, fortune: null,
      resilience: null, resolve: null
    },
    experience: { total: 0, spent: 0, history: [] },
    characteristicAdvances: Object.fromEntries(CHARACTERISTICS.map(({ key }) => [key, 0])),
    characteristicAdvancementCosts: Object.fromEntries(CHARACTERISTICS.map(({ key }) => [key, null])),
    skills: [],
    talents: [],
    equipment: { weapons: [], armour: [], possessions: [], spells: [], prayers: [] },
    resources: { corruptionPoints: 0 },
    rules: { encumbranceCapacity: null, corruptionThreshold: null },
    profile: { description: '', history: '', goals: '', notes: '' },
    isDraft: false,
    creationWizard: { step: 'identity', skippedSteps: [] },
    createdAt: now,
    updatedAt: now,
    ...overrides
  });
}

export function normalizeCharacter(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const identity = source.identity && typeof source.identity === 'object' ? source.identity : {};
  const characteristics = source.characteristics && typeof source.characteristics === 'object' ? source.characteristics : {};
  const secondary = source.secondary && typeof source.secondary === 'object' ? source.secondary : {};
  const experience = source.experience && typeof source.experience === 'object' ? source.experience : {};
  const profile = source.profile && typeof source.profile === 'object' ? source.profile : {};
  const now = new Date().toISOString();

  return {
    id: cleanText(source.id, 100) || createId(),
    schemaVersion: 4,
    identity: {
      firstName: cleanText(identity.firstName, 100),
      lastName: cleanText(identity.lastName, 100),
      species: cleanText(identity.species, 100),
      speciesId: cleanText(identity.speciesId, 180),
      gender: cleanText(identity.gender, 80),
      age: cleanNumber(identity.age),
      height: cleanText(identity.height, 40),
      weight: cleanText(identity.weight, 40),
      eyeColor: cleanText(identity.eyeColor, 80),
      hairColor: cleanText(identity.hairColor, 80),
      origin: cleanText(identity.origin, 160),
      religion: cleanText(identity.religion, 120),
      religionId: cleanText(identity.religionId, 180),
      deity: cleanText(identity.deity, 120),
      deityId: cleanText(identity.deityId, 180),
      career: cleanText(identity.career, 160),
      careerId: cleanText(identity.careerId, 180),
      careerLevel: cleanText(identity.careerLevel, 160),
      careerLevelId: cleanText(identity.careerLevelId, 180),
      status: cleanText(identity.status, 40) || 'Actif'
    },
    characteristics: Object.fromEntries(CHARACTERISTICS.map(({ key }) => [key, cleanNumber(characteristics[key])])),
    characteristicSpeciesModifiers: Object.fromEntries(CHARACTERISTICS.map(({ key }) => [
      key, source.characteristicSpeciesModifiers && Object.hasOwn(source.characteristicSpeciesModifiers, key)
        ? cleanNumber(source.characteristicSpeciesModifiers[key])
        : 0
    ])),
    characteristicGeneration: source.characteristicGeneration && typeof source.characteristicGeneration === 'object'
      ? {
        method: source.characteristicGeneration.method === '2d10' ? '2d10' : '',
        speciesProfileId: cleanText(source.characteristicGeneration.speciesProfileId, 180),
        speciesName: cleanText(source.characteristicGeneration.speciesName, 100),
        generatedAt: cleanDate(source.characteristicGeneration.generatedAt, now),
        modifiers: Object.fromEntries(CHARACTERISTICS.map(({ key }) => [
          key, cleanNumber(source.characteristicGeneration.modifiers?.[key])
        ])),
        rolls: Object.fromEntries(CHARACTERISTICS.map(({ key }) => {
          const dice = source.characteristicGeneration.rolls?.[key];
          return [key, Array.isArray(dice) && dice.length === 2 && dice.every((die) => Number.isInteger(die) && die >= 1 && die <= 10) ? [...dice] : null];
        }))
      }
      : null,
    secondary: {
      movement: cleanNumber(secondary.movement),
      woundsCurrent: cleanNumber(secondary.woundsCurrent),
      woundsMax: cleanNumber(secondary.woundsMax),
      resistance: cleanNumber(secondary.resistance),
      strengthBonus: cleanNumber(secondary.strengthBonus),
      enduranceBonus: cleanNumber(secondary.enduranceBonus),
      fate: cleanNumber(secondary.fate),
      fortune: cleanNumber(secondary.fortune),
      resilience: cleanNumber(secondary.resilience),
      resolve: cleanNumber(secondary.resolve)
    },
    experience: {
      total: cleanNumber(experience.total) ?? 0,
      spent: cleanNumber(experience.spent) ?? 0,
      history: cleanExperienceHistory(experience.history)
    },
    characteristicAdvances: Object.fromEntries(CHARACTERISTICS.map(({ key }) => [
      key, cleanNumber(source.characteristicAdvances?.[key]) ?? 0
    ])),
    characteristicAdvancementCosts: Object.fromEntries(CHARACTERISTICS.map(({ key }) => [
      key, cleanNumber(source.characteristicAdvancementCosts?.[key])
    ])),
    skills: cleanAdvancementList(source.skills),
    talents: cleanTalents(source.talents),
    equipment: {
      weapons: cleanEquipmentList(source.equipment?.weapons),
      armour: cleanEquipmentList(source.equipment?.armour),
      possessions: cleanEquipmentList(source.equipment?.possessions),
      spells: cleanEquipmentList(source.equipment?.spells),
      prayers: cleanEquipmentList(source.equipment?.prayers)
    },
    resources: {
      corruptionPoints: cleanNumber(source.resources?.corruptionPoints) ?? 0
    },
    rules: {
      encumbranceCapacity: cleanDecimal(source.rules?.encumbranceCapacity),
      corruptionThreshold: cleanNumber(source.rules?.corruptionThreshold)
    },
    profile: {
      description: cleanText(profile.description, 5000),
      history: cleanText(profile.history, 10000),
      goals: cleanText(profile.goals, 5000),
      notes: cleanText(profile.notes, 10000)
    },
    isDraft: Boolean(source.isDraft),
    creationWizard: source.creationWizard && typeof source.creationWizard === 'object'
      ? {
        step: cleanText(source.creationWizard.step, 40) || 'identity',
        // Les anciens completedSteps représentaient en réalité les étapes
        // parcourues, pas celles explicitement ignorées. Ne pas les convertir
        // en validations : cela marquerait à tort les étapes facultatives.
        skippedSteps: Array.isArray(source.creationWizard.skippedSteps)
          ? [...new Set(source.creationWizard.skippedSteps.filter((step) => ['religion', 'skills', 'talents', 'resources'].includes(step)).slice(0, 10))]
          : []
      }
      : { step: 'identity', skippedSteps: [] },
    createdAt: cleanDate(source.createdAt, now),
    updatedAt: cleanDate(source.updatedAt, now)
  };
}

export function validateCharacter(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['La fiche doit être un objet JSON.'] };
  }
  if (typeof input.id !== 'string' || input.id.length < 1 || input.id.length > 100) {
    errors.push('Identifiant de personnage absent ou invalide.');
  }
  for (const key of ['identity', 'characteristics', 'secondary', 'experience', 'profile']) {
    if (!input[key] || typeof input[key] !== 'object' || Array.isArray(input[key])) {
      errors.push(`Section « ${key} » absente ou invalide.`);
    }
  }
  if (errors.length) return { valid: false, errors };

  const numericEntries = [
    ...Object.entries(input.characteristics),
    ...Object.entries(input.secondary),
    ['total', input.experience.total],
    ['spent', input.experience.spent],
    ['corruptionPoints', input.resources?.corruptionPoints],
    ['encumbranceCapacity', input.rules?.encumbranceCapacity],
    ['corruptionThreshold', input.rules?.corruptionThreshold]
  ];
  for (const [key, value] of numericEntries) {
    if (value !== null && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 9999)) {
      errors.push(`Valeur numérique invalide pour « ${key} ».`);
    }
  }
  if (typeof input.identity.firstName !== 'string' || typeof input.identity.lastName !== 'string') {
    errors.push('Le prénom et le nom doivent être du texte.');
  }
  for (const collection of ['skills', 'talents']) {
    if (input[collection] !== undefined && !Array.isArray(input[collection])) {
      errors.push(`La section « ${collection} » doit être une liste.`);
      continue;
    }
    for (const [index, entry] of (input[collection] || []).entries()) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.name !== 'string') {
        errors.push(`Entrée ${index + 1} invalide dans « ${collection} ».`);
        continue;
      }
      const numericFields = collection === 'skills'
        ? ['baseValue', 'advances', 'advancementCost']
        : ['rank', 'advancementCost'];
      for (const key of numericFields) {
        const value = entry[key];
        const minimum = collection === 'talents' && key === 'rank' ? 1 : 0;
        if (value !== null && value !== undefined && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < minimum || Number(value) > 9999)) {
          errors.push(`Valeur numérique invalide pour « ${collection}.${key} ». `);
        }
      }
    }
  }
  if (input.equipment !== undefined && (!input.equipment || typeof input.equipment !== 'object' || Array.isArray(input.equipment))) {
    errors.push('La section « equipment » doit être un objet.');
  } else {
    for (const category of ['weapons', 'armour', 'possessions', 'spells', 'prayers']) {
      const entries = input.equipment?.[category];
      if (entries !== undefined && !Array.isArray(entries)) {
        errors.push(`La catégorie d’équipement « ${category} » doit être une liste.`);
        continue;
      }
      for (const [index, entry] of (entries || []).entries()) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.name !== 'string') {
          errors.push(`Objet ${index + 1} invalide dans « equipment.${category} ».`);
          continue;
        }
        for (const key of ['quantity', 'encumbrance', 'armourPoints']) {
          const value = entry[key];
          if (value !== null && value !== undefined && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 9999)) {
            errors.push(`Valeur numérique invalide pour « equipment.${category}.${key} ».`);
          }
        }
      }
    }
  }
  if (input.experience.history !== undefined && !Array.isArray(input.experience.history)) {
    errors.push('L’historique d’expérience doit être une liste.');
  }
  return { valid: errors.length === 0, errors };
}

export function getCharacterName(character) {
  const first = character?.identity?.firstName || '';
  const last = character?.identity?.lastName || '';
  return `${first} ${last}`.trim() || 'Personnage sans nom';
}

export function getExperienceAvailable(character) {
  return Math.max(0, (character?.experience?.total || 0) - (character?.experience?.spent || 0));
}
