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

function renderEditor(character) {
  const { identity, characteristics, secondary, experience, profile } = character;
  const characteristicFields = CHARACTERISTICS.map(({ key, label }) => field(label, `characteristics.${key}`, characteristics[key], { type: 'number', min: 0, max: 999 })).join('');
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
              ${selectField('Espèce', 'identity.species', identity.species, ['', 'Humain', 'Nain', 'Halfling', 'Elfe'])}
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
              ${field('Expérience totale', 'experience.total', experience.total, { type: 'number', min: 0 })}
              ${field('Expérience dépensée', 'experience.spent', experience.spent, { type: 'number', min: 0 })}
            </div>
          </section>

          <section class="form-section"><div class="form-section-title"><span>03</span><div><h3>Caractéristiques principales</h3><p>Saisissez les valeurs de votre fiche de personnage.</p></div></div><div class="form-grid form-grid-stats">${characteristicFields}</div><p class="form-hint">Les valeurs restent modifiables. Aucun profil de départ ni calcul de règle n’est appliqué automatiquement.</p></section>

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

          <section class="form-section"><div class="form-section-title"><span>05</span><div><h3>Chronique personnelle</h3><p>Gardez une trace de son histoire et de ses ambitions.</p></div></div>
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
  form.addEventListener('input', scheduleEditorSave);
  form.addEventListener('change', (event) => {
    if (event.target.id === 'career-level-select') {
      const careerId = form.querySelector('[data-reference-picker="careers"] [data-picker-id]')?.value || '';
      const career = referenceEntries.find((entry) => entry.kind === 'careers' && entry.id === careerId);
      const level = getCareerLevels(career).find((item) => item.id === event.target.value);
      document.querySelector('#career-level-id').value = level?.id || '';
      document.querySelector('#career-level-value').value = level?.name || '';
      const preview = document.querySelector('#career-preview');
      if (preview) preview.innerHTML = careerPreviewMarkup(career, level);
    }
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
  if (existing?.source === 'builtin' && !levelsOnly) return showToast('Les données intégrées sont protégées.', 'error');
  const editorCareerId = kind === 'careers' ? existing?.id || `custom:career:${createId()}` : '';
  let careerLevels = kind === 'careers' ? getCareerLevels(existing) : [];
  modalRoot.innerHTML = renderReferenceEditor(kind, existing, referenceEntries, { levelsOnly });
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

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'new-character') await createNewCharacter();
  if (action === 'open-character') navigate(`/character/${encodeURIComponent(id)}`);
  if (action === 'edit-character') await editCharacter(id);
  if (action === 'delete-character') await removeCharacter(id);
  if (action === 'duplicate-character') await duplicateCharacter(id);
  if (action === 'export-character') exportOneCharacter(id);
  if (action === 'export-backup') exportBackup();
  if (action === 'import-json') importInput.click();
  if (action === 'close-editor') await closeEditor();
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
