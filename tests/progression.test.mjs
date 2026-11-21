import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter, getExperienceAvailable } from '../src/models/character.js';
import {
  correctExperience, grantExperience, getRefundableProgressionCount,
  purchaseAdvancement, quoteProgressionRefund, refundAdvancements, undoLastPurchase
} from '../src/services/progression.js';
import { calculateCharacteristics } from '../src/rules/character-calculations.js';

test('un gain d’expérience est validé et inscrit dans l’historique', () => {
  const original = createCharacter({ experience: { total: 100, spent: 20 } });
  const updated = grantExperience(original, { amount: 50, note: 'Fin de séance', now: '2026-11-20T19:00:00.000Z' });
  assert.equal(updated.experience.total, 150);
  assert.equal(getExperienceAvailable(updated), 130);
  assert.equal(updated.experience.history.at(-1).type, 'gain');
  assert.equal(updated.experience.history.at(-1).note, 'Fin de séance');
  assert.equal(original.experience.total, 100);
});

test('un achat augmente la cible, déduit l’XP et conserve un solde négatif sans blocage', () => {
  const character = createCharacter({
    experience: { total: 120, spent: 100 },
    characteristicAdvances: { CC: 1 }
  });
  const updated = purchaseAdvancement(character, {
    target: { type: 'characteristic', key: 'CC' }, cost: 50, amount: 1,
    note: 'CC +1', now: '2026-11-20T19:05:00.000Z'
  });
  assert.equal(updated.characteristicAdvances.CC, 2);
  assert.equal(updated.experience.spent, 125);
  assert.equal(getExperienceAvailable(updated), -5);
  assert.equal(updated.experience.history.at(-1).type, 'purchase');
  assert.equal(updated.experience.history.at(-1).previousValue, 1);
  assert.equal(updated.experience.history.at(-1).newValue, 2);
  assert.equal(updated.experience.history.at(-1).xpBefore, 20);
  assert.equal(updated.experience.history.at(-1).xpAfter, -5);
});

test('les compétences et talents utilisent leur coût automatique', () => {
  const character = createCharacter({
    experience: { total: 500, spent: 0 },
    skills: [{ id: 'skill-1', name: 'Esquive', advances: 1 }],
    talents: [{ id: 'talent-1', name: 'Réflexes', rank: 1 }]
  });
  const skillPurchase = purchaseAdvancement(character, { target: { type: 'skill', id: 'skill-1' }, cost: 25 });
  assert.equal(skillPurchase.skills[0].advances, 2);
  const talentPurchase = purchaseAdvancement(skillPurchase, { target: { type: 'talent', id: 'talent-1' }, cost: 100 });
  assert.equal(talentPurchase.talents[0].rank, 2);
  assert.equal(talentPurchase.experience.spent, 110);
});

test('le rang maximal documenté d’un talent bloque les achats qui le dépassent', () => {
  const character = createCharacter({
    experience: { total: 500, spent: 0 },
    talents: [{ id: 'talent-limited', name: 'Talent à rang limité', rank: 2, maxRank: 3, acquired: true, status: 'acquired' }]
  });
  const advanced = purchaseAdvancement(character, { target: { type: 'talent', id: 'talent-limited' }, cost: 100 });
  assert.equal(advanced.talents[0].rank, 3);
  assert.throws(() => purchaseAdvancement(advanced, { target: { type: 'talent', id: 'talent-limited' }, cost: 100 }), /limité au rang 3/);
  assert.equal(advanced.talents[0].rank, 3);
});

test('une suggestion sélectionnée mais non acquise ne peut pas être achetée avec des XP', () => {
  const character = createCharacter({
    experience: { total: 500, spent: 0 },
    skills: [{ id: 'suggested-skill', name: 'Esquive', advances: 0, acquired: false, status: 'selected' }],
    talents: [{ id: 'suggested-talent', name: 'Réflexes', rank: 1, acquired: false, status: 'selected', conditions: 'Avoir la compétence Esquive' }]
  });
  assert.throws(() => purchaseAdvancement(character, { target: { type: 'skill', id: 'suggested-skill' } }), /marquée comme acquise/);
  assert.throws(() => purchaseAdvancement(character, { target: { type: 'talent', id: 'suggested-talent' } }), /conditions et prérequis/);
});

test('un remboursement partiel ou multiple restitue exactement le coût des achats concernés', () => {
  const character = createCharacter({
    experience: { total: 300, spent: 0 },
    skills: [{ id: 'skill-refund', name: 'Esquive', advances: 1, acquired: true }],
    talents: [{ id: 'talent-refund', name: 'Réflexes', rank: 1, acquired: true }]
  });
  const first = purchaseAdvancement(character, { target: { type: 'skill', id: 'skill-refund' }, cost: 25, now: '2026-11-20T19:01:00.000Z' });
  const second = purchaseAdvancement(first, { target: { type: 'skill', id: 'skill-refund' }, cost: 35, now: '2026-11-20T19:02:00.000Z' });
  const third = purchaseAdvancement(second, { target: { type: 'talent', id: 'talent-refund' }, cost: 80, now: '2026-11-20T19:03:00.000Z' });
  assert.equal(getRefundableProgressionCount(third, { type: 'skill', id: 'skill-refund' }), 2);
  const quote = quoteProgressionRefund(third, [
    { target: { type: 'skill', id: 'skill-refund' }, amount: 1 },
    { target: { type: 'talent', id: 'talent-refund' }, amount: 1 }
  ]);
  assert.equal(quote.count, 2);
  assert.equal(quote.amount, 110);
  assert.deepEqual(quote.allocations.map((item) => item.amount), [10, 100]);

  const refunded = refundAdvancements(third, [
    { target: { type: 'skill', id: 'skill-refund' }, amount: 1 },
    { target: { type: 'talent', id: 'talent-refund' }, amount: 1 }
  ], { now: '2026-11-20T19:04:00.000Z' });
  assert.equal(refunded.skills[0].advances, 2);
  assert.equal(refunded.talents[0].rank, 1);
  assert.equal(refunded.experience.spent, 10);
  assert.equal(getExperienceAvailable(refunded), 290);
  assert.equal(refunded.experience.history.at(-1).type, 'refund');
  assert.equal(refunded.experience.history.at(-1).amount, 110);
  assert.equal(refunded.experience.history.at(-1).xpBefore, 180);
  assert.equal(refunded.experience.history.at(-1).xpAfter, 290);
  assert.deepEqual(refunded.experience.history.at(-1).targetIds, ['skill-refund', 'talent-refund']);
  assert.equal(getRefundableProgressionCount(refunded, { type: 'skill', id: 'skill-refund' }), 1);
});

test('un talent acquis par XP perd son acquisition et ses effets lorsque son achat est remboursé', () => {
  const character = createCharacter({
    experience: { total: 100, spent: 0 },
    characteristics: { F: 30 },
    talents: [{
      id: 'talent-effect', name: 'Force accrue', rank: 1, acquired: false, status: 'selected',
      effects: [{ type: 'characteristicBonus', characteristic: 'F', value: 5, verified: true, reference: 'Livre, p. 10' }]
    }]
  });
  assert.equal(calculateCharacteristics(character).F.current, 30);
  const acquired = purchaseAdvancement(character, { target: { type: 'talent', id: 'talent-effect' }, cost: 60 });
  assert.equal(acquired.talents[0].acquired, true);
  assert.equal(calculateCharacteristics(acquired).F.current, 35);
  const refunded = refundAdvancements(acquired, [{ target: { type: 'talent', id: 'talent-effect' }, amount: 1 }]);
  assert.equal(refunded.talents[0].acquired, false);
  assert.equal(refunded.talents[0].status, 'selected');
  assert.equal(calculateCharacteristics(refunded).F.current, 30);
});

test('une acquisition de talent avec conditions exige leur vérification préalable', () => {
  const character = createCharacter({
    experience: { total: 100 },
    talents: [{ id: 'talent-prereq', name: 'Talent conditionnel', rank: 1, acquired: false, conditions: 'Avoir la compétence Esquive' }]
  });
  assert.throws(() => purchaseAdvancement(character, { target: { type: 'talent', id: 'talent-prereq' }, cost: 50 }), /conditions et prérequis/);
  character.talents[0].prerequisitesVerified = true;
  const acquired = purchaseAdvancement(character, { target: { type: 'talent', id: 'talent-prereq' }, cost: 50 });
  assert.equal(acquired.talents[0].acquired, true);
});

test('un remboursement ne peut dépasser les achats tracés ni rembourser un avancement historique non acheté', () => {
  const character = createCharacter({
    experience: { total: 100, spent: 0 },
    skills: [{ id: 'skill-legacy', name: 'Connaissances', advances: 4, acquired: true }]
  });
  assert.equal(getRefundableProgressionCount(character, { type: 'skill', id: 'skill-legacy' }), 0);
  assert.throws(() => refundAdvancements(character, [{ target: { type: 'skill', id: 'skill-legacy' }, amount: 1 }]), /avancement\(s\) demandé\(s\)/);
  assert.equal(character.skills[0].advances, 4);
});

test('annuler un remboursement remet la progression et les dépenses à leur état précédent', () => {
  const character = createCharacter({ experience: { total: 100 } , skills: [{ id: 'skill-undo-refund', name: 'Pistage', advances: 0, acquired: true }] });
  const bought = purchaseAdvancement(character, { target: { type: 'skill', id: 'skill-undo-refund' }, cost: 40 });
  const refunded = refundAdvancements(bought, [{ target: { type: 'skill', id: 'skill-undo-refund' }, amount: 1 }]);
  const restored = undoLastPurchase(refunded);
  assert.equal(restored.skills[0].advances, 1);
  assert.equal(restored.experience.spent, 10);
  assert.equal(getExperienceAvailable(restored), 90);
  assert.equal(restored.experience.history.at(-1).originalOperationType, 'refund');
});

test('annuler le dernier gain ou une correction restaure les valeurs et le solde', () => {
  const character = createCharacter({ experience: { total: 50, spent: 10 } });
  const gained = grantExperience(character, { amount: 40 });
  const undoneGain = undoLastPurchase(gained);
  assert.equal(undoneGain.experience.total, 50);
  assert.equal(getExperienceAvailable(undoneGain), 40);
  const corrected = correctExperience(undoneGain, { total: 200, spent: 25, note: 'Régularisation' });
  assert.equal(getExperienceAvailable(corrected), 175);
  const undoneCorrection = undoLastPurchase(corrected);
  assert.equal(undoneCorrection.experience.total, 50);
  assert.equal(undoneCorrection.experience.spent, 10);
});

test('annuler le dernier achat restaure la valeur et les XP dépensés', () => {
  const character = createCharacter({
    experience: { total: 200, spent: 0 }, characteristicAdvances: { Ag: 2 }
  });
  const bought = purchaseAdvancement(character, { target: { type: 'characteristic', key: 'Ag' }, cost: 75 });
  const undone = undoLastPurchase(bought);
  assert.equal(undone.characteristicAdvances.Ag, 2);
  assert.equal(undone.experience.spent, 0);
  assert.equal(undone.experience.history.at(-1).type, 'undo');
  assert.throws(() => undoLastPurchase(undone), /Aucune opération de progression/);
});

test('l’annulation est refusée si la cible a été modifiée depuis l’achat', () => {
  const character = createCharacter({ experience: { total: 100 } });
  const bought = purchaseAdvancement(character, { target: { type: 'characteristic', key: 'F' }, cost: 20 });
  bought.characteristicAdvances.F = 8;
  assert.throws(() => undoLastPurchase(bought), /a changé depuis cet achat/);
  assert.equal(bought.characteristicAdvances.F, 8);
});

test('les coûts et quantités invalides ainsi que les cibles arbitraires sont rejetés', () => {
  const character = createCharacter({ experience: { total: 100 } });
  assert.throws(() => grantExperience(character, { amount: 0 }), /entier positif/);
  assert.throws(() => purchaseAdvancement(character, { target: { type: 'characteristic', key: 'UNKNOWN' }, cost: 2 }), /cible de progression/);
  assert.throws(() => purchaseAdvancement({ ...character, characteristicAdvances: { F: 20 } }, { target: { type: 'characteristic', key: 'F' } }), /maximal de 20/);
});
