import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCharacter } from '../src/models/character.js';
import { renderCharacterGrid, renderDashboard } from '../src/views/dashboard.js';

test('le tableau de bord reste un registre et ouvre une fiche depuis la carte', () => {
  const character = createCharacter({
    id: 'character-dashboard-test',
    identity: { firstName: 'Marta', lastName: 'Weiss' }
  });
  const html = renderDashboard([character]);

  assert.match(html, /id="character-search"/);
  assert.match(html, /id="character-sort"/);
  assert.match(html, /id="character-filter"/);
  assert.match(html, /data-action="open-character"/);
  assert.match(html, /data-action="duplicate-character"/);
  assert.match(html, /data-action="delete-character"/);
  assert.doesNotMatch(html, /data-action="edit-character"/);
  assert.doesNotMatch(html, /overview-grid/);
});

test('les cartes du registre ne proposent plus de bouton de consultation distincte et modification', () => {
  const character = createCharacter({
    id: 'character-card-test',
    identity: { firstName: 'Alaric', lastName: 'Kessel' }
  });
  const html = renderCharacterGrid([character]);

  assert.match(html, /data-action="open-character"/);
  assert.match(html, /aria-label="Ouvrir Alaric Kessel"/);
  assert.doesNotMatch(html, /data-action="edit-character"/);
});

test('la fiche est un formulaire unique en sections, sans dialogue ni parcours de création guidé', async () => {
  const source = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(source, /class="detail-page character-sheet"/);
  assert.match(source, /id="character-form" class="character-form character-sheet-form" novalidate/);
  assert.match(source, /data-sheet-section="\$\{id\}"/);
  for (const section of ['identity', 'species', 'characteristics', 'career', 'religion', 'skills', 'talents', 'experience', 'equipment', 'combat', 'resources', 'notes']) {
    assert.ok(source.includes(`['${section}',`), `section ${section} absente de la fiche`);
  }
  assert.match(source, /function openCharacterSheet\(id\)/);
  assert.match(source, /await saveCharacter\(character\);\s*characters\.push\(character\);\s*setSaveIndicator\('Fiche vierge créée'/);
  assert.match(source, /data-xp-gain-amount/);
  assert.match(source, /data-career-change-career/);
  assert.doesNotMatch(source, /character-dialog|creation-stepper|wizard-next|data-guided=/);
  assert.doesNotMatch(source, /window\.prompt/);
  assert.doesNotMatch(source, /renderCharacterDetail/);
});
