import { CHARACTERISTICS, createId, getExperienceAvailable, normalizeCharacter } from '../models/character.js';

const characteristicKeys = new Set(CHARACTERISTICS.map(({ key }) => key));

function numeric(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 9999) {
    throw new RangeError(`${label} doit être un entier positif.`);
  }
  return parsed;
}

function locateProgressionTarget(character, target) {
  if (target?.type === 'characteristic' && characteristicKeys.has(target.key)) {
    return {
      path: `characteristicAdvances.${target.key}`,
      get: () => character.characteristicAdvances[target.key] || 0,
      set: (value) => { character.characteristicAdvances[target.key] = value; }
    };
  }
  if (target?.type === 'skill') {
    const entry = character.skills.find((item) => item.id === target.id);
    if (entry) return {
      path: `skills.${entry.id}.advances`,
      get: () => entry.advances || 0,
      set: (value) => { entry.advances = value; }
    };
  }
  if (target?.type === 'talent') {
    const entry = character.talents.find((item) => item.id === target.id);
    if (entry) return {
      path: `talents.${entry.id}.rank`,
      get: () => entry.rank || 1,
      set: (value) => { entry.rank = value; }
    };
  }
  throw new Error('La cible de progression est introuvable ou non prise en charge.');
}

export function grantExperience(input, { amount, note = '', now = new Date().toISOString() } = {}) {
  const character = normalizeCharacter(input);
  const gain = numeric(amount, 'Le gain d’expérience');
  character.experience.total += gain;
  character.experience.history.push({
    id: createId(), type: 'gain', amount: gain,
    note: String(note).trim().slice(0, 500), date: now,
    targetPath: '', previousValue: null, newValue: null, reversedEntryId: ''
  });
  character.updatedAt = now;
  return character;
}

/**
 * Enregistre un achat. Le coût doit être fourni par un référentiel vérifié ou
 * saisi explicitement par l'utilisateur : aucun barème WFRP n'est inventé.
 */
export function purchaseAdvancement(input, { target, amount = 1, cost, note = '', now = new Date().toISOString() } = {}) {
  const character = normalizeCharacter(input);
  const increments = numeric(amount, 'La quantité d’avancement');
  const price = numeric(cost, 'Le coût en expérience');
  if (getExperienceAvailable(character) < price) {
    throw new Error(`Expérience insuffisante : ${getExperienceAvailable(character)} XP disponible(s), ${price} XP nécessaire(s).`);
  }
  const progression = locateProgressionTarget(character, target);
  const previousValue = progression.get();
  const newValue = previousValue + increments;
  progression.set(newValue);
  character.experience.spent += price;
  character.experience.history.push({
    id: createId(), type: 'purchase', amount: price,
    note: String(note || progression.path).trim().slice(0, 500), date: now,
    targetPath: progression.path, previousValue, newValue, reversedEntryId: ''
  });
  character.updatedAt = now;
  return character;
}

export function undoLastPurchase(input, { now = new Date().toISOString() } = {}) {
  const character = normalizeCharacter(input);
  const reversedIds = new Set(character.experience.history
    .filter((entry) => entry.type === 'undo' && entry.reversedEntryId)
    .map((entry) => entry.reversedEntryId));
  const purchase = [...character.experience.history].reverse().find((entry) => (
    entry.type === 'purchase' && !reversedIds.has(entry.id)
  ));
  if (!purchase) throw new Error('Aucun achat non annulé n’est disponible dans l’historique.');

  const segments = purchase.targetPath.split('.');
  let current;
  if (segments.length === 2 && segments[0] === 'characteristicAdvances' && characteristicKeys.has(segments[1])) {
    current = character.characteristicAdvances[segments[1]];
    character.characteristicAdvances[segments[1]] = purchase.previousValue;
  } else if (segments.length === 3 && ['skills', 'talents'].includes(segments[0])) {
    const collection = character[segments[0]];
    const entry = collection.find((item) => item.id === segments[1]);
    if (!entry || !['advances', 'rank'].includes(segments[2])) {
      throw new Error('La cible de cet achat n’existe plus ; son annulation est impossible.');
    }
    current = entry[segments[2]];
    entry[segments[2]] = purchase.previousValue;
  } else {
    throw new Error('La cible de cet achat est invalide ; son annulation est impossible.');
  }
  if (current !== purchase.newValue) {
    throw new Error('La progression a changé depuis cet achat. Annulation refusée pour éviter de perdre des modifications.');
  }

  character.experience.spent = Math.max(0, character.experience.spent - purchase.amount);
  character.experience.history.push({
    id: createId(), type: 'undo', amount: purchase.amount,
    note: `Annulation : ${purchase.note}`, date: now,
    targetPath: purchase.targetPath, previousValue: purchase.newValue,
    newValue: purchase.previousValue, reversedEntryId: purchase.id
  });
  character.updatedAt = now;
  return character;
}
