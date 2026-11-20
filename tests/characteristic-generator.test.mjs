import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHARACTERISTICS } from '../src/models/character.js';
import { findSpeciesProfile, generateCharacteristics } from '../src/rules/characteristic-generator.js';

const dataset = JSON.parse(await readFile(new URL('../data/species.json', import.meta.url), 'utf8'));
const profiles = dataset.entries.map((entry) => ({ ...entry, kind: 'species' }));

test('le générateur lance exactement deux d10 par caractéristique et détaille chaque calcul', () => {
  const sequence = [0.4, 0.7];
  let calls = 0;
  const result = generateCharacteristics('Humain', profiles, {
    random: () => sequence[calls++ % sequence.length]
  });

  assert.equal(calls, 20);
  assert.equal(Object.keys(result.characteristics).length, 10);
  assert.deepEqual(Object.keys(result.characteristics), CHARACTERISTICS.map(({ key }) => key));
  assert.equal(result.characteristics.CC, 33);
  assert.deepEqual(result.details.CC, {
    label: 'CC', dice: [5, 8], diceTotal: 13, modifier: 20, total: 33, minimum: 22, maximum: 40
  });
});

test('les cinq espèces ont un profil complet et chaque résultat reste dans ses bornes', () => {
  assert.equal(profiles.length, 5);
  for (const profile of profiles) {
    for (const random of [() => 0, () => 0.999999]) {
      const result = generateCharacteristics(profile.name, profiles, { random });
      for (const { key } of CHARACTERISTICS) {
        const detail = result.details[key];
        assert.ok(Number.isInteger(result.characteristics[key]));
        assert.ok(detail.total >= detail.minimum);
        assert.ok(detail.total <= detail.maximum);
        assert.equal(detail.total, detail.diceTotal + detail.modifier);
      }
    }
  }
});

test('les modificateurs de base correspondent à la table WFRP4e intégrée', () => {
  const expected = {
    Humain: [20, 20, 20, 20, 20, 20, 20, 20, 20, 20],
    Nain: [30, 20, 20, 30, 20, 10, 30, 20, 40, 10],
    Halfling: [10, 30, 10, 20, 20, 20, 30, 20, 30, 30],
    'Haut Elfe': [30, 30, 20, 20, 40, 30, 30, 30, 30, 20],
    'Elfe sylvain': [30, 30, 20, 20, 40, 30, 30, 30, 30, 20]
  };
  for (const [name, values] of Object.entries(expected)) {
    const profile = findSpeciesProfile(name, profiles);
    assert.deepEqual(CHARACTERISTICS.map(({ key }) => profile.characteristicModifiers[key]), values);
  }
});

test('les alias historiques Elfe et les deux profils elfiques sont reconnus', () => {
  const highElf = findSpeciesProfile('Elfe', profiles);
  const woodElf = findSpeciesProfile('Elfe sylvain', profiles);
  assert.equal(highElf.name, 'Haut Elfe');
  assert.deepEqual(highElf.characteristicModifiers, woodElf.characteristicModifiers);
  assert.deepEqual(
    generateCharacteristics('Elfe', profiles, { random: () => 0 }).characteristics,
    generateCharacteristics('Haut Elfe', profiles, { random: () => 0 }).characteristics
  );
});

test('un profil personnalisé importé peut remplacer le profil intégré du même nom', () => {
  const builtin = profiles.find((profile) => profile.name === 'Haut Elfe');
  const imported = {
    ...builtin,
    id: 'pack:species:high-elf',
    source: 'pack',
    characteristicModifiers: { ...builtin.characteristicModifiers, CC: 35 }
  };
  const selected = findSpeciesProfile('Haut Elfe', [...profiles, imported]);
  assert.equal(selected.id, imported.id);
  assert.equal(generateCharacteristics('Haut Elfe', [...profiles, imported], { random: () => 0 }).characteristics.CC, 37);
});

test('le générateur refuse une espèce absente, inconnue ou dont le profil est incomplet', () => {
  assert.throws(() => generateCharacteristics('', profiles), /Choisissez une espèce/);
  assert.throws(() => generateCharacteristics('Ogre', profiles), /Aucun profil de génération/);
  const incomplete = [{ kind: 'species', name: 'Gnome', characteristicModifiers: { CC: 20 } }];
  assert.throws(() => generateCharacteristics('Gnome', incomplete), /profil.*incomplet/i);
});

test('la fonction aléatoire injectée doit renvoyer une valeur comprise entre 0 inclus et 1 exclu', () => {
  assert.throws(() => generateCharacteristics('Humain', profiles, { random: () => 1 }), /compris entre 0 inclus/);
  assert.throws(() => generateCharacteristics('Humain', profiles, { random: () => -0.1 }), /compris entre 0 inclus/);
});
