import { CHARACTERISTICS } from '../models/character.js';

const CHARACTERISTIC_KEYS = new Set(CHARACTERISTICS.map(({ key }) => key));

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Calcule les bonus de talents en appliquant les mêmes conditions partout. */
export function calculateTalentCharacteristicBonuses(talents = []) {
  const bonuses = Object.fromEntries(CHARACTERISTICS.map(({ key }) => [key, 0]));
  for (const talent of Array.isArray(talents) ? talents : []) {
    if (talent?.acquired === false || talent?.status === 'selected' || talent?.status === 'suggested') continue;
    for (const effect of Array.isArray(talent?.effects) ? talent.effects : []) {
      if (effect?.type !== 'characteristicBonus'
        || !CHARACTERISTIC_KEYS.has(effect.characteristic)
        || effect.verified !== true
        || !String(effect.reference || '').trim()) continue;
      const value = finiteOrNull(effect.value);
      if (value !== null) bonuses[effect.characteristic] += value;
    }
  }
  return bonuses;
}

/**
 * Calcule les valeurs dérivées sans supposer de règle absente des données.
 * Un effet de talent n'est appliqué que s'il est structuré et explicitement
 * marqué comme vérifié dans la fiche.
 */
export function calculateCharacteristics(character) {
  const result = {};
  const talentBonuses = calculateTalentCharacteristicBonuses(character?.talents);

  for (const { key, label, shortLabel } of CHARACTERISTICS) {
    const initial = finiteOrNull(character?.characteristics?.[key]);
    const speciesBonus = finiteOrNull(character?.characteristicSpeciesModifiers?.[key]);
    const advances = Math.max(0, finiteOrNull(character?.characteristicAdvances?.[key]) ?? 0);
    const talentBonus = talentBonuses[key];
    const current = initial === null || speciesBonus === null ? null : initial + speciesBonus + advances + talentBonus;
    result[key] = {
      key,
      label,
      shortLabel,
      initial,
      speciesBonus,
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

export function calculateSecondaryCharacteristics(character, characteristicValues = calculateCharacteristics(character)) {
  const manual = character?.secondary || {};
  const strengthBonus = characteristicValues.F?.bonus;
  const enduranceBonus = characteristicValues.E?.bonus;
  return {
    movement: finiteOrNull(manual.movement),
    woundsCurrent: finiteOrNull(manual.woundsCurrent),
    woundsMax: finiteOrNull(manual.woundsMax),
    resistance: finiteOrNull(manual.resistance),
    strengthBonus: strengthBonus ?? finiteOrNull(manual.strengthBonus),
    enduranceBonus: enduranceBonus ?? finiteOrNull(manual.enduranceBonus),
    fate: finiteOrNull(manual.fate),
    fortune: finiteOrNull(manual.fortune),
    resilience: finiteOrNull(manual.resilience),
    resolve: finiteOrNull(manual.resolve),
    derived: {
      strengthBonus: strengthBonus !== null,
      enduranceBonus: enduranceBonus !== null
    },
    woundsConfigured: finiteOrNull(manual.woundsMax) !== null
  };
}

export function calculateCharacterSheet(character) {
  const characteristics = calculateCharacteristics(character);
  return {
    characteristics,
    skills: calculateSkills(character, characteristics),
    encumbrance: calculateEncumbrance(character),
    corruption: evaluateCorruption(character),
    secondary: calculateSecondaryCharacteristics(character, characteristics)
  };
}
