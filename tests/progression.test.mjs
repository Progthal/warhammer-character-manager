import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter, getExperienceAvailable } from '../src/models/character.js';
import { grantExperience, purchaseAdvancement, undoLastPurchase } from '../src/services/progression.js';

test('un gain d’expérience est validé et inscrit dans l’historique', () => {
  const original = createCharacter({ experience: { total: 100, spent: 20 } });
  const updated = grantExperience(original, { amount: 50, note: 'Fin de séance', now: '2026-11-20T19:00:00.000Z' });
  assert.equal(updated.experience.total, 150);
  assert.equal(getExperienceAvailable(updated), 130);
  assert.equal(updated.experience.history.at(-1).type, 'gain');
  assert.equal(updated.experience.history.at(-1).note, 'Fin de séance');
  assert.equal(original.experience.total, 100);
});

test('un achat vérifie le solde, augmente la cible et ajoute la dépense à l’historique', () => {
  const character = createCharacter({
    experience: { total: 300, spent: 100 },
    characteristicAdvances: { CC: 1 }
  });
  const updated = purchaseAdvancement(character, {
    target: { type: 'characteristic', key: 'CC' }, cost: 50, amount: 1,
    note: 'CC +1', now: '2026-11-20T19:05:00.000Z'
  });
  assert.equal(updated.characteristicAdvances.CC, 2);
  assert.equal(updated.experience.spent, 150);
  assert.equal(getExperienceAvailable(updated), 150);
  assert.equal(updated.experience.history.at(-1).type, 'purchase');
  assert.equal(updated.experience.history.at(-1).previousValue, 1);
  assert.equal(updated.experience.history.at(-1).newValue, 2);
});

test('les compétences et talents peuvent progresser avec un coût explicitement fourni', () => {
  const character = createCharacter({
    experience: { total: 500, spent: 0 },
    skills: [{ id: 'skill-1', name: 'Esquive', advances: 1 }],
    talents: [{ id: 'talent-1', name: 'Réflexes', rank: 1 }]
  });
  const skillPurchase = purchaseAdvancement(character, { target: { type: 'skill', id: 'skill-1' }, cost: 25 });
  assert.equal(skillPurchase.skills[0].advances, 2);
  const talentPurchase = purchaseAdvancement(skillPurchase, { target: { type: 'talent', id: 'talent-1' }, cost: 100 });
  assert.equal(talentPurchase.talents[0].rank, 2);
  assert.equal(talentPurchase.experience.spent, 125);
});

test('un achat refusé faute de XP ne modifie pas la fiche d’origine', () => {
  const character = createCharacter({ experience: { total: 50, spent: 40 } });
  assert.throws(() => purchaseAdvancement(character, {
    target: { type: 'characteristic', key: 'F' }, cost: 20
  }), /Expérience insuffisante/);
  assert.equal(character.characteristicAdvances.F, 0);
  assert.equal(character.experience.spent, 40);
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
  assert.throws(() => undoLastPurchase(undone), /Aucun achat non annulé/);
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
  assert.throws(() => purchaseAdvancement(character, { target: { type: 'characteristic', key: 'F' }, cost: 0 }), /coût en expérience/);
});
