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

function cleanDate(value, fallback) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return fallback;
  return value;
}

export function createCharacter(overrides = {}) {
  const now = new Date().toISOString();
  return normalizeCharacter({
    id: createId(),
    schemaVersion: 1,
    identity: {
      firstName: '', lastName: '', species: '', gender: '', age: null,
      height: '', weight: '', eyeColor: '', hairColor: '', origin: '',
      religion: '', religionId: '', deity: '', deityId: '', career: '', careerId: '', careerLevel: '', status: 'Actif'
    },
    characteristics: Object.fromEntries(CHARACTERISTICS.map(({ key }) => [key, null])),
    secondary: {
      movement: null, woundsCurrent: null, woundsMax: null, resistance: null,
      strengthBonus: null, enduranceBonus: null, fate: null, fortune: null,
      resilience: null, resolve: null
    },
    experience: { total: 0, spent: 0 },
    profile: { description: '', history: '', goals: '', notes: '' },
    isDraft: false,
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
    schemaVersion: 1,
    identity: {
      firstName: cleanText(identity.firstName, 100),
      lastName: cleanText(identity.lastName, 100),
      species: cleanText(identity.species, 100),
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
      careerLevel: cleanText(identity.careerLevel, 80),
      status: cleanText(identity.status, 40) || 'Actif'
    },
    characteristics: Object.fromEntries(CHARACTERISTICS.map(({ key }) => [key, cleanNumber(characteristics[key])])),
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
      spent: cleanNumber(experience.spent) ?? 0
    },
    profile: {
      description: cleanText(profile.description, 5000),
      history: cleanText(profile.history, 10000),
      goals: cleanText(profile.goals, 5000),
      notes: cleanText(profile.notes, 10000)
    },
    isDraft: Boolean(source.isDraft),
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
    ...Object.entries(input.experience)
  ];
  for (const [key, value] of numericEntries) {
    if (value !== null && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 9999)) {
      errors.push(`Valeur numérique invalide pour « ${key} ».`);
    }
  }
  if (typeof input.identity.firstName !== 'string' || typeof input.identity.lastName !== 'string') {
    errors.push('Le prénom et le nom doivent être du texte.');
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
