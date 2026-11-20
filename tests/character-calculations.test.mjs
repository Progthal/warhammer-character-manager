import test from 'node:test';
import assert from 'node:assert/strict';
import { createCharacter } from '../src/models/character.js';
import {
  calculateCharacterSheet, calculateCharacteristics, calculateEncumbrance, calculateSkills, evaluateCorruption
} from '../src/rules/character-calculations.js';

test('les caractéristiques séparent valeur initiale, talents vérifiés, augmentations et bonus des dizaines', () => {
  const character = createCharacter({
    characteristics: { CC: 38 },
    characteristicAdvances: { CC: 4 },
    talents: [{
      name: 'Talent documenté',
      effects: [
        { type: 'characteristicBonus', characteristic: 'CC', value: 2, verified: true, reference: 'Livre, p. 123' },
        { type: 'characteristicBonus', characteristic: 'CC', value: 9, verified: true, reference: '' },
        { type: 'characteristicBonus', characteristic: 'CC', value: 3, verified: false, reference: 'Livre, p. 123' }
      ]
    }]
  });
  const result = calculateCharacteristics(character);
  assert.deepEqual(result.CC, {
    key: 'CC', label: 'Capacité de Combat', shortLabel: 'CC',
    initial: 38, talentBonus: 2, advances: 4, current: 44, bonus: 4
  });
  assert.equal(result.CT.current, null);
  assert.equal(result.CT.bonus, null);
});

test('les compétences utilisent la caractéristique associée ou une base manuelle explicite', () => {
  const character = createCharacter({
    characteristics: { Ag: 41 },
    skills: [
      { id: 'skill-basic', name: 'Esquive', characteristic: 'Ag', useCharacteristicBase: true, advances: 3 },
      { id: 'skill-advanced', name: 'Langue secrète', characteristic: 'Int', useCharacteristicBase: false, baseValue: 7, advances: 2 }
    ]
  });
  const skills = calculateSkills(character);
  assert.equal(skills[0].base, 41);
  assert.equal(skills[0].total, 44);
  assert.equal(skills[1].base, 7);
  assert.equal(skills[1].total, 9);
});

test('l’encombrement tient compte des quantités et signale une capacité dépassée seulement si elle est configurée', () => {
  const unknownCapacity = createCharacter({ equipment: {
    weapons: [{ name: 'Épée', encumbrance: 1, quantity: 2 }],
    possessions: [{ name: 'Sac', encumbrance: 0.5, quantity: 1 }]
  } });
  assert.deepEqual(calculateEncumbrance(unknownCapacity), { total: 2.5, capacity: null, overloaded: null, remaining: null });

  const configured = createCharacter({
    equipment: { weapons: [{ name: 'Épée', encumbrance: 1, quantity: 2 }] },
    rules: { encumbranceCapacity: 1 }
  });
  assert.equal(calculateEncumbrance(configured).overloaded, true);
  assert.equal(calculateEncumbrance(configured).remaining, -1);
});

test('le seuil de corruption est évalué sans appliquer de formule par défaut', () => {
  const character = createCharacter({ resources: { corruptionPoints: 5 } });
  assert.equal(evaluateCorruption(character).threshold, null);
  assert.equal(evaluateCorruption(character).exceeded, null);
  character.rules.corruptionThreshold = 4;
  assert.equal(evaluateCorruption(character).exceeded, true);
  character.rules.corruptionThreshold = 5;
  assert.equal(evaluateCorruption(character).exceeded, false);
});

test('la feuille agrégée conserve les valeurs secondaires manuelles sans les recalculer', () => {
  const character = createCharacter({ secondary: { movement: 4, woundsMax: 12, woundsCurrent: 8 } });
  const result = calculateCharacterSheet(character);
  assert.equal(result.secondary.movement, 4);
  assert.equal(result.secondary.woundsMax, 12);
  assert.equal(result.secondary.woundsConfigured, true);
});
