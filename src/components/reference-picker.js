import { escapeHTML } from '../utils/format.js';

const FIELD_NAMES = {
  religions: { id: 'identity.religionId', value: 'identity.religion', label: 'Religion', placeholder: 'Rechercher une religion…' },
  deities: { id: 'identity.deityId', value: 'identity.deity', label: 'Divinité', placeholder: 'Rechercher une divinité…' },
  careers: { id: 'identity.careerId', value: 'identity.career', label: 'Carrière', placeholder: 'Rechercher une carrière…' }
};

function normalizeSearch(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR').trim();
}

export function isDeityCompatibleWithReligion(deity, religion) {
  if (!deity || !religion) return true;
  return Boolean(deity.religionIds?.includes(religion.id) || religion.deityIds?.includes(deity.id));
}

export function filterReferenceOptions(catalog, kind, query = '', { religionId = '' } = {}) {
  const normalized = normalizeSearch(query);
  let entries = catalog.filter((entry) => entry.kind === kind);
  if (kind === 'deities' && religionId) {
    const religion = catalog.find((entry) => entry.kind === 'religions' && entry.id === religionId);
    entries = entries.filter((entry) => isDeityCompatibleWithReligion(entry, religion));
  }
  if (normalized) {
    entries = entries.filter((entry) => normalizeSearch([
      entry.name,
      entry.className,
      ...(entry.domains || []),
      ...(entry.symbols || []),
      entry.description
    ].filter(Boolean).join(' ')).includes(normalized));
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function entrySummary(entry) {
  if (entry.kind === 'careers') return [
    entry.className,
    entry.description,
    ...(entry.levels || []).slice(0, 4).map((level) => typeof level === 'string' ? level : level.name)
  ].filter(Boolean).join(' · ');
  if (entry.kind === 'deities') return [...(entry.domains || []), ...(entry.symbols || []), entry.description].filter(Boolean).join(' · ');
  return [entry.origin, ...(entry.particularities || []), entry.description].filter(Boolean).join(' · ');
}

function sourceLabel(entry) {
  if (entry.source === 'builtin') return 'Intégrée';
  if (entry.source === 'pack') return 'Pack importé';
  return 'Personnalisée';
}

export function findReferenceByLegacyValue(entries, kind, id, label) {
  const options = entries.filter((entry) => entry.kind === kind);
  if (id) {
    const byId = options.find((entry) => entry.id === id);
    if (byId) return byId;
  }
  const normalized = normalizeSearch(label);
  if (!normalized) return null;
  const matches = options.filter((entry) => normalizeSearch(entry.name) === normalized);
  return matches.length === 1 ? matches[0] : null;
}

export function renderReferencePicker({ kind, entries, selectedId = '', value = '' }) {
  const config = FIELD_NAMES[kind];
  if (!config) throw new Error(`Sélecteur de référentiel inconnu : ${kind}.`);
  const selected = findReferenceByLegacyValue(entries, kind, selectedId, value);
  const info = selected ? entrySummary(selected) : value ? `Valeur historique conservée : ${value}. Sélectionnez une entrée pour l'associer au référentiel.` : 'Aucune entrée sélectionnée.';
  const listId = `reference-options-${kind}`;
  return `
    <div class="form-field reference-picker" data-reference-picker="${kind}" data-selected-id="${escapeHTML(selected?.id || '')}">
      <span>${config.label}</span>
      <input type="hidden" name="${config.id}" data-picker-id value="${escapeHTML(selected?.id || '')}">
      <input type="hidden" name="${config.value}" data-picker-value value="${escapeHTML(selected?.name || value)}">
      <div class="reference-picker-control">
        <input type="search" class="reference-picker-input" role="combobox" aria-label="${config.label}" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="${listId}" data-picker-search autocomplete="off" placeholder="${config.placeholder}" value="${escapeHTML(selected ? selected.name : '')}">
        <button type="button" class="reference-picker-clear" data-picker-clear aria-label="Effacer ${config.label.toLocaleLowerCase('fr-FR')}" title="Effacer la sélection">×</button>
      </div>
      <div class="reference-picker-list" id="${listId}" role="listbox" hidden></div>
      <p class="reference-picker-info" data-picker-info>${escapeHTML(info)}</p>
      <p class="reference-picker-empty" data-picker-empty hidden>Aucun résultat ne correspond à cette recherche.</p>
    </div>`;
}

export function mountReferencePickers(root, catalog, { onChange = () => true } = {}) {
  const pickers = new Map();
  for (const wrapper of root.querySelectorAll('[data-reference-picker]')) {
    const kind = wrapper.dataset.referencePicker;
    pickers.set(kind, {
      wrapper,
      input: wrapper.querySelector('[data-picker-search]'),
      idInput: wrapper.querySelector('[data-picker-id]'),
      valueInput: wrapper.querySelector('[data-picker-value]'),
      list: wrapper.querySelector('[data-picker-list]') || wrapper.querySelector('[role="listbox"]'),
      info: wrapper.querySelector('[data-picker-info]'),
      empty: wrapper.querySelector('[data-picker-empty]'),
      clear: wrapper.querySelector('[data-picker-clear]'),
      selected: findReferenceByLegacyValue(catalog, kind, wrapper.dataset.selectedId, wrapper.querySelector('[data-picker-value]')?.value)
    });
  }

  function allOptions(kind) {
    const picker = pickers.get(kind);
    if (!picker) return [];
    const religionId = kind === 'deities' ? pickers.get('religions')?.idInput.value || '' : '';
    return filterReferenceOptions(catalog, kind, '', { religionId });
  }

  function closeList(picker) {
    picker.list.hidden = true;
    picker.input.setAttribute('aria-expanded', 'false');
    picker.input.removeAttribute('aria-activedescendant');
  }

  function openList(picker, query = '') {
    const kind = picker.wrapper.dataset.referencePicker;
    const religionId = kind === 'deities' ? pickers.get('religions')?.idInput.value || '' : '';
    const filtered = filterReferenceOptions(catalog, kind, query, { religionId });
    picker.list.innerHTML = filtered.map((entry, index) => {
      const summary = entrySummary(entry);
      return `<div class="reference-picker-option" id="${picker.list.id}-option-${index}" role="option" aria-selected="${picker.idInput.value === entry.id ? 'true' : 'false'}" data-reference-option="${escapeHTML(entry.id)}" data-option-index="${index}"><strong>${escapeHTML(entry.name)}</strong><small>${escapeHTML(summary || sourceLabel(entry))}</small><em>${sourceLabel(entry)}</em></div>`;
    }).join('');
    picker.empty.hidden = filtered.length > 0;
    picker.list.hidden = false;
    picker.input.setAttribute('aria-expanded', 'true');
    picker.activeIndex = -1;
  }

  function refreshInfo(picker) {
    const entry = picker.selected;
    const oldValue = picker.valueInput.value;
    picker.info.textContent = entry
      ? entrySummary(entry) || sourceLabel(entry)
      : oldValue ? `Valeur historique conservée : ${oldValue}. Sélectionnez une entrée pour l'associer au référentiel.` : 'Aucune entrée sélectionnée.';
  }

  function setSelection(kind, entry, { notify = false } = {}) {
    const picker = pickers.get(kind);
    if (!picker) return false;
    const previous = { entry: picker.selected, id: picker.idInput.value, value: picker.valueInput.value };
    picker.selected = entry || null;
    picker.idInput.value = entry?.id || '';
    picker.valueInput.value = entry?.name || '';
    picker.wrapper.dataset.selectedId = entry?.id || '';
    picker.input.value = entry?.name || '';
    closeList(picker);
    refreshInfo(picker);
    if (notify) {
      picker.idInput.dispatchEvent(new Event('change', { bubbles: true }));
      picker.valueInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (notify && onChange(kind, entry || null, previous.entry || null) === false) {
      picker.selected = previous.entry;
      picker.idInput.value = previous.id;
      picker.valueInput.value = previous.value;
      picker.wrapper.dataset.selectedId = previous.id;
      picker.input.value = previous.entry?.name || '';
      refreshInfo(picker);
      return false;
    }
    return true;
  }

  function highlightOption(picker, index) {
    const options = [...picker.list.querySelectorAll('[role="option"]')];
    if (!options.length) return;
    picker.activeIndex = index < 0 ? options.length - 1 : index % options.length;
    options.forEach((option, optionIndex) => option.classList.toggle('is-active', optionIndex === picker.activeIndex));
    const active = options[picker.activeIndex];
    picker.input.setAttribute('aria-activedescendant', active.id);
    active.scrollIntoView?.({ block: 'nearest' });
  }

  for (const [kind, picker] of pickers) {
    if (picker.selected) {
      picker.idInput.value = picker.selected.id;
      picker.valueInput.value = picker.selected.name;
      picker.input.value = picker.selected.name;
    }
    refreshInfo(picker);
    picker.input.addEventListener('focus', () => openList(picker, picker.selected ? '' : picker.input.value));
    picker.input.addEventListener('input', () => openList(picker, picker.input.value));
    picker.input.addEventListener('blur', () => {
      window.setTimeout(() => {
        if (!picker.wrapper.contains(document.activeElement)) {
          picker.input.value = picker.selected?.name || '';
          closeList(picker);
        }
      }, 120);
    });
    picker.input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (picker.list.hidden) openList(picker, picker.input.value);
        highlightOption(picker, picker.activeIndex + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (picker.list.hidden) openList(picker, picker.input.value);
        highlightOption(picker, picker.activeIndex - 1);
      } else if (event.key === 'Enter' && !picker.list.hidden) {
        event.preventDefault();
        const options = [...picker.list.querySelectorAll('[data-reference-option]')];
        const target = options[picker.activeIndex >= 0 ? picker.activeIndex : 0];
        if (target) selectById(kind, target.dataset.referenceOption);
      } else if (event.key === 'Escape') closeList(picker);
    });
    picker.list.addEventListener('pointerdown', (event) => event.preventDefault());
    picker.list.addEventListener('click', (event) => {
      const option = event.target.closest('[data-reference-option]');
      if (option) selectById(kind, option.dataset.referenceOption);
    });
    picker.clear.addEventListener('click', () => setSelection(kind, null, { notify: true }));
  }

  function selectById(kind, id) {
    const entry = catalog.find((item) => item.id === id && item.kind === kind);
    if (entry) setSelection(kind, entry, { notify: true });
  }

  return {
    getSelection(kind) {
      const picker = pickers.get(kind);
      return picker ? { id: picker.idInput.value, value: picker.valueInput.value, entry: picker.selected } : null;
    },
    setSelection(kind, id) {
      const entry = catalog.find((item) => item.id === id && item.kind === kind) || null;
      return setSelection(kind, entry);
    },
    refresh() {
      const deityPicker = pickers.get('deities');
      if (deityPicker && !deityPicker.list.hidden) openList(deityPicker, deityPicker.input.value);
      if (deityPicker) refreshInfo(deityPicker);
    }
  };
}
