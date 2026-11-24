import { createCharacter, createId, getCharacterName, getExperienceAvailable, normalizeCharacter, CHARACTERISTICS } from './models/character.js';
import { deleteCharacter, getAllCharacters, getCharacter, saveCharacter, saveCharacters, getAllReferenceEntries, saveReferenceBundle } from './database/indexeddb.js';
import { createBackupExport, createCharacterExport, MAX_IMPORT_SIZE, parseImportPayload, prepareImportedCharacters } from './services/import-export.js';
import {
  MAX_REFERENCE_IMPORT_SIZE, initializeBuiltInReferences,
  createCareerLevel, createCustomReference, exportCustomReferencePack, parseReferencePack,
  prepareImportedReferencePack, saveReferenceEntry, buildReferenceDeleteBundle,
  getCareerLevels, findCareerLevel, preserveNamedMetadata
} from './services/reference-catalog.js';
import { renderReferencePicker, mountReferencePickers, isDeityCompatibleWithReligion, findReferenceByLegacyValue } from './components/reference-picker.js';
import { renderTalentPicker, mountTalentPickers } from './components/talent-picker.js';
import { getRoute, navigate } from './router.js';
import { renderDashboard, renderCharacterGrid } from './views/dashboard.js';
import { renderReferenceManager, renderReferenceEditor, renderCareerLevelsEditor, renderTalentCards, renderTalentEditor, filterReferenceCards } from './views/reference-manager.js';
import { escapeHTML, formatDate } from './utils/format.js';
import { generateCharacteristics, findSpeciesProfile } from './rules/characteristic-generator.js';
import { calculateCharacteristics, calculateTalentCharacteristicBonuses } from './rules/character-calculations.js';
import { applyTheme, toggleTheme } from './services/theme.js';
import {
  correctExperience, grantExperience, purchaseAdvancement, undoLastPurchase,
  refundAdvancements, quoteProgressionRefund, purchaseCareerChange, getRefundableProgressionCount
} from './services/progression.js';
import { CAREER_CHANGE_COST, getNextAdvancementCost } from './rules/progression-costs.js';
import { getCreationSuggestions, mergeSuggestedEntries } from './services/creation-wizard.js';
import { createTalentCatalogExport, filterTalentCatalog, findTalentNameConflict, findTalentReference, mergeCharacterTalentEntries, normalizeTalentText, parseTalentPack, prepareTalentPack } from './services/talents.js';

const viewRoot = document.querySelector('#view-root');
const modalRoot = document.querySelector('#modal-root');
const toastRegion = document.querySelector('#toast-region');
const saveIndicator = document.querySelector('#save-indicator');
const importInput = document.querySelector('#import-file');
const referenceImportInput = document.querySelector('#reference-import-file');
const talentImportInput = document.querySelector('#talent-import-file');
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
    openEditor(character);
    return;
  }
  editorState = null;
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
  if (render && editorState) {
    clearTimeout(saveTimer);
    await queueEditorSave();
  }
  characters = await getAllCharacters();
  if (render) renderCurrentRoute();
  else updateSidebar();
}

function field(label, name, value, options = {}) {
  const { type = 'text', placeholder = '', wide = false, min, max, step, readOnly = false } = options;
  const attributes = [min !== undefined ? `min="${min}"` : '', max !== undefined ? `max="${max}"` : '', step !== undefined ? `step="${step}"` : '', readOnly ? 'readonly' : ''].filter(Boolean).join(' ');
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
  const names = (items = []) => items.map((item) => typeof item === 'string' ? item : item?.name || '').filter(Boolean).join(' · ');
  const details = [
    career.className ? `<span><strong>Classe :</strong> ${escapeHTML(career.className)}</span>` : '',
    selectedLevel ? `<span><strong>Niveau ${escapeHTML(selectedLevel.rank)} :</strong> ${escapeHTML(selectedLevel.name)}</span>` : career.levels?.length ? `<span><strong>Niveaux :</strong> ${escapeHTML(getCareerLevels(career).map((level) => level.name).join(' · '))}</span>` : '',
    ...((selectedLevel?.skills || career.skills || []).length ? [`<span><strong>Compétences :</strong> ${escapeHTML(names(selectedLevel?.skills || career.skills))}</span>`] : []),
    ...((selectedLevel?.talents || career.talents || []).length ? [`<span><strong>Talents :</strong> ${escapeHTML(names(selectedLevel?.talents || career.talents))}</span>`] : []),
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
    const speciesBonusValue = character.characteristicSpeciesModifiers?.[key];
    const advanceCount = character.characteristicAdvances?.[key] || 0;
    const nextCost = getNextAdvancementCost('characteristic', advanceCount);
    const refundableCount = getRefundableProgressionCount(character, { type: 'characteristic', key });
    return `<tr data-characteristic-row data-key="${key}">
      <th scope="row"><abbr title="${escapeHTML(label)}">${escapeHTML(shortLabel)}</abbr><span>${escapeHTML(label)}</span></th>
      <td><input type="number" min="0" max="999" step="1" name="characteristics.${key}" value="${escapeHTML(character.characteristics[key] ?? '')}" aria-label="${escapeHTML(label)} valeur initiale" data-stat-initial></td>
      <td><output data-stat-species>${stat.speciesBonus ?? '—'}</output><input type="hidden" name="characteristicSpeciesModifiers.${key}" value="${escapeHTML(speciesBonusValue === null ? '' : speciesBonusValue ?? 0)}" data-stat-species-value></td>
      <td><output data-stat-talent>${stat.talentBonus}</output></td>
      <td><input type="number" min="0" max="999" step="1" name="characteristicAdvances.${key}" value="${escapeHTML(character.characteristicAdvances?.[key] ?? 0)}" aria-label="${escapeHTML(label)} augmentations" data-stat-advances readonly title="Les augmentations se font depuis la progression XP de la fiche."></td>
      <td><output class="calculated-value" data-stat-current>${stat.current ?? '—'}</output></td>
      <td><output class="calculated-bonus" data-stat-bonus>${stat.bonus ?? '—'}</output></td>
      <td>${nextCost === null ? '<span class="muted-copy">Maximum atteint</span>' : `<button class="table-action" type="button" data-action="purchase-advancement" data-target-type="characteristic" data-target-key="${key}" data-character-id="${escapeHTML(character.id)}">+1 · ${nextCost} XP</button>`}</td>
      <td>${refundableCount ? `${renderRefundAdvancementButton(character, { type: 'characteristic', key: key })}` : '<span class="muted-copy">—</span>'}</td>
    </tr>`;
  }).join('');
  return `<div class="responsive-table editor-table-wrap"><table class="data-table characteristic-editor-table"><thead><tr><th>Caractéristique</th><th>Initiale</th><th>Espèce</th><th>Talents</th><th>Augm.</th><th>Actuelle</th><th>Bonus</th><th>Acheter</th><th>Rembourser</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}


function renderRefundAdvancementButton(character, target) {
  if (!character) return '<span class="muted-copy">—</span>';

  const count = getRefundableProgressionCount(character, target);
  if (!count) return '<span class="muted-copy">—</span>';

  let amount = 0;

  try {
    amount = quoteProgressionRefund(character, [
      { target, amount: 1 }
    ]).amount;
  } catch (error) {
    return '<span class="muted-copy">Indisponible</span>';
  }

  if (!amount || amount <= 0) {
    return '<span class="muted-copy">—</span>';
  }

  const targetAttribute = target.type === 'characteristic'
    ? `data-target-key="${escapeHTML(target.key)}"`
    : `data-target-id="${escapeHTML(target.id)}"`;

  return `<button
    class="table-action"
    type="button"
    data-action="refund-one-advancement"
    data-character-id="${escapeHTML(character.id)}"
    data-target-type="${target.type}"
    ${targetAttribute}
  >↶ +${amount} XP</button>`;
}

function renderSkillEditorRow(skill = {}, _collection = 'skills', character = null) {
  const rowId = skill.id || createId();
  const nextCost = getNextAdvancementCost('skill', skill.advances || 0);
  const refundableCount = character ? getRefundableProgressionCount(character, { type: 'skill', id: rowId }) : 0;
  const characteristicOptions = ['<option value="">—</option>', ...CHARACTERISTICS.map(({ key, shortLabel }) => (
    `<option value="${key}" ${skill.characteristic === key ? 'selected' : ''}>${shortLabel}</option>`
  ))].join('');
  const skillTypeOptions = `<option value="">Non défini</option><option value="basic" ${skill.skillType === 'basic' ? 'selected' : ''}>Base</option><option value="advanced" ${skill.skillType === 'advanced' ? 'selected' : ''}>Avancée</option>`;
  return `<div class="editor-list-row skill-editor-row" data-item-row data-collection="skills" data-item-id="${escapeHTML(rowId)}" data-reference-id="${escapeHTML(skill.referenceId || '')}" data-source-career-id="${escapeHTML(skill.sourceCareerId || '')}" data-source-career-level-id="${escapeHTML(skill.sourceCareerLevelId || '')}" data-source-species-id="${escapeHTML(skill.sourceSpeciesId || '')}">
    <label><span>Compétence</span><input data-collection-field="name" value="${escapeHTML(skill.name || '')}" maxlength="160"></label>
    <label><span>Carac.</span><select data-collection-field="characteristic">${characteristicOptions}</select></label>
    <label><span>Type</span><select data-collection-field="skillType">${skillTypeOptions}</select></label>
    <label><span>Base manuelle</span><input type="number" min="0" max="999" data-collection-field="baseValue" value="${escapeHTML(skill.baseValue ?? '')}" placeholder="Carac."></label>
    <label><span>Avanc.</span><input type="number" min="0" max="999" data-collection-field="advances" value="${escapeHTML(skill.advances ?? 0)}" readonly title="Les avancements se font avec les boutons de progression XP de la fiche."></label>
    <input type="hidden" data-collection-field="advancementCost" value="${escapeHTML(skill.advancementCost ?? '')}">
    <input type="hidden" data-collection-field="advancementCostVerified" value="${skill.advancementCostVerified ? 'true' : ''}">
    <input type="hidden" data-collection-field="advancementCostReference" value="${escapeHTML(skill.advancementCostReference || '')}">
    <label class="inline-check"><input type="checkbox" data-collection-field="useCharacteristicBase" ${skill.useCharacteristicBase !== false ? 'checked' : ''}><span>Base = caractéristique</span></label>
    <label class="inline-check"><input type="checkbox" data-collection-field="career" ${skill.career ? 'checked' : ''}><span>Compétence de carrière</span></label>
    <label class="inline-check"><input type="checkbox" data-collection-field="acquired" ${skill.acquired !== false ? 'checked' : ''}><span>Acquise</span></label>
    ${nextCost !== null ? `<button type="button" class="table-action progression-row-action" data-inline-progression data-action="purchase-advancement" data-character-id="${escapeHTML(character?.id || '')}" data-target-type="skill" data-target-id="${escapeHTML(rowId)}" ${skill.acquired === false ? 'disabled' : ''}>+1 · ${nextCost} XP</button>` : '<span class="muted-copy progression-row-action">Maximum atteint</span>'}
    ${refundableCount ? `${renderRefundAdvancementButton(character, { type: 'skill', id: rowId })}` : ''}
    <button type="button" class="icon-button danger-button" data-collection-action="remove" aria-label="Supprimer cette compétence" title="Supprimer">×</button>
  </div>`;
}

function renderTalentEditorRow(talent = {}, _collection = 'talents', character = null) {
  const rowId = talent.id || createId();
  const currentRank = talent.acquired === false ? 0 : (talent.rank || 1);
  const nextCost = getNextAdvancementCost('talent', currentRank);
  const refundableCount = character ? getRefundableProgressionCount(character, { type: 'talent', id: rowId }) : 0;
  const hasMaximumRank = Boolean(talent.maxRank && currentRank >= talent.maxRank);
  const requiresPrerequisiteVerification = Boolean(((talent.conditions || '').trim() || talent.prerequisites?.length) && talent.acquired === false);
  const effect = (talent.effects || []).find((item) => item.type === 'characteristicBonus') || {};
  const characteristicOptions = ['<option value="">—</option>', ...CHARACTERISTICS.map(({ key, shortLabel }) => (
    `<option value="${key}" ${effect.characteristic === key ? 'selected' : ''}>${shortLabel}</option>`
  ))].join('');
  return `<div class="editor-list-row talent-editor-row" data-item-row data-collection="talents" data-item-id="${escapeHTML(rowId)}" data-reference-id="${escapeHTML(talent.referenceId || '')}" data-source-career-id="${escapeHTML(talent.sourceCareerId || '')}" data-source-career-level-id="${escapeHTML(talent.sourceCareerLevelId || '')}" data-source-species-id="${escapeHTML(talent.sourceSpeciesId || '')}" data-max-rank="${escapeHTML(talent.maxRank ?? '')}" data-source-info="${escapeHTML(JSON.stringify(talent.sourceInfo || {}))}" data-references="${escapeHTML(JSON.stringify(talent.references || []))}" data-effects="${escapeHTML(JSON.stringify(talent.effects || []))}">
    <label class="talent-selection-field"><span>Talent · rechercher dans le catalogue</span>${renderTalentPicker({ ...talent, id: rowId }, referenceEntries)}<small class="talent-source-note">${escapeHTML(talentSuggestionReason(talent))}</small></label>
    <label><span>Rang</span><input type="number" min="1" max="999" data-collection-field="rank" value="${escapeHTML(talent.rank ?? 1)}" readonly title="Les rangs se gagnent et se remboursent avec les boutons de progression XP de la fiche."></label>
    <input type="hidden" data-collection-field="advancementCost" value="${escapeHTML(talent.advancementCost ?? '')}">
    <input type="hidden" data-collection-field="advancementCostVerified" value="${talent.advancementCostVerified ? 'true' : ''}">
    <label class="inline-check"><input type="checkbox" data-collection-field="prerequisitesVerified" ${talent.prerequisitesVerified ? 'checked' : ''}><span>Conditions / prérequis vérifiés</span></label>
    <label class="inline-check"><input type="checkbox" data-collection-field="acquired" ${talent.acquired !== false ? 'checked' : ''} disabled><span>Acquis (via progression XP)</span></label>
    <label><span>Bonus caractéristique</span><select data-collection-field="effectCharacteristic">${characteristicOptions}</select></label>
    <label><span>Valeur</span><input type="number" min="0" max="999" data-collection-field="effectValue" value="${escapeHTML(effect.value ?? 0)}"></label>
    <label class="inline-check"><input type="checkbox" data-collection-field="effectVerified" ${effect.verified ? 'checked' : ''}><span>Effet vérifié</span></label>
    <label class="talent-description"><span>Description</span><input data-collection-field="description" value="${escapeHTML(talent.description || '')}" maxlength="3000"></label>
    <label class="talent-description"><span>Conditions d’acquisition</span><input data-collection-field="conditions" value="${escapeHTML(talent.conditions || '')}" maxlength="2000" placeholder="Non renseignées"></label>
    <label class="talent-description"><span>Référence de règle pour l’effet</span><input data-collection-field="effectReference" value="${escapeHTML(effect.reference || '')}" maxlength="500" placeholder="Livre, page, errata…"></label>
    ${!hasMaximumRank && nextCost !== null ? `<button type="button" class="table-action progression-row-action" data-inline-progression data-action="purchase-advancement" data-character-id="${escapeHTML(character?.id || '')}" data-target-type="talent" data-target-id="${escapeHTML(rowId)}" ${requiresPrerequisiteVerification && talent.prerequisitesVerified !== true ? 'disabled' : ''}>${talent.acquired === false ? 'Acquérir' : 'Rang suivant'} · ${nextCost} XP</button>` : '<span class="muted-copy progression-row-action">Rang maximum atteint</span>'}
    ${refundableCount ? `${renderRefundAdvancementButton(character, { type: 'talent', id: rowId })}` : ''}
    <button type="button" class="icon-button danger-button" data-collection-action="remove" aria-label="Supprimer ce talent" title="Supprimer">×</button>
  </div>`;
}

function updateInlineProgressionControls(form = document.querySelector('#character-form')) {
  if (!form) return;
  form.querySelectorAll('[data-item-row][data-collection="skills"]').forEach((row) => {
    const button = row.querySelector('[data-inline-progression]');
    const acquired = row.querySelector('[data-collection-field="acquired"]')?.checked === true;
    if (button) button.disabled = !acquired;
  });
  form.querySelectorAll('[data-item-row][data-collection="talents"]').forEach((row) => {
    const button = row.querySelector('[data-inline-progression]');
    if (!button) return;
    const acquired = row.querySelector('[data-collection-field="acquired"]')?.checked === true;
    const verified = row.querySelector('[data-collection-field="prerequisitesVerified"]')?.checked === true;
    const conditions = row.querySelector('[data-collection-field="conditions"]')?.value?.trim() || '';
    const prerequisites = row.querySelector('[data-collection-field="prerequisites"]')?.value?.trim() || '';
    button.disabled = !acquired && Boolean(conditions || prerequisites) && !verified;
    button.title = button.disabled ? 'Vérifiez les conditions et prérequis avant l’acquisition.' : '';
  });
  const careerCompleted = form.querySelector('[name="identity.careerCompleted"]')?.checked === true;
  const careerChange = form.querySelector('[data-action="change-career"]');
  const careerPicker = form.querySelector('[data-career-change-career]');
  const levelPicker = form.querySelector('[data-career-change-level]');
  const selectedCareer = referenceEntries.find((entry) => entry.kind === 'careers' && entry.id === careerPicker?.value);
  if (levelPicker && levelPicker.dataset.careerId !== (selectedCareer?.id || '')) {
    const levels = getCareerLevels(selectedCareer);
    levelPicker.innerHTML = `<option value="">${levels.length ? 'Choisir un niveau…' : 'Aucun niveau défini'}</option>${levels.map((level) => `<option value="${escapeHTML(level.id)}">${escapeHTML(level.rank)} · ${escapeHTML(level.name)}</option>`).join('')}`;
    levelPicker.dataset.careerId = selectedCareer?.id || '';
    if (levels.length === 1) levelPicker.value = levels[0].id;
  }
  if (levelPicker) levelPicker.disabled = !selectedCareer || getCareerLevels(selectedCareer).length <= 1;
  const levels = getCareerLevels(selectedCareer);
  const currentCareerId = form.querySelector('[data-reference-picker="careers"] [data-picker-id]')?.value || '';
  const sameCareer = Boolean(selectedCareer && currentCareerId && selectedCareer.id === currentCareerId);
  if (careerChange) careerChange.disabled = !careerCompleted || !selectedCareer || sameCareer || (levels.length > 1 && !levelPicker?.value);
}

function talentSuggestionReason(talent = {}) {
  if (talent.acquired === true && (talent.sourceCareerId || talent.sourceSpeciesId)) {
    return talent.sourceSpeciesId
      ? 'Talent proposé par l’espèce puis acquis.'
      : 'Talent proposé par la carrière puis acquis.';
  }
  if (talent.sourceSpeciesId) {
    const species = referenceEntries.find((entry) => entry.kind === 'species' && entry.id === talent.sourceSpeciesId);
    return `Proposé par l’espèce : ${species?.name || 'référentiel d’espèce'}. À confirmer par le joueur.`;
  }
  if (talent.sourceCareerId) {
    const career = referenceEntries.find((entry) => entry.kind === 'careers' && entry.id === talent.sourceCareerId);
    const level = getCareerLevels(career).find((entry) => entry.id === talent.sourceCareerLevelId);
    return `Proposé par la carrière${career ? ` ${career.name}` : ''}${level ? ` · ${level.name}` : ''}. À confirmer par le joueur.`;
  }
  return talent.acquired === false ? 'Sélection manuelle · non acquis' : 'Talent ajouté manuellement ou conservé depuis une fiche existante.';
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

function renderCollectionSection(title, collection, entries, rowRenderer, description = '', character = null) {
  const rows = entries.length ? entries.map((entry) => rowRenderer(entry, collection, character)).join('') : '<p class="collection-empty">Aucune entrée. Utilisez le bouton pour en ajouter une.</p>';
  const refundActions = '';
  return `<div class="editor-collection"><div class="editor-collection-heading"><div><h4>${title}</h4>${description ? `<p>${description}</p>` : ''}</div><button type="button" class="button button-outline button-small" data-collection-action="add" data-collection="${collection}">＋ Ajouter</button></div><div class="editor-collection-rows" id="collection-${collection}" data-collection="${collection}">${rows}</div>${refundActions}</div>`;
}

function readEditorCollection(form, collection) {
  const entries = [...form.querySelectorAll(`[data-item-row][data-collection="${collection}"]`)].map((row) => {
    const read = (fieldName) => row.querySelector(`[data-collection-field="${fieldName}"]`);
    const value = (fieldName) => read(fieldName)?.value?.trim() || '';
    const number = (fieldName) => {
      const raw = value(fieldName);
      return raw === '' ? null : Number(raw);
    };
    const checkbox = (fieldName) => {
      const control = read(fieldName);
      return control?.type === 'checkbox' ? control.checked : control?.value === 'true';
    };
    if (collection === 'skills') return {
      id: row.dataset.itemId || createId(), referenceId: row.dataset.referenceId || '', name: value('name'), characteristic: value('characteristic'),
      skillType: value('skillType'),
      baseValue: number('baseValue'), useCharacteristicBase: checkbox('useCharacteristicBase'),
      advances: number('advances') ?? 0, advancementCost: number('advancementCost'),
      advancementCostVerified: checkbox('advancementCostVerified'),
      advancementCostReference: value('advancementCostReference'), career: checkbox('career'),
      acquired: checkbox('acquired'), status: checkbox('acquired') ? 'acquired' : 'selected',
      sourceCareerId: row.dataset.sourceCareerId || '', sourceCareerLevelId: row.dataset.sourceCareerLevelId || '', sourceSpeciesId: row.dataset.sourceSpeciesId || ''
    };
    if (collection === 'talents') {
      const effectCharacteristic = value('effectCharacteristic');
      const reference = findTalentReference(referenceEntries, row.dataset.referenceId, value('name'));
      let historicalSourceInfo = {};
      let historicalReferences = [];
      try { historicalSourceInfo = JSON.parse(row.dataset.sourceInfo || '{}'); } catch { historicalSourceInfo = {}; }
      try { historicalReferences = JSON.parse(row.dataset.references || '[]'); } catch { historicalReferences = []; }
      let storedEffects = [];
      try { storedEffects = JSON.parse(row.dataset.effects || '[]'); } catch { storedEffects = []; }
      const storedCharacteristicEffects = storedEffects.filter((effect) => effect?.type === 'characteristicBonus');
      const effects = storedEffects.filter((effect) => effect?.type !== 'characteristicBonus');
      if (effectCharacteristic) effects.push({
        type: 'characteristicBonus', characteristic: effectCharacteristic,
        value: number('effectValue') ?? 0, verified: checkbox('effectVerified'), reference: value('effectReference')
      });
      effects.push(...storedCharacteristicEffects.slice(1));
      return {
        id: row.dataset.itemId || createId(), referenceId: row.dataset.referenceId || '', name: value('name'), rank: number('rank') ?? 1,
        maxRank: number('maxRank') ?? (row.dataset.maxRank ? Number(row.dataset.maxRank) : null),
        nameFr: value('nameFr'), nameOriginal: value('nameOriginal'), category: value('category'),
        tests: value('tests').split(' ; ').filter(Boolean), skills: value('skills').split(' ; ').filter(Boolean),
        description: value('description'), conditions: value('conditions'), prerequisites: value('prerequisites').split(' ; ').filter(Boolean),
        verificationStatus: value('verificationStatus'), sourceInfo: { ...(reference?.sourceInfo || {}), ...historicalSourceInfo },
        references: reference?.references?.length ? reference.references : (historicalReferences.length ? historicalReferences : (historicalSourceInfo.title ? [`${historicalSourceInfo.title}${historicalSourceInfo.page ? `, p. ${historicalSourceInfo.page}` : ''}`] : [])),
        advancementCost: number('advancementCost'),
        advancementCostVerified: checkbox('advancementCostVerified'),
        prerequisitesVerified: checkbox('prerequisitesVerified'), effects,
        acquired: checkbox('acquired'), status: checkbox('acquired') ? 'acquired' : 'selected',
        sourceCareerId: row.dataset.sourceCareerId || '', sourceCareerLevelId: row.dataset.sourceCareerLevelId || '', sourceSpeciesId: row.dataset.sourceSpeciesId || ''
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
  return collection === 'talents' ? mergeCharacterTalentEntries(entries) : entries;
}

function updateCharacteristicPreviews(form) {
  if (!form) return;
  const previewTalents = [...form.querySelectorAll('[data-item-row][data-collection="talents"]')].map((row) => {
    let storedEffects = [];
    try { storedEffects = JSON.parse(row.dataset.effects || '[]'); } catch { storedEffects = []; }
    const storedCharacteristicEffects = storedEffects.filter((effect) => effect?.type === 'characteristicBonus');
    const key = row.querySelector('[data-collection-field="effectCharacteristic"]')?.value;
    const editedFirstEffect = key ? {
      ...(storedCharacteristicEffects[0] || {}),
      type: 'characteristicBonus',
      characteristic: key,
      value: Number(row.querySelector('[data-collection-field="effectValue"]')?.value || 0),
      verified: row.querySelector('[data-collection-field="effectVerified"]')?.checked === true,
      reference: row.querySelector('[data-collection-field="effectReference"]')?.value?.trim() || ''
    } : null;
    const effects = [...(editedFirstEffect ? [editedFirstEffect] : []), ...storedCharacteristicEffects.slice(1)];
    const acquired = row.querySelector('[data-collection-field="acquired"]')?.checked === true;
    return { acquired, status: acquired ? 'acquired' : 'selected', effects };
  });
  const talentBonuses = calculateTalentCharacteristicBonuses(previewTalents);
  for (const { key } of CHARACTERISTICS) {
    const row = form.querySelector(`[data-characteristic-row][data-key="${key}"]`);
    if (!row) continue;
    const initialRaw = row.querySelector('[data-stat-initial]')?.value;
    const initial = initialRaw === '' ? null : Number(initialRaw);
    const advances = Math.max(0, Number(row.querySelector('[data-stat-advances]')?.value || 0));
    const speciesRaw = row.querySelector('[data-stat-species-value]')?.value;
    const speciesBonus = speciesRaw === '' ? null : Number(speciesRaw);
    const talentBonus = talentBonuses[key];
    const current = initial === null || !Number.isFinite(initial) || speciesBonus === null || !Number.isFinite(speciesBonus) ? null : initial + speciesBonus + advances + talentBonus;
    row.querySelector('[data-stat-species]').textContent = speciesBonus ?? '—';
    row.querySelector('[data-stat-talent]').textContent = talentBonus;
    row.querySelector('[data-stat-current]').textContent = current ?? '—';
    row.querySelector('[data-stat-bonus]').textContent = current === null ? '—' : Math.floor(current / 10);
  }
}

function updateSpeciesSelection(form) {
  const speciesField = form.querySelector('[name="identity.species"]');
  const speciesName = speciesField?.value || '';
  const species = findSpeciesProfile(speciesName, referenceEntries);
  const previousIdentity = editorState?.character.identity || {};
  const previousSpecies = findSpeciesProfile(previousIdentity.species, referenceEntries);
  const previousSpeciesId = previousIdentity.speciesId || previousSpecies?.id || '';
  if (previousSpeciesId && species?.id !== previousSpeciesId) {
    const linkedRows = [...form.querySelectorAll('[data-item-row][data-source-species-id]')]
      .filter((row) => row.dataset.sourceSpeciesId === previousSpeciesId);
    if (linkedRows.length && !window.confirm(`Le changement d’espèce ne correspond plus à ${linkedRows.length} compétence(s) ou talent(s) suggéré(s) par « ${previousSpecies?.name || previousIdentity.species} ».\n\nLes retirer de cette sélection ?`)) {
      if (speciesField) speciesField.value = previousIdentity.species || previousSpecies?.name || '';
      return false;
    }
    linkedRows.forEach((row) => row.remove());
    for (const collection of ['skills', 'talents']) {
      const container = form.querySelector(`#collection-${collection}`);
      if (container && !container.querySelector('[data-item-row]')) container.innerHTML = '<p class="collection-empty">Aucune entrée. Utilisez le bouton pour en ajouter une.</p>';
    }
  }
  const idInput = form.querySelector('#species-reference-id');
  if (idInput) idInput.value = species?.id || '';
  const preview = form.querySelector('#species-preview');
  if (preview) preview.innerHTML = speciesPreviewMarkup(species);
  for (const { key } of CHARACTERISTICS) {
    const row = form.querySelector(`[data-characteristic-row][data-key="${key}"]`);
    const modifier = species?.characteristicModifiers?.[key];
    const input = row?.querySelector('[data-stat-species-value]');
    if (input) input.value = Number.isInteger(modifier) ? String(modifier) : '';
  }
  if (editorState) {
    editorState.character.identity.speciesId = species?.id || '';
  }
  updateCharacteristicPreviews(form);
  refreshReferenceSuggestions();
  return true;
}

function refreshReferenceSuggestions() {
  const form = document.querySelector('#character-form');
  if (!form) return;
  const careerId = form.querySelector('[data-reference-picker="careers"] [data-picker-id]')?.value || '';
  const career = referenceEntries.find((entry) => entry.kind === 'careers' && entry.id === careerId) || null;
  const levelId = form.querySelector('#career-level-select')?.value || '';
  const level = getCareerLevels(career).find((entry) => entry.id === levelId) || null;
  const speciesId = form.querySelector('#species-reference-id')?.value || '';
  const species = referenceEntries.find((entry) => entry.kind === 'species' && entry.id === speciesId) || null;
  const careerSuggestions = getCreationSuggestions({ career, level });
  const speciesSuggestions = getCreationSuggestions({ species });
  const currentTalents = readEditorCollection(form, 'talents');
  const currentTalentNames = (talent) => [talent.name, talent.nameFr, talent.nameOriginal].map(normalizeTalentText).filter(Boolean);
  const catalogCareerTalents = referenceEntries.filter((entry) => entry.kind === 'talents' && (
    (career && (entry.careerIds || []).includes(career.id)) || (level && (entry.careerLevelIds || []).includes(level.id))
  ));
  const catalogSpeciesTalents = referenceEntries.filter((entry) => entry.kind === 'talents' && species && (entry.species || []).includes(species.id));
  const describeTalent = (entry, reason) => {
    const candidateId = entry.id || entry.referenceId || '';
    const candidateNames = [entry.name, entry.name_fr, entry.nameFr, entry.name_original, entry.nameOriginal, ...(entry.aliases || [])]
      .map(normalizeTalentText).filter(Boolean);
    const owned = currentTalents.find((talent) => (candidateId && talent.referenceId === candidateId)
      || currentTalentNames(talent).some((name) => candidateNames.includes(name)));
    const details = [
      entry.maxRank ? `max. ${entry.maxRank} rang(s)` : '',
      ...(entry.prerequisites || []).map((item) => `prérequis : ${item}`),
      entry.conditions || ''
    ].filter(Boolean);
    const ownership = owned
      ? owned.acquired ? `Déjà acquis · rang ${owned.rank}` : `Déjà sélectionné · rang ${owned.rank}, non acquis`
      : 'À sélectionner';
    return `<li><strong>${escapeHTML(entry.name_fr || entry.name)}</strong> <span>— ${escapeHTML(reason)} · ${escapeHTML(ownership)}${details.length ? ` · ${escapeHTML(details.join(' · '))}` : ''}</span></li>`;
  };
  const careerTalentNames = new Set(careerSuggestions.talents.map((item) => normalizeTalentText(item.name)));
  const catalogOnlyCareerTalents = catalogCareerTalents.filter((entry) => !careerTalentNames.has(normalizeTalentText(entry.name_fr || entry.name)));
  const speciesTalentNames = new Set(speciesSuggestions.talents.map((item) => normalizeTalentText(item.name)));
  const catalogOnlySpeciesTalents = catalogSpeciesTalents.filter((entry) => !speciesTalentNames.has(normalizeTalentText(entry.name_fr || entry.name)));
  const panel = form.querySelector('#career-suggestions');
  if (panel) {
    const skills = careerSuggestions.skills.length;
    const talents = careerSuggestions.talents.length + catalogOnlyCareerTalents.length;
    const describeSkill = (item) => `${item.name}${item.skillType ? ` (${item.skillType === 'basic' ? 'Base' : 'Avancée'}${item.characteristic ? ` · ${item.characteristic}` : ''})` : item.characteristic ? ` (${item.characteristic})` : ''}`;
    panel.innerHTML = career
      ? `<p>${escapeHTML(career.name)}${level ? ` · ${escapeHTML(level.name)}` : ''} : ${skills} compétence(s) et ${talents} talent(s) référencé(s).</p>${skills ? `<small><strong>Compétences :</strong> ${escapeHTML(careerSuggestions.skills.map(describeSkill).join(' · '))}</small>` : ''}${talents ? `<ul class="talent-suggestion-list">${careerSuggestions.talents.map((item) => describeTalent(item, 'carrière')).join('')}${catalogOnlyCareerTalents.map((item) => describeTalent(item, 'carrière / niveau')).join('')}</ul>` : '<small>Aucun talent associé n’est renseigné pour cette carrière ou ce niveau.</small>'}<small>Proposition de référentiel uniquement : rien n’est acquis automatiquement.</small>`
      : '<p class="form-hint">Choisissez une carrière et un niveau pour consulter les suggestions disponibles.</p>';
  }
  const talentPanel = form.querySelector('#talent-suggestions');
  if (talentPanel) {
    const legacyCareerTalents = careerSuggestions.talents.map((item) => describeTalent(item, 'carrière / niveau'));
    const legacySpeciesTalents = speciesSuggestions.talents.map((item) => describeTalent(item, 'espèce'));
    talentPanel.querySelector('[data-talent-career-list]')?.replaceChildren();
    const careerList = talentPanel.querySelector('[data-talent-career-list]');
    const speciesList = talentPanel.querySelector('[data-talent-species-list]');
    if (careerList) careerList.innerHTML = [...legacyCareerTalents, ...catalogOnlyCareerTalents.map((item) => describeTalent(item, 'carrière / niveau'))].join('');
    if (speciesList) speciesList.innerHTML = [...legacySpeciesTalents, ...catalogOnlySpeciesTalents.map((item) => describeTalent(item, 'espèce'))].join('');
    const careerLabel = talentPanel.querySelector('[data-talent-career-count]');
    const speciesLabel = talentPanel.querySelector('[data-talent-species-count]');
    if (careerLabel) careerLabel.textContent = `${career ? `Carrière : ${career.name}${level ? ` · ${level.name}` : ''}` : 'Aucune carrière sélectionnée'} · ${legacyCareerTalents.length + catalogOnlyCareerTalents.length} talent(s)`;
    if (speciesLabel) speciesLabel.textContent = `${species ? `Espèce : ${species.name}` : 'Aucune espèce sélectionnée'} · ${legacySpeciesTalents.length + catalogOnlySpeciesTalents.length} talent(s)`;
  }
  const careerTalentCount = new Set([...careerSuggestions.talents.map((item) => item.name), ...catalogCareerTalents.map((item) => item.name_fr || item.name)]).size;
  const speciesTalentCount = new Set([...speciesSuggestions.talents.map((item) => item.name), ...catalogSpeciesTalents.map((item) => item.name_fr || item.name)]).size;
  for (const [id, count] of [['add-career-skills', careerSuggestions.skills.length], ['add-career-talents', careerTalentCount], ['add-species-skills', speciesSuggestions.skills.length], ['add-species-talents', speciesTalentCount]]) {
    const button = form.querySelector(`[data-action="${id}"]`);
    if (button) button.disabled = count === 0;
    if (button) button.title = count ? `${count} suggestion(s) disponible(s)` : 'Aucune suggestion renseignée dans ce référentiel';
  }
}

function addReferenceSuggestions(collection, sourceType) {
  const form = document.querySelector('#character-form');
  if (!form || !editorState) return;
  const current = readEditorCollection(form, collection);
  const careerId = form.querySelector('[data-reference-picker="careers"] [data-picker-id]')?.value || '';
  const career = referenceEntries.find((entry) => entry.kind === 'careers' && entry.id === careerId) || null;
  const levelId = form.querySelector('#career-level-select')?.value || '';
  const level = getCareerLevels(career).find((entry) => entry.id === levelId) || null;
  const speciesId = form.querySelector('#species-reference-id')?.value || '';
  const species = referenceEntries.find((entry) => entry.kind === 'species' && entry.id === speciesId) || null;
  const suggestions = sourceType === 'career'
    ? getCreationSuggestions({ career, level })[collection]
    : getCreationSuggestions({ species })[collection];
  if (collection === 'talents') {
    const catalogSuggestions = referenceEntries.filter((entry) => entry.kind === 'talents' && (
      sourceType === 'career'
        ? Boolean((career && (entry.careerIds || []).includes(career.id)) || (level && (entry.careerLevelIds || []).includes(level.id)))
        : Boolean(species && (entry.species || []).includes(species.id))
    )).map((entry) => ({
      id: entry.id,
      name: entry.name_fr || entry.name,
      rank: 1,
      maxRank: entry.maxRank,
      nameFr: entry.name_fr,
      nameOriginal: entry.name_original,
      category: entry.category,
      verificationStatus: entry.verificationStatus,
      description: entry.description,
      conditions: (entry.prerequisites || []).join(' ; '),
      prerequisites: entry.prerequisites || [],
      advancementCost: entry.advancementCost,
      advancementCostVerified: entry.advancementCostVerified === true,
      effects: entry.effects || [],
      references: entry.sourceInfo?.title ? [`${entry.sourceInfo.title}${entry.sourceInfo.page ? `, p. ${entry.sourceInfo.page}` : ''}`] : []
    }));
    suggestions.push(...catalogSuggestions);
  }
  const metadata = sourceType === 'career'
    ? { collection, sourceCareerId: career?.id || '', sourceCareerLevelId: level?.id || '' }
    : { collection, sourceSpeciesId: species?.id || '' };
  const merged = mergeSuggestedEntries(current, suggestions, metadata);
  if (sourceType === 'career' && collection === 'skills') {
    for (const item of merged.additions) item.career = true;
  }
  const container = form.querySelector(`#collection-${collection}`);
  const renderer = collection === 'skills' ? renderSkillEditorRow : renderTalentEditorRow;
  if (container) {
    container.innerHTML = merged.entries.length
      ? merged.entries.map((entry) => renderer(entry, collection, editorState.character)).join('')
      : '<p class="collection-empty">Aucune entrée. Utilisez le bouton pour en ajouter une.</p>';
    if (collection === 'talents') mountTalentPickers(container, referenceEntries);
  }
  syncEditorStateFromForm(form);
  scheduleEditorSave();
  showToast(merged.additions.length
    ? `${merged.additions.length} suggestion(s) ajoutée(s), à confirmer avant acquisition.`
    : 'Aucune nouvelle suggestion. Les entrées déjà présentes sont conservées.', merged.additions.length ? 'success' : 'info');
}

function generateAndApplyCharacteristics() {
  const form = document.querySelector('#character-form');
  const speciesField = form?.querySelector('[name="identity.species"]');
  const species = speciesField?.value || '';
  if (!species) {
    showToast('Choisissez d’abord une espèce dans la section « Espèce » avant de lancer les dés.', 'error');
    return;
  }

  try {
    const profiles = referenceEntries.filter((entry) => entry.kind === 'species');
    const result = generateCharacteristics(species, profiles);
    // Le bouton Dé applique immédiatement les dix jets ; l'historique permet
    // de revenir en arrière sans passer par un écran de confirmation séparé.
    applyCharacteristicGeneration(result);
  } catch (error) {
    showToast(error.message || 'Impossible de générer les caractéristiques.', 'error');
  }
}

function applyCharacteristicGeneration(result) {
  const form = document.querySelector('#character-form');
  if (!result || !form) return;
  const selectedSpecies = form.querySelector('[name="identity.species"]')?.value || '';
  if (selectedSpecies !== result.requestedSpecies) {
    showToast('L’espèce a changé. Relancez les dés pour appliquer les nouvelles valeurs.', 'error');
    return;
  }

  const previousValues = Object.fromEntries(CHARACTERISTICS.map(({ key }) => {
    const value = form.querySelector(`[name="characteristics.${key}"]`)?.value ?? '';
    return [key, value === '' ? null : Number(value)];
  }));
  editorState.generationHistory ||= [];
  editorState.generationHistory.push({
    previousValues,
    previousGeneration: clone(editorState.character.characteristicGeneration),
    generatedValues: Object.fromEntries(CHARACTERISTICS.map(({ key }) => [key, result.details[key].diceTotal])),
    speciesName: result.species,
    generatedAt: new Date().toISOString()
  });
  editorState.generationHistory = editorState.generationHistory.slice(-5);

  for (const { key } of CHARACTERISTICS) {
    const input = form.querySelector(`[name="characteristics.${key}"]`);
    const detail = result.details[key];
    const speciesModifier = form.querySelector(`[name="characteristicSpeciesModifiers.${key}"]`);
    if (input) input.value = String(detail.diceTotal);
    if (speciesModifier) speciesModifier.value = String(detail.modifier);
  }
  const speciesProfile = findSpeciesProfile(selectedSpecies, referenceEntries);
  form.querySelector('#species-reference-id').value = speciesProfile?.id || '';
  editorState.character.identity.speciesId = speciesProfile?.id || '';
  editorState.character.characteristicGeneration = {
    method: '2d10',
    speciesProfileId: speciesProfile?.id || result.profileId || '',
    speciesName: result.species,
    generatedAt: new Date().toISOString(),
    modifiers: Object.fromEntries(CHARACTERISTICS.map(({ key }) => [key, result.details[key].modifier])),
    rolls: Object.fromEntries(CHARACTERISTICS.map(({ key }) => [key, [...result.details[key].dice]]))
  };
  syncEditorStateFromForm(form);
  updateCharacteristicPreviews(form);
  updateGenerationHistoryUI();
  scheduleEditorSave();
  showToast('Les dix caractéristiques ont été appliquées. Elles restent modifiables.');
}

function updateGenerationHistoryUI() {
  const history = editorState?.generationHistory || [];
  const count = document.querySelector('#characteristic-generation-history-count');
  const undo = document.querySelector('[data-action="undo-characteristics-generation"]');
  if (count) {
    const latest = history.at(-1);
    count.textContent = history.length
      ? `${history.length} génération(s) effectuée(s) dans cette session${latest ? ` · dernière : ${latest.speciesName}` : ''}.`
      : 'Aucune génération effectuée dans cette session.';
  }
  if (undo) undo.disabled = history.length === 0;
}

function undoLastCharacteristicGeneration() {
  const form = document.querySelector('#character-form');
  const history = editorState?.generationHistory;
  const previous = history?.at(-1);
  if (!form || !previous) return;
  const changedAfterGeneration = CHARACTERISTICS.some(({ key }) => {
    const current = form.querySelector(`[name="characteristics.${key}"]`)?.value ?? '';
    const generated = previous.generatedValues[key];
    return current === '' || Number(current) !== generated;
  });
  if (changedAfterGeneration && !window.confirm('Certaines valeurs ont été modifiées après la dernière génération. Annuler le jet restaurera les valeurs qui existaient juste avant celui-ci et remplacera ces modifications. Continuer ?')) return;
  for (const { key } of CHARACTERISTICS) {
    const input = form.querySelector(`[name="characteristics.${key}"]`);
    if (input) input.value = previous.previousValues[key] === null ? '' : String(previous.previousValues[key]);
  }
  editorState.character.characteristicGeneration = clone(previous.previousGeneration);
  history.pop();
  syncEditorStateFromForm(form);
  updateCharacteristicPreviews(form);
  updateGenerationHistoryUI();
  scheduleEditorSave();
  showToast('La dernière génération a été annulée. Les modificateurs de l’espèce actuelle sont conservés.');
}

function speciesPreviewMarkup(species) {
  if (!species) return '<p class="career-preview-empty">Choisissez une espèce pour consulter ses informations et ses modificateurs.</p>';
  const modifiers = CHARACTERISTICS.map(({ key, shortLabel }) => {
    const value = species.characteristicModifiers?.[key];
    return `<span><strong>${escapeHTML(shortLabel)}</strong> ${Number.isInteger(value) ? `+${escapeHTML(value)}` : '—'}</span>`;
  }).join('');
  const aliases = (species.aliases || []).length ? `<p><strong>Alias :</strong> ${escapeHTML(species.aliases.join(' · '))}</p>` : '';
  const traits = [...(species.particularities || []), ...(species.specialTraits || [])];
  const traitMarkup = traits.length ? `<p><strong>Particularités :</strong> ${escapeHTML(traits.join(' · '))}</p>` : '';
  const itemNames = (items = []) => items.map((item) => typeof item === 'string' ? item : item?.name || '').filter(Boolean);
  const skills = itemNames(species.skills);
  const talents = itemNames(species.talents);
  const skillsMarkup = skills.length ? `<p><strong>Compétences associées :</strong> ${escapeHTML(skills.join(' · '))}</p>` : '';
  const talentsMarkup = talents.length ? `<p><strong>Talents associés :</strong> ${escapeHTML(talents.join(' · '))}</p>` : '';
  const references = (species.references || []).length ? `<p><strong>Références :</strong> ${escapeHTML(species.references.join(' · '))}</p>` : '';
  return `<div class="career-preview-content"><p>${escapeHTML(species.description || 'Aucune description disponible.')}</p><div class="species-modifier-grid">${modifiers}</div>${aliases}${traitMarkup}${skillsMarkup}${talentsMarkup}${references}</div>`;
}

function renderExperienceHistory(character) {
  const history = [...(character.experience.history || [])].reverse();
  if (!history.length) return '<p class="empty-inline">Aucun mouvement d’expérience enregistré.</p>';
  const labels = { gain: 'Gain', purchase: 'Achat', refund: 'Remboursement', undo: 'Annulation', correction: 'Correction', 'career-change': 'Changement de carrière' };
  const rows = history.map((entry) => {
    const delta = Number.isFinite(entry.xpBefore) && Number.isFinite(entry.xpAfter)
      ? entry.xpAfter - entry.xpBefore
      : (entry.type === 'gain' || (entry.type === 'undo' && ['purchase', 'career-change'].includes(entry.originalOperationType)) || entry.type === 'refund' ? entry.amount : -entry.amount);
    const balance = Number.isFinite(entry.xpBefore) && Number.isFinite(entry.xpAfter) ? `${entry.xpBefore} → ${entry.xpAfter}` : 'Ancien historique';
    return `<tr><td>${escapeHTML(formatDate(entry.date, { hour: '2-digit', minute: '2-digit' }))}</td><td>${escapeHTML(labels[entry.type] || 'Opération')}</td><td>${escapeHTML(entry.note || entry.targetPath || '—')}</td><td class="${delta < 0 ? 'xp-negative' : 'xp-positive'}">${delta > 0 ? '+' : ''}${delta} XP</td><td>${escapeHTML(balance)} XP</td></tr>`;
  }).join('');
  return `<div class="responsive-table"><table class="data-table"><thead><tr><th>Date</th><th>Opération</th><th>Détail</th><th>Variation</th><th>Solde avant → après</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderEditor(character) {
  const { identity, secondary, experience, profile } = character;
  const selectedCareer = findReferenceByLegacyValue(referenceEntries, 'careers', identity.careerId, identity.career);
  const selectedLevel = findCareerLevel(selectedCareer, identity.careerLevelId, identity.careerLevel);
  const selectedSpecies = findSpeciesProfile(identity.species, referenceEntries);
  const stageLabels = [
    ['identity', 'Identité'], ['species', 'Espèce'], ['characteristics', 'Caractéristiques'], ['career', 'Carrière'],
    ['religion', 'Religion'], ['skills', 'Compétences'], ['talents', 'Talents'], ['experience', 'Progression et XP'],
    ['equipment', 'Équipement'], ['combat', 'Combat'], ['resources', 'Ressources'], ['notes', 'Notes']
  ];
  const stage = (id, title, description, content) => `<section class="form-section sheet-section" id="sheet-${id}" data-sheet-section="${id}"><div class="form-section-title"><span>${String(stageLabels.findIndex(([key]) => key === id) + 1).padStart(2, '0')}</span><div><h3>${title}</h3><p>${description}</p></div></div>${content}</section>`;
  const identityContent = `<div class="form-grid">
    ${field('Prénom', 'identity.firstName', identity.firstName, { placeholder: 'Ex. : Alaric' })}
    ${field('Nom', 'identity.lastName', identity.lastName, { placeholder: 'Ex. : von Kessel' })}
    ${field('Genre', 'identity.gender', identity.gender, { placeholder: 'Facultatif' })}
    ${field('Âge', 'identity.age', identity.age, { type: 'number', min: 0, max: 999 })}
    ${field('Origine', 'identity.origin', identity.origin, { placeholder: 'Ville, province…' })}
    ${field('Taille', 'identity.height', identity.height, { placeholder: 'Ex. : 1,78 m' })}
    ${field('Poids', 'identity.weight', identity.weight, { placeholder: 'Ex. : 75 kg' })}
    ${field('Couleur des yeux', 'identity.eyeColor', identity.eyeColor)}
    ${field('Couleur des cheveux', 'identity.hairColor', identity.hairColor)}
  </div>`;
  const speciesContent = `<div class="form-grid">${speciesSelectField(identity.species)}<input type="hidden" name="identity.speciesId" id="species-reference-id" value="${escapeHTML(identity.speciesId || selectedSpecies?.id || '')}"><div class="career-preview form-field-wide" id="species-preview">${speciesPreviewMarkup(selectedSpecies)}</div></div><p class="form-hint">Les modificateurs sont appliqués séparément des jets initiaux. Changer d’espèce met à jour ces bonus sans remplacer les valeurs de base saisies.</p>`;
  const characteristicContent = `<div class="characteristic-section-heading"><div><p>Valeur initiale, bonus d’espèce, effets de talents, augmentations et valeur actuelle.</p></div><button type="button" class="characteristic-generator-trigger" data-action="generate-characteristics" title="Générer les caractéristiques aléatoirement" aria-label="Générer les caractéristiques aléatoirement"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8" cy="8" r="1.25"/><circle cx="16" cy="8" r="1.25"/><circle cx="8" cy="12" r="1.25"/><circle cx="16" cy="12" r="1.25"/><circle cx="8" cy="16" r="1.25"/><circle cx="16" cy="16" r="1.25"/></svg></button></div><div class="generation-history-bar"><span id="characteristic-generation-history-count">Aucune génération effectuée dans cette session.</span><button type="button" class="button button-quiet button-small" data-action="undo-characteristics-generation" disabled>↶ Annuler la dernière génération</button></div>${characteristicEditorMarkup(character)}<p class="form-hint">Un jet applique deux dés à dix faces (2d10) à chaque caractéristique, puis le modificateur de l’espèce. Les coûts XP sont calculés automatiquement à partir du nombre d’avancements déjà achetés.</p>`;
  const careerContent = `<div class="form-grid">${renderReferencePicker({ kind: 'careers', entries: referenceEntries, selectedId: identity.careerId, value: identity.career })}${careerLevelField(identity, selectedCareer)}<label class="inline-check form-field-wide"><input type="checkbox" name="identity.careerCompleted" ${identity.careerCompleted ? 'checked' : ''}><span>Carrière actuelle terminée (achèvement et conditions de sortie vérifiés)</span></label><div class="career-preview form-field-wide" id="career-preview">${careerPreviewMarkup(selectedCareer, selectedLevel)}</div><div class="career-suggestions form-field-wide" id="career-suggestions"><p class="form-hint">Sélectionnez une carrière et un niveau pour afficher les compétences et talents documentés associés.</p></div></div>`;
  const religionContent = `<div class="form-grid">${renderReferencePicker({ kind: 'religions', entries: referenceEntries, selectedId: identity.religionId, value: identity.religion })}${renderReferencePicker({ kind: 'deities', entries: referenceEntries, selectedId: identity.deityId, value: identity.deity })}</div><p class="form-hint">Cette étape est facultative. La divinité est filtrée selon le culte sélectionné ; les liens existants sont vérifiés avant validation.</p>`;
  const skillsContent = `<div id="skill-suggestions" class="suggestion-panel"><p class="form-hint">Les compétences des référentiels peuvent être proposées ici. Les ajouter les sélectionne sans les déclarer acquises ni leur attribuer d’avancement.</p><button type="button" class="button button-outline button-small" data-action="add-career-skills">＋ Ajouter les compétences de carrière</button><button type="button" class="button button-quiet button-small" data-action="add-species-skills">＋ Ajouter les compétences d’espèce</button></div>${renderCollectionSection('Compétences', 'skills', character.skills || [], renderSkillEditorRow, 'Achetez les avancements directement sur chaque ligne. Les coûts suivent le moteur de progression configuré.', character)}`;
  const talentsContent = `<div id="talent-suggestions" class="suggestion-panel"><p class="form-hint">Les talents associés sont proposés séparément selon leur provenance. Examinez leurs conditions puis ajoutez-les explicitement ; aucun talent n’est acquis automatiquement.</p><div class="talent-suggestion-group"><strong data-talent-career-count>Carrière / niveau</strong><ul data-talent-career-list></ul><button type="button" class="button button-outline button-small" data-action="add-career-talents">＋ Ajouter les talents de carrière</button></div><div class="talent-suggestion-group"><strong data-talent-species-count>Espèce</strong><ul data-talent-species-list></ul><button type="button" class="button button-quiet button-small" data-action="add-species-talents">＋ Ajouter les talents d’espèce</button></div></div>${renderCollectionSection('Talents', 'talents', character.talents || [], renderTalentEditorRow, 'Achetez l’acquisition ou le rang suivant directement sur la ligne du talent.', character)}`;
  const experienceAvailable = getExperienceAvailable(character);
  const reversedHistoryIds = new Set((experience.history || []).filter((entry) => entry.type === 'undo').map((entry) => entry.reversedEntryId));
  const canUndoPurchase = (experience.history || []).some((entry) => ['gain', 'purchase', 'refund', 'correction', 'career-change'].includes(entry.type) && !reversedHistoryIds.has(entry.id));
  const experienceContent = `<div class="detail-summary-grid"><article class="detail-summary"><span>Expérience totale</span><strong>${experience.total.toLocaleString('fr-FR')} <small>XP</small></strong></article><article class="detail-summary"><span>Expérience dépensée</span><strong>${experience.spent.toLocaleString('fr-FR')} <small>XP</small></strong></article><article class="detail-summary detail-summary-highlight"><span>Expérience disponible</span><strong class="${experienceAvailable < 0 ? 'xp-negative' : ''}">${experienceAvailable.toLocaleString('fr-FR')} <small>XP</small></strong></article></div><div class="experience-actions"><div class="experience-gain-control"><label class="xp-action-field"><span>Gain d’expérience (XP)</span><input type="number" min="1" max="1000000000" step="1" value="50" data-ephemeral data-xp-gain-amount></label><label class="xp-action-field"><span>Motif (facultatif)</span><input type="text" maxlength="500" value="Gain d’expérience" data-ephemeral data-xp-gain-note></label><button class="button button-outline" type="button" data-action="grant-experience" data-character-id="${escapeHTML(character.id)}">＋ Ajouter le gain</button></div><details class="experience-correction"><summary>Corriger le solde d’expérience</summary><div class="experience-correction-fields"><label class="xp-action-field"><span>Expérience totale</span><input type="number" min="0" max="1000000000" step="1" value="${experience.total}" data-ephemeral data-xp-correction-total></label><label class="xp-action-field"><span>Expérience dépensée</span><input type="number" min="0" max="1000000000" step="1" value="${experience.spent}" data-ephemeral data-xp-correction-spent></label><label class="xp-action-field"><span>Motif</span><input type="text" maxlength="500" value="Correction manuelle vérifiée" data-ephemeral data-xp-correction-note></label><button class="button button-quiet" type="button" data-action="correct-experience" data-character-id="${escapeHTML(character.id)}">Enregistrer la correction</button></div></details>${canUndoPurchase ? `<button class="button button-quiet" type="button" data-action="undo-last-purchase" data-character-id="${escapeHTML(character.id)}">↶ Annuler la dernière opération</button>` : ''}</div>${renderExperienceHistory(character)}`;
  const equipmentContent = `<div class="editor-collection-group">
      ${renderCollectionSection('Armes', 'weapons', character.equipment?.weapons || [], renderEquipmentEditorRow)}
      ${renderCollectionSection('Armures', 'armour', character.equipment?.armour || [], renderEquipmentEditorRow)}
      ${renderCollectionSection('Objets et possessions', 'possessions', character.equipment?.possessions || [], renderEquipmentEditorRow)}
      ${renderCollectionSection('Sorts', 'spells', character.equipment?.spells || [], renderEquipmentEditorRow)}
      ${renderCollectionSection('Prières', 'prayers', character.equipment?.prayers || [], renderEquipmentEditorRow)}
    </div>`;
  const combatContent = `<div class="form-grid form-grid-stats">
      ${field('Mouvement', 'secondary.movement', secondary.movement, { type: 'number', min: 0 })}
      ${field('Blessures actuelles', 'secondary.woundsCurrent', secondary.woundsCurrent, { type: 'number', min: 0 })}
      ${field('Blessures maximales', 'secondary.woundsMax', secondary.woundsMax, { type: 'number', min: 0 })}
      ${field('Résistance', 'secondary.resistance', secondary.resistance, { type: 'number', min: 0 })}
      ${field('Bonus de Force (secours si F indisponible)', 'secondary.strengthBonus', secondary.strengthBonus, { type: 'number', min: 0 })}
      ${field('Bonus d’Endurance (secours si E indisponible)', 'secondary.enduranceBonus', secondary.enduranceBonus, { type: 'number', min: 0 })}
      ${field('Points de destin', 'secondary.fate', secondary.fate, { type: 'number', min: 0 })}
      ${field('Points de chance', 'secondary.fortune', secondary.fortune, { type: 'number', min: 0 })}
      ${field('Résilience', 'secondary.resilience', secondary.resilience, { type: 'number', min: 0 })}
      ${field('Motivation', 'secondary.resolve', secondary.resolve, { type: 'number', min: 0 })}
    </div><p class="form-hint">Les valeurs dérivées restent calculées automatiquement. Les champs secondaires sans formule vérifiée sont modifiables ici.</p>`;
  const resourcesContent = `<div class="form-grid form-grid-stats">
      ${field('Points de corruption', 'resources.corruptionPoints', character.resources?.corruptionPoints ?? 0, { type: 'number', min: 0 })}
      ${field('Seuil de corruption', 'rules.corruptionThreshold', character.rules?.corruptionThreshold, { type: 'number', min: 0 })}
      ${field('Capacité d’encombrement', 'rules.encumbranceCapacity', character.rules?.encumbranceCapacity, { type: 'number', min: 0, step: 'any' })}
      ${selectField('Statut', 'identity.status', identity.status, ['Actif', 'En pause', 'Inactif'])}
    </div><p class="form-hint">Les ressources dont aucune formule vérifiée n’est configurée restent saisissables manuellement.</p>`;
  const notesContent = `<div class="form-grid">${textareaField('Description physique', 'profile.description', profile.description, 'Apparence, signes distinctifs…')}${textareaField('Histoire personnelle', 'profile.history', profile.history, 'Origines, événements marquants…')}${textareaField('Objectifs', 'profile.goals', profile.goals, 'Ce que votre personnage cherche à accomplir…')}${textareaField('Notes personnelles', 'profile.notes', profile.notes, 'Informations libres…')}</div>`;
  const careerChangeOptions = referenceEntries
    .filter((entry) => entry.kind === 'careers' && (identity.careerId ? entry.id !== identity.careerId : entry.name !== identity.career))
    .sort((left, right) => left.name.localeCompare(right.name, 'fr'))
    .map((entry) => `<option value="${escapeHTML(entry.id)}">${escapeHTML(entry.name)}</option>`).join('');
  const careerChangeAction = `<div class="career-change-action form-field-wide"><p>Après achèvement et vérification des conditions de sortie, choisissez une nouvelle carrière. Coût : ${CAREER_CHANGE_COST} XP.</p><label class="xp-action-field"><span>Nouvelle carrière</span><select data-ephemeral data-career-change-career><option value="">Choisir une carrière…</option>${careerChangeOptions}</select></label><label class="xp-action-field"><span>Niveau de départ</span><select data-ephemeral data-career-change-level data-career-id=""><option value="">Choisissez d’abord une carrière</option></select></label><button class="button button-outline" type="button" data-action="change-career" data-character-id="${escapeHTML(character.id)}" disabled>Changer de carrière · ${CAREER_CHANGE_COST} XP</button></div>`;
  const stages = [
    stage('identity', 'Identité', 'Renseignez les informations personnelles dans l’ordre qui vous convient.', identityContent),
    stage('species', 'Espèce', 'Choisissez une espèce et consultez les données configurées.', speciesContent),
    stage('characteristics', 'Caractéristiques principales', 'Générez les caractéristiques ou saisissez-les individuellement.', characteristicContent),
    stage('career', 'Carrière et niveau', 'Choisissez ou ajustez directement la carrière et son niveau.', `${careerContent}${careerChangeAction}`),
    stage('religion', 'Religion et divinité', 'Une étape facultative, reliée aux données de votre catalogue.', religionContent),
    stage('skills', 'Compétences', 'Ajoutez les compétences et achetez leurs avancements sur chaque ligne.', skillsContent),
    stage('talents', 'Talents', 'Ajoutez les talents et gérez leur acquisition et leurs rangs sur la même ligne.', talentsContent),
    stage('experience', 'Progression et expérience', 'Suivez les gains, achats, remboursements et le solde disponible.', experienceContent),
    stage('equipment', 'Équipement, magie et prières', 'Gérez armes, armures, possessions, sorts et prières depuis leurs sections.', equipmentContent),
    stage('combat', 'Combat', 'Modifiez blessures, mouvement et autres valeurs secondaires.', combatContent),
    stage('resources', 'Ressources', 'Suivez corruption, encombrement et statut du personnage.', resourcesContent),
    stage('notes', 'Notes et chronique', 'Ajoutez librement description, histoire, objectifs et notes.', notesContent)
  ].join('');
  const sectionNav = `<nav class="sheet-nav" aria-label="Sections de la fiche">${[
    ['identity', 'Identité'], ['species', 'Espèce'], ['characteristics', 'Caractéristiques'], ['career', 'Carrière'], ['religion', 'Religion'],
    ['skills', 'Compétences'], ['talents', 'Talents'], ['experience', 'Progression et XP'], ['equipment', 'Équipement'], ['combat', 'Combat'], ['resources', 'Ressources'], ['notes', 'Notes']
  ].map(([id, label]) => `<button type="button" data-action="scroll-section" data-target="sheet-${id}">${label}</button>`).join('')}</nav>`;
  const footer = `<footer class="editor-footer sheet-footer"><span class="autosave-state" id="autosave-state" role="status" aria-live="polite"><i></i> Enregistré</span><div><button type="button" class="button button-quiet" data-action="duplicate-character" data-id="${escapeHTML(character.id)}">Dupliquer</button><button type="button" class="button button-quiet" data-action="delete-character" data-id="${escapeHTML(character.id)}">Supprimer</button></div></footer>`;
  return `
    <div class="detail-page character-sheet">
      <header class="character-sheet-heading">
        <div><a class="back-link" href="#/">← Retour au registre</a><div class="eyebrow"><span class="eyebrow-line"></span> FICHE PERSONNAGE UNIQUE</div><h1>${escapeHTML(getCharacterName(character))}</h1><p>Toutes les informations sont modifiables directement sur cette fiche.</p></div>
        <div class="hero-actions"><button class="button button-outline" type="button" data-action="export-character" data-id="${escapeHTML(character.id)}">⇩ Exporter</button></div>
      </header>
      ${sectionNav}
      <form id="character-form" class="character-form character-sheet-form" novalidate>${stages}${footer}</form>
    </div>`;
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
  candidate.identity.careerCompleted = Boolean(form.querySelector('[name="identity.careerCompleted"]')?.checked);
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

function syncEditorStateFromForm(form = document.querySelector('#character-form')) {
  if (!editorState || !form) return null;
  const candidate = collectEditorValues();
  editorState.character = candidate;
  return candidate;
}

function updateAutosaveState(message, state = '') {
  const element = document.querySelector('#autosave-state');
  if (!element) return;
  element.innerHTML = `<i></i> ${escapeHTML(message)}`;
  element.dataset.state = state;
}

function enqueueEditorSave(operation) {
  const queued = editorSaveQueue.then(operation);
  editorSaveQueue = queued.catch(() => undefined);
  return queued;
}

function queueEditorSave(complete = false) {
  const state = editorState;
  if (!state) return Promise.resolve();
  return enqueueEditorSave(async () => {
    if (editorState !== state) return;
    const candidate = collectEditorValues();
    if (complete) candidate.isDraft = false;
    await saveCharacter(candidate);
    const index = characters.findIndex((item) => item.id === candidate.id);
    if (index >= 0) characters[index] = candidate;
    else characters.push(candidate);
    setSaveIndicator('Enregistré sur cet appareil', 'saved');
    updateAutosaveState('Enregistré sur cet appareil', 'saved');
    updateSidebar();
  });
}

function scheduleEditorSave() {
  updateAutosaveState('Modifications en cours…', 'dirty');
  setSaveIndicator('Modifications en cours…', 'pending');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    updateAutosaveState('Enregistrement…', 'saving');
    setSaveIndicator('Enregistrement…', 'saving');
    queueEditorSave().catch((error) => {
      updateAutosaveState('Échec de la sauvegarde', 'error');
      setSaveIndicator('Erreur de sauvegarde', 'error');
      showToast(error.message || 'Impossible d’enregistrer cette fiche.', 'error');
    });
  }, 450);
}

async function openEditor(character) {
  // La fiche est l'écran de travail permanent : aucune modale ni mode édition.
  editorState = { character: clone(character), originalCareerIdentity: clone(character.identity), generationHistory: [] };
  viewRoot.innerHTML = renderEditor(character);
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
      if (kind === 'careers') {
        const oldCareerId = previous?.id || editorState?.originalCareerIdentity?.careerId || '';
        const previousCareerName = previous?.name || editorState?.originalCareerIdentity?.career || '';
        const changedCareer = oldCareerId
          ? entry?.id !== oldCareerId
          : Boolean(previousCareerName && entry?.name !== previousCareerName);
        if (changedCareer) {
          const linkedRows = oldCareerId
            ? [...form.querySelectorAll('[data-item-row][data-source-career-id]')]
              .filter((row) => row.dataset.sourceCareerId === oldCareerId)
            : [];
          const oldCareerLabel = previous?.name || previousCareerName || 'l’ancienne carrière';
          if (linkedRows.length && !window.confirm(`La nouvelle carrière ne correspond plus à ${linkedRows.length} compétence(s) ou talent(s) suggéré(s) par « ${oldCareerLabel} ».\n\nLes retirer de cette sélection ?`)) return false;
          const completionCheckbox = form.querySelector('[name="identity.careerCompleted"]');
          if (completionCheckbox) completionCheckbox.checked = false;
          linkedRows.forEach((row) => row.remove());
          for (const collection of ['skills', 'talents']) {
            const container = form.querySelector(`#collection-${collection}`);
            if (container && !container.querySelector('[data-item-row]')) container.innerHTML = '<p class="collection-empty">Aucune entrée. Utilisez le bouton pour en ajouter une.</p>';
          }
        }
        updateCareerLevelOptions(entry, previous);
      }
      return true;
    }
  });
  mountTalentPickers(form, referenceEntries);
  form.addEventListener('input', (event) => {
    if (event.target.matches('[data-ephemeral]')) return;
    syncEditorStateFromForm(form);
    const heading = document.querySelector('.character-sheet-heading h1');
    if (heading) heading.textContent = getCharacterName(editorState.character);
    if (event.target.closest('[data-item-row]') || event.target.matches('[data-stat-initial], [data-stat-advances]')) updateCharacteristicPreviews(form);
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
        skills: () => renderSkillEditorRow({ id: createId(), useCharacteristicBase: true, advances: 0, acquired: true, status: 'acquired' }, 'skills', editorState.character),
        talents: () => renderTalentEditorRow({ id: createId(), rank: 1, acquired: false, status: 'selected' }, 'talents', editorState.character),
        weapons: () => renderEquipmentEditorRow({ id: createId(), quantity: 1 }, 'weapons'),
        armour: () => renderEquipmentEditorRow({ id: createId(), quantity: 1 }, 'armour'),
        possessions: () => renderEquipmentEditorRow({ id: createId(), quantity: 1 }, 'possessions'),
        spells: () => renderEquipmentEditorRow({ id: createId(), quantity: 1 }, 'spells'),
        prayers: () => renderEquipmentEditorRow({ id: createId(), quantity: 1 }, 'prayers')
      };
      if (!templates[collection]) return;
      container.insertAdjacentHTML('beforeend', templates[collection]());
      if (collection === 'talents') mountTalentPickers(container, referenceEntries);
      container.querySelector('[data-item-row]:last-child [data-collection-field="name"]')?.focus();
    }
    syncEditorStateFromForm(form);
    updateCharacteristicPreviews(form);
    scheduleEditorSave();
  });
  form.addEventListener('change', (event) => {
    if (event.target.matches('[data-ephemeral]')) {
      updateInlineProgressionControls(form);
      return;
    }
    updateInlineProgressionControls(form);
    if (event.target.name === 'identity.species') {
      updateSpeciesSelection(form);
    }
    if (event.target.id === 'career-level-select') {
      const careerId = form.querySelector('[data-reference-picker="careers"] [data-picker-id]')?.value || '';
      const career = referenceEntries.find((entry) => entry.kind === 'careers' && entry.id === careerId);
      const level = getCareerLevels(career).find((item) => item.id === event.target.value);
      document.querySelector('#career-level-id').value = level?.id || '';
      document.querySelector('#career-level-value').value = level?.name || '';
      const preview = document.querySelector('#career-preview');
      if (preview) preview.innerHTML = careerPreviewMarkup(career, level);
      refreshReferenceSuggestions();
    }
    syncEditorStateFromForm(form);
    updateCharacteristicPreviews(form);
    scheduleEditorSave();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearTimeout(saveTimer);
    try {
      await queueEditorSave();
      showToast('Fiche enregistrée automatiquement.');
    } catch (error) {
      updateAutosaveState('Échec de la sauvegarde', 'error');
      showToast(error.message || 'Impossible d’enregistrer cette fiche.', 'error');
    }
  });
  updateSidebar();
  updateCharacteristicPreviews(form);
  updateInlineProgressionControls(form);
  refreshReferenceSuggestions();
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
  refreshReferenceSuggestions();
}

async function createNewCharacter() {
  try {
    const character = createCharacter({ isDraft: false, creationWizard: null });
    await saveCharacter(character);
    characters.push(character);
    setSaveIndicator('Fiche vierge créée', 'saved');
    navigate(`/character/${encodeURIComponent(character.id)}`);
  } catch (error) {
    showToast(error.message || 'Impossible de créer une fiche.', 'error');
  }
}

function openCharacterSheet(id) {
  const character = characters.find((item) => item.id === id);
  if (!character) return showToast('Ce personnage est introuvable.', 'error');
  navigate(`/character/${encodeURIComponent(id)}`);
}

async function removeCharacter(id) {
  const character = characters.find((item) => item.id === id);
  if (!character) return;
  if (!window.confirm(`Supprimer définitivement « ${getCharacterName(character)} » de ce navigateur ?`)) return;
  try {
    if (editorState?.character.id === id) {
      clearTimeout(saveTimer);
      await queueEditorSave();
    }
    await deleteCharacter(id);
    characters = characters.filter((item) => item.id !== id);
    if (editorState?.character.id === id) editorState = null;
    if (getRoute().name === 'character' && getRoute().id === id) {
      navigate('/');
      return;
    }
    renderCurrentRoute();
    showToast('Personnage supprimé.');
  } catch (error) {
    showToast(error.message || 'Impossible de supprimer ce personnage.', 'error');
  }
}

async function duplicateCharacter(id) {
  const duplicateFromSheet = editorState?.character.id === id;
  if (duplicateFromSheet) {
    clearTimeout(saveTimer);
    try {
      await queueEditorSave();
      const saved = await getCharacter(id);
      if (saved) characters[characters.findIndex((item) => item.id === id)] = saved;
    } catch (error) {
      showToast(error.message || 'Impossible d’enregistrer la fiche avant duplication.', 'error');
      return;
    }
  }
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
    if (duplicateFromSheet) {
      characters.push(duplicate);
      navigate('/');
    } else {
      await refreshCharacters();
    }
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

async function exportOneCharacter(id) {
  try {
    if (editorState?.character.id === id) await queueEditorSave();
    const character = editorState?.character.id === id ? await getCharacter(id) : characters.find((item) => item.id === id);
    if (!character) throw new Error('Ce personnage est introuvable.');
    downloadJSON(createCharacterExport(character), `wfrp-personnage-${safeFilename(getCharacterName(character))}.json`);
    showToast('Fiche exportée au format JSON.');
  } catch (error) {
    showToast(error.message || 'Impossible d’exporter cette fiche.', 'error');
  }
}

async function exportBackup() {
  try {
    if (editorState) await queueEditorSave();
    const savedCharacters = editorState ? await getAllCharacters() : characters;
    downloadJSON(createBackupExport(savedCharacters), `wfrp-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`);
    showToast('Sauvegarde complète exportée.');
  } catch (error) {
    showToast(error.message || 'Impossible de créer la sauvegarde.', 'error');
  }
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
  await saveCharacters(prepared.map((entry) => entry.character));
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
    const previousLevel = careerLevels.find((entry) => entry.id === card.dataset.careerLevelId) || {};
    for (const fieldName of ['skills', 'skillIds', 'talents', 'talentIds', 'advancements', 'entryConditions', 'exitConditions', 'equipment', 'references']) {
      const lines = splitLines(card.querySelector(`[data-level-field="${fieldName}"]`)?.value || '');
      level[fieldName] = ['skills', 'talents'].includes(fieldName)
        ? preserveNamedMetadata(lines, previousLevel[fieldName], fieldName)
        : lines;
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
      data.particularities = splitLines(values.get('particularities'));
      data.skills = preserveNamedMetadata(splitLines(values.get('skills')), existing?.skills, 'skills');
      data.skillIds = splitLines(values.get('skillIds'));
      data.talents = preserveNamedMetadata(splitLines(values.get('talents')), existing?.talents, 'talents');
      data.talentIds = splitLines(values.get('talentIds'));
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
        data.particularities = existing.particularities || [];
        data.skills = existing.skills || [];
        data.skillIds = existing.skillIds || [];
        data.talents = existing.talents || [];
        data.talentIds = existing.talentIds || [];
        data.references = existing.references || [];
      }
    } else {
      careerLevels = captureCareerLevels();
      data.className = values.get('className');
      data.id = editorCareerId;
      data.levels = careerLevels;
      data.skills = preserveNamedMetadata(splitLines(values.get('skills')), existing?.skills, 'skills');
      data.skillIds = splitLines(values.get('skillIds'));
      data.talents = preserveNamedMetadata(splitLines(values.get('talents')), existing?.talents, 'talents');
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

function openTalentEditor(id = '') {
  const existing = id ? referenceEntries.find((entry) => entry.kind === 'talents' && entry.id === id) : null;
  if (id && !existing) return showToast('Ce talent est introuvable dans le référentiel.', 'error');
  if (existing?.source === 'builtin') return showToast('Les talents intégrés sont protégés. Créez une copie personnalisée pour les adapter.', 'error');
  modalRoot.innerHTML = renderTalentEditor(existing, referenceEntries);
  const dialog = document.querySelector('#talent-editor-dialog');
  const form = document.querySelector('#talent-form');
  dialog.addEventListener('close', () => modalRoot.replaceChildren(), { once: true });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.close();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    const rawEffects = String(values.get('effects') || '').trim();
    let effects = [];
    if (rawEffects) {
      try {
        effects = JSON.parse(rawEffects);
      } catch {
        showToast('Le champ des effets doit contenir un JSON valide.', 'error');
        form.querySelector('[name="effects"]')?.focus();
        return;
      }
      if (!Array.isArray(effects) || effects.some((effect) => !effect || typeof effect !== 'object' || Array.isArray(effect))) {
        showToast('Les effets doivent être un tableau d’objets JSON.', 'error');
        return;
      }
    }
    const name = String(values.get('name') || '').trim();
    if (!name) {
      showToast('Le nom principal du talent est obligatoire.', 'error');
      form.querySelector('[name="name"]')?.focus();
      return;
    }
    const candidate = {
      name,
      name_fr: String(values.get('name_fr') || '').trim(),
      name_original: String(values.get('name_original') || '').trim(),
      aliases: splitLines(values.get('aliases'))
    };
    const nameConflict = findTalentNameConflict(referenceEntries, candidate, existing?.id || '');
    if (nameConflict) {
      showToast(`Ce nom ou alias est déjà utilisé par « ${nameConflict.name_fr || nameConflict.name} ».`, 'error');
      return;
    }
    const maxRankRaw = String(values.get('maxRank') || '').trim();
    const advancementCostRaw = String(values.get('advancementCost') || '').trim();
    const advancementCost = advancementCostRaw ? Number(advancementCostRaw) : null;
    const advancementCostVerified = values.get('advancementCostVerified') === '1';
    const data = {
      id: existing?.id,
      source: existing?.source || 'custom',
      packId: existing?.packId || null,
      name,
      name_fr: values.get('name_fr'),
      name_original: values.get('name_original'),
      aliases: splitLines(values.get('aliases')),
      category: values.get('category'),
      description: values.get('description'),
      tests: splitLines(values.get('tests')),
      skills: splitLines(values.get('skills')),
      maxRank: maxRankRaw ? Number(maxRankRaw) : null,
      advancementCost,
      advancementCostVerified,
      prerequisites: splitLines(values.get('prerequisites')),
      species: values.getAll('species'),
      careerIds: values.getAll('careerIds'),
      careerLevelIds: splitLines(values.get('careerLevelIds')),
      availability: values.get('availability'),
      verificationStatus: values.get('verificationStatus') || (existing ? existing.verificationStatus : 'custom'),
      sourceInfo: {
        title: values.get('sourceTitle'),
        publisher: values.get('sourcePublisher'),
        page: values.get('sourcePage'),
        url: values.get('sourceUrl'),
        note: values.get('sourceNote')
      },
      references: splitLines(values.get('references')),
      effects,
      custom: existing?.custom ?? !existing
    };
    if (data.maxRank !== null && (!Number.isInteger(data.maxRank) || data.maxRank < 1 || data.maxRank > 999)) {
      showToast('Le rang maximal doit être un entier compris entre 1 et 999.', 'error');
      return;
    }
    if (advancementCostRaw && (!Number.isInteger(advancementCost) || advancementCost < 1 || advancementCost > 9999)) {
      showToast('Le coût d’expérience doit être un entier compris entre 1 et 9 999.', 'error');
      return;
    }
    if (advancementCostVerified && (!advancementCost || !(data.references.length || (data.sourceInfo.title && data.sourceInfo.page)))) {
      showToast('Pour déclarer le coût vérifié, renseignez un coût positif et une référence de source précise.', 'error');
      return;
    }
    try {
      const entry = existing ? data : createCustomReference('talents', data);
      referenceEntries = await saveReferenceEntry(entry, referenceEntries);
      dialog.close();
      renderCurrentRoute();
      showToast(existing ? 'Talent personnalisé mis à jour.' : 'Talent personnalisé ajouté.');
    } catch (error) {
      showToast(error.message || 'Impossible d’enregistrer ce talent.', 'error');
    }
  });
  dialog.showModal();
  form.querySelector('[name="name"]')?.focus();
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

function exportTalents() {
  const payload = createTalentCatalogExport(referenceEntries);
  if (!payload.pack.entries.length) return showToast('Aucun talent à exporter.', 'error');
  downloadJSON(payload, `wfrp-talents-${new Date().toISOString().slice(0, 10)}.json`);
  showToast(`${payload.pack.entries.length} talent(s) exporté(s).`);
}

async function importTalentFile(file) {
  if (!file) return;
  if (file.size > MAX_REFERENCE_IMPORT_SIZE) throw new Error('Le fichier dépasse la limite de 10 Mo.');
  const payload = JSON.parse(await file.text());
  const pack = parseTalentPack(payload, referenceEntries);
  const prepared = prepareTalentPack(pack, referenceEntries);
  const conflictNames = prepared.skipped.slice(0, 5).map((entry) => entry.name).join(', ');
  const conflictDetails = prepared.skipped.length
    ? `\n\n${prepared.skipped.length} doublon(s) ou conflit(s) seront ignorés${conflictNames ? ` : ${conflictNames}` : ''}. Aucune entrée existante ne sera remplacée.`
    : '\n\nAucun conflit détecté. Les entrées existantes ne seront pas remplacées.';
  const associationDetails = prepared.unresolvedAssociations
    ? `\n\n${prepared.unresolvedAssociations} association(s) vers une espèce, carrière ou niveau absent(e) de cette base ne peuvent pas être reliées. Elles seront écartées et pourront être renseignées depuis le catalogue après import.`
    : '';
  if (!prepared.additions.length) {
    showToast(`Import annulé : les ${prepared.skipped.length} talent(s) sont déjà présents ou en conflit.`, 'error');
    return;
  }
  const accepted = window.confirm(`Importer le pack « ${pack.name} » ?\n\n${prepared.additions.length} nouveau(x) talent(s) seront ajoutés.${conflictDetails}${associationDetails}`);
  if (!accepted) return;
  const updated = [...referenceEntries, ...prepared.additions];
  await saveReferenceBundle(updated);
  referenceEntries = updated;
  renderCurrentRoute();
  showToast(`${prepared.additions.length} talent(s) importé(s) ; ${prepared.skipped.length} conflit(s) ignoré(s).`);
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
  // Les coûts, rangs, remboursements et valeurs calculées sont recalculés
  // ensemble après chaque opération de progression.
  renderCurrentRoute();
  setSaveIndicator('Progression enregistrée', 'saved');
}

async function addExperience(requestedId = '') {
  try {
    const character = await getCharacterForProgression(requestedId);
    if (!character) throw new Error('Ouvrez une fiche de personnage avant d’ajouter de l’expérience.');
    const amount = document.querySelector('[data-xp-gain-amount]')?.value;
    const note = document.querySelector('[data-xp-gain-note]')?.value || '';
    const updated = grantExperience(character, { amount, note });
    await persistProgressionUpdate(updated);
    showToast(`${Number(amount)} XP ajoutés à la fiche.`);
  } catch (error) {
    showToast(error.message || 'Impossible d’ajouter l’expérience.', 'error');
  }
}

async function correctExperienceBalance(requestedId = '') {
  try {
    const character = await getCharacterForProgression(requestedId);
    if (!character) throw new Error('Ce personnage est introuvable.');
    const total = document.querySelector('[data-xp-correction-total]')?.value;
    const spent = document.querySelector('[data-xp-correction-spent]')?.value;
    const note = document.querySelector('[data-xp-correction-note]')?.value || '';
    const updated = correctExperience(character, { total, spent, note });
    await persistProgressionUpdate(updated);
    showToast(`Correction XP enregistrée. Solde : ${getExperienceAvailable(updated)} XP.`);
  } catch (error) {
    showToast(error.message || 'Impossible de corriger les XP.', 'error');
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
    const targetEntry = targetType === 'skill'
      ? character.skills.find((item) => item.id === target.id)
      : targetType === 'talent' ? character.talents.find((item) => item.id === target.id) : null;
    const characteristic = CHARACTERISTICS.find((item) => item.key === target.key);
    const targetLabel = targetType === 'characteristic'
      ? `l’augmentation de ${characteristic?.label || target.key}`
      : targetType === 'skill'
        ? `la compétence « ${targetEntry?.name || 'inconnue'} »`
        : targetEntry?.acquired === false
          ? `l’acquisition du talent « ${targetEntry?.name || 'inconnu'} »`
          : `le rang suivant du talent « ${targetEntry?.name || 'inconnu'} »`;
    const updated = purchaseAdvancement(character, { target, amount: 1, note: `Progression : ${targetLabel}` });
    const cost = updated.experience.history.at(-1).amount;
    await persistProgressionUpdate(updated);
    showToast(`Progression achetée : −${cost} XP. Solde : ${getExperienceAvailable(updated)} XP.`);
  } catch (error) {
    showToast(error.message || 'Impossible d’effectuer cet achat.', 'error');
  }
}

async function changeCareer(requestedId = '') {
  try {
    const character = await getCharacterForProgression(requestedId);
    if (!character) throw new Error('Ce personnage est introuvable.');
    if (character.identity.careerCompleted !== true) {
      throw new Error('Marquez la carrière actuelle comme terminée après vérification de ses conditions de sortie.');
    }
    const careerId = document.querySelector('[data-career-change-career]')?.value || '';
    const career = referenceEntries.find((entry) => entry.kind === 'careers' && entry.id === careerId);
    if (!career) throw new Error('Choisissez une nouvelle carrière dans la liste de la fiche.');
    const levels = getCareerLevels(career);
    const levelId = document.querySelector('[data-career-change-level]')?.value || '';
    const level = levels.length === 1 ? levels[0] : levels.find((item) => item.id === levelId) || null;
    if (levels.length > 1 && !level) throw new Error('Choisissez un niveau de départ pour cette carrière.');
    const updated = purchaseCareerChange(character, { career, level });
    await persistProgressionUpdate(updated);
    showToast(`Changement vers « ${career.name} » enregistré : −${CAREER_CHANGE_COST} XP. Solde : ${getExperienceAvailable(updated)} XP.`);
  } catch (error) {
    showToast(error.message || 'Impossible de changer de carrière.', 'error');
  }
}

function getRefundSelections(group) {
  return [...document.querySelectorAll(`[data-refund-count][data-refund-group="${group}"]`)]
    .map((input) => ({
      target: input.dataset.targetType === 'characteristic'
        ? { type: 'characteristic', key: input.dataset.targetKey }
        : { type: input.dataset.targetType, id: input.dataset.targetId },
      amount: Number(input.value || 0)
    }))
    .filter((selection) => selection.amount > 0);
}

function refreshRefundPreview(group) {
  const scopes = [...document.querySelectorAll(`[data-refund-scope="${group}"]`)];
  const inputs = [...document.querySelectorAll(`[data-refund-count][data-refund-group="${group}"]`)];
  const selections = getRefundSelections(group);
  let quote = { amount: 0, count: 0 };
  let error = '';
  const character = characters.find((item) => item.id === getRoute().id);
  if (character && selections.length) {
    try {
      quote = quoteProgressionRefund(character, selections);
    } catch (reason) {
      error = reason.message || 'Sélection de remboursement invalide.';
    }
  }
  for (const input of inputs) {
    const line = input.parentElement?.querySelector('[data-refund-line-total]');
    if (!line) continue;
    const count = Number(input.value || 0);
    if (!count) { line.textContent = '0 XP'; continue; }
    try {
      const lineQuote = quoteProgressionRefund(character, [{
        target: input.dataset.targetType === 'characteristic'
          ? { type: 'characteristic', key: input.dataset.targetKey }
          : { type: input.dataset.targetType, id: input.dataset.targetId },
        amount: count
      }]);
      line.textContent = `${lineQuote.amount.toLocaleString('fr-FR')} XP`;
    } catch {
      line.textContent = '—';
    }
  }
  for (const scope of scopes) {
    const total = scope.querySelector('[data-refund-total]');
    if (total) total.textContent = error ? 'Sélection invalide' : `${quote.amount.toLocaleString('fr-FR')} XP`;
    const button = scope.querySelector('[data-action="refund-selected-progressions"]');
    if (button) {
      button.disabled = !selections.length || Boolean(error);
      button.title = error || (selections.length ? `${quote.count} progression(s) · restitution de ${quote.amount} XP` : 'Sélectionnez les avancements ou talents à rembourser.');
    }
  }
}

async function refundSelectedProgressions(button) {
  try {
    const group = button.dataset.refundGroup;
    const character = await getCharacterForProgression(button.dataset.characterId || '');
    if (!character) throw new Error('Ce personnage est introuvable.');
    const selections = getRefundSelections(group);
    const quote = quoteProgressionRefund(character, selections);
    if (!quote.count) throw new Error('Sélectionnez les avancements ou talents à rembourser.');
    const updated = refundAdvancements(character, selections);
    await persistProgressionUpdate(updated);
    const note = group === 'talents'
      ? ' Les effets mécaniques des talents sont recalculés ; vérifiez les éléments qui en dépendaient.'
      : '';
    showToast(`${quote.count} progression(s) remboursée(s) : +${quote.amount} XP. Solde : ${getExperienceAvailable(updated)} XP.${note}`);
  } catch (error) {
    showToast(error.message || 'Impossible de rembourser cette progression.', 'error');
  }
}


async function refundOneAdvancement(button) {
  try {
    const character = await getCharacterForProgression(
      button.dataset.characterId || ''
    );

    if (!character) {
      throw new Error('Ce personnage est introuvable.');
    }

    const targetType = button.dataset.targetType;

    const target = targetType === 'characteristic'
      ? {
          type: 'characteristic',
          key: button.dataset.targetKey
        }
      : {
          type: targetType,
          id: button.dataset.targetId
        };

    const selections = [{ target, amount: 1 }];
    const quote = quoteProgressionRefund(character, selections);

    if (quote.count !== 1 || quote.amount <= 0) {
      throw new Error('Cet avancement ne peut pas être remboursé.');
    }

    const updated = refundAdvancements(character, selections, {
      note: `Remboursement individuel : ${targetType}`
    });

    await persistProgressionUpdate(updated);

    showToast(
      `Avancement remboursé : +${quote.amount} XP. ` +
      `Solde : ${getExperienceAvailable(updated)} XP.`
    );

  } catch (error) {
    showToast(
      error.message || 'Impossible de rembourser cet avancement.',
      'error'
    );
  }
}

async function undoPurchase(requestedId = '') {
  try {
    const character = await getCharacterForProgression(requestedId);
    if (!character) throw new Error('Ce personnage est introuvable.');
    const updated = undoLastPurchase(character);
    await persistProgressionUpdate(updated);
    showToast(`Dernière opération annulée. Solde : ${getExperienceAvailable(updated)} XP.`);
  } catch (error) {
    showToast(error.message || 'Impossible d’annuler cet achat.', 'error');
  }
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'scroll-section') {
    document.getElementById(button.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (action === 'toggle-theme') toggleTheme();
  if (action === 'new-character') await createNewCharacter();
  if (action === 'open-character') {
    openCharacterSheet(id);
  }
  if (action === 'delete-character') await removeCharacter(id);
  if (action === 'duplicate-character') await duplicateCharacter(id);
  if (action === 'export-character') exportOneCharacter(id);
  if (action === 'export-backup') exportBackup();
  if (action === 'import-json') importInput.click();
  if (action === 'generate-characteristics') {
    event.preventDefault();
    generateAndApplyCharacteristics();
  }
  if (action === 'undo-characteristics-generation') undoLastCharacteristicGeneration();
  if (action === 'add-career-skills') addReferenceSuggestions('skills', 'career');
  if (action === 'add-career-talents') addReferenceSuggestions('talents', 'career');
  if (action === 'add-species-skills') addReferenceSuggestions('skills', 'species');
  if (action === 'add-species-talents') addReferenceSuggestions('talents', 'species');
  if (action === 'grant-experience') await addExperience(button.dataset.characterId || '');
  if (action === 'correct-experience') await correctExperienceBalance(button.dataset.characterId || '');
  if (action === 'purchase-advancement') await buyAdvancement(button);
    if (action === 'refund-one-advancement') await refundOneAdvancement(button);
  if (action === 'change-career') await changeCareer(button.dataset.characterId || '');
  if (action === 'refund-selected-progressions') await refundSelectedProgressions(button);
  if (action === 'undo-last-purchase') await undoPurchase(button.dataset.characterId || '');
  if (action === 'add-reference') openReferenceEditor(button.dataset.kind);
  if (action === 'add-talent') openTalentEditor();
  if (action === 'edit-talent') openTalentEditor(id);
  if (action === 'edit-reference') {
    const entry = referenceEntries.find((item) => item.id === id);
    if (entry) openReferenceEditor(entry.kind, id);
  }
  if (action === 'delete-reference') await deleteReference(id);
  if (action === 'export-references') exportReferences();
  if (action === 'export-talents') exportTalents();
  if (action === 'import-references') referenceImportInput.click();
  if (action === 'import-talents') talentImportInput?.click();
  if (action === 'close-reference-editor') document.querySelector('#reference-editor-dialog')?.close();
  if (action === 'close-talent-editor') document.querySelector('#talent-editor-dialog')?.close();
  if (action === 'open-references') {
    try {
      if (editorState) {
        clearTimeout(saveTimer);
        await queueEditorSave();
      }
      editorState = null;
      navigate('/references');
    } catch (error) {
      showToast(error.message || 'Impossible d’enregistrer la fiche avant de quitter.', 'error');
    }
  }
});

function refreshTalentReferenceCards() {
  const filters = Object.fromEntries([...viewRoot.querySelectorAll('[data-talent-filter]')].map((field) => [field.dataset.talentFilter, field.value]));
  const results = filterTalentCatalog(referenceEntries, filters);
  const grid = viewRoot.querySelector('#talent-reference-grid');
  if (grid) grid.innerHTML = renderTalentCards(results);
  const count = viewRoot.querySelector('[data-talent-results-count]');
  if (count) count.textContent = `${results.length} talent(s)`;
}

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
  if (event.target.matches('[data-talent-filter]')) refreshTalentReferenceCards();
  if (event.target.matches('[data-refund-count]')) refreshRefundPreview(event.target.dataset.refundGroup);
});

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-talent-filter]')) refreshTalentReferenceCards();
  if (event.target.matches('[data-refund-count]')) refreshRefundPreview(event.target.dataset.refundGroup);
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

talentImportInput?.addEventListener('change', async () => {
  const [file] = talentImportInput.files || [];
  try {
    await importTalentFile(file);
  } catch (error) {
    showToast(error instanceof SyntaxError ? 'Le fichier ne contient pas un JSON valide.' : error.message, 'error');
  } finally {
    talentImportInput.value = '';
  }
});

window.addEventListener('hashchange', async () => {
  if (editorState) {
    clearTimeout(saveTimer);
    try {
      await queueEditorSave();
    } catch (error) {
      setSaveIndicator('Erreur de sauvegarde', 'error');
      showToast(error.message || 'Les dernières modifications n’ont pas pu être enregistrées.', 'error');
      return;
    }
  }
  editorState = null;
  renderCurrentRoute();
  viewRoot.focus({ preventScroll: true });
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !editorState) return;
  clearTimeout(saveTimer);
  queueEditorSave().catch((error) => {
    updateAutosaveState('Échec de la sauvegarde', 'error');
    setSaveIndicator('Erreur de sauvegarde', 'error');
    console.error('Échec de la sauvegarde avant masquage de la page :', error);
  });
});
window.addEventListener('pagehide', () => {
  if (!editorState) return;
  clearTimeout(saveTimer);
  queueEditorSave().catch((error) => {
    setSaveIndicator('Erreur de sauvegarde', 'error');
    console.error('Échec de la sauvegarde avant fermeture de la page :', error);
  });
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
  let storageReady = false;
  try {
    referenceEntries = await initializeBuiltInReferences();
    await refreshCharacters();
    storageReady = true;
    setSaveIndicator('Stockage local prêt', 'saved');
  } catch (error) {
    try {
      referenceEntries = await getAllReferenceEntries();
      await refreshCharacters();
      storageReady = true;
      setSaveIndicator('Stockage local prêt · référentiels en cache', 'saved');
      showToast(`Les référentiels intégrés n’ont pas pu être actualisés : ${error.message}`, 'error');
    } catch (storageError) {
      viewRoot.innerHTML = `<section class="storage-error"><span class="empty-emblem">!</span><h1>Le registre ne peut pas s’ouvrir</h1><p>${escapeHTML(storageError.message || error.message || 'Le stockage local est indisponible.')}</p><p>Ouvrez cette application depuis une adresse locale ou HTTPS, puis vérifiez les autorisations de stockage de votre navigateur.</p></section>`;
      setSaveIndicator('Stockage indisponible', 'error');
    }
  }

  if (storageReady) {
    const createButton = document.querySelector('[data-action="new-character"]');
    if (createButton) createButton.disabled = false;
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
