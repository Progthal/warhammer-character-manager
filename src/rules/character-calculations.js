import { CHARACTERISTICS } from '../models/character.js';

const CHARACTERISTIC_KEYS = new Set(CHARACTERISTICS.map(({ key }) => key));

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Calcule les valeurs dérivées sans supposer de règle absente des données.
 * Un effet de talent n'est appliqué que s'il est structuré et explicitement
 * marqué comme vérifié dans la fiche.
 */
export function calculateCharacteristics(character) {
  const result = {};
  const talents = Array.isArray(character?.talents) ? character.talents : [];

  for (const { key, label, shortLabel } of CHARACTERISTICS) {
    const initial = finiteOrNull(character?.characteristics?.[key]);
    const advances = Math.max(0, finiteOrNull(character?.characteristicAdvances?.[key]) ?? 0);
    const talentBonus = talents.reduce((total, talent) => {
      const effects = Array.isArray(talent?.effects) ? talent.effects : [];
      return total + effects.reduce((sum, effect) => {
        if (effect?.type !== 'characteristicBonus' || effect?.characteristic !== key || effect?.verified !== true || !String(effect.reference || '').trim()) return sum;
        return sum + (finiteOrNull(effect.value) ?? 0);
      }, 0);
    }, 0);
    const current = initial === null ? null : initial + advances + talentBonus;
    result[key] = {
      key,
      label,
      shortLabel,
      initial,
      talentBonus,
      advances,
      current,
      bonus: current === null ? null : Math.floor(current / 10)
    };
  }
  return result;
}

export function calculateSkills(character, characteristicValues = calculateCharacteristics(character)) {
  return (Array.isArray(character?.skills) ? character.skills : []).map((skill) => {
    const key = CHARACTERISTIC_KEYS.has(skill?.characteristic) ? skill.characteristic : '';
    const characteristicBase = key ? characteristicValues[key]?.current ?? null : null;
    const manualBase = finiteOrNull(skill?.baseValue);
    const base = skill?.useCharacteristicBase !== false && characteristicBase !== null
      ? characteristicBase
      : manualBase;
    const advances = Math.max(0, finiteOrNull(skill?.advances) ?? 0);
    return {
      ...skill,
      base,
      advances,
      total: base === null ? null : base + advances,
      characteristicLabel: key ? CHARACTERISTICS.find((item) => item.key === key)?.shortLabel || key : '—'
    };
  });
}

export function calculateEncumbrance(character) {
  const equipment = character?.equipment || {};
  const categories = ['weapons', 'armour', 'possessions', 'spells', 'prayers'];
  const total = categories.reduce((sum, category) => {
    const items = Array.isArray(equipment[category]) ? equipment[category] : [];
    return sum + items.reduce((subtotal, item) => {
      const encumbrance = finiteOrNull(item?.encumbrance) ?? 0;
      const quantity = Math.max(1, finiteOrNull(item?.quantity) ?? 1);
      return subtotal + encumbrance * quantity;
    }, 0);
  }, 0);
  const capacity = finiteOrNull(character?.rules?.encumbranceCapacity);
  return {
    total,
    capacity,
    overloaded: capacity === null ? null : total > capacity,
    remaining: capacity === null ? null : capacity - total
  };
}

export function evaluateCorruption(character) {
  const current = finiteOrNull(character?.resources?.corruptionPoints) ?? 0;
  const threshold = finiteOrNull(character?.rules?.corruptionThreshold);
  return {
    current,
    threshold,
    exceeded: threshold === null ? null : current > threshold,
    remaining: threshold === null ? null : threshold - current
  };
}

export function calculateCharacterSheet(character) {
  const characteristics = calculateCharacteristics(character);
  return {
    characteristics,
    skills: calculateSkills(character, characteristics),
    encumbrance: calculateEncumbrance(character),
    corruption: evaluateCorruption(character),
    secondary: {
      movement: finiteOrNull(character?.secondary?.movement),
      woundsCurrent: finiteOrNull(character?.secondary?.woundsCurrent),
      woundsMax: finiteOrNull(character?.secondary?.woundsMax),
      woundsConfigured: finiteOrNull(character?.secondary?.woundsMax) !== null
    }
  };
}
