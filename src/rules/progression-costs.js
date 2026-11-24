const ADVANCEMENT_BANDS = Object.freeze({
  characteristic: Object.freeze([25, 30, 35, 40]),
  skill: Object.freeze([10, 15, 20, 25])
});

export const TALENT_ACQUISITION_COST = 100;
export const CAREER_LEVEL_UP_COST = 100;
export const CAREER_CHANGE_COST = 100;
export const MAX_PURCHASED_ADVANCEMENTS = 20;

/** Retourne le prix unitaire du prochain avancement ou null au-delà du 20e. */
export function getNextAdvancementCost(type, advancesAlreadyPurchased = 0) {
  const count = Number(advancesAlreadyPurchased);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('Le nombre d’avancements déjà achetés doit être un entier positif ou nul.');
  }
  if (type === 'talent') return TALENT_ACQUISITION_COST;
  const bands = ADVANCEMENT_BANDS[type];
  if (!bands) throw new Error(`Type de progression inconnu : ${type}.`);
  if (count >= MAX_PURCHASED_ADVANCEMENTS) return null;
  return bands[Math.floor(count / 5)];
}

/** Détaille le coût de chaque achat, y compris lorsqu'une opération franchit un palier. */
export function quoteAdvancementCosts(type, advancesAlreadyPurchased = 0, amount = 1) {
  const startingCount = Number(advancesAlreadyPurchased);
  if (!Number.isSafeInteger(startingCount) || startingCount < 0) {
    throw new RangeError('Le nombre d’avancements déjà achetés doit être un entier positif ou nul.');
  }
  const count = Number(amount);
  if (!Number.isSafeInteger(count) || count <= 0 || count > 999) {
    throw new RangeError('La quantité d’avancement doit être un entier positif.');
  }
  const advancements = [];
  for (let index = 0; index < count; index += 1) {
    const number = startingCount + index + 1;
    const unitCost = getNextAdvancementCost(type, startingCount + index);
    if (unitCost === null) {
      throw new RangeError(`Le nombre maximal de ${MAX_PURCHASED_ADVANCEMENTS} avancements est déjà atteint.`);
    }
    advancements.push({ number, unitCost });
  }
  return {
    count,
    amount: advancements.reduce((total, item) => total + item.unitCost, 0),
    advancements
  };
}
