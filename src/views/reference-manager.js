import { escapeHTML } from '../utils/format.js';

const KIND_LABELS = { religions: 'Religions', deities: 'Divinités', careers: 'Carrières' };

function sourceBadge(entry) {
  const label = entry.source === 'builtin' ? 'Donnée intégrée' : entry.source === 'pack' ? 'Pack importé' : 'Donnée personnalisée';
  const className = entry.source === 'builtin' ? 'source-badge source-builtin' : entry.source === 'pack' ? 'source-badge source-pack' : 'source-badge source-custom';
  return `<span class="${className}">${label}</span>`;
}

function referenceCard(entry, allEntries) {
  const linkedNames = entry.kind === 'religions'
    ? (entry.deityIds || []).map((id) => allEntries.find((item) => item.id === id)?.name).filter(Boolean)
    : entry.kind === 'deities'
      ? (entry.religionIds || []).map((id) => allEntries.find((item) => item.id === id)?.name).filter(Boolean)
      : [];
  const detail = entry.kind === 'careers'
    ? [entry.className, entry.levels?.length ? `${entry.levels.length} niveau(x)` : 'Niveaux à compléter'].filter(Boolean).join(' · ')
    : entry.kind === 'deities'
      ? (entry.domains || []).join(' · ')
      : entry.origin;
  const editable = entry.source !== 'builtin';
  return `<article class="reference-card" data-entry-card data-kind="${entry.kind}" data-search="${escapeHTML(`${entry.name} ${detail || ''} ${entry.description || ''}`.toLocaleLowerCase('fr-FR'))}">
    <div class="reference-card-top"><span class="reference-kind">${KIND_LABELS[entry.kind]}</span>${sourceBadge(entry)}</div>
    <h3>${escapeHTML(entry.name)}</h3>
    ${detail ? `<p class="reference-card-meta">${escapeHTML(detail)}</p>` : ''}
    ${linkedNames.length ? `<p class="reference-card-meta">Associé à : ${escapeHTML(linkedNames.join(' · '))}</p>` : ''}
    <p class="reference-card-description">${escapeHTML(entry.description || 'Aucune description renseignée.')}</p>
    ${entry.references?.length ? `<p class="reference-card-source">Source : ${escapeHTML(entry.references.join(' · '))}</p>` : ''}
    <div class="reference-card-actions">${editable ? `<button class="button button-outline" type="button" data-action="edit-reference" data-id="${escapeHTML(entry.id)}">Modifier</button><button class="icon-button icon-button-danger" type="button" data-action="delete-reference" data-id="${escapeHTML(entry.id)}" aria-label="Supprimer ${escapeHTML(entry.name)}" title="Supprimer">×</button>` : '<span class="reference-immutable">Référence protégée</span>'}</div>
  </article>`;
}

export function renderReferenceManager(entries) {
  const sorted = [...entries].sort((a, b) => KIND_LABELS[a.kind].localeCompare(KIND_LABELS[b.kind], 'fr') || a.name.localeCompare(b.name, 'fr'));
  const counts = Object.fromEntries(['religions', 'deities', 'careers'].map((kind) => [kind, entries.filter((entry) => entry.kind === kind).length]));
  return `<section class="reference-page">
    <div class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> BIBLIOTHÈQUE LOCALE</div><h1>Référentiels <em>de données</em></h1><p class="page-intro">Choisissez les religions, divinités et carrières depuis les données intégrées ou vos propres extensions.</p></div><div class="heading-seal" aria-hidden="true"><span>✧</span><small>DATA<br>BOOK</small></div></div>
    <div class="reference-summary-grid">
      <article class="reference-summary"><span>Religions</span><strong>${counts.religions}</strong><button type="button" data-action="add-reference" data-kind="religions">＋ Ajouter</button></article>
      <article class="reference-summary"><span>Divinités</span><strong>${counts.deities}</strong><button type="button" data-action="add-reference" data-kind="deities">＋ Ajouter</button></article>
      <article class="reference-summary"><span>Carrières</span><strong>${counts.careers}</strong><button type="button" data-action="add-reference" data-kind="careers">＋ Ajouter</button></article>
    </div>
    <section class="reference-library">
      <div class="section-heading"><div><div class="eyebrow">CATALOGUE</div><h2>Entrées disponibles</h2></div><div class="reference-tools"><button type="button" class="button button-outline" data-action="export-references">⇩ Exporter mes données</button><button type="button" class="button button-outline" data-action="import-references">⇧ Importer un pack</button></div></div>
      <div class="toolbar reference-toolbar"><label class="search-box"><span aria-hidden="true">⌕</span><input id="reference-search" type="search" placeholder="Rechercher un élément…" autocomplete="off"></label><label class="filter-select"><span>Type</span><select id="reference-kind-filter"><option value="all">Tous les types</option><option value="religions">Religions</option><option value="deities">Divinités</option><option value="careers">Carrières</option></select></label></div>
      <p class="reference-results-count" id="reference-results-count">${sorted.length} entrée${sorted.length > 1 ? 's' : ''}</p>
      <div class="reference-grid" id="reference-grid">${sorted.map((entry) => referenceCard(entry, sorted)).join('') || '<div class="empty-state"><h3>Aucune donnée</h3><p>Ajoutez une entrée ou importez un pack JSON.</p></div>'}</div>
    </section>
    <aside class="reference-legend"><strong>Origine des données</strong><span><i class="legend-dot legend-builtin"></i> Intégrées : fournies avec l’application et protégées</span><span><i class="legend-dot legend-custom"></i> Personnalisées : créées ou modifiées ici</span><span><i class="legend-dot legend-pack"></i> Packs : importés depuis un fichier JSON</span></aside>
    <p class="reference-disclaimer">La liste des religions intégrée est une base initiale partielle, limitée à dix cultes humains du Vieux Monde ; elle ne prétend pas couvrir tous les panthéons ou cultes du cadre. Les 64 carrières et leurs classes reprennent la liste de l’aide de jeu française <a href="https://www.feldo.fr/2019/08/20/warhammer-4-recap-sur-creation-de-perso-par-zeptitlink/" target="_blank" rel="noopener noreferrer">Création de personnages WFRP4e (2019)</a>, à vérifier avec votre traduction du livre de base. Les carrières ne contiennent ici que leur nom et leur classe ; niveaux, compétences, talents, conditions et équipements restent à compléter. Aucun extrait descriptif d’ouvrage n’est reproduit.</p>
  </section>`;
}

function inputField(label, name, value, { wide = false, placeholder = '' } = {}) {
  return `<label class="form-field ${wide ? 'form-field-wide' : ''}"><span>${label}</span><input name="${name}" value="${escapeHTML(value || '')}" placeholder="${escapeHTML(placeholder)}"></label>`;
}

function textareaField(label, name, value, { wide = true, hint = 'Une valeur par ligne.' } = {}) {
  return `<label class="form-field ${wide ? 'form-field-wide' : ''}"><span>${label}</span><textarea name="${name}" rows="3" placeholder="Une valeur par ligne">${escapeHTML((value || []).join('\n'))}</textarea><small class="form-hint">${hint}</small></label>`;
}

function relationshipSelect(label, name, entries, selectedIds, kind) {
  const options = entries.filter((entry) => entry.kind === kind).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const selected = new Set(selectedIds || []);
  return `<label class="form-field form-field-wide"><span>${label}</span><select name="${name}" multiple size="${Math.min(Math.max(options.length, 3), 7)}">${options.map((entry) => `<option value="${escapeHTML(entry.id)}" ${selected.has(entry.id) ? 'selected' : ''}>${escapeHTML(entry.name)}${entry.source === 'builtin' ? ' · intégrée' : ''}</option>`).join('')}</select><small class="form-hint">Maintenez Ctrl (ou Cmd) pour sélectionner plusieurs entrées.</small></label>`;
}

export function renderReferenceEditor(kind, entry, allEntries) {
  const isEdit = Boolean(entry);
  const value = entry || {};
  let specificFields = '';
  if (kind === 'religions') {
    specificFields = `${inputField('Origine ou région d’influence', 'origin', value.origin, { placeholder: 'Facultatif' })}${textareaField('Particularités', 'particularities', value.particularities)}${relationshipSelect('Divinités associées', 'deityIds', allEntries, value.deityIds, 'deities')}`;
  } else if (kind === 'deities') {
    specificFields = `${textareaField('Domaines d’influence', 'domains', value.domains)}${textareaField('Symboles', 'symbols', value.symbols)}${textareaField('Informations complémentaires', 'additionalInformation', value.additionalInformation ? [value.additionalInformation] : [])}${relationshipSelect('Religions associées', 'religionIds', allEntries, value.religionIds, 'religions')}`;
  } else {
    specificFields = `${inputField('Classe', 'className', value.className, { placeholder: 'Ex. : Lettrés' })}${textareaField('Niveaux de carrière', 'levels', value.levels, { hint: 'Un intitulé par ligne. Les niveaux restent vides tant qu’ils ne sont pas renseignés.' })}${textareaField('Compétences disponibles', 'skills', value.skills)}${textareaField('Identifiants de compétences liées', 'skillIds', value.skillIds, { hint: 'Identifiants stables des entrées de compétences d’un futur référentiel.' })}${textareaField('Talents disponibles', 'talents', value.talents)}${textareaField('Identifiants de talents liés', 'talentIds', value.talentIds, { hint: 'Identifiants stables des entrées de talents d’un futur référentiel.' })}${textareaField('Avancements possibles', 'advancements', value.advancements)}${textareaField('Conditions d’entrée', 'entryConditions', value.entryConditions)}${textareaField('Conditions de sortie', 'exitConditions', value.exitConditions)}${textareaField('Équipement associé', 'equipment', value.equipment)}`;
  }
  return `<dialog class="editor-dialog reference-editor-dialog" id="reference-editor-dialog" aria-labelledby="reference-editor-title"><div class="editor-shell">
    <header class="editor-header"><div><div class="eyebrow"><span class="eyebrow-line"></span> RÉFÉRENTIEL PERSONNALISÉ</div><h2 id="reference-editor-title">${isEdit ? 'Modifier' : 'Ajouter'} : ${kind === 'religions' ? 'religion' : kind === 'deities' ? 'divinité' : 'carrière'}</h2><p>Les données intégrées à l’application ne peuvent pas être modifiées.</p></div><button type="button" class="dialog-close" data-action="close-reference-editor" aria-label="Fermer">×</button></header>
    <form id="reference-form" class="character-form" data-reference-kind="${kind}" data-reference-id="${escapeHTML(value.id || '')}">
      <section class="form-section"><div class="form-grid">${inputField('Nom', 'name', value.name, { wide: true, placeholder: 'Nom de la référence' })}${textareaField('Description courte', 'description', value.description ? [value.description] : [], { hint: 'Résumé rédigé par vous, sans recopier les textes des ouvrages.' })}${specificFields}${textareaField('Références et sources', 'references', value.references, { hint: 'Indiquez les livres, pages ou sources que vous utilisez.' })}</div></section>
      <footer class="editor-footer"><span class="autosave-state"><i></i> Stockage local</span><div><button type="button" class="button button-quiet" data-action="close-reference-editor">Annuler</button><button type="submit" class="button button-primary">Enregistrer <span aria-hidden="true">→</span></button></div></footer>
    </form>
  </div></dialog>`;
}

export function filterReferenceCards(root, query, kind) {
  const normalized = String(query || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr-FR').trim();
  let count = 0;
  root.querySelectorAll('[data-entry-card]').forEach((card) => {
    const matchesKind = kind === 'all' || card.dataset.kind === kind;
    const matchesQuery = !normalized || card.dataset.search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(normalized);
    card.hidden = !(matchesKind && matchesQuery);
    if (!card.hidden) count += 1;
  });
  const counter = root.querySelector('#reference-results-count');
  if (counter) counter.textContent = `${count} entrée${count > 1 ? 's' : ''}`;
}
