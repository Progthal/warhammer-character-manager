import { createCharacter, createId, getCharacterName, getExperienceAvailable, normalizeCharacter, CHARACTERISTICS } from './models/character.js';
import { deleteCharacter, getAllCharacters, getCharacter, saveCharacter, getAllReferenceEntries, saveReferenceBundle } from './database/indexeddb.js';
import { createBackupExport, createCharacterExport, MAX_IMPORT_SIZE, parseImportPayload, prepareImportedCharacters } from './services/import-export.js';
import {
  MAX_REFERENCE_IMPORT_SIZE, initializeBuiltInReferences,
  createCareerLevel, createCustomReference, exportCustomReferencePack, parseReferencePack,
  prepareImportedReferencePack, saveReferenceEntry, buildReferenceDeleteBundle,
  getCareerLevels, findCareerLevel
} from './services/reference-catalog.js';
import { renderReferencePicker, mountReferencePickers, isDeityCompatibleWithReligion, findReferenceByLegacyValue } from './components/reference-picker.js';
import { getRoute, navigate } from './router.js';
import { renderDashboard, renderCharacterGrid } from './views/dashboard.js';
import { renderCharacterDetail } from './views/character-detail.js';
import { renderReferenceManager, renderReferenceEditor, renderCareerLevelsEditor, filterReferenceCards } from './views/reference-manager.js';
import { escapeHTML } from './utils/format.js';
import { generateCharacteristics } from './rules/characteristic-generator.js';
import { calculateCharacteristics } from './rules/character-calculations.js';
import { applyTheme, toggleTheme } from './services/theme.js';
import { grantExperience, purchaseAdvancement, undoLastPurchase } from './services/progression.js';

const viewRoot = document.querySelector('#view-root');
const modalRoot = document.querySelector('#modal-root');
const toastRegion = document.querySelector('#toast-region');
const saveIndicator = document.querySelector('#save-indicator');
const importInput = document.querySelector('#import-file');
const referenceImportInput = document.querySelector('#reference-import-file');
const filterState = { query: '', sort: 'updated', status: 'all' };

let characters = [];
let referenceEntries = [];
let editorState = null;
let saveTimer;
let editorSaveQueue = Promise.resolve();
let toastTimer;

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastRegion.replaceChildren(toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.remove(), 4200);
}

function setSaveIndicator(message, state = '') {
  saveIndicator.textContent = message;
  saveIndicator.dataset.state = state;
}

function updateConnectionStatus() {
  const status = document.querySelector('#connection-status');
  const online = navigator.onLine;
  status.classList.toggle('is-offline', !online);
  status.querySelector('span:last-child').textContent = online ? 'En ligne' : 'Hors ligne';
}

function updateSidebar() {
  document.querySelector('#sidebar-character-count').textContent = characters.length.toLocaleString('fr-FR');
  const route = getRoute();
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const activeNav = route.name === 'references'
      ? 'references'
      : route.name === 'character' ? 'characters' : 'dashboard';
    link.classList.toggle('is-active', link.dataset.nav === activeNav);
  });
  document.querySelector('#breadcrumb-current').textContent = route.name === 'character'
    ? 'FICHE PERSONNAGE'
    : route.name === 'references' ? 'RÉFÉRENTIELS' : 'TABLEAU DE BORD';
}

function filteredCharacters() {
  const query = filterState.query.trim().toLocaleLowerCase('fr-FR');
  const filtered = characters.filter((character) => {
    if (filterState.status === 'draft' && !character.isDraft) return false;
    if (filterState.status === 'active' && (character.isDraft || character.identity.status !== 'Actif')) return false;
    if (filterState.status === 'paused' && (character.isDraft || character.identity.status !== 'En pause')) return false;
    if (filterState.status === 'inactive' && (character.isDraft || character.identity.status !== 'Inactif')) return false;
    if (!query) return true;
    const haystack = [
      getCharacterName(character), character.identity.species,
      character.identity.career, character.identity.origin
    ].join(' ').toLocaleLowerCase('fr-FR');
    return haystack.includes(query);
  });
  filtered.sort((a, b) => {
    if (filterState.sort === 'name') return getCharacterName(a).localeCompare(getCharacterName(b), 'fr');
    if (filterState.sort === 'experience') return getExperienceAvailable(b) - getExperienceAvailable(a);
    if (filterState.sort === 'species') return (a.identity.species || '').localeCompare(b.identity.species || '', 'fr');
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
  return filtered;
}

function updateCharacterGrid() {
  const grid = document.querySelector('#character-grid');
  if (!grid) return;
  const filtered = filteredCharacters();
  grid.innerHTML = renderCharacterGrid(filtered);
  const count = document.querySelector('#results-count');
  if (count) count.textContent = `${filtered.length} fiche${filtered.length > 1 ? 's' : ''}`;
}

function renderCurrentRoute() {
  updateSidebar();
  const route = getRoute();
  if (route.name === 'references') {
    viewRoot.innerHTML = renderReferenceManager(referenceEntries);
    return;
  }
  if (route.name === 'character') {
    const character = characters.find((item) => item.id === route.id);
    if (!character) {
      viewRoot.innerHTML = `<section class="not-found"><span class="empty-emblem">✧</span><h1>Cette fiche est introuvable</h1><p>Elle a peut-être été supprimée ou déplacée.</p><a class="button button-primary" href="#/">Retour au registre</a></section>`;
      return;
    }
    viewRoot.innerHTML = renderCharacterDetail(character, referenceEntries);
    return;
  }
  viewRoot.innerHTML = renderDashboard(characters);
  filterState.query = '';
  filterState.sort = 'updated';
  filterState.status = 'all';
  const search = document.querySelector('#character-search');
  const sort = document.querySelector('#character-sort');
  const statusFilter = document.querySelector('#character-filter');
  if (search) search.value = filterState.query;
  if (sort) sort.value = filterState.sort;
  if (statusFilter) statusFilter.value = filterState.status;
}

async function refreshCharacters({ render = true } = {}) {
  characters = await getAllCharacters();
  if (render) renderCurrentRoute();
  else updateSidebar();
}

function field(label, name, value, options = {}) {
  const { type = 'text', placeholder = '', wide = false, min, max, step } = options;
  const attributes = [min !== undefined ? `min="${min}"` : '', max !== undefined ? `max="${max}"` : '', step !== undefined ? `step="${step}"` : ''].filter(Boolean).join(' ');
  const className = wide ? 'form-field form-field-wide' : 'form-field';
  return `<label class="${className}"><span>${label}</span><input type="${type}" name="${name}" value="${escapeHTML(value ?? '')}" placeholder="${escapeHTML(placeholder)}" ${attributes}></label>`;
}

function textareaField(label, name, value, placeholder = '') {
  return `<label class="form-field form-field-wide"><span>${label}</span><textarea name="${name}" rows="3" placeholder="${escapeHTML(placeholder)}">${escapeHTML(value || '')}</textarea></label>`;
}

function selectField(label, name, value, options) {
  const optionsHTML = options.map((option) => `<option value="${escapeHTML(option)}" ${value === option ? 'selected' : ''}>${escapeHTML(option || 'À définir')}</option>`).join('');
  return `<label class="form-field"><span>${label}</span><select name="${name}">${optionsHTML}</select></label>`;
}

function speciesSelectField(value) {
  const allSpecies = referenceEntries
    .filter((entry) => entry.kind === 'species')
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const speciesByName = new Map();
  for (const entry of allSpecies) {
    const normalizedName = entry.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR');
    const current = speciesByName.get(normalizedName);
    if (!current || (current.source === 'builtin' && entry.source !== 'builtin')) speciesByName.set(normalizedName, entry);
  }
  const species = [...speciesByName.values()];
  const options = ['<option value="">À définir</option>', ...species.map((entry) => (
    `<option value="${escapeHTML(entry.name)}" ${value === entry.name ? 'selected' : ''}>${escapeHTML(entry.name)}${entry.source === 'pack' ? ' · pack importé' : entry.source === 'custom' ? ' · personnalisé' : entry.customized ? ' · ajusté' : ''}</option>`
  ))];
  if (value && !species.some((entry) => entry.name === value)) {
    options.push(`<option value="${escapeHTML(value)}" selected>${escapeHTML(value)} · valeur existante</option>`);
  }
  return `<label class="form-field"><span>Espèce</span><select name="identity.species">${options.join('')}</select></label>`;
}

function careerLevelField(identity, selectedCareer) {
  const levels = getCareerLevels(selectedCareer);
  const current = identity.careerLevel || '';
  const selectedLevel = findCareerLevel(selectedCareer, identity.careerLevelId, current);
  const unmatchedCurrent = current && !selectedLevel;
  const options = [
    `<option value="" ${selectedLevel ? '' : 'selected'}>${unmatchedCurrent ? `Ancienne valeur à réassocier : ${escapeHTML(current)}` : 'À définir'}</option>`,
    ...levels.map((level) => `<option value="${escapeHTML(level.id)}" ${selectedLevel?.id === level.id ? 'selected' : ''}>${escapeHTML(level.rank)} · ${escapeHTML(level.name)}</option>`)
  ].join('');
  const disabled = selectedCareer && levels.length ? '' : 'disabled';
  const hint = !selectedCareer
    ? 'Sélectionnez une carrière pour consulter ses niveaux.'
    : unmatchedCurrent
      ? `L’ancienne valeur « ${current} » est conservée. Choisissez un niveau pour la réassocier.`
      : levels.length
        ? 'Choisissez un niveau. Son identifiant stable sera enregistré dans la fiche.'
        : 'Aucun niveau vérifié n’est renseigné pour cette carrière. Ajoutez les informations depuis les Référentiels.';
  return `<div class="form-field career-level-field"><span>Niveau de carrière</span><select id="career-level-select" ${disabled}>${options}</select><input type="hidden" id="career-level-value" name="identity.careerLevel" value="${escapeHTML(current)}"><input type="hidden" id="career-level-id" name="identity.careerLevelId" value="${escapeHTML(selectedLevel?.id || identity.careerLevelId || '')}"><small class="form-hint" id="career-level-hint">${escapeHTML(hint)}</small>${selectedCareer && !levels.length ? '<button type="button" class="text-button" data-action="open-references">Ouvrir les Référentiels</button>' : ''}</div>`;
}

function careerPreviewMarkup(career, selectedLevel = null) {
  if (!career) return '<p class="career-preview-empty">Sélectionnez une carrière pour afficher sa fiche.</p>';
  const details = [
    career.className ? `<span><strong>Classe :</strong> ${escapeHTML(career.className)}</span>` : '',
    selectedLevel ? `<span><strong>Niveau ${escapeHTML(selectedLevel.rank)} :</strong> ${escapeHTML(selectedLevel.name)}</span>` : career.levels?.length ? `<span><strong>Niveaux :</strong> ${escapeHTML(getCareerLevels(career).map((level) => level.name).join(' · '))}</span>` : '',
    ...((selectedLevel?.skills || career.skills || []).length ? [`<span><strong>Compétences :</strong> ${escapeHTML((selectedLevel?.skills || career.skills).join(' · '))}</span>`] : []),
    ...((selectedLevel?.talents || career.talents || []).length ? [`<span><strong>Talents :</strong> ${escapeHTML((selectedLevel?.talents || career.talents).join(' · '))}</span>`] : []),
    ...((selectedLevel?.advancements || career.advancements || []).length ? [`<span><strong>Avancements :</strong> ${escapeHTML((selectedLevel?.advancements || career.advancements).join(' · '))}</span>`] : []),
    ...((selectedLevel?.entryConditions || career.entryConditions || []).length ? [`<span><strong>Conditions d’accès :</strong> ${escapeHTML((selectedLevel?.entryConditions || career.entryConditions).join(' · '))}</span>`] : []),
    ...((selectedLevel?.exitConditions || career.exitConditions || []).length ? [`<span><strong>Conditions de sortie :</strong> ${escapeHTML((selectedLevel?.exitConditions || career.exitConditions).join(' · '))}</span>`] : []),
    ...((selectedLevel?.equipment || career.equipment || []).length ? [`<span><strong>Équipement :</strong> ${escapeHTML((selectedLevel?.equipment || career.equipment).join(' · '))}</span>`] : []),
    selectedLevel?.description ? `<span><strong>Description :</strong> ${escapeHTML(selectedLevel.description)}</span>` : '',
    selectedLevel?.additionalInformation ? `<span><strong>Informations :</strong> ${escapeHTML(selectedLevel.additionalInformation)}</span>` : ''
  ].filter(Boolean).join('');
  return `<div class="career-preview-content">${career.description ? `<p>${escapeHTML(career.description)}</p>` : ''}${details ? `<div>${details}</div>` : '<small>Cette carrière ne contient pas encore de détails vérifiés. Vous pouvez les compléter depuis les Référentiels.</small>'}</div>`;
}

function characteristicEditorMarkup(character) {
  const calculated = calculateCharacteristics(character);
  const rows = CHARACTERISTICS.map(({ key, label, shortLabel }) => {
    const stat = calculated[key];
    return `<tr data-characteristic-row data-key="${key}">
      <th scope="row"><abbr title="${escapeHTML(label)}">${escapeHTML(shortLabel)}</abbr><span>${escapeHTML(label)}</span></th>
      <td><input type="number" min="0" max="999" step="1" name="characteristics.${key}" value="${escapeHTML(character.characteristics[key] ?? '')}" aria-label="${escapeHTML(label)} valeur initiale" data-stat-initial></td>
      <td><output data-stat-talent>${stat.talentBonus}</output></td>
      <td><input type="number" min="0" max="999" step="1" name="characteristicAdvances.${key}" value="${escapeHTML(character.characteristicAdvances?.[key] ?? 0)}" aria-label="${escapeHTML(label)} augmentations" data-stat-advances></td>
      <td><output class="calculated-value" data-stat-current>${stat.current ?? '—'}</output></td>
      <td><output class="calculated-bonus" data-stat-bonus>${stat.bonus ?? '—'}</output></td>
      <td><input class="cost-input" type="number" min="1" max="9999" step="1" name="characteristicAdvancementCosts.${key}" value="${escapeHTML(character.characteristicAdvancementCosts?.[key] ?? '')}" placeholder="—" aria-label="Coût configuré de l’augmentation ${shortLabel}" title="Coût configuré depuis votre source de règles"></td>
    </tr>`;
  }).join('');
  return `<div class="responsive-table editor-table-wrap"><table class="data-table characteristic-editor-table"><thead><tr><th>Caractéristique</th><th>Initiale</th><th>Talents</th><th>Augm.</th><th>Actuelle</th><th>Bonus</th><th>Coût XP / +1</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderSkillEditorRow(skill = {}) {
  const characteristicOptions = ['<option value="">—</option>', ...CHARACTERISTICS.map(({ key, shortLabel }) => (
    `<option value="${key}" ${skill.characteristic === key ? 'selected' : ''}>${shortLabel}</option>`
  ))].join('');
  return `<div class="editor-list-row skill-editor-row" data-item-row data-collection="skills" data-item-id="${escapeHTML(skill.id || createId())}">
    <label><span>Compétence</span><input data-collection-field="name" value="${escapeHTML(skill.name || '')}" maxlength="160"></label>
    <label><span>Carac.</span><select data-collection-field="characteristic">${characteristicOptions}</select></label>
    <label><span>Base manuelle</span><input type="number" min="0" max="999" data-collection-field="baseValue" value="${escapeHTML(skill.baseValue ?? '')}" placeholder="Carac."></label>
    <label><span>Avanc.</span><input type="number" min="0" max="999" data-collection-field="advances" value="${escapeHTML(skill.advances ?? 0)}"></label>
    <label><span>Coût XP / +1</span><input type="number" min="1" max="9999" data-collection-field="advancementCost" value="${escapeHTML(skill.advancementCost ?? '')}" placeholder="—"></label>
    <label class="inline-check"><input type="checkbox" data-collection-field="useCharacteristicBase" ${skill.useCharacteristicBase !== false ? 'checked' : ''}><span>Base = caractéristique</span></label>
    <label class="inline-check"><input type="checkbox" data-collection-field="career" ${skill.career ? 'checked' : ''}><span>Compétence de carrière</span></label>
    <button type="button" class="icon-button danger-button" data-collection-action="remove" aria-label="Supprimer cette compétence" title="Supprimer">×</button>
  </div>`;
}

function renderTalentEditorRow(talent = {}) {
  const effect = (talent.effects || []).find((item) => item.type === 'characteristicBonus') || {};
  const characteristicOptions = ['<option value="">—</option>', ...CHARACTERISTICS.map(({ key, shortLabel }) => (
    `<option value="${key}" ${effect.characteristic === key ? 'selected' : ''}>${shortLabel}</option>`
  ))].join('');
  return `<div class="editor-list-row talent-editor-row" data-item-row data-collection="talents" data-item-id="${escapeHTML(talent.id || createId())}">
    <label><span>Talent</span><input data-collection-field="name" value="${escapeHTML(talent.name || '')}" maxlength="160"></label>
    <label><span>Rang</span><input type="number" min="1" max="999" data-collection-field="rank" value="${escapeHTML(talent.rank ?? 1)}"></label>
    <label><span>Coût XP / rang</span><input type="number" min="1" max="9999" data-collection-field="advancementCost" value="${escapeHTML(talent.advancementCost ?? '')}" placeholder="—"></label>
    <label><span>Bonus caractéristique</span><select data-collection-field="effectCharacteristic">${characteristicOptions}</select></label>
    <label><span>Valeur</span><input type="number" min="0" max="999" data-collection-field="effectValue" value="${escapeHTML(effect.value ?? 0)}"></label>
    <label class="inline-check"><input type="checkbox" data-collection-field="effectVerified" ${effect.verified ? 'checked' : ''}><span>Effet vérifié</span></label>
    <label class="talent-description"><span>Description / référence</span><input data-collection-field="description" value="${escapeHTML(talent.description || '')}" maxlength="3000"></label>
    <label class="talent-description"><span>Référence de règle pour l’effet</span><input data-collection-field="effectReference" value="${escapeHTML(effect.reference || '')}" maxlength="500" placeholder="Livre, page, errata…"></label>
    <button type="button" class="icon-button danger-button" data-collection-action="remove" aria-label="Supprimer ce talent" title="Supprimer">×</button>
  </div>`;
}

function renderEquipmentEditorRow(item = {}, category = 'possessions') {
  const firstLabel = category === 'armour' ? 'Localisation' : 'Type';
  const secondLabel = category === 'weapons' ? 'Dégâts' : category === 'armour' ? 'Points d’armure' : 'Détails';
  const secondValue = category === 'weapons' ? item.damage || '' : category === 'armour' ? item.armourPoints ?? '' : item.qualities || item.description || '';
  return `<div class="editor-list-row equipment-editor-row" data-item-row data-collection="${category}" data-item-id="${escapeHTML(item.id || createId())}">
    <label><span>Nom</span><input data-collection-field="name" value="${escapeHTML(item.name || '')}" maxlength="160"></label>
    <label><span>${firstLabel}</span><input data-collection-field="type" value="${escapeHTML(item.type || item.location || '')}" maxlength="100"></label>
    <label><span>${secondLabel}</span><input data-collection-field="details" value="${escapeHTML(secondValue)}" maxlength="500"></label>
    <label><span>Quantité</span><input type="number" min="1" max="999" data-collection-field="quantity" value="${escapeHTML(item.quantity ?? 1)}"></label>
    <label><span>Encombrement</span><input type="number" min="0" max="9999" step="any" data-collection-field="encumbrance" value="${escapeHTML(item.encumbrance ?? 0)}"></label>
    <button type="button" class="icon-button danger-button" data-collection-action="remove" aria-label="Supprimer cet objet" title="Supprimer">×</button>
  </div>`;
}

function renderCollectionSection(title, collection, entries, rowRenderer, description = '') {
  const rows = entries.length ? entries.map((entry) => rowRenderer(entry, collection)).join('') : '<p class="collection-empty">Aucune entrée. Utilisez le bouton pour en ajouter une.</p>';
  return `<div class="editor-collection"><div class="editor-collection-heading"><div><h4>${title}</h4>${description ? `<p>${description}</p>` : ''}</div><button type="button" class="button button-outline button-small" data-collection-action="add" data-collection="${collection}">＋ Ajouter</button></div><div class="editor-collection-rows" id="collection-${collection}" data-collection="${collection}">${rows}</div></div>`;
}

function readEditorCollection(form, collection) {
  return [...form.querySelectorAll(`[data-item-row][data-collection="${collection}"]`)].map((row) => {
    const read = (fieldName) => row.querySelector(`[data-collection-field="${fieldName}"]`);
    const value = (fieldName) => read(fieldName)?.value?.trim() || '';
    const number = (fieldName) => {
      const raw = value(fieldName);
      return raw === '' ? null : Number(raw);
    };
    const checkbox = (fieldName) => Boolean(read(fieldName)?.checked);
    if (collection === 'skills') return {
      id: row.dataset.itemId || createId(), name: value('name'), characteristic: value('characteristic'),
      baseValue: number('baseValue'), useCharacteristicBase: checkbox('useCharacteristicBase'),
      advances: number('advances') ?? 0, advancementCost: number('advancementCost'), career: checkbox('career')
    };
    if (collection === 'talents') {
      const effectCharacteristic = value('effectCharacteristic');
      const effects = effectCharacteristic ? [{
        type: 'characteristicBonus', characteristic: effectCharacteristic,
        value: number('effectValue') ?? 0, verified: checkbox('effectVerified'), reference: value('effectReference')
      }] : [];
      return {
        id: row.dataset.itemId || createId(), name: value('name'), rank: number('rank') ?? 1,
        description: value('description'), advancementCost: number('advancementCost'), effects
      };
    }
    const detail = value('details');
    const item = {
      id: row.dataset.itemId || createId(), name: value('name'), type: value('type'),
      quantity: number('quantity') ?? 1, encumbrance: number('encumbrance') ?? 0
    };
    if (collection === 'armour') { item.location = item.type; item.armourPoints = detail === '' ? null : Number(detail); }
    else if (collection === 'weapons') item.damage = detail;
    else item.qualities = detail;
    return item;
  }).filter((entry) => entry.name);
}

function updateCharacteristicPreviews(form) {
  if (!form) return;
  const talentBonuses = Object.fromEntries(CHARACTERISTICS.map(({ key }) => [key, 0]));
  for (const row of form.querySelectorAll('[data-item-row][data-collection="talents"]')) {
    const verified = row.querySelector('[data-collection-field="effectVerified"]')?.checked;
    const key = row.querySelector('[data-collection-field="effectCharacteristic"]')?.value;
    const value = Number(row.querySelector('[data-collection-field="effectValue"]')?.value || 0);
    const reference = row.querySelector('[data-collection-field="effectReference"]')?.value?.trim();
    if (verified && reference && Object.hasOwn(talentBonuses, key) && Number.isFinite(value)) talentBonuses[key] += value;
  }
  for (const { key } of CHARACTERISTICS) {
    const row = form.querySelector(`[data-characteristic-row][data-key="${key}"]`);
    if (!row) continue;
    const initialRaw = row.querySelector('[data-stat-initial]')?.value;
    const initial = initialRaw === '' ? null : Number(initialRaw);
    const advances = Math.max(0, Number(row.querySelector('[data-stat-advances]')?.value || 0));
    const talentBonus = talentBonuses[key];
    const current = initial === null || !Number.isFinite(initial) ? null : initial + advances + talentBonus;
    row.querySelector('[data-stat-talent]').textContent = talentBonus;
    row.querySelector('[data-stat-current]').textContent = current ?? '—';
    row.querySelector('[data-stat-bonus]').textContent = current === null ? '—' : Math.floor(current / 10);
  }
}

function characteristicGenerationPreviewMarkup(result) {
  const rows = CHARACTERISTICS.map(({ key, label }) => {
    const detail = result.details[key];
    return `<tr><th scope="row"><span>${escapeHTML(key)}</span> ${escapeHTML(label)}</th><td>${detail.dice.join(' + ')} = ${detail.diceTotal}</td><td>+${detail.modifier}</td><td>${detail.minimum}–${detail.maximum}</td><td><strong>${detail.total}</strong></td></tr>`;
  }).join('');
  return `<div class="characteristic-preview-card">
    <div class="characteristic-preview-heading"><div><strong>Aperçu de génération · ${escapeHTML(result.species)}</strong><small>Étape 1 : 2d10 + modificateur d’espèce, appliqué une seule fois.</small></div><span>NON ENREGISTRÉ</span></div>
    <div class="characteristic-preview-table-wrap"><table class="characteristic-preview-table"><thead><tr><th>Caractéristique</th><th>Jet 2d10</th><th>Mod.</th><th>Plage</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="form-hint">Plage naturelle du jet : minimum 2 + modificateur, maximum 20 + modificateur. Les valeurs actuelles restent intactes tant que vous ne confirmez pas cet aperçu. Une nouvelle génération remplacera uniquement cet aperçu ; l’XP n’est pas modifiée.</p>
    <div class="characteristic-preview-actions"><button type="button" class="button button-quiet" data-action="cancel-characteristics">Annuler</button><button type="button" class="button button-outline" data-action="reroll-characteristics">↻ Relancer</button><button type="button" class="button button-primary" data-action="confirm-characteristics">Confirmer les valeurs</button></div>
  </div>`;
}

function clearCharacteristicGenerationPreview() {
  if (editorState) editorState.characteristicPreview = null;
  const preview = document.querySelector('#characteristic-generation-preview');
  if (preview) {
    preview.hidden = true;
    preview.replaceChildren();
  }
}

function generateCharacteristicPreview() {
  const form = document.querySelector('#character-form');
  const speciesField = form?.querySelector('[name="identity.species"]');
  const species = speciesField?.value || '';
  if (!species) {
    showToast('Choisissez une espèce avant de générer les caractéristiques.', 'error');
    speciesField?.focus();
    return;
  }

  const hasExistingValues = CHARACTERISTICS.some(({ key }) => (
    form.querySelector(`[name="characteristics.${key}"]`)?.value !== ''
  ));
  if (hasExistingValues && !editorState?.characteristicPreview && !window.confirm('Des caractéristiques sont déjà renseignées. Vous pourrez les remplacer en confirmant le nouvel aperçu. Continuer la génération ?')) return;

  try {
    const profiles = referenceEntries.filter((entry) => entry.kind === 'species');
    const result = generateCharacteristics(species, profiles);
    editorState.characteristicPreview = result;
    const preview = document.querySelector('#characteristic-generation-preview');
    preview.innerHTML = characteristicGenerationPreviewMarkup(result);
    preview.hidden = false;
  } catch (error) {
    clearCharacteristicGenerationPreview();
    showToast(error.message || 'Impossible de générer les caractéristiques.', 'error');
  }
}

function confirmCharacteristicPreview() {
  const result = editorState?.characteristicPreview;
  const form = document.querySelector('#character-form');
  if (!result || !form) return;
  const selectedSpecies = form.querySelector('[name="identity.species"]')?.value || '';
  if (selectedSpecies !== result.requestedSpecies) {
    clearCharacteristicGenerationPreview();
    showToast('L’espèce a changé. Relancez la génération avant de confirmer.', 'error');
    return;
  }

  for (const { key } of CHARACTERISTICS) {
    const input = form.querySelector(`[name="characteristics.${key}"]`);
    if (input) input.value = String(result.characteristics[key]);
  }
  clearCharacteristicGenerationPreview();
  scheduleEditorSave();
  showToast('Les dix caractéristiques ont été appliquées. Elles restent modifiables.');
}

function renderEditor(character) {
  const { identity, characteristics, secondary, experience, profile } = character;
  const selectedCareer = findReferenceByLegacyValue(referenceEntries, 'careers', identity.careerId, identity.career);
  const selectedLevel = findCareerLevel(selectedCareer, identity.careerLevelId, identity.careerLevel);
  return `
    <dialog class="editor-dialog" id="character-dialog" aria-labelledby="editor-title">
      <div class="editor-shell">
        <header class="editor-header"><div><div class="eyebrow"><span class="eyebrow-line"></span> REGISTRE PERSONNEL</div><h2 id="editor-title">${character.isDraft ? 'Nouvelle fiche' : 'Modifier le personnage'}</h2><p>Les modifications sont enregistrées automatiquement sur cet appareil.</p></div><button type="button" class="dialog-close" data-action="close-editor" aria-label="Fermer">×</button></header>
        <form id="character-form" class="character-form">
          <section class="form-section"><div class="form-section-title"><span>01</span><div><h3>Identité</h3><p>Les traits qui définissent votre personnage.</p></div></div>
            <div class="form-grid">
              ${field('Prénom', 'identity.firstName', identity.firstName, { placeholder: 'Ex. : Alaric' })}
              ${field('Nom', 'identity.lastName', identity.lastName, { placeholder: 'Ex. : von Kessel' })}
              ${speciesSelectField(identity.species)}
              ${field('Genre', 'identity.gender', identity.gender, { placeholder: 'Facultatif' })}
              ${field('Âge', 'identity.age', identity.age, { type: 'number', min: 0, max: 999 })}
              ${field('Origine', 'identity.origin', identity.origin, { placeholder: 'Ville, province…' })}
              ${field('Taille', 'identity.height', identity.height, { placeholder: 'Ex. : 1,78 m' })}
              ${field('Poids', 'identity.weight', identity.weight, { placeholder: 'Ex. : 75 kg' })}
              ${field('Couleur des yeux', 'identity.eyeColor', identity.eyeColor)}
              ${field('Couleur des cheveux', 'identity.hairColor', identity.hairColor)}
              ${renderReferencePicker({ kind: 'religions', entries: referenceEntries, selectedId: identity.religionId, value: identity.religion })}
              ${renderReferencePicker({ kind: 'deities', entries: referenceEntries, selectedId: identity.deityId, value: identity.deity })}
            </div>
          </section>

          <section class="form-section"><div class="form-section-title"><span>02</span><div><h3>Carrière et expérience</h3><p>Votre voie et votre progression personnelle.</p></div></div>
            <div class="form-grid">
              ${renderReferencePicker({ kind: 'careers', entries: referenceEntries, selectedId: identity.careerId, value: identity.career })}
              ${careerLevelField(identity, selectedCareer)}
              <div class="career-preview form-field-wide" id="career-preview">${careerPreviewMarkup(selectedCareer, selectedLevel)}</div>
              ${selectField('Statut', 'identity.status', identity.status, ['Actif', 'En pause', 'Inactif'])}
              <div class="experience-input-group">${field('Expérience totale', 'experience.total', experience.total, { type: 'number', min: 0 })}<button type="button" class="button button-outline button-small" data-action="grant-experience">＋ Ajouter un gain XP</button></div>
              ${field('Expérience dépensée', 'experience.spent', experience.spent, { type: 'number', min: 0 })}
            </div>
          </section>

          <section class="form-section"><div class="form-section-title"><span>03</span><div class="characteristic-section-heading"><div><h3>Caractéristiques principales</h3><p>Valeur initiale, effets de talents, augmentations et valeur actuelle.</p></div><button type="button" class="characteristic-generator-trigger" data-action="generate-characteristics" title="Générer les caractéristiques aléatoirement" aria-label="Générer les caractéristiques aléatoirement"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8" cy="8" r="1.25"/><circle cx="16" cy="8" r="1.25"/><circle cx="8" cy="12" r="1.25"/><circle cx="16" cy="12" r="1.25"/><circle cx="8" cy="16" r="1.25"/><circle cx="16" cy="16" r="1.25"/></svg></button></div></div>${characteristicEditorMarkup(character)}<div id="characteristic-generation-preview" class="form-field-wide" hidden></div><p class="form-hint">Le bonus est calculé avec le chiffre des dizaines. Les effets de talents sont pris en compte uniquement lorsqu’ils sont configurés et marqués comme vérifiés. Le coût XP par +1 reste à renseigner depuis votre source de règles ; aucun barème n’est présumé.</p></section>

          <section class="form-section"><div class="form-section-title"><span>04</span><div><h3>Caractéristiques secondaires</h3><p>Ressources et valeurs complémentaires.</p></div></div>
            <div class="form-grid form-grid-stats">
              ${field('Mouvement', 'secondary.movement', secondary.movement, { type: 'number', min: 0 })}
              ${field('Blessures actuelles', 'secondary.woundsCurrent', secondary.woundsCurrent, { type: 'number', min: 0 })}
              ${field('Blessures maximales', 'secondary.woundsMax', secondary.woundsMax, { type: 'number', min: 0 })}
              ${field('Résistance', 'secondary.resistance', secondary.resistance, { type: 'number', min: 0 })}
              ${field('Bonus de Force', 'secondary.strengthBonus', secondary.strengthBonus, { type: 'number', min: 0 })}
              ${field('Bonus d’Endurance', 'secondary.enduranceBonus', secondary.enduranceBonus, { type: 'number', min: 0 })}
              ${field('Points de destin', 'secondary.fate', secondary.fate, { type: 'number', min: 0 })}
              ${field('Points de chance', 'secondary.fortune', secondary.fortune, { type: 'number', min: 0 })}
              ${field('Résilience', 'secondary.resilience', secondary.resilience, { type: 'number', min: 0 })}
              ${field('Motivation', 'secondary.resolve', secondary.resolve, { type: 'number', min: 0 })}
            </div>
          </section>

          <section class="form-section"><div class="form-section-title"><span>05</span><div><h3>Compétences et talents</h3><p>Les valeurs de compétences sont dérivées des caractéristiques associées et des avancements.</p></div></div>
            ${renderCollectionSection('Compétences', 'skills', character.skills || [], renderSkillEditorRow, 'Cochez « Base = caractéristique » pour utiliser la valeur actuelle de la caractéristique choisie.')}
            ${renderCollectionSection('Talents', 'talents', character.talents || [], renderTalentEditorRow, 'Un effet mécanique doit être structuré, référencé et marqué comme vérifié avant son application.')}
          </section>

          <section class="form-section"><div class="form-section-title"><span>06</span><div><h3>Équipement et possessions</h3><p>Renseignez l’encombrement unitaire de chaque objet ; les quantités sont prises en compte.</p></div></div>
            ${renderCollectionSection('Armes', 'weapons', character.equipment?.weapons || [], renderEquipmentEditorRow)}
            ${renderCollectionSection('Armures', 'armour', character.equipment?.armour || [], renderEquipmentEditorRow)}
            ${renderCollectionSection('Objets et possessions', 'possessions', character.equipment?.possessions || [], renderEquipmentEditorRow)}
            ${renderCollectionSection('Sorts', 'spells', character.equipment?.spells || [], renderEquipmentEditorRow)}
            ${renderCollectionSection('Prières', 'prayers', character.equipment?.prayers || [], renderEquipmentEditorRow)}
          </section>

          <section class="form-section"><div class="form-section-title"><span>07</span><div><h3>Paramètres et ressources</h3><p>Seuils et capacités configurables ; aucune formule non vérifiée n’est appliquée automatiquement.</p></div></div>
            <div class="form-grid">
              ${field('Points de corruption', 'resources.corruptionPoints', character.resources?.corruptionPoints ?? 0, { type: 'number', min: 0 })}
              ${field('Seuil de corruption', 'rules.corruptionThreshold', character.rules?.corruptionThreshold, { type: 'number', min: 0 })}
              ${field('Capacité d’encombrement', 'rules.encumbranceCapacity', character.rules?.encumbranceCapacity, { type: 'number', min: 0, step: 'any' })}
            </div>
            <p class="form-hint">La capacité et le seuil sont des paramètres explicites de cette fiche. Ils ne sont pas calculés à partir de formules présumées.</p>
          </section>

          <section class="form-section"><div class="form-section-title"><span>08</span><div><h3>Chronique personnelle</h3><p>Gardez une trace de son histoire et de ses ambitions.</p></div></div>
            <div class="form-grid">${textareaField('Description physique', 'profile.description', profile.description, 'Apparence, signes distinctifs…')}${textareaField('Histoire personnelle', 'profile.history', profile.history, 'Origines, événements marquants…')}${textareaField('Objectifs', 'profile.goals', profile.goals, 'Ce que votre personnage cherche à accomplir…')}${textareaField('Notes personnelles', 'profile.notes', profile.notes, 'Informations libres…')}</div>
          </section>

          <footer class="editor-footer"><span class="autosave-state" id="autosave-state"><i></i> Enregistré sur cet appareil</span><div><button type="button" class="button button-quiet" data-action="close-editor">Fermer</button><button type="submit" class="button button-primary">Enregistrer et terminer <span aria-hidden="true">→</span></button></div></footer>
        </form>
      </div>
    </dialog>`;
}

function setNestedValue(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  while (parts.length > 1) {
    const part = parts.shift();
    cursor[part] ??= {};
    cursor = cursor[part];
  }
  cursor[parts[0]] = value;
}

function collectEditorValues() {
  const form = document.querySelector('#character-form');
  const candidate = clone(editorState.character);
  for (const [name, rawValue] of new FormData(form)) {
    const control = [...form.elements].find((element) => element.name === name);
    const value = control?.type === 'number' ? (rawValue === '' ? null : Number(rawValue)) : rawValue;
    setNestedValue(candidate, name, value);
  }
  candidate.skills = readEditorCollection(form, 'skills');
  candidate.talents = readEditorCollection(form, 'talents');
  candidate.equipment = {
    weapons: readEditorCollection(form, 'weapons'),
    armour: readEditorCollection(form, 'armour'),
    possessions: readEditorCollection(form, 'possessions'),
    spells: readEditorCollection(form, 'spells'),
    prayers: readEditorCollection(form, 'prayers')
  };
  candidate.updatedAt = new Date().toISOString();
  return normalizeCharacter(candidate);
}

function updateAutosaveState(message, state = '') {
  const element = document.querySelector('#autosave-state');
  if (!element) return;
  element.innerHTML = `<i></i> ${escapeHTML(message)}`;
  element.dataset.state = state;
}

function queueEditorSave(complete = false) {
  const state = editorState;
  if (!state) return Promise.resolve();
  const operation = editorSaveQueue.then(async () => {
    if (editorState !== state) return;
    const candidate = collectEditorValues();
    if (complete) candidate.isDraft = false;
    await saveCharacter(candidate);
    state.character = candidate;
    const index = characters.findIndex((item) => item.id === candidate.id);
    if (index >= 0) characters[index] = candidate;
    else characters.push(candidate);
    setSaveIndicator('Enregistré sur cet appareil', 'saved');
    updateAutosaveState('Enregistré sur cet appareil', 'saved');
    updateSidebar();
  });
  editorSaveQueue = operation.catch(() => undefined);
  return operation;
}

function scheduleEditorSave() {
  updateAutosaveState('Enregistrement des modifications…', 'pending');
  setSaveIndicator('Modifications en attente…', 'pending');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    queueEditorSave().catch((error) => {
      updateAutosaveState('Échec de la sauvegarde', 'error');
      setSaveIndicator('Erreur de sauvegarde', 'error');
      showToast(error.message || 'Impossible d’enregistrer cette fiche.', 'error');
    });
  }, 450);
}

async function closeEditor() {
  if (!editorState) return;
  clearTimeout(saveTimer);
  try {
    await queueEditorSave();
    const dialog = document.querySelector('#character-dialog');
    if (dialog?.open) dialog.close();
    else modalRoot.replaceChildren();
    editorState = null;
    await refreshCharacters();
  } catch (error) {
    showToast(error.message || 'La sauvegarde a échoué.', 'error');
  }
}

async function openEditor(character) {
  editorState = { character: clone(character) };
  modalRoot.innerHTML = renderEditor(character);
  const dialog = document.querySelector('#character-dialog');
  dialog.addEventListener('close', () => {
    editorState = null;
    modalRoot.replaceChildren();
    refreshCharacters().catch((error) => showToast(error.message, 'error'));
  }, { once: true });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeEditor();
  });
  const form = document.querySelector('#character-form');
  let pickers;
  pickers = mountReferencePickers(form, referenceEntries, {
    onChange(kind, entry, previous) {
      if (kind === 'religions') {
        const currentDeity = pickers.getSelection('deities');
        const incompatible = Boolean(entry && currentDeity?.value && currentDeity?.entry && !isDeityCompatibleWithReligion(currentDeity.entry, entry));
        const legacyUnresolved = Boolean(entry && currentDeity?.value && !currentDeity?.id);
        if (incompatible || legacyUnresolved) {
          const deityName = currentDeity.entry?.name || currentDeity.value;
          const message = incompatible
            ? `La divinité « ${deityName} » n’est pas associée à « ${entry.name} ».`
            : `La divinité historique « ${deityName} » ne peut pas être vérifiée dans le référentiel.`;
          const accepted = window.confirm(`${message}\n\nEffacer cette valeur pour en choisir une nouvelle ?`);
          if (!accepted) return false;
          pickers.setSelection('deities', '');
        }
        pickers.refresh();
      }
      if (kind === 'careers') updateCareerLevelOptions(entry, previous);
      return true;
    }
  });
  form.addEventListener('input', (event) => {
    if (event.target.name === 'identity.species' || event.target.name?.startsWith('characteristics.')) {
      clearCharacteristicGenerationPreview();
    }
    if (event.target.closest('[data-item-row]') || event.target.matches('[data-stat-initial], [data-stat-advances]')) {
      updateCharacteristicPreviews(form);
    }
    scheduleEditorSave();
  });
  form.addEventListener('click', (event) => {
    const button = event.target.closest('[data-collection-action]');
    if (!button) return;
    const action = button.dataset.collectionAction;
    const collection = button.dataset.collection || button.closest('[data-item-row]')?.dataset.collection;
    if (action === 'remove') {
      button.closest('[data-item-row]')?.remove();
    } else if (action === 'add' && collection) {
      const container = form.querySelector(`#collection-${collection}`);
      if (!container) return;
      container.querySelector('.collection-empty')?.remove();
      const templates = {
        skills: () => renderSkillEditorRow({ id: createId(), useCharacteristicBase: true, advances: 0 }),
        talents: () => renderTalentEditorRow({ id: createId(), rank: 1 }),
        weapons: () => renderEquipmentEditorRow({ id: createId(), quantity: 1 }, 'weapons'),
        armour: () => renderEquipmentEditorRow({ id: createId(), quantity: 1 }, 'armour'),
        possessions: () => renderEquipmentEditorRow({ id: createId(), quantity: 1 }, 'possessions'),
        spells: () => renderEquipmentEditorRow({ id: createId(), quantity: 1 }, 'spells'),
        prayers: () => renderEquipmentEditorRow({ id: createId(), quantity: 1 }, 'prayers')
      };
      if (!templates[collection]) return;
      container.insertAdjacentHTML('beforeend', templates[collection]());
      container.querySelector('[data-item-row]:last-child [data-collection-field="name"]')?.focus();
    }
    updateCharacteristicPreviews(form);
    scheduleEditorSave();
  });
  form.addEventListener('change', (event) => {
    if (event.target.name === 'identity.species') clearCharacteristicGenerationPreview();
    if (event.target.id === 'career-level-select') {
      const careerId = form.querySelector('[data-reference-picker="careers"] [data-picker-id]')?.value || '';
      const career = referenceEntries.find((entry) => entry.kind === 'careers' && entry.id === careerId);
      const level = getCareerLevels(career).find((item) => item.id === event.target.value);
      document.querySelector('#career-level-id').value = level?.id || '';
      document.querySelector('#career-level-value').value = level?.name || '';
      const preview = document.querySelector('#career-preview');
      if (preview) preview.innerHTML = careerPreviewMarkup(career, level);
    }
    updateCharacteristicPreviews(form);
    scheduleEditorSave();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearTimeout(saveTimer);
    try {
      await queueEditorSave(true);
      const id = editorState.character.id;
      if (dialog.open) dialog.close('saved');
      navigate(`/character/${encodeURIComponent(id)}`);
      showToast('Personnage enregistré.');
    } catch (error) {
      updateAutosaveState('Échec de la sauvegarde', 'error');
      showToast(error.message || 'Impossible d’enregistrer cette fiche.', 'error');
    }
  });
  dialog.showModal();
  updateCharacteristicPreviews(form);
  dialog.querySelector('.reference-picker-input')?.focus();
}

function updateCareerLevelOptions(career, previousCareer) {
  const select = document.querySelector('#career-level-select');
  const hidden = document.querySelector('#career-level-value');
  const hiddenId = document.querySelector('#career-level-id');
  const hint = document.querySelector('#career-level-hint');
  if (!select || !hidden || !hiddenId) return;
  if (career?.id !== previousCareer?.id) {
    hidden.value = '';
    hiddenId.value = '';
  }
  const levels = getCareerLevels(career);
  const currentId = hiddenId.value;
  const selected = levels.find((level) => level.id === currentId);
  const options = ['<option value="">À définir</option>'];
  options.push(...levels.map((level) => `<option value="${escapeHTML(level.id)}" ${selected?.id === level.id ? 'selected' : ''}>${escapeHTML(level.rank)} · ${escapeHTML(level.name)}</option>`));
  select.innerHTML = options.join('');
  select.disabled = !career || levels.length === 0;
  select.value = selected?.id || '';
  if (selected) {
    hiddenId.value = selected.id;
    hidden.value = selected.name;
  }
  if (hint) hint.textContent = levels.length
    ? 'Choisissez un niveau. Son identifiant stable sera enregistré dans la fiche.'
    : career ? 'Aucun niveau vérifié n’est renseigné pour cette carrière. Ajoutez les informations depuis les Référentiels.' : 'Sélectionnez une carrière pour consulter ses niveaux.';
  const preview = document.querySelector('#career-preview');
  if (preview) preview.innerHTML = careerPreviewMarkup(career, selected || null);
  hidden.dispatchEvent(new Event('change', { bubbles: true }));
}

async function createNewCharacter() {
  try {
    const character = createCharacter({ isDraft: true });
    await saveCharacter(character);
    characters.push(character);
    await openEditor(character);
    setSaveIndicator('Brouillon créé', 'saved');
  } catch (error) {
    showToast(error.message || 'Impossible de créer une fiche.', 'error');
  }
}

async function editCharacter(id) {
  try {
    const character = await getCharacter(id);
    if (!character) throw new Error('Ce personnage est introuvable.');
    await openEditor(character);
  } catch (error) {
    showToast(error.message || 'Impossible d’ouvrir cette fiche.', 'error');
  }
}

async function removeCharacter(id) {
  const character = characters.find((item) => item.id === id);
  if (!character) return;
  if (!window.confirm(`Supprimer définitivement « ${getCharacterName(character)} » de ce navigateur ?`)) return;
  try {
    await deleteCharacter(id);
    characters = characters.filter((item) => item.id !== id);
    renderCurrentRoute();
    showToast('Personnage supprimé.');
  } catch (error) {
    showToast(error.message || 'Impossible de supprimer ce personnage.', 'error');
  }
}

async function duplicateCharacter(id) {
  const original = characters.find((item) => item.id === id);
  if (!original) return;
  try {
    const now = new Date().toISOString();
    const duplicate = normalizeCharacter({
      ...clone(original),
      id: createId(),
      identity: { ...original.identity, lastName: `${original.identity.lastName || ''} (copie)`.trim() },
      isDraft: false,
      createdAt: now,
      updatedAt: now
    });
    await saveCharacter(duplicate);
    await refreshCharacters();
    showToast('Copie du personnage créée.');
  } catch (error) {
    showToast(error.message || 'Impossible de dupliquer ce personnage.', 'error');
  }
}

function downloadJSON(payload, filename) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(value) {
  return String(value || 'personnage').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'personnage';
}

function exportOneCharacter(id) {
  const character = characters.find((item) => item.id === id);
  if (!character) return;
  downloadJSON(createCharacterExport(character), `wfrp-personnage-${safeFilename(getCharacterName(character))}.json`);
  showToast('Fiche exportée au format JSON.');
}

function exportBackup() {
  downloadJSON(createBackupExport(characters), `wfrp-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`);
  showToast('Sauvegarde complète exportée.');
}

async function importJSONFile(file) {
  if (!file) return;
  if (file.size > MAX_IMPORT_SIZE) throw new Error('Le fichier dépasse la limite de 10 Mo.');
  const payload = JSON.parse(await file.text());
  const imported = parseImportPayload(payload);
  const prepared = prepareImportedCharacters(imported.characters, new Set(characters.map((item) => item.id)));
  const copies = prepared.filter((entry) => entry.copiedBecauseOfIdCollision).length;
  const details = copies ? ` ${copies} identifiant(s) déjà présent(s) seront importés sous forme de copies.` : '';
  const noun = prepared.length > 1 ? 'personnages' : 'personnage';
  if (!window.confirm(`Importer ${prepared.length} ${noun} dans ce navigateur ?${details}\n\nLes fiches déjà présentes seront conservées.`)) return;
  for (const entry of prepared) await saveCharacter(entry.character);
  await refreshCharacters();
  showToast(`${prepared.length} ${noun} importé${prepared.length > 1 ? 's' : ''}.`);
  navigate('/');
}

function splitLines(value) {
  return String(value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function openReferenceEditor(kind, id = '') {
  const existing = id ? referenceEntries.find((entry) => entry.id === id) : null;
  if (id && !existing) return showToast('Cette entrée de référentiel est introuvable.', 'error');
  const levelsOnly = existing?.source === 'builtin' && kind === 'careers';
  const speciesOnly = existing?.source === 'builtin' && kind === 'species';
  if (existing?.source === 'builtin' && !levelsOnly && !speciesOnly) return showToast('Les données intégrées sont protégées.', 'error');
  const editorCareerId = kind === 'careers' ? existing?.id || `custom:career:${createId()}` : '';
  let careerLevels = kind === 'careers' ? getCareerLevels(existing) : [];
  modalRoot.innerHTML = renderReferenceEditor(kind, existing, referenceEntries, { levelsOnly, speciesOnly });
  const dialog = document.querySelector('#reference-editor-dialog');
  const form = document.querySelector('#reference-form');
  const captureCareerLevels = () => [...form.querySelectorAll('.career-level-card')].map((card, index) => {
    const level = {
      id: card.dataset.careerLevelId,
      careerId: editorCareerId,
      rank: Number(card.querySelector('[data-level-field="rank"]')?.value) || index + 1
    };
    for (const fieldName of ['name', 'description', 'additionalInformation']) {
      level[fieldName] = card.querySelector(`[data-level-field="${fieldName}"]`)?.value || '';
    }
    for (const fieldName of ['skills', 'skillIds', 'talents', 'talentIds', 'advancements', 'entryConditions', 'exitConditions', 'equipment', 'references']) {
      level[fieldName] = splitLines(card.querySelector(`[data-level-field="${fieldName}"]`)?.value || '');
    }
    return level;
  });
  const renderLevels = () => {
    const container = form.querySelector('#career-level-editor');
    if (container) container.outerHTML = renderCareerLevelsEditor(careerLevels);
  };
  dialog.addEventListener('close', () => modalRoot.replaceChildren(), { once: true });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.close();
  });
  if (kind === 'careers') {
    form.addEventListener('click', (event) => {
      const button = event.target.closest('[data-level-action]');
      if (!button) return;
      event.preventDefault();
      careerLevels = captureCareerLevels();
      const action = button.dataset.levelAction;
      const card = button.closest('[data-career-level-id]');
      const index = careerLevels.findIndex((level) => level.id === card?.dataset.careerLevelId);
      if (action === 'add') {
        if (careerLevels.length >= 100) return showToast('Une carrière ne peut pas contenir plus de 100 niveaux.', 'error');
        careerLevels.push(createCareerLevel(editorCareerId, careerLevels.length + 1));
      } else if (action === 'remove' && index >= 0) {
        if (!window.confirm(`Supprimer le niveau « ${careerLevels[index].name || `Niveau ${index + 1}`} » ?`)) return;
        careerLevels.splice(index, 1);
      } else if ((action === 'up' || action === 'down') && index >= 0) {
        const target = action === 'up' ? index - 1 : index + 1;
        if (target >= 0 && target < careerLevels.length) {
          [careerLevels[index], careerLevels[target]] = [careerLevels[target], careerLevels[index]];
        }
      }
      careerLevels.forEach((level, levelIndex) => { level.rank = levelIndex + 1; });
      renderLevels();
    });
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const data = {
      id: existing?.id,
      source: existing?.source || 'custom',
      packId: existing?.packId || null,
      name: values.get('name'),
      description: values.get('description'),
      references: splitLines(values.get('references'))
    };
    if (kind === 'religions') {
      data.origin = values.get('origin');
      data.particularities = splitLines(values.get('particularities'));
      data.deityIds = values.getAll('deityIds');
    } else if (kind === 'deities') {
      data.domains = splitLines(values.get('domains'));
      data.symbols = splitLines(values.get('symbols'));
      data.additionalInformation = values.get('additionalInformation');
      data.religionIds = values.getAll('religionIds');
    } else if (kind === 'species') {
      data.aliases = splitLines(values.get('aliases'));
      data.characteristicModifiers = Object.fromEntries(CHARACTERISTICS.map(({ key }) => {
        const raw = values.get(`characteristicModifier.${key}`);
        return [key, raw === '' || raw === null ? null : Number(raw)];
      }));
      if (speciesOnly) {
        data.id = existing.id;
        data.source = existing.source;
        data.packId = existing.packId;
        data.customized = true;
        data.name = existing.name;
        data.description = existing.description;
        data.aliases = existing.aliases || [];
        data.references = existing.references || [];
      }
    } else {
      careerLevels = captureCareerLevels();
      data.className = values.get('className');
      data.id = editorCareerId;
      data.levels = careerLevels;
      data.skills = splitLines(values.get('skills'));
      data.skillIds = splitLines(values.get('skillIds'));
      data.talents = splitLines(values.get('talents'));
      data.talentIds = splitLines(values.get('talentIds'));
      data.advancements = splitLines(values.get('advancements'));
      data.entryConditions = splitLines(values.get('entryConditions'));
      data.exitConditions = splitLines(values.get('exitConditions'));
      data.equipment = splitLines(values.get('equipment'));
    }
    if (!String(data.name || '').trim()) {
      showToast('Le nom de cette entrée est obligatoire.', 'error');
      form.querySelector('[name="name"]')?.focus();
      return;
    }
    try {
      if (levelsOnly) {
        referenceEntries = await saveReferenceEntry({ ...existing, levels: careerLevels }, referenceEntries);
        dialog.close();
        renderCurrentRoute();
        showToast('Niveaux de carrière enregistrés.');
        return;
      }
      referenceEntries = await saveReferenceEntry(existing ? data : createCustomReference(kind, data), referenceEntries);
      dialog.close();
      renderCurrentRoute();
      showToast('Référentiel enregistré.');
    } catch (error) {
      showToast(error.message || 'Impossible d’enregistrer cette entrée.', 'error');
    }
  });
  dialog.showModal();
  (form.querySelector('[name="name"]:not([type="hidden"])') || form.querySelector('input:not([type="hidden"])'))?.focus();
}

async function deleteReference(id) {
  const entry = referenceEntries.find((item) => item.id === id);
  if (!entry) return;
  if (entry.source === 'builtin') {
    showToast('Les données intégrées à l’application ne peuvent pas être supprimées.', 'error');
    return;
  }
  if (!window.confirm(`Supprimer « ${entry.name} » de vos référentiels ? Les autres entrées seront conservées.`)) return;
  try {
    const bundle = buildReferenceDeleteBundle(referenceEntries, id);
    await saveReferenceBundle(bundle.entries, bundle.deletedIds);
    referenceEntries = bundle.entries;
    renderCurrentRoute();
    showToast('Entrée de référentiel supprimée.');
  } catch (error) {
    showToast(error.message || 'Impossible de supprimer cette entrée.', 'error');
  }
}

function exportReferences() {
  const payload = exportCustomReferencePack(referenceEntries);
  if (payload.pack.entries.length === 0) {
    showToast('Aucune donnée personnalisée ou aucun pack importé à exporter.', 'error');
    return;
  }
  downloadJSON(payload, `wfrp-referentiels-${new Date().toISOString().slice(0, 10)}.json`);
  showToast(`${payload.pack.entries.length} entrée(s) de référentiel exportée(s).`);
}

async function importReferenceFile(file) {
  if (!file) return;
  if (file.size > MAX_REFERENCE_IMPORT_SIZE) throw new Error('Le fichier dépasse la limite de 10 Mo.');
  const payload = JSON.parse(await file.text());
  const pack = parseReferencePack(payload, referenceEntries);
  const imported = prepareImportedReferencePack(pack, referenceEntries);
  if (!window.confirm(`Importer le pack « ${pack.name || 'Sans nom'} » contenant ${imported.length} entrée(s) ?\n\nLes données intégrées et les entrées existantes ne seront pas remplacées. Le contenu importé sera ajouté comme un pack distinct.`)) return;
  await saveReferenceBundle([...referenceEntries, ...imported]);
  referenceEntries = [...referenceEntries, ...imported];
  renderCurrentRoute();
  showToast(`${imported.length} entrée(s) importée(s) dans un nouveau pack.`);
}

async function getCharacterForProgression(requestedId = '') {
  if (editorState) {
    clearTimeout(saveTimer);
    await queueEditorSave();
    const editorId = editorState.character.id;
    if (requestedId && requestedId !== editorId) return getCharacter(requestedId);
    return getCharacter(editorId);
  }
  const id = requestedId || getRoute().id;
  return id ? getCharacter(id) : null;
}

async function persistProgressionUpdate(updated) {
  await saveCharacter(updated);
  const index = characters.findIndex((item) => item.id === updated.id);
  if (index >= 0) characters[index] = updated;
  else characters.push(updated);
  if (editorState?.character.id === updated.id) {
    editorState.character = clone(updated);
    const total = document.querySelector('[name="experience.total"]');
    const spent = document.querySelector('[name="experience.spent"]');
    if (total) total.value = String(updated.experience.total);
    if (spent) spent.value = String(updated.experience.spent);
  } else {
    renderCurrentRoute();
  }
  setSaveIndicator('Progression enregistrée', 'saved');
}

async function addExperience(requestedId = '') {
  try {
    const character = await getCharacterForProgression(requestedId);
    if (!character) throw new Error('Ouvrez une fiche de personnage avant d’ajouter de l’expérience.');
    const amount = window.prompt('Combien de points d’expérience ajouter ?', '50');
    if (amount === null) return;
    const note = window.prompt('Motif du gain (facultatif) :', 'Gain d’expérience');
    if (note === null) return;
    const updated = grantExperience(character, { amount, note });
    await persistProgressionUpdate(updated);
    showToast(`${Number(amount)} XP ajoutés à la fiche.`);
  } catch (error) {
    showToast(error.message || 'Impossible d’ajouter l’expérience.', 'error');
  }
}

async function buyAdvancement(button) {
  try {
    const characterId = button.dataset.characterId;
    const character = await getCharacterForProgression(characterId);
    if (!character) throw new Error('Ce personnage est introuvable.');
    const targetType = button.dataset.targetType;
    const target = targetType === 'characteristic'
      ? { type: targetType, key: button.dataset.targetKey }
      : { type: targetType, id: button.dataset.targetId };
    const cost = Number(button.dataset.cost);
    const targetLabel = targetType === 'characteristic'
      ? `l’augmentation de ${target.key}`
      : `${targetType === 'skill' ? 'la compétence' : 'le talent'} sélectionné`;
    if (!Number.isInteger(cost) || cost <= 0) throw new Error('Aucun coût d’expérience valide n’est configuré pour cette progression.');
    if (!window.confirm(`Acheter ${targetLabel} pour ${cost} XP ?\n\nLe coût configuré sera enregistré dans l’historique.`)) return;
    const updated = purchaseAdvancement(character, { target, amount: 1, cost, note: `Progression : ${targetLabel}` });
    await persistProgressionUpdate(updated);
    showToast(`Progression achetée pour ${cost} XP.`);
  } catch (error) {
    showToast(error.message || 'Impossible d’effectuer cet achat.', 'error');
  }
}

async function undoPurchase(requestedId = '') {
  try {
    const character = await getCharacterForProgression(requestedId);
    if (!character) throw new Error('Ce personnage est introuvable.');
    if (!window.confirm('Annuler le dernier achat enregistré ? Les avancements et l’expérience dépensée seront restaurés.')) return;
    const updated = undoLastPurchase(character);
    await persistProgressionUpdate(updated);
    showToast('Dernier achat annulé.');
  } catch (error) {
    showToast(error.message || 'Impossible d’annuler cet achat.', 'error');
  }
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'toggle-theme') toggleTheme();
  if (action === 'new-character') await createNewCharacter();
  if (action === 'open-character') navigate(`/character/${encodeURIComponent(id)}`);
  if (action === 'edit-character') await editCharacter(id);
  if (action === 'delete-character') await removeCharacter(id);
  if (action === 'duplicate-character') await duplicateCharacter(id);
  if (action === 'export-character') exportOneCharacter(id);
  if (action === 'export-backup') exportBackup();
  if (action === 'import-json') importInput.click();
  if (action === 'close-editor') await closeEditor();
  if (action === 'generate-characteristics') generateCharacteristicPreview();
  if (action === 'reroll-characteristics') generateCharacteristicPreview();
  if (action === 'cancel-characteristics') clearCharacteristicGenerationPreview();
  if (action === 'confirm-characteristics') confirmCharacteristicPreview();
  if (action === 'grant-experience') await addExperience(button.dataset.characterId || '');
  if (action === 'purchase-advancement') await buyAdvancement(button);
  if (action === 'undo-last-purchase') await undoPurchase(button.dataset.characterId || '');
  if (action === 'add-reference') openReferenceEditor(button.dataset.kind);
  if (action === 'edit-reference') {
    const entry = referenceEntries.find((item) => item.id === id);
    if (entry) openReferenceEditor(entry.kind, id);
  }
  if (action === 'delete-reference') await deleteReference(id);
  if (action === 'export-references') exportReferences();
  if (action === 'import-references') referenceImportInput.click();
  if (action === 'close-reference-editor') document.querySelector('#reference-editor-dialog')?.close();
  if (action === 'open-references') {
    await closeEditor();
    navigate('/references');
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'character-search') {
    filterState.query = event.target.value;
    updateCharacterGrid();
    const search = document.querySelector('#character-search');
    search?.focus();
    if (search) search.setSelectionRange(search.value.length, search.value.length);
  }
  if (event.target.id === 'reference-search') {
    filterReferenceCards(viewRoot, event.target.value, document.querySelector('#reference-kind-filter')?.value || 'all');
  }
});

document.addEventListener('change', (event) => {
  if (event.target.id === 'character-sort') {
    filterState.sort = event.target.value;
    updateCharacterGrid();
  }
  if (event.target.id === 'character-filter') {
    filterState.status = event.target.value;
    updateCharacterGrid();
  }
  if (event.target.id === 'reference-kind-filter') {
    filterReferenceCards(viewRoot, document.querySelector('#reference-search')?.value || '', event.target.value);
  }
});

importInput.addEventListener('change', async () => {
  const [file] = importInput.files || [];
  try {
    await importJSONFile(file);
  } catch (error) {
    showToast(error instanceof SyntaxError ? 'Le fichier ne contient pas un JSON valide.' : error.message, 'error');
  } finally {
    importInput.value = '';
  }
});

referenceImportInput.addEventListener('change', async () => {
  const [file] = referenceImportInput.files || [];
  try {
    await importReferenceFile(file);
  } catch (error) {
    showToast(error instanceof SyntaxError ? 'Le fichier ne contient pas un JSON valide.' : error.message, 'error');
  } finally {
    referenceImportInput.value = '';
  }
});

window.addEventListener('hashchange', () => {
  renderCurrentRoute();
  viewRoot.focus({ preventScroll: true });
});
window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    const search = document.querySelector('#character-search');
    if (search) {
      event.preventDefault();
      search.focus();
    }
  }
});

async function startApp() {
  applyTheme();
  updateConnectionStatus();
  try {
    referenceEntries = await initializeBuiltInReferences();
    await refreshCharacters();
    setSaveIndicator('Stockage local prêt', 'saved');
  } catch (error) {
    try {
      referenceEntries = await getAllReferenceEntries();
      await refreshCharacters();
      setSaveIndicator('Stockage local prêt · référentiels en cache', 'saved');
      showToast(`Les référentiels intégrés n’ont pas pu être actualisés : ${error.message}`, 'error');
    } catch (storageError) {
      viewRoot.innerHTML = `<section class="storage-error"><span class="empty-emblem">!</span><h1>Le registre ne peut pas s’ouvrir</h1><p>${escapeHTML(storageError.message || error.message || 'Le stockage local est indisponible.')}</p><p>Ouvrez cette application depuis une adresse locale ou HTTPS, puis vérifiez les autorisations de stockage de votre navigateur.</p></section>`;
      setSaveIndicator('Stockage indisponible', 'error');
    }
  }

  if ('serviceWorker' in navigator && window.isSecureContext) {
    try {
      await navigator.serviceWorker.register(new URL('../service-worker.js', import.meta.url), {
        scope: new URL('../', import.meta.url).pathname
      });
    } catch (error) {
      console.warn('Service Worker non enregistré :', error);
    }
  }
}

startApp();
