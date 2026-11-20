import { createCharacter, createId, getCharacterName, getExperienceAvailable, normalizeCharacter, CHARACTERISTICS } from './models/character.js';
import { deleteCharacter, getAllCharacters, getCharacter, saveCharacter, getAllReferenceEntries, saveReferenceBundle } from './database/indexeddb.js';
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
import { renderCharacterDetail } from './views/character-detail.js';
import { renderReferenceManager, renderReferenceEditor, renderCareerLevelsEditor, renderTalentCards, renderTalentEditor, filterReferenceCards } from './views/reference-manager.js';
import { escapeHTML } from './utils/format.js';
import { generateCharacteristics, findSpeciesProfile } from './rules/characteristic-generator.js';
import { calculateCharacteristics } from './rules/character-calculations.js';
import { applyTheme, toggleTheme } from './services/theme.js';
import { grantExperience, purchaseAdvancement, undoLastPurchase } from './services/progression.js';
import { CREATION_STEPS, getCreationStepStates, getCreationSuggestions, mergeSuggestedEntries, validateCharacterCreation } from './services/creation-wizard.js';
import { createTalentCatalogExport, filterTalentCatalog, findTalentReference, normalizeTalentText, parseTalentPack, prepareTalentPack } from './services/talents.js';

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

const OPTIONAL_CREATION_STEPS = new Set(['religion', 'skills', 'talents', 'resources']);

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
  const currentWizardStep = editorState?.guided
    ? CREATION_STEPS.find((step) => step.id === editorState.character.creationWizard?.step)
    : null;
  document.querySelector('#breadcrumb-current').textContent = currentWizardStep
    ? `CRÉATION · ${currentWizardStep.title.toLocaleUpperCase('fr-FR')}`
    : route.name === 'character'
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
    return `<tr data-characteristic-row data-key="${key}">
      <th scope="row"><abbr title="${escapeHTML(label)}">${escapeHTML(shortLabel)}</abbr><span>${escapeHTML(label)}</span></th>
      <td><input type="number" min="0" max="999" step="1" name="characteristics.${key}" value="${escapeHTML(character.characteristics[key] ?? '')}" aria-label="${escapeHTML(label)} valeur initiale" data-stat-initial></td>
      <td><output data-stat-species>${stat.speciesBonus ?? '—'}</output><input type="hidden" name="characteristicSpeciesModifiers.${key}" value="${escapeHTML(speciesBonusValue === null ? '' : speciesBonusValue ?? 0)}" data-stat-species-value></td>
      <td><output data-stat-talent>${stat.talentBonus}</output></td>
      <td><input type="number" min="0" max="999" step="1" name="characteristicAdvances.${key}" value="${escapeHTML(character.characteristicAdvances?.[key] ?? 0)}" aria-label="${escapeHTML(label)} augmentations" data-stat-advances></td>
      <td><output class="calculated-value" data-stat-current>${stat.current ?? '—'}</output></td>
      <td><output class="calculated-bonus" data-stat-bonus>${stat.bonus ?? '—'}</output></td>
      <td><input class="cost-input" type="number" min="1" max="9999" step="1" name="characteristicAdvancementCosts.${key}" value="${escapeHTML(character.characteristicAdvancementCosts?.[key] ?? '')}" placeholder="—" aria-label="Coût configuré de l’augmentation ${shortLabel}" title="Coût configuré depuis votre source de règles"></td>
    </tr>`;
  }).join('');
  return `<div class="responsive-table editor-table-wrap"><table class="data-table characteristic-editor-table"><thead><tr><th>Caractéristique</th><th>Initiale</th><th>Espèce</th><th>Talents</th><th>Augm.</th><th>Actuelle</th><th>Bonus</th><th>Coût XP / +1</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderSkillEditorRow(skill = {}) {
  const characteristicOptions = ['<option value="">—</option>', ...CHARACTERISTICS.map(({ key, shortLabel }) => (
    `<option value="${key}" ${skill.characteristic === key ? 'selected' : ''}>${shortLabel}</option>`
  ))].join('');
  const skillTypeOptions = `<option value="">Non défini</option><option value="basic" ${skill.skillType === 'basic' ? 'selected' : ''}>Base</option><option value="advanced" ${skill.skillType === 'advanced' ? 'selected' : ''}>Avancée</option>`;
  return `<div class="editor-list-row skill-editor-row" data-item-row data-collection="skills" data-item-id="${escapeHTML(skill.id || createId())}" data-reference-id="${escapeHTML(skill.referenceId || '')}" data-source-career-id="${escapeHTML(skill.sourceCareerId || '')}" data-source-career-level-id="${escapeHTML(skill.sourceCareerLevelId || '')}" data-source-species-id="${escapeHTML(skill.sourceSpeciesId || '')}">
    <label><span>Compétence</span><input data-collection-field="name" value="${escapeHTML(skill.name || '')}" maxlength="160"></label>
    <label><span>Carac.</span><select data-collection-field="characteristic">${characteristicOptions}</select></label>
    <label><span>Type</span><select data-collection-field="skillType">${skillTypeOptions}</select></label>
    <label><span>Base manuelle</span><input type="number" min="0" max="999" data-collection-field="baseValue" value="${escapeHTML(skill.baseValue ?? '')}" placeholder="Carac."></label>
    <label><span>Avanc.</span><input type="number" min="0" max="999" data-collection-field="advances" value="${escapeHTML(skill.advances ?? 0)}"></label>
    <label><span>Coût XP / +1</span><input type="number" min="1" max="9999" data-collection-field="advancementCost" value="${escapeHTML(skill.advancementCost ?? '')}" placeholder="—"></label>
    <label class="inline-check"><input type="checkbox" data-collection-field="useCharacteristicBase" ${skill.useCharacteristicBase !== false ? 'checked' : ''}><span>Base = caractéristique</span></label>
    <label class="inline-check"><input type="checkbox" data-collection-field="career" ${skill.career ? 'checked' : ''}><span>Compétence de carrière</span></label>
    <label class="inline-check"><input type="checkbox" data-collection-field="acquired" ${skill.acquired !== false ? 'checked' : ''}><span>Acquise</span></label>
    <button type="button" class="icon-button danger-button" data-collection-action="remove" aria-label="Supprimer cette compétence" title="Supprimer">×</button>
  </div>`;
}

function renderTalentEditorRow(talent = {}) {
  const rowId = talent.id || createId();
  const effect = (talent.effects || []).find((item) => item.type === 'characteristicBonus') || {};
  const characteristicOptions = ['<option value="">—</option>', ...CHARACTERISTICS.map(({ key, shortLabel }) => (
    `<option value="${key}" ${effect.characteristic === key ? 'selected' : ''}>${shortLabel}</option>`
  ))].join('');
  return `<div class="editor-list-row talent-editor-row" data-item-row data-collection="talents" data-item-id="${escapeHTML(rowId)}" data-reference-id="${escapeHTML(talent.referenceId || '')}" data-source-career-id="${escapeHTML(talent.sourceCareerId || '')}" data-source-career-level-id="${escapeHTML(talent.sourceCareerLevelId || '')}" data-source-species-id="${escapeHTML(talent.sourceSpeciesId || '')}" data-max-rank="${escapeHTML(talent.maxRank ?? '')}" data-source-info="${escapeHTML(JSON.stringify(talent.sourceInfo || {}))}" data-references="${escapeHTML(JSON.stringify(talent.references || []))}" data-effects="${escapeHTML(JSON.stringify(talent.effects || []))}">
    <label class="talent-selection-field"><span>Talent · rechercher dans le catalogue</span>${renderTalentPicker({ ...talent, id: rowId }, referenceEntries)}<small class="talent-source-note">${escapeHTML(talentSuggestionReason(talent))}</small></label>
    <label><span>Rang</span><input type="number" min="1" max="999" data-collection-field="rank" value="${escapeHTML(talent.rank ?? 1)}"></label>
    <label><span>Coût XP / rang</span><input type="number" min="1" max="9999" data-collection-field="advancementCost" value="${escapeHTML(talent.advancementCost ?? '')}" placeholder="—"></label>
    <label class="inline-check"><input type="checkbox" data-collection-field="acquired" ${talent.acquired !== false ? 'checked' : ''}><span>Acquis</span></label>
    <label><span>Bonus caractéristique</span><select data-collection-field="effectCharacteristic">${characteristicOptions}</select></label>
    <label><span>Valeur</span><input type="number" min="0" max="999" data-collection-field="effectValue" value="${escapeHTML(effect.value ?? 0)}"></label>
    <label class="inline-check"><input type="checkbox" data-collection-field="effectVerified" ${effect.verified ? 'checked' : ''}><span>Effet vérifié</span></label>
    <label class="talent-description"><span>Description</span><input data-collection-field="description" value="${escapeHTML(talent.description || '')}" maxlength="3000"></label>
    <label class="talent-description"><span>Conditions d’acquisition</span><input data-collection-field="conditions" value="${escapeHTML(talent.conditions || '')}" maxlength="2000" placeholder="Non renseignées"></label>
    <label class="talent-description"><span>Référence de règle pour l’effet</span><input data-collection-field="effectReference" value="${escapeHTML(effect.reference || '')}" maxlength="500" placeholder="Livre, page, errata…"></label>
    <button type="button" class="icon-button danger-button" data-collection-action="remove" aria-label="Supprimer ce talent" title="Supprimer">×</button>
  </div>`;
}

function talentSuggestionReason(talent = {}) {
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

function renderCollectionSection(title, collection, entries, rowRenderer, description = '') {
  const rows = entries.length ? entries.map((entry) => rowRenderer(entry, collection)).join('') : '<p class="collection-empty">Aucune entrée. Utilisez le bouton pour en ajouter une.</p>';
  return `<div class="editor-collection"><div class="editor-collection-heading"><div><h4>${title}</h4>${description ? `<p>${description}</p>` : ''}</div><button type="button" class="button button-outline button-small" data-collection-action="add" data-collection="${collection}">＋ Ajouter</button></div><div class="editor-collection-rows" id="collection-${collection}" data-collection="${collection}">${rows}</div></div>`;
}

function readEditorCollection(form, collection) {
  const entries = [...form.querySelectorAll(`[data-item-row][data-collection="${collection}"]`)].map((row) => {
    const read = (fieldName) => row.querySelector(`[data-collection-field="${fieldName}"]`);
    const value = (fieldName) => read(fieldName)?.value?.trim() || '';
    const number = (fieldName) => {
      const raw = value(fieldName);
      return raw === '' ? null : Number(raw);
    };
    const checkbox = (fieldName) => Boolean(read(fieldName)?.checked);
    if (collection === 'skills') return {
      id: row.dataset.itemId || createId(), referenceId: row.dataset.referenceId || '', name: value('name'), characteristic: value('characteristic'),
      skillType: value('skillType'),
      baseValue: number('baseValue'), useCharacteristicBase: checkbox('useCharacteristicBase'),
      advances: number('advances') ?? 0, advancementCost: number('advancementCost'), career: checkbox('career'),
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
      const effects = storedEffects.filter((effect) => effect?.type !== 'characteristicBonus');
      if (effectCharacteristic) effects.push({
        type: 'characteristicBonus', characteristic: effectCharacteristic,
        value: number('effectValue') ?? 0, verified: checkbox('effectVerified'), reference: value('effectReference')
      });
      return {
        id: row.dataset.itemId || createId(), referenceId: row.dataset.referenceId || '', name: value('name'), rank: number('rank') ?? 1,
        maxRank: number('maxRank') ?? (row.dataset.maxRank ? Number(row.dataset.maxRank) : null),
        nameFr: value('nameFr'), nameOriginal: value('nameOriginal'), category: value('category'),
        tests: value('tests').split(' ; ').filter(Boolean), skills: value('skills').split(' ; ').filter(Boolean),
        description: value('description'), conditions: value('conditions'), prerequisites: value('prerequisites').split(' ; ').filter(Boolean),
        verificationStatus: value('verificationStatus'), sourceInfo: { ...(reference?.sourceInfo || {}), ...historicalSourceInfo },
        references: reference?.references?.length ? reference.references : (historicalReferences.length ? historicalReferences : (historicalSourceInfo.title ? [`${historicalSourceInfo.title}${historicalSourceInfo.page ? `, p. ${historicalSourceInfo.page}` : ''}`] : [])),
        advancementCost: number('advancementCost'), effects,
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
  if (collection !== 'talents') return entries;
  const uniqueTalents = new Map();
  for (const talent of entries) {
    const key = talent.referenceId || normalizeTalentText(talent.name);
    const existing = uniqueTalents.get(key);
    if (!existing) {
      uniqueTalents.set(key, talent);
      continue;
    }
    // Plusieurs occurrences d'un même talent représentent des rangs, pas
    // plusieurs talents distincts. Conserver le rang le plus élevé.
    existing.rank = Math.max(existing.rank || 1, talent.rank || 1);
    existing.maxRank ??= talent.maxRank;
    existing.acquired = existing.acquired || talent.acquired;
    existing.status = existing.acquired ? 'acquired' : 'selected';
    existing.advancementCost ??= talent.advancementCost;
    if (!existing.description) existing.description = talent.description;
    if (!existing.conditions) existing.conditions = talent.conditions;
    if (!existing.references.length) existing.references = talent.references;
  }
  return [...uniqueTalents.values()];
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
  clearSkippedWizardStep('species');
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
  refreshWizardSuggestions();
  return true;
}

function refreshWizardSuggestions() {
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
  const catalogCareerTalents = referenceEntries.filter((entry) => entry.kind === 'talents' && (
    (career && (entry.careerIds || []).includes(career.id)) || (level && (entry.careerLevelIds || []).includes(level.id))
  ));
  const catalogSpeciesTalents = referenceEntries.filter((entry) => entry.kind === 'talents' && species && (entry.species || []).includes(species.id));
  const describeTalent = (entry, reason) => {
    const details = [
      entry.maxRank ? `max. ${entry.maxRank} rang(s)` : '',
      ...(entry.prerequisites || []).map((item) => `prérequis : ${item}`),
      entry.conditions || ''
    ].filter(Boolean);
    return `<li><strong>${escapeHTML(entry.name_fr || entry.name)}</strong> <span>— ${escapeHTML(reason)}${details.length ? ` · ${escapeHTML(details.join(' · '))}` : ''}</span></li>`;
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

function addWizardSuggestions(collection, sourceType) {
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
      ? merged.entries.map(renderer).join('')
      : '<p class="collection-empty">Aucune entrée. Utilisez le bouton pour en ajouter une.</p>';
    if (collection === 'talents') mountTalentPickers(container, referenceEntries);
  }
  clearSkippedWizardStep(collection);
  syncEditorStateFromForm(form);
  updateWizardProgress(form);
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
    // En création guidée, le champ Espèce appartient à une étape masquée.
    // Lui donner le focus force le navigateur à faire défiler toute la page.
    showToast('Choisissez une espèce à l’étape « Espèce » avant de lancer les dés.', 'error');
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

  clearSkippedWizardStep('characteristics');

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
  updateWizardProgress(form);
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
  clearSkippedWizardStep('characteristics');
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
  updateWizardProgress(form);
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

function renderCreationReviewMarkup(character) {
  const result = validateCharacterCreation(character, referenceEntries);
  const { identity } = character;
  const fullName = [identity.firstName, identity.lastName].filter(Boolean).join(' ') || 'Sans nom';
  const selectedSpecies = result.selected.species?.name || identity.species || 'Non défini';
  const selectedCareer = result.selected.career?.name || identity.career || 'Non définie';
  const selectedLevel = result.selected.level?.name || identity.careerLevel || 'Non défini';
  const calculated = calculateCharacteristics(character);
  const characteristics = CHARACTERISTICS.map(({ key, shortLabel }) => {
    const stat = calculated[key];
    return `<span><strong>${shortLabel}</strong> ${stat.current ?? '—'}</span>`;
  }).join('');
  const messages = (items, title, className) => items.length
    ? `<section class="validation-group ${className}"><h4>${title} · ${items.length}</h4><ul>${items.map((item) => `<li><button type="button" data-action="wizard-go" data-step="${escapeHTML(item.step)}" title="Aller à l’étape concernée">↗</button>${escapeHTML(item.message)}</li>`).join('')}</ul></section>`
    : '';
  const status = result.valid
    ? '<div class="validation-status validation-status-ready"><strong>La fiche peut être créée.</strong><span>Les éventuels avertissements sont non bloquants.</span></div>'
    : '<div class="validation-status validation-status-blocked"><strong>Quelques informations obligatoires manquent.</strong><span>Utilisez les liens pour revenir directement aux étapes concernées.</span></div>';
  return `<div class="creation-review-summary">
    ${status}
    <div class="creation-review-identity"><div><span>PERSONNAGE</span><strong>${escapeHTML(fullName)}</strong></div><div><span>ESPÈCE</span><strong>${escapeHTML(selectedSpecies)}</strong></div><div><span>CARRIÈRE</span><strong>${escapeHTML(selectedCareer)}</strong></div><div><span>NIVEAU</span><strong>${escapeHTML(selectedLevel)}</strong></div></div>
    <div class="creation-review-stats"><h4>Caractéristiques actuelles</h4><div>${characteristics}</div></div>
    <div class="creation-review-counts"><span>${result.counts.skills} compétence(s)</span><span>${result.counts.talents} talent(s)</span><span>${character.equipment.weapons.length + character.equipment.armour.length + character.equipment.possessions.length + character.equipment.spells.length + character.equipment.prayers.length} objet(s) / équipement(s)</span><span>${character.experience.total} XP · ${Math.max(0, character.experience.total - character.experience.spent)} disponibles</span></div>
    ${messages(result.errors, 'Erreurs bloquantes', 'validation-errors')}
    ${messages(result.warnings, 'Avertissements', 'validation-warnings')}
    ${messages(result.information, 'Informations', 'validation-information')}
  </div>`;
}

function renderEditor(character, { guided = false } = {}) {
  const { identity, secondary, experience, profile } = character;
  const selectedCareer = findReferenceByLegacyValue(referenceEntries, 'careers', identity.careerId, identity.career);
  const selectedLevel = findCareerLevel(selectedCareer, identity.careerLevelId, identity.careerLevel);
  const selectedSpecies = findSpeciesProfile(identity.species, referenceEntries);
  const currentStep = CREATION_STEPS.some((step) => step.id === character.creationWizard?.step)
    ? character.creationWizard.step
    : 'identity';
  const stage = (id, title, description, content) => `<section class="form-section creation-stage" data-wizard-step="${id}" ${guided && currentStep !== id ? 'hidden' : ''}><div class="form-section-title"><span>${String(CREATION_STEPS.findIndex((step) => step.id === id) + 1).padStart(2, '0')}</span><div><h3>${title}</h3><p>${description}</p></div></div>${content}</section>`;
  const progress = guided ? `<nav class="creation-stepper" aria-label="Étapes de création">${CREATION_STEPS.map((step, index) => `<button type="button" class="creation-stepper-item ${currentStep === step.id ? 'is-current' : ''}" data-action="wizard-go" data-step="${step.id}" aria-current="${currentStep === step.id ? 'step' : 'false'}" data-progress="pending"><span>${index + 1}</span><small>${escapeHTML(step.shortTitle)}</small></button>`).join('')}</nav>` : '';
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
  const characteristicContent = `<div class="characteristic-section-heading"><div><p>Valeur initiale, bonus d’espèce, effets de talents, augmentations et valeur actuelle.</p></div><button type="button" class="characteristic-generator-trigger" data-action="generate-characteristics" title="Générer les caractéristiques aléatoirement" aria-label="Générer les caractéristiques aléatoirement"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><circle cx="8" cy="8" r="1.25"/><circle cx="16" cy="8" r="1.25"/><circle cx="8" cy="12" r="1.25"/><circle cx="16" cy="12" r="1.25"/><circle cx="8" cy="16" r="1.25"/><circle cx="16" cy="16" r="1.25"/></svg></button></div><div class="generation-history-bar"><span id="characteristic-generation-history-count">Aucune génération effectuée dans cette session.</span><button type="button" class="button button-quiet button-small" data-action="undo-characteristics-generation" disabled>↶ Annuler la dernière génération</button></div>${characteristicEditorMarkup(character)}<p class="form-hint">Un jet applique deux dés à dix faces (2d10) à chaque caractéristique, puis le modificateur de l’espèce. Les deux dés et le modificateur sont conservés séparément. Vous pouvez annuler la dernière génération. Les coûts d’avancement restent configurables et aucun barème non vérifié n’est appliqué.</p>`;
  const careerContent = `<div class="form-grid">${renderReferencePicker({ kind: 'careers', entries: referenceEntries, selectedId: identity.careerId, value: identity.career })}${careerLevelField(identity, selectedCareer)}<div class="career-preview form-field-wide" id="career-preview">${careerPreviewMarkup(selectedCareer, selectedLevel)}</div><div class="career-suggestions form-field-wide" id="career-suggestions"><p class="form-hint">Sélectionnez une carrière et un niveau pour afficher les compétences et talents documentés associés.</p></div></div>`;
  const religionContent = `<div class="form-grid">${renderReferencePicker({ kind: 'religions', entries: referenceEntries, selectedId: identity.religionId, value: identity.religion })}${renderReferencePicker({ kind: 'deities', entries: referenceEntries, selectedId: identity.deityId, value: identity.deity })}</div><p class="form-hint">Cette étape est facultative. La divinité est filtrée selon le culte sélectionné ; les liens existants sont vérifiés avant validation.</p>`;
  const skillsContent = `<div id="skill-suggestions" class="suggestion-panel"><p class="form-hint">Les compétences des référentiels peuvent être proposées ici. Les ajouter les sélectionne sans les déclarer acquises ni leur attribuer d’avancement.</p><button type="button" class="button button-outline button-small" data-action="add-career-skills">＋ Ajouter les compétences de carrière</button><button type="button" class="button button-quiet button-small" data-action="add-species-skills">＋ Ajouter les compétences d’espèce</button></div>${renderCollectionSection('Compétences', 'skills', character.skills || [], renderSkillEditorRow, 'Une compétence sélectionnée n’est acquise qu’après validation explicite. Les avancements restent à zéro tant que vous ne les renseignez pas.')}`;
  const talentsContent = `<div id="talent-suggestions" class="suggestion-panel"><p class="form-hint">Les talents associés sont proposés séparément selon leur provenance. Examinez leurs conditions puis ajoutez-les explicitement ; aucun talent n’est acquis automatiquement.</p><div class="talent-suggestion-group"><strong data-talent-career-count>Carrière / niveau</strong><ul data-talent-career-list></ul><button type="button" class="button button-outline button-small" data-action="add-career-talents">＋ Ajouter les talents de carrière</button></div><div class="talent-suggestion-group"><strong data-talent-species-count>Espèce</strong><ul data-talent-species-list></ul><button type="button" class="button button-quiet button-small" data-action="add-species-talents">＋ Ajouter les talents d’espèce</button></div></div>${renderCollectionSection('Talents', 'talents', character.talents || [], renderTalentEditorRow, 'Un seul enregistrement par talent : augmentez le rang sur la ligne existante. Les coûts et effets non vérifiés ne sont pas appliqués.')}`;
  const resourcesContent = `<div class="form-grid form-grid-stats">
      ${field('Expérience totale', 'experience.total', experience.total, { type: 'number', min: 0 })}
      ${field('Expérience dépensée', 'experience.spent', experience.spent, { type: 'number', min: 0 })}
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
      ${field('Points de corruption', 'resources.corruptionPoints', character.resources?.corruptionPoints ?? 0, { type: 'number', min: 0 })}
      ${field('Seuil de corruption', 'rules.corruptionThreshold', character.rules?.corruptionThreshold, { type: 'number', min: 0 })}
      ${field('Capacité d’encombrement', 'rules.encumbranceCapacity', character.rules?.encumbranceCapacity, { type: 'number', min: 0, step: 'any' })}
      ${selectField('Statut', 'identity.status', identity.status, ['Actif', 'En pause', 'Inactif'])}
    </div>
    <div class="editor-collection-group"><h4>Équipement et possessions · facultatif</h4>
      ${renderCollectionSection('Armes', 'weapons', character.equipment?.weapons || [], renderEquipmentEditorRow)}
      ${renderCollectionSection('Armures', 'armour', character.equipment?.armour || [], renderEquipmentEditorRow)}
      ${renderCollectionSection('Objets et possessions', 'possessions', character.equipment?.possessions || [], renderEquipmentEditorRow)}
      ${renderCollectionSection('Sorts', 'spells', character.equipment?.spells || [], renderEquipmentEditorRow)}
      ${renderCollectionSection('Prières', 'prayers', character.equipment?.prayers || [], renderEquipmentEditorRow)}
    </div>
    <div class="form-grid">${textareaField('Description physique', 'profile.description', profile.description, 'Apparence, signes distinctifs…')}${textareaField('Histoire personnelle', 'profile.history', profile.history, 'Origines, événements marquants…')}${textareaField('Objectifs', 'profile.goals', profile.goals, 'Ce que votre personnage cherche à accomplir…')}${textareaField('Notes personnelles', 'profile.notes', profile.notes, 'Informations libres…')}</div>
    <p class="form-hint">Le mouvement, les blessures maximales et plusieurs ressources restent manuels tant que les données officielles nécessaires ne sont pas configurées. Les bonus de Force et d’Endurance sont dérivables des caractéristiques quand elles sont renseignées.</p>`;
  const stages = [
    stage('identity', 'Identité du personnage', 'Les traits qui définissent votre personnage.', identityContent),
    stage('species', 'Espèce', 'Choisissez une espèce et consultez les données configurées.', speciesContent),
    stage('characteristics', 'Caractéristiques principales', 'Générez les caractéristiques ou saisissez-les individuellement.', characteristicContent),
    stage('career', 'Carrière et niveau', 'Les choix proposés proviennent uniquement du référentiel sélectionné.', careerContent),
    stage('religion', 'Religion et divinité', 'Une étape facultative, reliée aux données de votre catalogue.', religionContent),
    stage('skills', 'Compétences', 'Examinez les suggestions et décidez lesquelles sélectionner.', skillsContent),
    stage('talents', 'Talents', 'Ajoutez les talents voulus sans inventer leurs effets ni leurs coûts.', talentsContent),
    stage('resources', 'Caractéristiques secondaires et ressources', 'Renseignez les valeurs connues et les éléments facultatifs.', resourcesContent),
    stage('review', 'Récapitulatif et validation', 'Les erreurs bloquantes et les avertissements vous renvoient à la bonne étape.', '<div id="creation-review">Le récapitulatif sera actualisé à cette étape.</div>')
  ].join('');
  const footer = guided
    ? `<footer class="editor-footer creation-wizard-footer"><span class="autosave-state" id="autosave-state"><i></i> Brouillon enregistré sur cet appareil</span><div><button type="button" class="button button-quiet" data-action="close-editor">Enregistrer le brouillon</button><button type="button" class="button button-outline" data-action="wizard-prev">← Précédent</button><button type="button" class="button button-quiet" data-action="wizard-skip" hidden>Passer cette étape</button><button type="button" class="button button-primary" data-action="wizard-next">Suivant →</button><button type="submit" class="button button-primary" data-wizard-finish hidden>Créer le personnage</button></div></footer>`
    : `<footer class="editor-footer"><span class="autosave-state" id="autosave-state"><i></i> Enregistré sur cet appareil</span><div><button type="button" class="button button-quiet" data-action="close-editor">Fermer</button><button type="submit" class="button button-primary">Enregistrer et terminer <span aria-hidden="true">→</span></button></div></footer>`;
  return `
    <dialog class="editor-dialog ${guided ? 'creation-wizard-dialog' : ''}" id="character-dialog" aria-labelledby="editor-title">
      <div class="editor-shell">
        <header class="editor-header"><div><div class="eyebrow"><span class="eyebrow-line"></span> REGISTRE PERSONNEL</div><h2 id="editor-title">${guided ? 'Création guidée du personnage' : 'Modifier le personnage'}</h2><p>${guided ? 'Avancez à votre rythme. Vos choix sont conservés dans un brouillon local.' : 'Les modifications sont enregistrées automatiquement sur cet appareil.'}</p></div><button type="button" class="dialog-close" data-action="close-editor" aria-label="Fermer">×</button></header>
        ${progress}
        <form id="character-form" class="character-form" data-guided="${guided ? 'true' : 'false'}">
          ${stages}
          ${footer}
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
    modalRoot.replaceChildren();
    editorState = null;
    await refreshCharacters();
  } catch (error) {
    showToast(error.message || 'La sauvegarde a échoué.', 'error');
  }
}

function showWizardStep(stepId) {
  const index = Math.max(0, CREATION_STEPS.findIndex((step) => step.id === stepId));
  const selected = CREATION_STEPS[index];
  const form = document.querySelector('#character-form');
  if (!form || !selected) return;
  form.querySelectorAll('[data-wizard-step]').forEach((section) => {
    section.hidden = section.dataset.wizardStep !== selected.id;
  });
  form.closest('.editor-shell')?.querySelectorAll('.creation-stepper-item').forEach((button, buttonIndex) => {
    const active = button.dataset.step === selected.id;
    button.classList.toggle('is-current', active);
    button.setAttribute('aria-current', active ? 'step' : 'false');
    button.querySelector('span').textContent = buttonIndex + 1;
  });
  updateWizardProgress(form);
  const previous = form.querySelector('[data-action="wizard-prev"]');
  const next = form.querySelector('[data-action="wizard-next"]');
  const skip = form.querySelector('[data-action="wizard-skip"]');
  const finish = form.querySelector('[data-wizard-finish]');
  if (previous) previous.disabled = index === 0;
  if (next) next.hidden = selected.id === 'review';
  if (skip) skip.hidden = !OPTIONAL_CREATION_STEPS.has(selected.id);
  if (finish) finish.hidden = selected.id !== 'review';
  const title = document.querySelector('#editor-title');
  if (title) title.textContent = `Création guidée · ${selected.title}`;
  if (selected.id === 'review') updateCreationReview();
}

function updateWizardProgress(form = document.querySelector('#character-form')) {
  if (!editorState?.guided || !form) return;
  const candidate = collectEditorValues();
  const states = getCreationStepStates(
    candidate,
    referenceEntries,
    {
      currentStep: editorState.character.creationWizard?.step || 'identity',
      skippedSteps: candidate.creationWizard?.skippedSteps || []
    }
  );
  const statesById = new Map(states.map((state) => [state.id, state]));
  form.closest('.editor-shell')?.querySelectorAll('.creation-stepper-item').forEach((button) => {
    const state = statesById.get(button.dataset.step);
    if (!state) return;
    button.classList.toggle('is-current', state.isCurrent);
    button.classList.toggle('is-complete', state.isComplete);
    button.dataset.progress = state.state;
    const index = CREATION_STEPS.findIndex((step) => step.id === state.id);
    const marker = button.querySelector('span');
    if (marker) marker.textContent = state.isComplete ? '✓' : String(index + 1);
    const label = button.querySelector('small')?.textContent || button.dataset.step;
    button.setAttribute('aria-label', `${label}${state.isComplete ? ' · étape terminée' : ' · étape à compléter'}${state.isCurrent ? ' · étape sélectionnée' : ''}`);
  });
}

function clearSkippedWizardStep(stepId) {
  if (!editorState?.guided || !OPTIONAL_CREATION_STEPS.has(stepId)) return false;
  const wizard = editorState.character.creationWizard || { step: 'identity', skippedSteps: [] };
  const skipped = new Set(wizard.skippedSteps || []);
  if (!skipped.delete(stepId)) return false;
  editorState.character.creationWizard = { ...wizard, skippedSteps: [...skipped] };
  return true;
}

function clearSkippedWizardStepForTarget(target) {
  if (!target?.name && !target?.hasAttribute?.('data-collection-field')) return;
  const stepId = target.closest?.('[data-wizard-step]')?.dataset.wizardStep;
  if (stepId) clearSkippedWizardStep(stepId);
}

function updateCreationReview() {
  const container = document.querySelector('#creation-review');
  if (!container || !editorState) return;
  try {
    const candidate = collectEditorValues();
    const validation = validateCharacterCreation(candidate, referenceEntries);
    container.innerHTML = renderCreationReviewMarkup(candidate);
    const finish = document.querySelector('[data-wizard-finish]');
    if (finish) {
      finish.disabled = !validation.valid;
      finish.title = validation.valid ? 'Créer la fiche du personnage' : 'Corrigez les erreurs bloquantes avant de créer la fiche';
    }
  } catch (error) {
    container.textContent = error.message || 'Impossible de préparer le récapitulatif.';
  }
}

async function setWizardStep(stepId, { skipCurrent = false } = {}) {
  if (!editorState?.guided || !CREATION_STEPS.some((step) => step.id === stepId)) return;
  clearTimeout(saveTimer);
  const state = editorState;
  const previousCharacter = state.character;
  try {
    const candidate = collectEditorValues();
    const currentStep = state.character.creationWizard?.step || 'identity';
    const skipped = new Set(candidate.creationWizard?.skippedSteps || []);
    if (skipCurrent && currentStep !== stepId && OPTIONAL_CREATION_STEPS.has(currentStep)) skipped.add(currentStep);
    candidate.creationWizard = { step: stepId, skippedSteps: [...skipped] };
    candidate.isDraft = true;
    // Le changement est visible immédiatement. Toutes les écritures restent
    // sérialisées avec les autosauvegardes pour empêcher un ancien brouillon
    // d'écraser l'étape ou les choix les plus récents.
    state.character = candidate;
    showWizardStep(stepId);
    updateSidebar();
    await enqueueEditorSave(async () => {
      if (editorState !== state) return;
      const persisted = collectEditorValues();
      persisted.isDraft = true;
      await saveCharacter(persisted);
      if (editorState !== state) return;
      const index = characters.findIndex((entry) => entry.id === persisted.id);
      if (index >= 0) characters[index] = persisted;
      else characters.push(persisted);
      showWizardStep(state.character.creationWizard?.step || 'identity');
      updateAutosaveState('Brouillon enregistré', 'saved');
      setSaveIndicator('Brouillon enregistré', 'saved');
      updateSidebar();
    });
  } catch (error) {
    if (editorState === state) {
      state.character = { ...state.character, creationWizard: previousCharacter.creationWizard };
      showWizardStep(previousCharacter.creationWizard?.step || 'identity');
      updateSidebar();
    }
    updateAutosaveState('Échec de la sauvegarde', 'error');
    showToast(error.message || 'Impossible d’enregistrer le brouillon.', 'error');
  }
}

async function openEditor(character, { guided = false } = {}) {
  editorState = { character: clone(character), guided, generationHistory: [] };
  const activeEditorState = editorState;
  modalRoot.innerHTML = renderEditor(character, { guided });
  const dialog = document.querySelector('#character-dialog');
  dialog.addEventListener('close', () => {
    if (editorState === activeEditorState) {
      editorState = null;
      if (modalRoot.contains(dialog)) modalRoot.replaceChildren();
    }
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
      if (kind === 'careers') {
        const oldCareerId = previous?.id || '';
        if (oldCareerId && entry?.id !== oldCareerId) {
          const linkedRows = [...form.querySelectorAll('[data-item-row][data-source-career-id]')]
            .filter((row) => row.dataset.sourceCareerId === oldCareerId);
          if (linkedRows.length && !window.confirm(`La nouvelle carrière ne correspond plus à ${linkedRows.length} compétence(s) ou talent(s) suggéré(s) par « ${previous.name} ».\n\nLes retirer de cette sélection ?`)) return false;
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
    clearSkippedWizardStepForTarget(event.target);
    syncEditorStateFromForm(form);
    if (event.target.closest('[data-item-row]') || event.target.matches('[data-stat-initial], [data-stat-advances]')) updateCharacteristicPreviews(form);
    if (guided) updateWizardProgress(form);
    if (guided && editorState?.character.creationWizard?.step === 'review') updateCreationReview();
    scheduleEditorSave();
  });
  form.addEventListener('click', (event) => {
    const button = event.target.closest('[data-collection-action]');
    if (!button) return;
    const action = button.dataset.collectionAction;
    const collection = button.dataset.collection || button.closest('[data-item-row]')?.dataset.collection;
    const progressStep = button.closest('[data-wizard-step]')?.dataset.wizardStep || collection;
    if (action === 'remove') {
      button.closest('[data-item-row]')?.remove();
      clearSkippedWizardStep(progressStep);
    } else if (action === 'add' && collection) {
      const container = form.querySelector(`#collection-${collection}`);
      if (!container) return;
      container.querySelector('.collection-empty')?.remove();
      const templates = {
        skills: () => renderSkillEditorRow({ id: createId(), useCharacteristicBase: true, advances: 0, acquired: true, status: 'acquired' }),
        talents: () => renderTalentEditorRow({ id: createId(), rank: 1, acquired: true, status: 'acquired' }),
        weapons: () => renderEquipmentEditorRow({ id: createId(), quantity: 1 }, 'weapons'),
        armour: () => renderEquipmentEditorRow({ id: createId(), quantity: 1 }, 'armour'),
        possessions: () => renderEquipmentEditorRow({ id: createId(), quantity: 1 }, 'possessions'),
        spells: () => renderEquipmentEditorRow({ id: createId(), quantity: 1 }, 'spells'),
        prayers: () => renderEquipmentEditorRow({ id: createId(), quantity: 1 }, 'prayers')
      };
      if (!templates[collection]) return;
      container.insertAdjacentHTML('beforeend', templates[collection]());
      if (collection === 'talents') mountTalentPickers(container, referenceEntries);
      clearSkippedWizardStep(progressStep);
      container.querySelector('[data-item-row]:last-child [data-collection-field="name"]')?.focus();
    }
    syncEditorStateFromForm(form);
    updateCharacteristicPreviews(form);
    if (guided) updateWizardProgress(form);
    scheduleEditorSave();
  });
  form.addEventListener('change', (event) => {
    clearSkippedWizardStepForTarget(event.target);
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
      refreshWizardSuggestions();
    }
    syncEditorStateFromForm(form);
    updateCharacteristicPreviews(form);
    if (guided) updateWizardProgress(form);
    if (guided && editorState?.character.creationWizard?.step === 'review') updateCreationReview();
    scheduleEditorSave();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearTimeout(saveTimer);
    try {
      if (guided) {
        const currentStep = editorState.character.creationWizard?.step || 'identity';
        if (currentStep !== 'review') {
          const nextStep = CREATION_STEPS[Math.min(CREATION_STEPS.length - 1, CREATION_STEPS.findIndex((step) => step.id === currentStep) + 1)];
          await setWizardStep(nextStep.id);
          return;
        }
        const candidate = collectEditorValues();
        const validation = validateCharacterCreation(candidate, referenceEntries);
        updateCreationReview();
        if (!validation.valid) {
          const firstError = validation.errors[0];
          await setWizardStep(firstError.step);
          showToast(validation.errors.map((item) => item.message).join(' '), 'error');
          return;
        }
      }
      await queueEditorSave(true);
      const id = editorState.character.id;
      if (dialog.open) dialog.close('saved');
      navigate(`/character/${encodeURIComponent(id)}`);
      showToast(guided ? 'Personnage créé et enregistré sur cet appareil.' : 'Personnage enregistré.');
    } catch (error) {
      updateAutosaveState('Échec de la sauvegarde', 'error');
      showToast(error.message || 'Impossible d’enregistrer cette fiche.', 'error');
    }
  });
  dialog.showModal();
  updateSidebar();
  updateCharacteristicPreviews(form);
  if (guided) {
    showWizardStep(character.creationWizard?.step || 'identity');
    refreshWizardSuggestions();
    dialog.querySelector(`[data-wizard-step="${character.creationWizard?.step || 'identity'}"] input:not([type="hidden"]), [data-wizard-step="${character.creationWizard?.step || 'identity'}"] select`)?.focus();
  } else {
    dialog.querySelector('.reference-picker-input')?.focus();
  }
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
  refreshWizardSuggestions();
}

async function createNewCharacter() {
  try {
    const character = createCharacter({ isDraft: true, creationWizard: { step: 'identity', skippedSteps: [] } });
    await saveCharacter(character);
    characters.push(character);
    await openEditor(character, { guided: true });
    setSaveIndicator('Brouillon créé', 'saved');
  } catch (error) {
    showToast(error.message || 'Impossible de créer une fiche.', 'error');
  }
}

async function editCharacter(id) {
  try {
    const character = await getCharacter(id);
    if (!character) throw new Error('Ce personnage est introuvable.');
    await openEditor(character, { guided: character.isDraft });
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
    const maxRankRaw = String(values.get('maxRank') || '').trim();
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
      effects,
      custom: existing?.custom ?? !existing
    };
    if (data.maxRank !== null && (!Number.isInteger(data.maxRank) || data.maxRank < 1 || data.maxRank > 999)) {
      showToast('Le rang maximal doit être un entier compris entre 1 et 999.', 'error');
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
  if (!prepared.additions.length) {
    showToast(`Import annulé : les ${prepared.skipped.length} talent(s) sont déjà présents ou en conflit.`, 'error');
    return;
  }
  const accepted = window.confirm(`Importer le pack « ${pack.name} » ?\n\n${prepared.additions.length} nouveau(x) talent(s) seront ajoutés.${conflictDetails}`);
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
  if (action === 'open-character') {
    const selected = characters.find((character) => character.id === id);
    if (selected?.isDraft) await editCharacter(id);
    else navigate(`/character/${encodeURIComponent(id)}`);
  }
  if (action === 'edit-character') await editCharacter(id);
  if (action === 'delete-character') await removeCharacter(id);
  if (action === 'duplicate-character') await duplicateCharacter(id);
  if (action === 'export-character') exportOneCharacter(id);
  if (action === 'export-backup') exportBackup();
  if (action === 'import-json') importInput.click();
  if (action === 'close-editor') await closeEditor();
  if (action === 'generate-characteristics') {
    event.preventDefault();
    generateAndApplyCharacteristics();
  }
  if (action === 'undo-characteristics-generation') undoLastCharacteristicGeneration();
  if (action === 'wizard-prev' || action === 'wizard-next' || action === 'wizard-skip') {
    const current = editorState?.character.creationWizard?.step || 'identity';
    const index = CREATION_STEPS.findIndex((step) => step.id === current);
    const direction = action === 'wizard-prev' ? -1 : 1;
    const next = CREATION_STEPS[Math.max(0, Math.min(CREATION_STEPS.length - 1, index + direction))];
    if (next) await setWizardStep(next.id, { skipCurrent: action === 'wizard-skip' && OPTIONAL_CREATION_STEPS.has(current) });
  }
  if (action === 'wizard-go') await setWizardStep(button.dataset.step);
  if (action === 'add-career-skills') addWizardSuggestions('skills', 'career');
  if (action === 'add-career-talents') addWizardSuggestions('talents', 'career');
  if (action === 'add-species-skills') addWizardSuggestions('skills', 'species');
  if (action === 'add-species-talents') addWizardSuggestions('talents', 'species');
  if (action === 'grant-experience') await addExperience(button.dataset.characterId || '');
  if (action === 'purchase-advancement') await buyAdvancement(button);
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
  if (event.target.matches('[data-talent-filter]')) {
    const filters = Object.fromEntries([...viewRoot.querySelectorAll('[data-talent-filter]')].map((field) => [field.dataset.talentFilter, field.value]));
    const results = filterTalentCatalog(referenceEntries, filters);
    const grid = viewRoot.querySelector('#talent-reference-grid');
    if (grid) grid.innerHTML = renderTalentCards(results);
    const count = viewRoot.querySelector('[data-talent-results-count]');
    if (count) count.textContent = `${results.length} talent(s)`;
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

  if (referenceEntries.length > 0) {
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
