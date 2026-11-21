import { escapeHTML } from '../utils/format.js';
import { findTalentReference, normalizeTalentText } from '../services/talents.js';

const INITIAL_RESULTS = 20;
const PAGE_SIZE = 20;

function sourceLabel(entry) {
  if (entry.verificationStatus === 'verified') return 'Référence vérifiée';
  if (entry.verificationStatus === 'incomplete') return 'Informations incomplètes';
  if (entry.verificationStatus === 'community') return 'Source communautaire';
  return entry.source === 'pack' ? 'Pack importé' : entry.source === 'custom' ? 'Personnalisé' : 'À vérifier';
}

function talentSummary(entry) {
  if (!entry) return 'Aucun talent du catalogue sélectionné.';
  const details = [
    entry.name_fr && entry.name_fr !== entry.name ? `FR : ${entry.name_fr}` : '',
    entry.name_original && entry.name_original !== entry.name ? `Nom original : ${entry.name_original}` : '',
    entry.category || '',
    entry.description || '',
    entry.tests?.length ? `Tests : ${entry.tests.join(', ')}` : '',
    entry.skills?.length ? `Compétences : ${entry.skills.join(', ')}` : '',
    entry.maxRank ? `Rang maximal connu : ${entry.maxRank}` : 'Rang maximal non renseigné',
    entry.prerequisites?.length ? `Prérequis : ${entry.prerequisites.join(' ; ')}` : '',
    entry.sourceInfo?.title ? `Source : ${entry.sourceInfo.title}${entry.sourceInfo.publisher ? ` · ${entry.sourceInfo.publisher}` : ''}${entry.sourceInfo.page ? `, p. ${entry.sourceInfo.page}` : ''}` : '',
    entry.sourceInfo?.note || '',
    entry.references?.length ? `Références : ${entry.references.join(' · ')}` : '',
    sourceLabel(entry)
  ].filter(Boolean);
  return details.join(' · ');
}

export function renderTalentPicker(talent = {}, catalog = []) {
  const selected = findTalentReference(catalog, talent.referenceId, talent.name);
  const referenceId = selected?.id || talent.referenceId || '';
  const selectedName = talent.name || selected?.name_fr || selected?.name || '';
  const preview = selected ? {
    ...selected,
    name: talent.name || selected.name,
    name_fr: talent.nameFr || selected.name_fr,
    name_original: talent.nameOriginal || selected.name_original,
    category: talent.category || selected.category,
    maxRank: talent.maxRank ?? selected.maxRank,
    verificationStatus: talent.verificationStatus || selected.verificationStatus,
    prerequisites: talent.prerequisites?.length ? talent.prerequisites : selected.prerequisites,
    tests: talent.tests?.length ? talent.tests : selected.tests,
    skills: talent.skills?.length ? talent.skills : selected.skills,
    sourceInfo: talent.sourceInfo || selected.sourceInfo
  } : null;
  const listId = `talent-options-${String(talent.id || 'new-talent').replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return `<div class="talent-picker" data-talent-picker data-reference-id="${escapeHTML(referenceId)}" data-list-id="${listId}">
    <input type="hidden" data-collection-field="name" value="${escapeHTML(selectedName)}">
    <input type="hidden" data-collection-field="nameFr" value="${escapeHTML(talent.nameFr || selected?.name_fr || '')}">
    <input type="hidden" data-collection-field="nameOriginal" value="${escapeHTML(talent.nameOriginal || selected?.name_original || '')}">
    <input type="hidden" data-collection-field="category" value="${escapeHTML(talent.category || selected?.category || '')}">
    <input type="hidden" data-collection-field="maxRank" value="${escapeHTML(talent.maxRank ?? selected?.maxRank ?? '')}">
    <input type="hidden" data-collection-field="verificationStatus" value="${escapeHTML(talent.verificationStatus || selected?.verificationStatus || '')}">
    <input type="hidden" data-collection-field="prerequisites" value="${escapeHTML((talent.prerequisites?.length ? talent.prerequisites : selected?.prerequisites || []).join(' ; '))}">
    <input type="hidden" data-collection-field="tests" value="${escapeHTML((talent.tests?.length ? talent.tests : selected?.tests || []).join(' ; '))}">
    <input type="hidden" data-collection-field="skills" value="${escapeHTML((talent.skills?.length ? talent.skills : selected?.skills || []).join(' ; '))}">
    <div class="talent-picker-selected" data-talent-selected>${escapeHTML(selectedName || 'Aucun talent sélectionné')}</div>
    ${!selected && talent.name ? '<small class="form-hint talent-picker-legacy">Nom historique conservé : associez-le à une entrée du catalogue pour bénéficier de ses informations.</small>' : ''}
    <div class="reference-picker-control">
      <input type="search" class="reference-picker-input" data-talent-search role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="${listId}" autocomplete="off" placeholder="Rechercher un talent… (FR ou nom original)">
      <button type="button" class="reference-picker-clear" data-talent-clear aria-label="Effacer le talent" title="Effacer la sélection">×</button>
    </div>
    <div class="reference-picker-list" id="${listId}" role="listbox" hidden></div>
    <p class="reference-picker-info" data-talent-info>${escapeHTML(talentSummary(preview))}</p>
  </div>`;
}

export function mountTalentPickers(root, catalog) {
  const pickers = [...root.querySelectorAll('[data-talent-picker]:not([data-picker-mounted])')];
  for (const wrapper of pickers) {
    wrapper.dataset.pickerMounted = 'true';
    const row = wrapper.closest('[data-item-row]');
    const nameField = wrapper.querySelector('[data-collection-field="name"]');
    const selectedLabel = wrapper.querySelector('[data-talent-selected]');
    const search = wrapper.querySelector('[data-talent-search]');
    const list = wrapper.querySelector('[role="listbox"]');
    const info = wrapper.querySelector('[data-talent-info]');
    const clear = wrapper.querySelector('[data-talent-clear]');
    const legacy = wrapper.querySelector('.talent-picker-legacy');
    let selected = findTalentReference(catalog, wrapper.dataset.referenceId, nameField.value);
    const hadReferenceId = Boolean(row.dataset.referenceId);
    const hadCharacterEffects = Boolean(row.dataset.effects && row.dataset.effects !== '[]');
    let matches = [];
    let visibleCount = INITIAL_RESULTS;
    let activeIndex = -1;

    if (selected) {
      wrapper.dataset.referenceId = selected.id;
      row.dataset.referenceId = selected.id;
      row.dataset.maxRank ||= selected.maxRank ?? '';
      if (!row.dataset.sourceInfo || row.dataset.sourceInfo === '{}') row.dataset.sourceInfo = JSON.stringify(selected.sourceInfo || {});
      if (!row.dataset.references || row.dataset.references === '[]') row.dataset.references = JSON.stringify(selected.references || []);
      if (!hadReferenceId && !hadCharacterEffects) row.dataset.effects = JSON.stringify(selected.effects || []);
      if (!hadReferenceId) nameField.value = selected.name_fr || selected.name;
      const fillIfEmpty = (field, value) => {
        const input = wrapper.querySelector(`[data-collection-field="${field}"]`);
        if (input && !input.value) input.value = value ?? '';
      };
      fillIfEmpty('nameFr', selected.name_fr);
      fillIfEmpty('nameOriginal', selected.name_original);
      fillIfEmpty('category', selected.category);
      fillIfEmpty('maxRank', selected.maxRank);
      fillIfEmpty('verificationStatus', selected.verificationStatus);
      fillIfEmpty('prerequisites', (selected.prerequisites || []).join(' ; '));
      fillIfEmpty('tests', (selected.tests || []).join(' ; '));
      fillIfEmpty('skills', (selected.skills || []).join(' ; '));
      selectedLabel.textContent = nameField.value || selected.name_fr || selected.name;
      info.textContent = talentSummary({
        ...selected,
        name_fr: wrapper.querySelector('[data-collection-field="nameFr"]').value || selected.name_fr,
        name_original: wrapper.querySelector('[data-collection-field="nameOriginal"]').value || selected.name_original,
        category: wrapper.querySelector('[data-collection-field="category"]').value || selected.category,
        maxRank: wrapper.querySelector('[data-collection-field="maxRank"]').value || selected.maxRank,
        prerequisites: wrapper.querySelector('[data-collection-field="prerequisites"]').value.split(' ; ').filter(Boolean),
        tests: wrapper.querySelector('[data-collection-field="tests"]').value.split(' ; ').filter(Boolean),
        skills: wrapper.querySelector('[data-collection-field="skills"]').value.split(' ; ').filter(Boolean),
        sourceInfo: JSON.parse(row.dataset.sourceInfo || '{}')
      });
      if (legacy) legacy.remove();
      const rank = row.querySelector('[data-collection-field="rank"]');
      if (rank && selected.maxRank) rank.max = String(selected.maxRank);
      const characteristicEffect = hadReferenceId || hadCharacterEffects
        ? null
        : (selected.effects || []).find((effect) => effect.type === 'characteristicBonus');
      const characteristicField = row.querySelector('[data-collection-field="effectCharacteristic"]');
      const effectValue = row.querySelector('[data-collection-field="effectValue"]');
      const effectVerified = row.querySelector('[data-collection-field="effectVerified"]');
      const effectReference = row.querySelector('[data-collection-field="effectReference"]');
      if (!hadReferenceId && !hadCharacterEffects) {
        if (characteristicField) characteristicField.value = characteristicEffect?.characteristic || '';
        if (effectValue) effectValue.value = characteristicEffect?.value ?? 0;
        if (effectVerified) effectVerified.checked = characteristicEffect?.verified === true;
        if (effectReference) effectReference.value = characteristicEffect?.reference || '';
      }
    }

    const close = () => {
      list.hidden = true;
      search.setAttribute('aria-expanded', 'false');
      search.removeAttribute('aria-activedescendant');
      activeIndex = -1;
    };

    const render = () => {
      const page = matches.slice(0, visibleCount);
      list.innerHTML = page.map((entry, index) => {
        const label = entry.name_fr || entry.name;
        const original = entry.name_original && entry.name_original !== label ? entry.name_original : '';
        const metadata = [entry.category, entry.tests?.length ? entry.tests.join(', ') : '', sourceLabel(entry)].filter(Boolean).join(' · ');
        const additional = [entry.description, entry.prerequisites?.length ? `Prérequis : ${entry.prerequisites.join(' ; ')}` : '', entry.maxRank ? `Rang maximal : ${entry.maxRank}` : ''].filter(Boolean).join(' · ');
        return `<div class="reference-picker-option" id="${list.id}-option-${index}" role="option" aria-selected="${selected?.id === entry.id ? 'true' : 'false'}" data-talent-option="${escapeHTML(entry.id)}"><strong>${escapeHTML(label)}</strong>${original ? `<small>${escapeHTML(original)}</small>` : ''}<small>${escapeHTML(metadata)}</small>${additional ? `<small>${escapeHTML(additional)}</small>` : ''}</div>`;
      }).join('');
      if (matches.length > page.length) {
        list.insertAdjacentHTML('beforeend', `<button type="button" class="talent-picker-more" data-talent-more>Afficher ${Math.min(PAGE_SIZE, matches.length - page.length)} résultat(s) supplémentaire(s) · ${matches.length - page.length} restant(s)</button>`);
      }
      if (!matches.length) list.innerHTML = '<p class="reference-picker-empty">Aucun talent correspondant. Vérifiez les noms français et originaux dans le catalogue.</p>';
    };

    const open = (query = '') => {
      const normalized = normalizeTalentText(query);
      matches = catalog.filter((entry) => entry.kind === 'talents' && [
        entry.name, entry.name_fr, entry.name_original, ...(entry.aliases || [])
      ].some((name) => normalizeTalentText(name).includes(normalized)));
      matches.sort((a, b) => (a.name_fr || a.name).localeCompare(b.name_fr || b.name, 'fr'));
      visibleCount = INITIAL_RESULTS;
      render();
      list.hidden = false;
      search.setAttribute('aria-expanded', 'true');
      activeIndex = -1;
    };

    const choose = (entry) => {
      if (!entry) return;
      selected = entry;
      wrapper.dataset.referenceId = entry.id;
      row.dataset.referenceId = entry.id;
      row.dataset.maxRank = entry.maxRank ?? '';
      row.dataset.sourceInfo = JSON.stringify(entry.sourceInfo || {});
      row.dataset.references = JSON.stringify(entry.references || []);
      row.dataset.effects = JSON.stringify(entry.effects || []);
      nameField.value = entry.name_fr || entry.name;
      wrapper.querySelector('[data-collection-field="nameFr"]').value = entry.name_fr || '';
      wrapper.querySelector('[data-collection-field="nameOriginal"]').value = entry.name_original || '';
      wrapper.querySelector('[data-collection-field="category"]').value = entry.category || '';
      wrapper.querySelector('[data-collection-field="maxRank"]').value = entry.maxRank ?? '';
      wrapper.querySelector('[data-collection-field="verificationStatus"]').value = entry.verificationStatus || '';
      wrapper.querySelector('[data-collection-field="prerequisites"]').value = (entry.prerequisites || []).join(' ; ');
      wrapper.querySelector('[data-collection-field="tests"]').value = (entry.tests || []).join(' ; ');
      wrapper.querySelector('[data-collection-field="skills"]').value = (entry.skills || []).join(' ; ');
      selectedLabel.textContent = entry.name_fr || entry.name;
      info.textContent = talentSummary(entry);
      if (legacy) legacy.remove();
      const description = row.querySelector('[data-collection-field="description"]');
      const conditions = row.querySelector('[data-collection-field="conditions"]');
      if (description && !description.value && entry.description) description.value = entry.description;
      if (conditions && !conditions.value && entry.prerequisites?.length) conditions.value = entry.prerequisites.join(' ; ');
      const rank = row.querySelector('[data-collection-field="rank"]');
      if (rank) {
        rank.max = entry.maxRank ? String(entry.maxRank) : '999';
        if (entry.maxRank && Number(rank.value) > entry.maxRank) rank.value = String(entry.maxRank);
      }
      const characteristicEffect = (entry.effects || []).find((effect) => effect.type === 'characteristicBonus');
      const characteristicField = row.querySelector('[data-collection-field="effectCharacteristic"]');
      const effectValue = row.querySelector('[data-collection-field="effectValue"]');
      const effectVerified = row.querySelector('[data-collection-field="effectVerified"]');
      const effectReference = row.querySelector('[data-collection-field="effectReference"]');
      if (characteristicField) characteristicField.value = characteristicEffect?.characteristic || '';
      if (effectValue) effectValue.value = characteristicEffect?.value ?? 0;
      if (effectVerified) effectVerified.checked = characteristicEffect?.verified === true;
      if (effectReference) effectReference.value = characteristicEffect?.reference || '';
      search.value = '';
      search.placeholder = 'Rechercher un autre talent…';
      close();
      nameField.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const highlight = (index) => {
      const options = [...list.querySelectorAll('[data-talent-option]')];
      if (!options.length) return;
      activeIndex = index < 0 ? options.length - 1 : index % options.length;
      options.forEach((option, optionIndex) => option.classList.toggle('is-active', optionIndex === activeIndex));
      search.setAttribute('aria-activedescendant', options[activeIndex].id);
      options[activeIndex].scrollIntoView?.({ block: 'nearest' });
    };

    search.addEventListener('focus', () => open(search.value));
    search.addEventListener('input', () => open(search.value));
    search.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (list.hidden) open(search.value);
        highlight(activeIndex + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        highlight(activeIndex - 1);
      } else if (event.key === 'Enter' && !list.hidden) {
        event.preventDefault();
        const option = [...list.querySelectorAll('[data-talent-option]')][activeIndex >= 0 ? activeIndex : 0];
        if (option) choose(catalog.find((entry) => entry.id === option.dataset.talentOption));
      } else if (event.key === 'Escape') close();
    });
    search.addEventListener('blur', () => window.setTimeout(() => {
      if (!wrapper.contains(document.activeElement)) close();
    }, 130));
    list.addEventListener('pointerdown', (event) => {
      if (event.target.closest('[data-talent-option]')) event.preventDefault();
    });
    list.addEventListener('click', (event) => {
      const more = event.target.closest('[data-talent-more]');
      if (more) {
        visibleCount += PAGE_SIZE;
        render();
        return;
      }
      const option = event.target.closest('[data-talent-option]');
      if (option) choose(catalog.find((entry) => entry.id === option.dataset.talentOption));
    });
    clear.addEventListener('click', () => {
      selected = null;
      wrapper.dataset.referenceId = '';
      row.dataset.referenceId = '';
      row.dataset.maxRank = '';
      row.dataset.sourceInfo = '{}';
      row.dataset.effects = '[]';
      row.dataset.references = '[]';
      nameField.value = '';
      for (const field of ['nameFr', 'nameOriginal', 'category', 'maxRank', 'verificationStatus', 'prerequisites', 'tests', 'skills']) {
        wrapper.querySelector(`[data-collection-field="${field}"]`).value = '';
      }
      const characteristicField = row.querySelector('[data-collection-field="effectCharacteristic"]');
      const effectValue = row.querySelector('[data-collection-field="effectValue"]');
      const effectVerified = row.querySelector('[data-collection-field="effectVerified"]');
      const effectReference = row.querySelector('[data-collection-field="effectReference"]');
      if (characteristicField) characteristicField.value = '';
      if (effectValue) effectValue.value = '0';
      if (effectVerified) effectVerified.checked = false;
      if (effectReference) effectReference.value = '';
      selectedLabel.textContent = 'Aucun talent sélectionné';
      info.textContent = talentSummary(null);
      search.value = '';
      close();
      nameField.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
}

