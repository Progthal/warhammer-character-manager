import { CHARACTERISTICS, createId, getExperienceAvailable, normalizeCharacter } from '../models/character.js';
import { CAREER_CHANGE_COST, CAREER_LEVEL_UP_COST, quoteAdvancementCosts } from '../rules/progression-costs.js';
import { findCareerLevel, getCareerLevels } from './reference-catalog.js';

const characteristicKeys = new Set(CHARACTERISTICS.map(({ key }) => key));

function positiveInteger(value, label, maximum = 9999) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new RangeError(`${label} doit être un entier positif.`);
  }
  return parsed;
}

function conditionTexts(...values) {
  return values.flatMap((value) => Array.isArray(value) ? value : value ? [value] : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function resolveCurrentCareerLevel(character, career, levels) {
  const identity = character.identity;
  const matchesCareer = career && (identity.careerId
    ? career.id === identity.careerId
    : String(career.name || '').trim().toLocaleLowerCase('fr-FR')
      === String(identity.career || '').trim().toLocaleLowerCase('fr-FR'));
  if (!matchesCareer) return null;
  return findCareerLevel(career, identity.careerLevelId, identity.careerLevel)
    || (!identity.careerLevelId && !identity.careerLevel ? levels[0] || null : null);
}

/** Évalue la progression vers le niveau suivant à partir du référentiel associé. */
export function getCareerLevelProgress(input, { career } = {}) {
  const character = normalizeCharacter(input);
  const levels = getCareerLevels(career);
  const currentLevel = resolveCurrentCareerLevel(character, career, levels);
  const currentIndex = currentLevel ? levels.findIndex((level) => level.id === currentLevel.id) : -1;
  const nextLevel = currentIndex >= 0 ? levels[currentIndex + 1] || null : null;
  const blockers = nextLevel
    ? conditionTexts(nextLevel.entryConditions).map((condition) => `Condition d’accès non vérifiable automatiquement : ${condition}`)
    : [];
  const isComplete = levels.length > 0 && currentIndex === levels.length - 1;
  return {
    levels,
    currentLevel,
    nextLevel,
    isComplete,
    canAdvance: Boolean(nextLevel) && blockers.length === 0,
    blockers
  };
}

/** Vérifie automatiquement les prérequis structurés avant un changement de carrière.
 * Les conditions enregistrées en texte libre bloquent l'opération plutôt que d'être
 * considérées à tort comme satisfaites.
 */
export function getCareerChangeEligibility(input, { currentCareer, targetCareer = null } = {}) {
  const character = normalizeCharacter(input);
  const progress = getCareerLevelProgress(character, { career: currentCareer });
  const blockers = [...progress.blockers];

  if (!currentCareer || !progress.currentLevel) {
    blockers.push('La carrière ou le niveau actuel ne peut pas être associé au référentiel.');
  } else if (!progress.isComplete) {
    blockers.push('Le dernier niveau de la carrière actuelle doit être atteint avant de pouvoir en changer.');
  }

  const exitConditions = conditionTexts(currentCareer?.exitConditions, progress.currentLevel?.exitConditions);
  if (exitConditions.length) {
    blockers.push(`Conditions de sortie en texte libre, non vérifiables automatiquement : ${exitConditions.join(' ; ')}`);
  }

  let startingLevel = null;
  if (targetCareer) {
    if (!targetCareer.id || !targetCareer.name) {
      blockers.push('Sélectionnez une nouvelle carrière valide.');
    } else if (targetCareer.id === character.identity.careerId
      || (!character.identity.careerId && targetCareer.name === character.identity.career)) {
      blockers.push('La nouvelle carrière doit être différente de la carrière actuelle.');
    }

    const targetLevels = getCareerLevels(targetCareer);
    startingLevel = targetLevels[0] || null;
    if (!startingLevel) {
      blockers.push('La nouvelle carrière ne possède aucun niveau de départ dans le référentiel.');
    } else {
      const entryConditions = conditionTexts(targetCareer.entryConditions, startingLevel.entryConditions);
      if (entryConditions.length) {
        blockers.push(`Conditions d’accès en texte libre, non vérifiables automatiquement : ${entryConditions.join(' ; ')}`);
      }
    }
  }

  return {
    eligible: Boolean(targetCareer) && blockers.length === 0,
    blockers,
    currentLevel: progress.currentLevel,
    startingLevel,
    isCurrentCareerComplete: progress.isComplete
  };
}

function locateProgressionTarget(character, target) {
  if (target?.type === 'characteristic' && characteristicKeys.has(target.key)) {
    return {
      path: `characteristicAdvances.${target.key}`,
      type: 'characteristic',
      get: () => character.characteristicAdvances[target.key] || 0,
      set: (value) => { character.characteristicAdvances[target.key] = value; }
    };
  }
  if (target?.type === 'skill') {
    const entry = character.skills.find((item) => item.id === target.id);
    if (entry) return {
      path: `skills.${entry.id}.advances`,
      type: 'skill',
      entry,
      get: () => entry.advances || 0,
      set: (value) => { entry.advances = value; }
    };
  }
  if (target?.type === 'talent') {
    const entry = character.talents.find((item) => item.id === target.id);
    if (entry) return {
      path: `talents.${entry.id}.rank`,
      type: 'talent',
      entry,
      get: () => entry.acquired === false || entry.status === 'selected' || entry.status === 'suggested' ? 0 : (entry.rank || 1),
      set: (value) => {
        if (value <= 0) {
          entry.acquired = false;
          entry.status = 'selected';
          // Un talent sélectionné conserve son rang descriptif, mais n'est
          // plus compté comme acquis et ses effets ne sont plus appliqués.
          entry.rank = Math.max(1, entry.rank || 1);
        } else {
          entry.rank = value;
          entry.acquired = true;
          entry.status = 'acquired';
        }
      }
    };
  }
  throw new Error('La cible de progression est introuvable ou non prise en charge.');
}

function targetFromPath(character, path) {
  const skillPrefix = 'skills.';
  const skillSuffix = '.advances';
  if (String(path).startsWith(skillPrefix) && String(path).endsWith(skillSuffix)) {
    const id = String(path).slice(skillPrefix.length, -skillSuffix.length);
    return locateProgressionTarget(character, { type: 'skill', id });
  }
  const talentPrefix = 'talents.';
  const talentSuffix = '.rank';
  if (String(path).startsWith(talentPrefix) && String(path).endsWith(talentSuffix)) {
    const id = String(path).slice(talentPrefix.length, -talentSuffix.length);
    return locateProgressionTarget(character, { type: 'talent', id });
  }
  const segments = String(path || '').split('.');
  if (segments.length === 2 && segments[0] === 'characteristicAdvances') {
    return locateProgressionTarget(character, { type: 'characteristic', key: segments[1] });
  }
  if (segments.length === 2 && segments[0] === 'experience' && ['total', 'spent'].includes(segments[1])) {
    return {
      path,
      type: 'experience',
      get: () => character.experience[segments[1]],
      set: (value) => { character.experience[segments[1]] = value; }
    };
  }
  throw new Error('La cible de cette opération est invalide.');
}

function targetIdFromPath(path) {
  const segments = String(path || '').split('.');
  if (segments[0] === 'characteristicAdvances') return segments[1] || '';
  return segments.length >= 2 ? segments[1] : '';
}

function historyCount(entry) {
  const explicit = Number(entry?.count);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  const difference = Math.abs(Number(entry?.newValue) - Number(entry?.previousValue));
  return Number.isInteger(difference) && difference > 0 ? difference : 1;
}

function historyUnitCost(entry) {
  const configured = Number(entry?.unitCost);
  if (Number.isInteger(configured) && configured > 0) return configured;
  const count = historyCount(entry);
  const total = Number(entry?.amount);
  return Number.isInteger(total) && total > 0 && total % count === 0 ? total / count : null;
}

function purchaseAdvancementUnits(entry) {
  if (Array.isArray(entry?.advancementCosts) && entry.advancementCosts.length) {
    return entry.advancementCosts
      .map((item) => ({ number: Number(item.number), unitCost: Number(item.unitCost) }))
      .filter((item) => Number.isSafeInteger(item.number) && item.number > 0
        && Number.isSafeInteger(item.unitCost) && item.unitCost > 0);
  }
  const count = historyCount(entry);
  const unitCost = historyUnitCost(entry);
  if (!unitCost) return [];
  const firstNumber = Number.isSafeInteger(Number(entry?.previousValue))
    ? Number(entry.previousValue) + 1
    : 1;
  return Array.from({ length: count }, (_, index) => ({ number: firstNumber + index, unitCost }));
}

function reversedOperationIds(history) {
  return new Set(history.filter((entry) => entry.type === 'undo' && entry.reversedEntryId).map((entry) => entry.reversedEntryId));
}

function refundedCountsByPurchase(history) {
  const undone = reversedOperationIds(history);
  const refundedNumbers = new Map();
  const legacyRefundedCounts = new Map();
  for (const refund of history) {
    if (refund.type !== 'refund' || undone.has(refund.id)) continue;
    for (const allocation of refund.refundAllocations || []) {
      if (!allocation.purchaseId) continue;
      if (Array.isArray(allocation.advancements) && allocation.advancements.length) {
        const numbers = refundedNumbers.get(allocation.purchaseId) || new Set();
        allocation.advancements.forEach((item) => numbers.add(Number(item.number)));
        refundedNumbers.set(allocation.purchaseId, numbers);
      } else {
        legacyRefundedCounts.set(allocation.purchaseId,
          (legacyRefundedCounts.get(allocation.purchaseId) || 0) + (allocation.count || 0));
      }
    }
  }
  return { undone, refundedNumbers, legacyRefundedCounts };
}

function refundablePurchasesForPath(character, targetPath) {
  const history = character.experience.history || [];
  const { undone, refundedNumbers, legacyRefundedCounts } = refundedCountsByPurchase(history);
  return history.filter((entry) => entry.type === 'purchase'
    && entry.targetPath === targetPath
    && !undone.has(entry.id))
    .map((entry) => {
      const refunded = refundedNumbers.get(entry.id) || new Set();
      const units = purchaseAdvancementUnits(entry)
        .filter((unit) => !refunded.has(unit.number));
      // Les anciennes sauvegardes ne contiennent pas les numéros individuels.
      // Leur remboursement historique concernait toujours les achats les plus récents.
      const legacyRefundCount = Math.min(units.length, legacyRefundedCounts.get(entry.id) || 0);
      units.splice(units.length - legacyRefundCount, legacyRefundCount);
      return {
        entry,
        units: units.reverse(),
        count: units.length
      };
    })
    .filter((item) => item.count > 0)
    .reverse();
}

function targetPathFor(character, target) {
  return locateProgressionTarget(character, target).path;
}

export function getRefundableProgressionCount(input, target) {
  const character = normalizeCharacter(input);
  const path = targetPathFor(character, target);
  return refundablePurchasesForPath(character, path).reduce((total, item) => total + item.units.length, 0);
}

/**
 * Calcule le remboursement à partir des achats réellement enregistrés.
 * Les achats les plus récents sont remboursés en premier ; le coût exact de
 * chaque achat reste ainsi conservé même si le référentiel a changé depuis.
 */
export function quoteProgressionRefund(input, selections = []) {
  const character = normalizeCharacter(input);
  const amountsByPath = new Map();
  for (const selection of selections) {
    const count = Number(selection?.amount ?? selection?.count ?? 0);
    if (!Number.isInteger(count) || count < 0 || count > 9999) {
      throw new RangeError('Le nombre d’avancements à rembourser est invalide.');
    }
    if (!count) continue;
    const path = targetPathFor(character, selection.target);
    amountsByPath.set(path, (amountsByPath.get(path) || 0) + count);
  }

  const allocations = [];
  const targetChanges = [];
  let totalAmount = 0;
  let totalCount = 0;
  for (const [targetPath, requestedCount] of amountsByPath) {
    const available = refundablePurchasesForPath(character, targetPath);
    const availableCount = available.reduce((total, item) => total + item.units.length, 0);
    if (requestedCount > availableCount) {
      throw new Error(`Remboursement impossible : ${requestedCount} avancement(s) demandé(s), ${availableCount} achat(s) remboursable(s) pour cette cible.`);
    }
    let remaining = requestedCount;
    let refundAmount = 0;
    for (const purchase of available) {
      if (!remaining) break;
      const selectedUnits = purchase.units.slice(0, remaining);
      if (selectedUnits.some((item) => !Number.isSafeInteger(item.unitCost) || item.unitCost <= 0)) {
        throw new Error('Le coût historique de cet achat est incomplet ; son remboursement exact est impossible.');
      }
      const count = selectedUnits.length;
      const amount = selectedUnits.reduce((total, item) => total + item.unitCost, 0);
      allocations.push({
        purchaseId: purchase.entry.id,
        targetPath,
        targetId: targetIdFromPath(targetPath),
        count,
        amount,
        advancements: selectedUnits.map((item) => ({
          number: item.number,
          unitCost: item.unitCost,
          amount: item.unitCost
        }))
      });
      refundAmount += amount;
      remaining -= count;
    }
    const target = targetFromPath(character, targetPath);
    const previousValue = target.get();
    if (previousValue < requestedCount) {
      throw new Error('Remboursement impossible : la valeur actuelle ne contient pas tous les avancements achetés.');
    }
    targetChanges.push({
      targetPath,
      targetId: targetIdFromPath(targetPath),
      count: requestedCount,
      previousValue,
      newValue: previousValue - requestedCount
    });
    totalAmount += refundAmount;
    totalCount += requestedCount;
  }
  return { amount: totalAmount, count: totalCount, allocations, targetChanges };
}

export function grantExperience(input, { amount, note = '', now = new Date().toISOString() } = {}) {
  const character = normalizeCharacter(input);
  const gain = positiveInteger(amount, 'Le gain d’expérience', 1_000_000_000);
  const xpBefore = getExperienceAvailable(character);
  if (character.experience.total + gain > 1_000_000_000) throw new RangeError('Le total XP dépasse la limite prise en charge.');
  character.experience.total += gain;
  const xpAfter = getExperienceAvailable(character);
  character.experience.history.push({
    id: createId(), type: 'gain', amount: gain, count: 0,
    note: String(note).trim().slice(0, 500), date: now,
    targetPath: '', previousValue: null, newValue: null, reversedEntryId: '',
    xpBefore, xpAfter
  });
  character.updatedAt = now;
  return character;
}

/**
 * Corrige une valeur XP après vérification humaine. La correction est tracée
 * et peut être annulée sans écraser les opérations suivantes.
 */
export function correctExperience(input, { total, spent, note = 'Correction XP', now = new Date().toISOString() } = {}) {
  const character = normalizeCharacter(input);
  const changes = [];
  for (const [key, value] of [['total', total], ['spent', spent]]) {
    if (value === undefined || value === null || value === '') continue;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1_000_000_000) {
      throw new RangeError(`La valeur XP « ${key} » doit être un entier positif ou nul.`);
    }
    const previousValue = character.experience[key];
    if (previousValue === parsed) continue;
    changes.push({ targetPath: `experience.${key}`, count: 0, previousValue, newValue: parsed });
  }
  if (!changes.length) throw new Error('Aucune correction XP à enregistrer.');
  const xpBefore = getExperienceAvailable(character);
  for (const change of changes) targetFromPath(character, change.targetPath).set(change.newValue);
  const xpAfter = getExperienceAvailable(character);
  character.experience.history.push({
    id: createId(), type: 'correction', amount: Math.abs(xpAfter - xpBefore), count: 0,
    note: String(note || 'Correction XP').trim().slice(0, 500), date: now,
    targetPath: changes.map((change) => change.targetPath).join(', '),
    previousValue: null, newValue: null, reversedEntryId: '',
    targetChanges: changes, xpBefore, xpAfter
  });
  character.updatedAt = now;
  return character;
}

/**
 * Enregistre un achat selon les coûts WFRP4e centralisés.
 * Le solde peut devenir négatif : un manque d'XP ne bloque jamais l'achat.
 */
export function purchaseAdvancement(input, { target, amount = 1, note = '', now = new Date().toISOString() } = {}) {
  const character = normalizeCharacter(input);
  const increments = positiveInteger(amount, 'La quantité d’avancement', 999);
  const progression = locateProgressionTarget(character, target);
  if (progression.type === 'skill' && (progression.entry.acquired === false || progression.entry.status === 'selected' || progression.entry.status === 'suggested')) {
    throw new Error('Cette compétence doit être marquée comme acquise avant de pouvoir acheter des avancements.');
  }
  if (progression.type === 'talent' && progression.get() === 0) {
    const hasRequirements = Boolean(progression.entry.conditions?.trim() || progression.entry.prerequisites?.length);
    if (hasRequirements && progression.entry.prerequisitesVerified !== true) {
      throw new Error('Vérifiez les conditions et prérequis du talent dans la fiche avant son acquisition.');
    }
  }
  const previousValue = progression.get();
  const newValue = previousValue + increments;
  if (progression.type === 'talent') {
    const talent = progression.entry;
    if (talent.maxRank && newValue > talent.maxRank) {
      throw new RangeError(`Le talent « ${talent.name} » est limité au rang ${talent.maxRank}.`);
    }
  }
  const quote = quoteAdvancementCosts(progression.type, previousValue, increments);
  const price = quote.amount;
  const xpBefore = getExperienceAvailable(character);
  if (character.experience.spent + price > 1_000_000_000) throw new RangeError('Les dépenses XP dépassent la limite prise en charge.');
  progression.set(newValue);
  character.experience.spent += price;
  const xpAfter = getExperienceAvailable(character);
  character.experience.history.push({
    id: createId(), type: 'purchase', amount: price, count: increments,
    unitCost: quote.advancements.every((item) => item.unitCost === quote.advancements[0].unitCost)
      ? quote.advancements[0].unitCost
      : null,
    advancementCosts: quote.advancements,
    advancementNumber: increments === 1 ? quote.advancements[0].number : null,
    note: String(note || progression.path).trim().slice(0, 500), date: now,
    targetPath: progression.path,
    targetId: progression.type === 'characteristic' ? target.key : progression.entry.id,
    previousValue, newValue, reversedEntryId: '',
    targetChanges: [{ targetPath: progression.path, count: increments, previousValue, newValue }],
    xpBefore, xpAfter
  });
  character.updatedAt = now;
  return character;
}

/** Achat du niveau suivant de la carrière actuelle (100 XP, progression séquentielle). */
export function purchaseCareerLevel(input, { career, now = new Date().toISOString() } = {}) {
  const character = normalizeCharacter(input);
  const identity = character.identity;
  const progress = getCareerLevelProgress(character, { career });
  if (!progress.currentLevel) {
    throw new Error('La carrière et le niveau actuel doivent être associés au référentiel avant de progresser.');
  }
  if (!progress.nextLevel) {
    throw new Error('Le dernier niveau de cette carrière est déjà atteint. Vous pouvez changer de carrière.');
  }
  if (progress.blockers.length) throw new Error(progress.blockers.join(' '));
  if (character.experience.spent + CAREER_LEVEL_UP_COST > 1_000_000_000) {
    throw new RangeError('Les dépenses XP dépassent la limite prise en charge.');
  }

  const previousCareer = {
    careerId: identity.careerId,
    career: identity.career,
    careerLevelId: identity.careerLevelId,
    careerLevel: identity.careerLevel,
    careerCompleted: identity.careerCompleted
  };
  const isFinalLevel = progress.nextLevel.id === progress.levels.at(-1)?.id;
  const nextCareer = {
    ...previousCareer,
    careerLevelId: progress.nextLevel.id,
    careerLevel: progress.nextLevel.name,
    careerCompleted: isFinalLevel
  };
  const xpBefore = getExperienceAvailable(character);
  Object.assign(identity, nextCareer);
  character.experience.spent += CAREER_LEVEL_UP_COST;
  const xpAfter = getExperienceAvailable(character);
  character.experience.history.push({
    id: createId(),
    type: 'career-level-up',
    amount: CAREER_LEVEL_UP_COST,
    count: 1,
    unitCost: CAREER_LEVEL_UP_COST,
    note: `Progression de carrière : ${previousCareer.careerLevel || progress.currentLevel.name} → ${nextCareer.careerLevel}`,
    date: now,
    targetPath: 'identity.careerLevel',
    targetId: nextCareer.careerLevelId,
    previousValue: null,
    newValue: null,
    reversedEntryId: '',
    careerChange: { previous: previousCareer, next: nextCareer },
    xpBefore,
    xpAfter
  });
  character.updatedAt = now;
  return character;
}

/** Changement automatique après le dernier niveau et vérification des conditions déclarées. */
export function purchaseCareerChange(input, { currentCareer, career, now = new Date().toISOString() } = {}) {
  const character = normalizeCharacter(input);
  const eligibility = getCareerChangeEligibility(character, { currentCareer, targetCareer: career });
  if (!eligibility.eligible) throw new Error(eligibility.blockers.join(' '));

  const identity = character.identity;
  const previousCareer = {
    careerId: identity.careerId,
    career: identity.career,
    careerLevelId: identity.careerLevelId,
    careerLevel: identity.careerLevel,
    careerCompleted: identity.careerCompleted
  };
  const nextCareer = {
    careerId: career.id,
    career: career.name,
    careerLevelId: eligibility.startingLevel.id,
    careerLevel: eligibility.startingLevel.name,
    careerCompleted: false
  };
  if (character.experience.spent + CAREER_CHANGE_COST > 1_000_000_000) {
    throw new RangeError('Les dépenses XP dépassent la limite prise en charge.');
  }
  const xpBefore = getExperienceAvailable(character);
  Object.assign(identity, nextCareer);
  character.experience.spent += CAREER_CHANGE_COST;
  const xpAfter = getExperienceAvailable(character);
  character.experience.history.push({
    id: createId(),
    type: 'career-change',
    amount: CAREER_CHANGE_COST,
    count: 1,
    unitCost: CAREER_CHANGE_COST,
    note: `Changement de carrière : ${previousCareer.career} → ${nextCareer.career}`,
    date: now,
    targetPath: 'identity.career',
    targetId: career.id,
    previousValue: null,
    newValue: null,
    reversedEntryId: '',
    careerChange: { previous: previousCareer, next: nextCareer },
    xpBefore,
    xpAfter
  });
  character.updatedAt = now;
  return character;
}

export function refundAdvancements(input, selections = [], { note = '', now = new Date().toISOString() } = {}) {
  const character = normalizeCharacter(input);
  const quote = quoteProgressionRefund(character, selections);
  if (!quote.count) throw new Error('Sélectionnez au moins un avancement ou talent acheté et remboursable.');
  if (character.experience.spent < quote.amount) {
    throw new Error('Le solde des dépenses XP ne permet pas de restituer le coût historique exact.');
  }
  const xpBefore = getExperienceAvailable(character);
  for (const change of quote.targetChanges) {
    targetFromPath(character, change.targetPath).set(change.newValue);
  }
  character.experience.spent -= quote.amount;
  const xpAfter = getExperienceAvailable(character);
  const labels = quote.targetChanges.map((change) => change.targetPath).join(', ');
  character.experience.history.push({
    id: createId(), type: 'refund', amount: quote.amount, count: quote.count,
    unitCost: quote.count === 1 ? quote.allocations[0]?.advancements?.[0]?.unitCost ?? null : null,
    note: String(note || `Remboursement : ${labels}`).trim().slice(0, 500),
    date: now, targetPath: labels,
    targetId: quote.targetChanges.length === 1 ? quote.targetChanges[0].targetId : '',
    targetIds: [...new Set(quote.targetChanges.map((change) => change.targetId).filter(Boolean))],
    previousValue: null, newValue: null, reversedEntryId: '',
    targetChanges: quote.targetChanges,
    refundAllocations: quote.allocations,
    xpBefore, xpAfter
  });
  character.updatedAt = now;
  return character;
}

export function undoLastPurchase(input, { now = new Date().toISOString() } = {}) {
  const character = normalizeCharacter(input);
  const reversedIds = reversedOperationIds(character.experience.history);
  const operation = [...character.experience.history].reverse().find((entry) => (
    ['gain', 'purchase', 'refund', 'correction', 'career-level-up', 'career-change'].includes(entry.type) && !reversedIds.has(entry.id)
  ));
  if (!operation) throw new Error('Aucune opération de progression non annulée n’est disponible dans l’historique.');

  const changes = ['gain', 'career-level-up', 'career-change'].includes(operation.type)
    ? []
    : operation.targetChanges?.length
      ? operation.targetChanges
      : [{
      targetPath: operation.targetPath,
      count: historyCount(operation),
      previousValue: operation.previousValue,
      newValue: operation.newValue
      }];
  const restorations = changes.map((change) => {
    const target = targetFromPath(character, change.targetPath);
    const expectedValue = change.newValue;
    const restoreValue = change.previousValue;
    if (target.get() !== expectedValue) {
      throw new Error('La progression a changé depuis cet achat. Annulation refusée pour éviter de perdre des modifications.');
    }
    return { target, targetPath: change.targetPath, currentValue: expectedValue, restoreValue, count: change.count };
  });
  if (['purchase', 'career-level-up', 'career-change'].includes(operation.type) && character.experience.spent < operation.amount) {
    throw new Error('Les dépenses XP ne correspondent plus à cet achat ; annulation refusée.');
  }
  if (operation.type === 'gain' && character.experience.total < operation.amount) {
    throw new Error('Le total XP a changé depuis ce gain ; annulation refusée.');
  }

  const xpBefore = getExperienceAvailable(character);
  for (const item of restorations) item.target.set(item.restoreValue);
  if (['career-level-up', 'career-change'].includes(operation.type)) {
    const expected = operation.careerChange?.next;
    const previous = operation.careerChange?.previous;
    if (!expected || !previous
      || character.identity.careerId !== expected.careerId
      || character.identity.career !== expected.career
      || character.identity.careerLevelId !== expected.careerLevelId
      || character.identity.careerLevel !== expected.careerLevel
      || character.identity.careerCompleted !== expected.careerCompleted) {
      throw new Error('La carrière ou son niveau a changé depuis cette opération. Annulation refusée.');
    }
    Object.assign(character.identity, previous);
    character.experience.spent -= operation.amount;
  } else if (operation.type === 'purchase') character.experience.spent -= operation.amount;
  else if (operation.type === 'refund') character.experience.spent += operation.amount;
  else if (operation.type === 'gain') character.experience.total -= operation.amount;
  const xpAfter = getExperienceAvailable(character);
  character.experience.history.push({
    id: createId(), type: 'undo', amount: operation.amount, count: operation.count || 0,
    unitCost: operation.unitCost,
    note: `Annulation : ${operation.note}`, date: now,
    targetPath: operation.targetPath, targetId: operation.targetId,
    targetIds: operation.targetIds || (operation.targetId ? [operation.targetId] : []),
    previousValue: null, newValue: null,
    reversedEntryId: operation.id, originalOperationType: operation.type,
    targetChanges: restorations.map((item) => ({
      targetPath: item.targetPath,
      count: item.count,
      previousValue: item.currentValue,
      newValue: item.restoreValue
    })),
    careerChange: ['career-level-up', 'career-change'].includes(operation.type)
      ? { previous: operation.careerChange.next, next: operation.careerChange.previous }
      : null,
    xpBefore, xpAfter
  });
  character.updatedAt = now;
  return character;
}
