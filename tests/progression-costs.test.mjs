import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter, getExperienceAvailable } from '../src/models/character.js';
import { createCharacterExport, parseImportPayload, prepareImportedCharacters } from '../src/services/import-export.js';
import { purchaseAdvancement, purchaseCareerChange, refundAdvancements, quoteProgressionRefund, undoLastPurchase } from '../src/services/progression.js';
import { CAREER_CHANGE_COST, getNextAdvancementCost, quoteAdvancementCosts } from '../src/rules/progression-costs.js';
import { renderCharacterDetail } from '../src/views/character-detail.js';

test('les vingt paliers de caractéristiques appliquent 25, 30, 35 et 40 XP par tranche', () => {
  assert.deepEqual(Array.from({ length: 20 }, (_, index) => getNextAdvancementCost('characteristic', index)), [
    25, 25, 25, 25, 25,
    30, 30, 30, 30, 30,
    35, 35, 35, 35, 35,
    40, 40, 40, 40, 40
  ]);
  assert.equal(getNextAdvancementCost('characteristic', 20), null);
});

test('les vingt paliers de chaque compétence appliquent 10, 15, 20 et 25 XP par tranche', () => {
  assert.deepEqual(Array.from({ length: 20 }, (_, index) => getNextAdvancementCost('skill', index)), [
    10, 10, 10, 10, 10,
    15, 15, 15, 15, 15,
    20, 20, 20, 20, 20,
    25, 25, 25, 25, 25
  ]);
  assert.equal(getNextAdvancementCost('skill', 20), null);
});

test('chaque compétence utilise son propre compteur d’avancements', () => {
  const character = createCharacter({
    experience: { total: 500 },
    skills: [
      { id: 'skill-five', name: 'Esquive', advances: 4, acquired: true },
      { id: 'skill-six', name: 'Athlétisme', advances: 5, acquired: true }
    ]
  });
  const first = purchaseAdvancement(character, { target: { type: 'skill', id: 'skill-five' } });
  const second = purchaseAdvancement(first, { target: { type: 'skill', id: 'skill-six' } });
  assert.equal(second.experience.history.at(-2).amount, 10);
  assert.equal(second.experience.history.at(-1).amount, 15);
  assert.equal(second.skills[0].advances, 5);
  assert.equal(second.skills[1].advances, 6);
  assert.equal(second.experience.history.at(-2).targetId, 'skill-five');
  assert.equal(second.experience.history.at(-1).targetId, 'skill-six');
});

test('un achat groupé calcule chaque tranche et son remboursement restitue chaque prix historique', () => {
  const character = createCharacter({
    experience: { total: 500 },
    skills: [{ id: 'skill-crossing', name: 'Discrétion', advances: 4, acquired: true }]
  });
  const bought = purchaseAdvancement(character, {
    target: { type: 'skill', id: 'skill-crossing' }, amount: 3
  });
  const purchase = bought.experience.history.at(-1);
  assert.equal(purchase.amount, 40);
  assert.deepEqual(purchase.advancementCosts, [
    { number: 5, unitCost: 10 },
    { number: 6, unitCost: 15 },
    { number: 7, unitCost: 15 }
  ]);
  const quote = quoteProgressionRefund(bought, [
    { target: { type: 'skill', id: 'skill-crossing' }, amount: 2 }
  ]);
  assert.equal(quote.amount, 30);
  assert.deepEqual(quote.allocations[0].advancements.map((item) => item.unitCost), [15, 15]);
  const refunded = refundAdvancements(bought, [
    { target: { type: 'skill', id: 'skill-crossing' }, amount: 2 }
  ]);
  assert.equal(refunded.skills[0].advances, 5);
  assert.equal(refunded.experience.spent, 10);
  assert.equal(refunded.experience.history.at(-1).amount, 30);
});

test('les augmentations de caractéristiques peuvent être remboursées au prix exact de leur palier', () => {
  const character = createCharacter({
    experience: { total: 500 },
    characteristicAdvances: { F: 4 }
  });
  const bought = purchaseAdvancement(character, {
    target: { type: 'characteristic', key: 'F' }, amount: 2
  });
  assert.equal(bought.experience.spent, 55);
  assert.deepEqual(bought.experience.history.at(-1).advancementCosts, [
    { number: 5, unitCost: 25 },
    { number: 6, unitCost: 30 }
  ]);
  const refunded = refundAdvancements(bought, [
    { target: { type: 'characteristic', key: 'F' }, amount: 1 }
  ]);
  assert.equal(refunded.characteristicAdvances.F, 5);
  assert.equal(refunded.experience.spent, 25);
  assert.deepEqual(refunded.experience.history.at(-1).targetIds, ['F']);
  assert.equal(refunded.experience.history.at(-1).unitCost, 30);
});

test('chaque acquisition ou rang suivant d’un talent coûte 100 XP et respecte son rang maximal', () => {
  const character = createCharacter({
    experience: { total: 400 },
    talents: [{ id: 'talent-100', name: 'Coup puissant', rank: 1, acquired: true, maxRank: 3 }]
  });
  const rankTwo = purchaseAdvancement(character, { target: { type: 'talent', id: 'talent-100' } });
  const rankThree = purchaseAdvancement(rankTwo, { target: { type: 'talent', id: 'talent-100' } });
  assert.equal(rankThree.talents[0].rank, 3);
  assert.equal(rankThree.experience.spent, 200);
  assert.deepEqual(rankThree.experience.history.slice(-2).map((entry) => entry.amount), [100, 100]);
  assert.throws(() => purchaseAdvancement(rankThree, { target: { type: 'talent', id: 'talent-100' } }), /limité au rang 3/);
});

test('un changement de carrière coûte 100 XP seulement après validation de la carrière actuelle et reste annulable', () => {
  const character = createCharacter({
    experience: { total: 50 },
    identity: {
      careerId: 'career:old', career: 'Soldat', careerLevelId: 'career:old:1', careerLevel: 'Recrue'
    }
  });
  const nextCareer = { id: 'career:new', name: 'Éclaireur' };
  assert.throws(() => purchaseCareerChange(character, { career: nextCareer }), /uniquement après/);
  const completed = createCharacter({
    ...character,
    identity: { ...character.identity, careerCompleted: true }
  });
  const changed = purchaseCareerChange(completed, {
    career: nextCareer,
    level: { id: 'career:new:1', name: 'Pisteur', careerId: 'career:new' }
  });
  assert.equal(CAREER_CHANGE_COST, 100);
  assert.equal(changed.identity.careerId, 'career:new');
  assert.equal(changed.identity.careerLevel, 'Pisteur');
  assert.equal(changed.identity.careerCompleted, false);
  assert.equal(changed.experience.spent, 100);
  assert.equal(getExperienceAvailable(changed), -50);
  assert.equal(changed.experience.history.at(-1).type, 'career-change');
  assert.equal(changed.experience.history.at(-1).targetId, 'career:new');
  const restored = undoLastPurchase(changed);
  assert.equal(restored.identity.careerId, 'career:old');
  assert.equal(restored.identity.careerLevel, 'Recrue');
  assert.equal(restored.identity.careerCompleted, true);
  assert.equal(restored.experience.spent, 0);
});

test('les prix et informations d’historique survivent à un export et un import JSON', () => {
  const character = createCharacter({
    experience: { total: 300 },
    identity: {
      career: 'Soldat', careerId: 'career:soldier', careerCompleted: true
    },
    skills: [{ id: 'skill-json', name: 'Esquive', advances: 4, acquired: true }]
  });
  const bought = purchaseAdvancement(character, { target: { type: 'skill', id: 'skill-json' } });
  const payload = createCharacterExport(bought, '2026-11-21T01:00:00.000Z');
  const parsed = parseImportPayload(payload);
  const [imported] = prepareImportedCharacters(parsed.characters);
  assert.equal(imported.character.identity.careerCompleted, true);
  assert.equal(imported.character.experience.history.at(-1).targetId, 'skill-json');
  assert.deepEqual(imported.character.experience.history.at(-1).advancementCosts, [
    { number: 5, unitCost: 10 }
  ]);
});

test('le devis des achats groupés refuse de dépasser le vingtième avancement', () => {
  assert.throws(() => quoteAdvancementCosts('skill', 19, 2), /maximal de 20/);
});

test('le compteur de départ du devis est validé et converti avant de numéroter les achats', () => {
  assert.deepEqual(quoteAdvancementCosts('skill', '5', 1).advancements, [
    { number: 6, unitCost: 15 }
  ]);
  assert.throws(() => quoteAdvancementCosts('skill', -1, 1), /nombre d’avancements/);
  assert.throws(() => quoteAdvancementCosts('skill', 1.5, 1), /nombre d’avancements/);
});

test('la fiche détaille les prochains coûts et ne propose le changement de carrière qu’après achèvement', () => {
  const references = [{ id: 'career:current', kind: 'careers', name: 'Soldat', className: 'Combattants', levels: [] }];
  const character = createCharacter({
    id: 'character-ui',
    identity: { career: 'Soldat', careerId: 'career:current' },
    characteristicAdvances: { F: 5 },
    skills: [{ id: 'skill-ui', name: 'Esquive', advances: 5, acquired: true }],
    talents: [{ id: 'talent-ui', name: 'Réflexes', rank: 1, acquired: true }]
  });
  const inProgress = renderCharacterDetail(character, references);
  assert.match(inProgress, /\+1 · 30 XP/);
  assert.match(inProgress, /\+1 · 15 XP/);
  assert.match(inProgress, /Rang suivant.*100 XP|Acheter le rang suivant.*100 XP/);
  assert.doesNotMatch(inProgress, /data-action="change-career"/);
  const completed = createCharacter({ ...character, identity: { ...character.identity, careerCompleted: true } });
  assert.match(renderCharacterDetail(completed, references), /data-action="change-career"/);
});
