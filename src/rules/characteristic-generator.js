import { CHARACTERISTICS } from '../models/character.js';

function normalizeSpeciesName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('fr-FR');
}

export function findSpeciesProfile(species, speciesProfiles = []) {
  const requested = normalizeSpeciesName(species);
  if (!requested) return null;
  const candidates = speciesProfiles.filter((profile) => profile?.kind === 'species');
  const exactMatches = candidates.filter((profile) => normalizeSpeciesName(profile.name) === requested);
  if (exactMatches.length) {
    return exactMatches.find((profile) => profile.source && profile.source !== 'builtin') || exactMatches[0];
  }
  const aliasMatches = candidates.filter((profile) => (
    (profile.aliases || []).some((alias) => normalizeSpeciesName(alias) === requested)
  ));
  return aliasMatches.find((profile) => profile.source && profile.source !== 'builtin') || aliasMatches[0] || null;
}

function rollD10(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('La fonction aléatoire doit retourner un nombre compris entre 0 inclus et 1 exclu.');
  }
  return Math.floor(value * 10) + 1;
}

/**
 * Génère les dix caractéristiques WFRP4e à partir de 2d10 et du modificateur
 * propre à l'espèce. La fonction ne dépend pas du DOM et accepte un hasard
 * injectable pour les tests reproductibles.
 */
export function generateCharacteristics(species, speciesProfiles, { random = Math.random } = {}) {
  if (typeof species !== 'string' || !species.trim()) {
    throw new Error('Choisissez une espèce avant de générer les caractéristiques.');
  }
  if (!Array.isArray(speciesProfiles)) {
    throw new TypeError('Les profils d’espèce doivent être fournis sous forme de tableau.');
  }
  if (typeof random !== 'function') throw new TypeError('La source aléatoire doit être une fonction.');

  const profile = findSpeciesProfile(species, speciesProfiles);
  if (!profile) {
    throw new Error(`Aucun profil de génération n’est configuré pour l’espèce « ${species} ». Vérifiez le référentiel des espèces.`);
  }

  const modifiers = profile.characteristicModifiers || {};
  const missing = CHARACTERISTICS.filter(({ key }) => (
    !Number.isInteger(modifiers[key]) || modifiers[key] < 0 || modifiers[key] > 99
  ));
  if (missing.length) {
    throw new Error(`Le profil « ${profile.name} » est incomplet. Modificateurs à configurer : ${missing.map(({ shortLabel }) => shortLabel).join(', ')}.`);
  }

  const characteristics = {};
  const details = {};
  for (const { key, shortLabel } of CHARACTERISTICS) {
    const dice = [rollD10(random), rollD10(random)];
    const diceTotal = dice[0] + dice[1];
    const modifier = modifiers[key];
    const total = diceTotal + modifier;
    characteristics[key] = total;
    details[key] = {
      label: shortLabel,
      dice,
      diceTotal,
      modifier,
      total,
      minimum: 2 + modifier,
      maximum: 20 + modifier
    };
  }

  return {
    requestedSpecies: species,
    species: profile.name,
    profileId: profile.id,
    characteristics,
    details
  };
}
