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

function cleanExperienceAmount(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const number = Number(value);
  return Number.isSafeInteger(number) ? Math.max(0, Math.min(1_000_000_000, number)) : 0;
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
      advancementCostVerified: source.advancementCostVerified === true,
      advancementCostReference: cleanText(source.advancementCostReference, 500),
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
  const cleaned = value.slice(0, 500).map((item) => {
    const source = item && typeof item === 'object' && !Array.isArray(item) ? item : {};
    const maximumRank = cleanNumber(source.maxRank ?? source.max_rank);
    const effects = Array.isArray(source.effects) ? source.effects.slice(0, 50).map((effect) => {
      const entry = effect && typeof effect === 'object' && !Array.isArray(effect) ? effect : {};
      return {
        type: cleanText(entry.type, 50) || 'none',
        target: cleanText(entry.target, 120),
        resource: cleanText(entry.resource, 80),
        operation: cleanText(entry.operation, 30),
        formula: cleanText(entry.formula, 500),
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
      maxRank: Number.isInteger(maximumRank) && maximumRank >= 1 && maximumRank <= 999 ? maximumRank : null,
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
      advancementCostVerified: source.advancementCostVerified === true,
      advancementCostReference: cleanText(source.advancementCostReference, 500),
      prerequisitesVerified: source.prerequisitesVerified === true,
      acquired: source.acquired !== false,
      status: ['suggested', 'selected', 'acquired'].includes(source.status) ? source.status : (source.acquired === false ? 'selected' : 'acquired'),
      sourceCareerId: cleanText(source.sourceCareerId, 180),
      sourceCareerLevelId: cleanText(source.sourceCareerLevelId, 180),
      sourceSpeciesId: cleanText(source.sourceSpeciesId, 180),
      notes: cleanText(source.notes, 2000)
    };
  }).filter((item) => item.name);

  // Les répétitions d'un talent représentent ses rangs, pas des effets à
  // additionner plusieurs fois. Les références stables permettent aussi de
  // reconnaître un même talent lorsque son libellé a changé.
  const byReference = new Map();
  const byName = new Map();
  const result = [];
  const normalizeName = (name) => cleanText(name, 160)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR');
  for (const talent of cleaned) {
    const nameKeys = [talent.name, talent.nameFr, talent.nameOriginal].map(normalizeName).filter(Boolean);
    const existing = (talent.referenceId && byReference.get(talent.referenceId))
      || nameKeys.map((key) => byName.get(key)).find((candidate) => candidate
        && (!talent.referenceId || !candidate.referenceId || talent.referenceId === candidate.referenceId));
    if (!existing) {
      result.push(talent);
      if (talent.referenceId) byReference.set(talent.referenceId, talent);
      nameKeys.forEach((key) => byName.set(key, talent));
      continue;
    }
    existing.rank = Math.max(existing.rank, talent.rank);
    existing.maxRank ??= talent.maxRank;
    existing.acquired = existing.acquired || talent.acquired;
    existing.status = existing.acquired ? 'acquired' : 'selected';
    existing.advancementCost ??= talent.advancementCost;
    existing.advancementCostVerified ||= talent.advancementCostVerified;
    existing.advancementCostReference ||= talent.advancementCostReference;
    existing.prerequisitesVerified ||= talent.prerequisitesVerified;
    existing.description ||= talent.description;
    existing.conditions ||= talent.conditions;
    existing.category ||= talent.category;
    existing.nameFr ||= talent.nameFr;
    existing.nameOriginal ||= talent.nameOriginal;
    existing.verificationStatus ||= talent.verificationStatus;
    existing.sourceInfo ||= talent.sourceInfo;
    existing.sourceCareerId ||= talent.sourceCareerId;
    existing.sourceCareerLevelId ||= talent.sourceCareerLevelId;
    existing.sourceSpeciesId ||= talent.sourceSpeciesId;
    existing.tests = [...new Set([...existing.tests, ...talent.tests])];
    existing.skills = [...new Set([...existing.skills, ...talent.skills])];
    existing.prerequisites = [...new Set([...existing.prerequisites, ...talent.prerequisites])];
    existing.references = [...new Set([...existing.references, ...talent.references])];
    const effectKeys = new Set(existing.effects.map((effect) => JSON.stringify(effect)));
    for (const effect of talent.effects) {
      const key = JSON.stringify(effect);
      if (!effectKeys.has(key)) {
        existing.effects.push(effect);
        effectKeys.add(key);
      }
    }
    if (talent.referenceId) byReference.set(talent.referenceId, existing);
    nameKeys.forEach((key) => byName.set(key, existing));
  }
  return result;
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
    const cleanChange = (change) => {
      const entry = change && typeof change === 'object' && !Array.isArray(change) ? change : {};
      const targetPath = cleanText(entry.targetPath, 300);
      const cleanValue = (value) => targetPath.startsWith('experience.')
        ? (Number.isSafeInteger(Number(value)) && Math.abs(Number(value)) <= 1_000_000_000 ? Number(value) : null)
        : cleanNumber(value);
      return {
        targetPath,
        targetId: cleanText(entry.targetId, 180),
        count: cleanNumber(entry.count) ?? 0,
        previousValue: cleanValue(entry.previousValue),
        newValue: cleanValue(entry.newValue)
      };
    };
    const cleanAllocation = (allocation) => {
      const entry = allocation && typeof allocation === 'object' && !Array.isArray(allocation) ? allocation : {};
      return {
        purchaseId: cleanText(entry.purchaseId, 120),
        targetPath: cleanText(entry.targetPath, 300),
        targetId: cleanText(entry.targetId, 180),
        count: cleanNumber(entry.count) ?? 0,
        amount: cleanExperienceAmount(entry.amount),
        advancements: Array.isArray(entry.advancements) ? entry.advancements.slice(0, 999).map((item) => ({
          number: cleanNumber(item?.number) ?? 0,
          unitCost: cleanExperienceAmount(item?.unitCost),
          amount: cleanExperienceAmount(item?.amount)
        })) : []
      };
    };
    return {
      id: cleanId(source.id),
      type: ['gain', 'purchase', 'refund', 'undo', 'correction', 'career-level-up', 'career-change'].includes(source.type) ? source.type : 'gain',
      amount: cleanExperienceAmount(source.amount),
      count: cleanNumber(source.count),
      unitCost: source.unitCost === null || source.unitCost === undefined ? null : cleanExperienceAmount(source.unitCost),
      note: cleanText(source.note, 500),
      date: cleanDate(source.date, new Date().toISOString()),
      targetPath: cleanText(source.targetPath, 300),
      targetId: cleanText(source.targetId, 180),
      targetIds: Array.isArray(source.targetIds) ? [...new Set(source.targetIds.slice(0, 100).map((id) => cleanText(id, 180)).filter(Boolean))] : [],
      previousValue: cleanNumber(source.previousValue),
      newValue: cleanNumber(source.newValue),
      reversedEntryId: cleanText(source.reversedEntryId, 120),
      originalOperationType: ['purchase', 'refund', 'gain', 'correction', 'career-level-up', 'career-change'].includes(source.originalOperationType) ? source.originalOperationType : '',
      xpBefore: Number.isSafeInteger(Number(source.xpBefore)) && Math.abs(Number(source.xpBefore)) <= 1_000_000_000 ? Number(source.xpBefore) : null,
      xpAfter: Number.isSafeInteger(Number(source.xpAfter)) && Math.abs(Number(source.xpAfter)) <= 1_000_000_000 ? Number(source.xpAfter) : null,
      targetChanges: Array.isArray(source.targetChanges) ? source.targetChanges.slice(0, 50).map(cleanChange) : [],
      advancementCosts: Array.isArray(source.advancementCosts) ? source.advancementCosts.slice(0, 999).map((entry) => ({
        number: cleanNumber(entry?.number) ?? 0,
        unitCost: cleanExperienceAmount(entry?.unitCost)
      })) : [],
      advancementNumber: cleanNumber(source.advancementNumber),
      refundAllocations: Array.isArray(source.refundAllocations) ? source.refundAllocations.slice(0, 100).map(cleanAllocation) : [],
      careerChange: source.careerChange && typeof source.careerChange === 'object'
        ? {
          previous: cleanCareerChangeValue(source.careerChange.previous),
          next: cleanCareerChangeValue(source.careerChange.next)
        }
        : null
    };
  });
}

function cleanCareerChangeValue(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    careerId: cleanText(source.careerId, 180),
    career: cleanText(source.career, 160),
    careerLevelId: cleanText(source.careerLevelId, 180),
    careerLevel: cleanText(source.careerLevel, 160),
    careerCompleted: source.careerCompleted === true
  };
}

export function createCharacter(overrides = {}) {
  const now = new Date().toISOString();
  return normalizeCharacter({
    id: createId(),
    schemaVersion: 6,
    identity: {
      firstName: '', lastName: '', species: '', speciesId: '', gender: '', age: null,
      height: '', weight: '', eyeColor: '', hairColor: '', origin: '',
      religion: '', religionId: '', deity: '', deityId: '', career: '', careerId: '', careerLevel: '', careerLevelId: '', careerCompleted: false, status: 'Actif'
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
    schemaVersion: 6,
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
      careerCompleted: identity.careerCompleted === true,
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
      total: cleanExperienceAmount(experience.total),
      spent: cleanExperienceAmount(experience.spent),
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
    ['corruptionPoints', input.resources?.corruptionPoints],
    ['encumbranceCapacity', input.rules?.encumbranceCapacity],
    ['corruptionThreshold', input.rules?.corruptionThreshold]
  ];
  for (const [key, value] of numericEntries) {
    if (value !== null && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 9999)) {
      errors.push(`Valeur numérique invalide pour « ${key} ».`);
    }
  }
  for (const key of ['total', 'spent']) {
    const value = input.experience[key];
    if (value !== null && value !== '' && (!Number.isSafeInteger(Number(value)) || Number(value) < 0 || Number(value) > 1_000_000_000)) {
      errors.push(`Valeur numérique invalide pour « experience.${key} ».`);
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
  return (character?.experience?.total || 0) - (character?.experience?.spent || 0);
}
