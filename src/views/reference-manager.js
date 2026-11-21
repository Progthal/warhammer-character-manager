import { escapeHTML } from '../utils/format.js';

const KIND_LABELS = { religions: 'Religions', deities: 'Divinités', careers: 'Carrières', species: 'Espèces', talents: 'Talents' };

function sourceBadge(entry) {
  const label = entry.source === 'builtin' ? (entry.customized ? 'Profil ajusté' : 'Donnée intégrée') : entry.source === 'pack' ? 'Pack importé' : 'Donnée personnalisée';
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
    ? [entry.className, entry.levels?.length ? `${entry.levels.length} niveau(x) : ${entry.levels.map((level) => typeof level === 'string' ? level : level.name).filter(Boolean).join(', ')}` : 'Aucun niveau renseigné'].filter(Boolean).join(' · ')
    : entry.kind === 'deities'
      ? (entry.domains || []).join(' · ')
      : entry.kind === 'species'
        ? Object.entries(entry.characteristicModifiers || {}).map(([key, value]) => `${key} ${Number.isInteger(value) ? `+${value}` : 'à définir'}`).join(' · ')
        : entry.origin;
  const editable = entry.source !== 'builtin';
  const manageCareerLevels = entry.kind === 'careers';
  const manageSpeciesProfile = entry.kind === 'species';
  return `<article class="reference-card" data-entry-card data-kind="${entry.kind}" data-search="${escapeHTML(`${entry.name} ${detail || ''} ${entry.description || ''}`.toLocaleLowerCase('fr-FR'))}">
    <div class="reference-card-top"><span class="reference-kind">${KIND_LABELS[entry.kind]}</span>${sourceBadge(entry)}</div>
    <h3>${escapeHTML(entry.name)}</h3>
    ${detail ? `<p class="reference-card-meta">${escapeHTML(detail)}</p>` : ''}
    ${linkedNames.length ? `<p class="reference-card-meta">Associé à : ${escapeHTML(linkedNames.join(' · '))}</p>` : ''}
    <p class="reference-card-description">${escapeHTML(entry.description || 'Aucune description renseignée.')}</p>
    ${entry.references?.length ? `<p class="reference-card-source">Source : ${escapeHTML(entry.references.join(' · '))}</p>` : ''}
    <div class="reference-card-actions">${editable || manageCareerLevels || manageSpeciesProfile ? `<button class="button button-outline" type="button" data-action="edit-reference" data-id="${escapeHTML(entry.id)}">${editable ? 'Modifier' : manageSpeciesProfile ? 'Configurer' : 'Gérer les niveaux'}</button>` : '<span class="reference-immutable">Référence protégée</span>'}${editable ? `<button class="icon-button icon-button-danger" type="button" data-action="delete-reference" data-id="${escapeHTML(entry.id)}" aria-label="Supprimer ${escapeHTML(entry.name)}" title="Supprimer">×</button>` : ''}</div>
  </article>`;
}

export function renderReferenceManager(entries) {
  const nonTalents = entries.filter((entry) => entry.kind !== 'talents');
  const talents = entries.filter((entry) => entry.kind === 'talents');
  const sorted = [...nonTalents].sort((a, b) => KIND_LABELS[a.kind].localeCompare(KIND_LABELS[b.kind], 'fr') || a.name.localeCompare(b.name, 'fr'));
  const counts = Object.fromEntries(['religions', 'deities', 'careers', 'species', 'talents'].map((kind) => [kind, entries.filter((entry) => entry.kind === kind).length]));
  const categories = [...new Set(talents.map((entry) => entry.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const species = entries.filter((entry) => entry.kind === 'species').sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const careers = entries.filter((entry) => entry.kind === 'careers').sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const careerClasses = [...new Set(careers.map((entry) => entry.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
  const careerLevels = careers.flatMap((career) => (career.levels || []).map((level) => ({ id: level.id, name: `${career.name} · ${level.name}` }))).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return `<section class="reference-page">
    <div class="page-heading"><div><div class="eyebrow"><span class="eyebrow-line"></span> BIBLIOTHÈQUE LOCALE</div><h1>Référentiels <em>de données</em></h1><p class="page-intro">Choisissez les religions, divinités, carrières, espèces et talents depuis les données intégrées ou vos propres extensions.</p></div><div class="heading-seal" aria-hidden="true"><span>✧</span><small>DATA<br>BOOK</small></div></div>
    <div class="reference-summary-grid">
      <article class="reference-summary"><span>Religions</span><strong>${counts.religions}</strong><button type="button" data-action="add-reference" data-kind="religions">＋ Ajouter</button></article>
      <article class="reference-summary"><span>Divinités</span><strong>${counts.deities}</strong><button type="button" data-action="add-reference" data-kind="deities">＋ Ajouter</button></article>
      <article class="reference-summary"><span>Carrières</span><strong>${counts.careers}</strong><button type="button" data-action="add-reference" data-kind="careers">＋ Ajouter</button></article>
      <article class="reference-summary"><span>Espèces</span><strong>${counts.species}</strong><button type="button" data-action="add-reference" data-kind="species">＋ Ajouter</button></article>
      <article class="reference-summary"><span>Talents</span><strong>${counts.talents}</strong><button type="button" data-action="add-talent">＋ Ajouter</button></article>
    </div>
    <section class="reference-library">
      <div class="section-heading"><div><div class="eyebrow">CATALOGUE</div><h2>Entrées disponibles</h2></div><div class="reference-tools"><button type="button" class="button button-outline" data-action="export-references">⇩ Exporter mes données</button><button type="button" class="button button-outline" data-action="import-references">⇧ Importer un pack</button></div></div>
      <div class="toolbar reference-toolbar"><label class="search-box"><span aria-hidden="true">⌕</span><input id="reference-search" type="search" placeholder="Rechercher un élément…" autocomplete="off"></label><label class="filter-select"><span>Type</span><select id="reference-kind-filter"><option value="all">Tous les types</option><option value="religions">Religions</option><option value="deities">Divinités</option><option value="careers">Carrières</option><option value="species">Espèces</option></select></label></div>
      <p class="reference-results-count" id="reference-results-count">${sorted.length} entrée${sorted.length > 1 ? 's' : ''}</p>
      <div class="reference-grid" id="reference-grid">${sorted.map((entry) => referenceCard(entry, sorted)).join('') || '<div class="empty-state"><h3>Aucune donnée</h3><p>Ajoutez une entrée ou importez un pack JSON.</p></div>'}</div>
    </section>
    <section class="reference-library talent-library" aria-labelledby="talent-library-title">
      <div class="section-heading"><div><div class="eyebrow">RÉFÉRENTIEL SPÉCIALISÉ</div><h2 id="talent-library-title">Catalogue des talents</h2><p class="page-intro">${talents.length} talent(s) indexé(s). Les informations non vérifiées restent explicitement signalées.</p></div><div class="reference-tools"><button type="button" class="button button-outline" data-action="export-talents">⇩ Exporter le catalogue</button><button type="button" class="button button-outline" data-action="import-talents">⇧ Importer un pack</button><button type="button" class="button button-primary" data-action="add-talent">＋ Nouveau talent</button></div></div>
      <div class="talent-filter-grid">
        <label class="form-field form-field-wide"><span>Nom, alias, description ou référence</span><input type="search" data-talent-filter="query" placeholder="Nom français ou original…" autocomplete="off"></label>
        <label class="form-field"><span>Catégorie</span><select data-talent-filter="category"><option value="">Toutes</option>${categories.map((value) => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join('')}<option value="__none">Non renseignée</option></select></label>
        <label class="form-field"><span>Espèce</span><select data-talent-filter="speciesId"><option value="">Toutes les associations</option>${species.map((entry) => `<option value="${escapeHTML(entry.id)}">${escapeHTML(entry.name)} (association documentée)</option>`).join('')}<option value="__none">Aucune association documentée</option></select></label>
        <label class="form-field"><span>Carrière associée</span><select data-talent-filter="careerId"><option value="">Toutes les carrières</option>${careers.map((entry) => `<option value="${escapeHTML(entry.id)}">${escapeHTML(entry.name)}</option>`).join('')}</select></label>
        <label class="form-field"><span>Classe de carrière</span><select data-talent-filter="careerClass"><option value="">Toutes les classes</option>${careerClasses.map((value) => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join('')}</select></label>
        <label class="form-field"><span>Niveau de carrière</span><select data-talent-filter="careerLevelId"><option value="">Tous les niveaux</option>${careerLevels.map((level) => `<option value="${escapeHTML(level.id)}">${escapeHTML(level.name)}</option>`).join('')}</select></label>
        <label class="form-field"><span>Caractéristique / test</span><select data-talent-filter="characteristic"><option value="">Tous</option>${['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((value) => `<option value="${value}">${value}</option>`).join('')}</select></label>
        <label class="form-field"><span>Compétence associée</span><input data-talent-filter="skill" placeholder="Nom de compétence…"></label>
        <label class="form-field"><span>Disponibilité</span><select data-talent-filter="availability"><option value="all">Toutes</option><option value="available">Disponible</option><option value="restricted">Restreinte</option><option value="unavailable">Indisponible</option><option value="unknown">Non renseignée</option></select></label>
        <label class="form-field"><span>Origine</span><select data-talent-filter="source"><option value="all">Toutes</option><option value="builtin">Intégrée</option><option value="pack">Pack importé</option><option value="custom">Personnalisée</option></select></label>
        <label class="form-field"><span>Vérification</span><select data-talent-filter="verification"><option value="all">Tous les statuts</option><option value="verified">Confirmé par source</option><option value="incomplete">Informations incomplètes</option><option value="community">Communautaire</option><option value="custom">Personnalisé</option></select></label>
      </div>
      <p class="reference-results-count" data-talent-results-count>${talents.length} talent(s)</p>
      <div class="reference-grid" id="talent-reference-grid">${renderTalentCards(talents)}</div>
    </section>
    <aside class="reference-legend"><strong>Origine des données</strong><span><i class="legend-dot legend-builtin"></i> Intégrées : fournies avec l’application et protégées</span><span><i class="legend-dot legend-custom"></i> Personnalisées : créées ou modifiées ici</span><span><i class="legend-dot legend-pack"></i> Packs : importés depuis un fichier JSON</span></aside>
    <p class="reference-disclaimer">Les profils de caractéristiques des cinq espèces reprennent la table « Attributes Table » du livre de base anglais WFRP4e (Character II, p. 33). Les 64 carrières et leurs classes reprennent une aide de jeu française secondaire et restent à vérifier. Le catalogue de talents est un index communautaire de noms : les descriptions, traductions, catégories, tests, rangs, prérequis, effets et liens de carrière non vérifiés ne sont volontairement pas inventés. Vérifiez les règles dans vos ouvrages Cubicle 7.</p>
  </section>`;
}

export function renderTalentCards(entries) {
  if (!entries.length) return '<div class="empty-state"><h3>Aucun talent correspondant</h3><p>Modifiez les filtres ou ajoutez un talent personnalisé.</p></div>';
  return entries.map((entry) => {
    const label = entry.name_fr || entry.name;
    const sourceStatus = entry.verificationStatus === 'verified' ? 'Confirmé par source' : entry.verificationStatus === 'incomplete' ? 'Informations incomplètes' : entry.verificationStatus === 'community' ? 'Communautaire' : 'Personnalisé';
    const rank = entry.maxRank ? `Maximum ${entry.maxRank} rang(s)` : 'Maximum non renseigné';
    const detail = [entry.category || 'Catégorie non renseignée', entry.tests?.length ? `Tests : ${entry.tests.join(', ')}` : '', entry.skills?.length ? `Compétences : ${entry.skills.join(', ')}` : '', rank, entry.advancementCostVerified ? `Coût : ${entry.advancementCost} XP / rang` : 'Coût XP non vérifié', `Disponibilité : ${entry.availability === 'unknown' ? 'non renseignée' : entry.availability}`].filter(Boolean).join(' · ');
    const sourceText = [entry.sourceInfo?.title, entry.sourceInfo?.publisher, entry.sourceInfo?.page ? `p. ${entry.sourceInfo.page}` : '', entry.sourceInfo?.url].filter(Boolean).join(' · ') || (entry.references || []).join(' · ');
    return `<article class="reference-card talent-reference-card">
      <div class="reference-card-top"><span class="reference-kind">TALENT</span><span class="source-badge ${entry.source === 'builtin' ? 'source-builtin' : entry.source === 'pack' ? 'source-pack' : 'source-custom'}">${entry.source === 'builtin' ? 'Intégré' : entry.source === 'pack' ? 'Pack importé' : 'Personnalisé'}</span></div>
      <h3>${escapeHTML(label)}</h3>
      ${entry.name_original && entry.name_original !== label ? `<p class="reference-card-meta">Nom original : ${escapeHTML(entry.name_original)}</p>` : ''}
      <p class="reference-card-meta">${escapeHTML(detail)}</p>
      <p class="reference-card-description">${escapeHTML(entry.description || 'Aucune description vérifiée renseignée.')}</p>
      <p class="talent-verification"><span class="verification-dot verification-${escapeHTML(entry.verificationStatus || 'incomplete')}"></span>${sourceStatus}</p>
      ${entry.prerequisites?.length ? `<p class="reference-card-meta">Prérequis : ${escapeHTML(entry.prerequisites.join(' · '))}</p>` : ''}
      ${sourceText ? `<p class="reference-card-source">Source : ${escapeHTML(sourceText)}</p>` : ''}
      <div class="reference-card-actions">${entry.source === 'builtin' ? '<span class="reference-immutable">Entrée intégrée protégée</span>' : `<button class="button button-outline" type="button" data-action="edit-talent" data-id="${escapeHTML(entry.id)}">Modifier</button><button class="icon-button icon-button-danger" type="button" data-action="delete-reference" data-id="${escapeHTML(entry.id)}" aria-label="Supprimer ${escapeHTML(label)}" title="Supprimer">×</button>`}</div>
    </article>`;
  }).join('');
}

export function renderTalentEditor(entry, allEntries) {
  const value = entry || {};
  const species = allEntries.filter((item) => item.kind === 'species');
  const careers = allEntries.filter((item) => item.kind === 'careers');
  const multi = (label, name, options, selected) => {
    const picked = new Set(selected || []);
    return `<label class="form-field form-field-wide"><span>${label}</span><select name="${name}" multiple size="${Math.min(Math.max(options.length, 3), 7)}">${options.map((option) => `<option value="${escapeHTML(option.id)}" ${picked.has(option.id) ? 'selected' : ''}>${escapeHTML(option.name)}</option>`).join('')}</select><small class="form-hint">Sélection multiple : Ctrl (ou Cmd) + clic.</small></label>`;
  };
  const input = (label, name, fieldValue, wide = false) => `<label class="form-field ${wide ? 'form-field-wide' : ''}"><span>${label}</span><input name="${name}" value="${escapeHTML(fieldValue ?? '')}" maxlength="500"></label>`;
  const textarea = (label, name, fieldValue, hint = 'Une valeur par ligne.') => `<label class="form-field form-field-wide"><span>${label}</span><textarea name="${name}" rows="3">${escapeHTML(Array.isArray(fieldValue) ? fieldValue.join('\n') : fieldValue || '')}</textarea><small class="form-hint">${hint}</small></label>`;
  const selectedStatus = value.verificationStatus || 'incomplete';
  const selectedAvailability = value.availability || 'unknown';
  return `<dialog class="editor-dialog reference-editor-dialog" id="talent-editor-dialog" aria-labelledby="talent-editor-title"><div class="editor-shell">
    <header class="editor-header"><div><div class="eyebrow"><span class="eyebrow-line"></span> RÉFÉRENTIEL DE TALENTS</div><h2 id="talent-editor-title">${entry ? 'Modifier le talent' : 'Ajouter un talent personnalisé'}</h2><p>Les effets mécaniques ne sont appliqués que s’ils sont structurés, explicitement vérifiés et accompagnés d’une référence.</p></div><button type="button" class="dialog-close" data-action="close-talent-editor" aria-label="Fermer">×</button></header>
    <form id="talent-form" class="character-form" data-talent-id="${escapeHTML(value.id || '')}">
      <section class="form-section"><div class="form-grid">
        ${input('Nom principal', 'name', value.name, true)}
        ${input('Nom français', 'name_fr', value.name_fr)}${input('Nom original', 'name_original', value.name_original)}${input('Catégorie documentée', 'category', value.category)}
        ${textarea('Autres noms / alias', 'aliases', value.aliases)}
        ${textarea('Description courte reformulée', 'description', value.description, 'Résumé personnel et original, sans recopier le texte d’un ouvrage.')}
        ${textarea('Caractéristiques ou tests associés', 'tests', value.tests)}
        ${textarea('Compétences associées', 'skills', value.skills)}
        <label class="form-field"><span>Rang maximal connu</span><input type="number" min="1" max="999" name="maxRank" value="${escapeHTML(value.maxRank ?? '')}" placeholder="Non renseigné"></label>
        <label class="form-field"><span>Coût XP par acquisition / rang</span><input type="number" min="1" max="9999" name="advancementCost" value="${escapeHTML(value.advancementCost ?? '')}" placeholder="Non renseigné"></label>
        <label class="form-field inline-check"><input type="checkbox" name="advancementCostVerified" value="1" ${value.advancementCostVerified ? 'checked' : ''}><span>Coût vérifié dans la source indiquée ci-dessous</span></label>
        ${textarea('Prérequis / conditions', 'prerequisites', value.prerequisites)}
        ${multi('Espèces explicitement associées (laisser vide si aucune association précise n’est vérifiée)', 'species', species, value.species)}
        ${multi('Carrières associées', 'careerIds', careers, value.careerIds)}
        ${textarea('Identifiants de niveaux de carrière associés', 'careerLevelIds', value.careerLevelIds, 'Un identifiant de niveau par ligne ; laissez vide si non vérifié.')}
        <label class="form-field"><span>Disponibilité</span><select name="availability"><option value="unknown" ${selectedAvailability === 'unknown' ? 'selected' : ''}>Non renseignée</option><option value="available" ${selectedAvailability === 'available' ? 'selected' : ''}>Disponible</option><option value="restricted" ${selectedAvailability === 'restricted' ? 'selected' : ''}>Restreinte</option><option value="unavailable" ${selectedAvailability === 'unavailable' ? 'selected' : ''}>Indisponible</option></select></label>
        <label class="form-field"><span>Statut de vérification</span><select name="verificationStatus"><option value="verified" ${selectedStatus === 'verified' ? 'selected' : ''}>Confirmé par référence fiable</option><option value="incomplete" ${selectedStatus === 'incomplete' ? 'selected' : ''}>Identifié, informations incomplètes</option><option value="community" ${selectedStatus === 'community' ? 'selected' : ''}>Communautaire</option><option value="custom" ${selectedStatus === 'custom' ? 'selected' : ''}>Personnalisé</option></select></label>
        ${input('Ouvrage / document source', 'sourceTitle', value.sourceInfo?.title, true)}
        ${input('Éditeur / auteur', 'sourcePublisher', value.sourceInfo?.publisher)}${input('Page / section', 'sourcePage', value.sourceInfo?.page)}
        ${input('URL de référence', 'sourceUrl', value.sourceInfo?.url, true)}
        ${textarea('Références précises (ouvrages, chapitres, pages)', 'references', value.references, 'Une référence courte par ligne. Ne recopiez pas les descriptions des ouvrages.')}
        ${textarea('Note de vérification', 'sourceNote', value.sourceInfo?.note, 'Précisez ce qui est vérifié et ce qui reste à confirmer.')}
        ${textarea('Effets mécaniques (JSON)', 'effects', value.effects?.length ? JSON.stringify(value.effects, null, 2) : '', 'Laissez vide si aucun effet. Exemple : [{"type":"characteristicBonus","characteristic":"F","value":5,"verified":true,"reference":"Livre de base, p. 123"}]. Les autres types restent documentaires tant qu’un calcul vérifié n’est pas implémenté.')}
      </div></section>
      <footer class="editor-footer"><span class="autosave-state"><i></i> Stockage local</span><div><button type="button" class="button button-quiet" data-action="close-talent-editor">Annuler</button><button type="submit" class="button button-primary">Enregistrer <span aria-hidden="true">→</span></button></div></footer>
    </form>
  </div></dialog>`;
}

function inputField(label, name, value, { wide = false, placeholder = '' } = {}) {
  return `<label class="form-field ${wide ? 'form-field-wide' : ''}"><span>${label}</span><input name="${name}" value="${escapeHTML(value || '')}" placeholder="${escapeHTML(placeholder)}"></label>`;
}

function textareaField(label, name, value, { wide = true, hint = 'Une valeur par ligne.' } = {}) {
  const lines = Array.isArray(value) ? value.map((item) => typeof item === 'string' ? item : item?.name || '').filter(Boolean) : [];
  return `<label class="form-field ${wide ? 'form-field-wide' : ''}"><span>${label}</span><textarea name="${name}" rows="3" placeholder="Une valeur par ligne">${escapeHTML(lines.join('\n'))}</textarea><small class="form-hint">${hint}</small></label>`;
}

function levelTextField(level, field, label, { hint = '', rows = 2 } = {}) {
  const value = Array.isArray(level[field])
    ? level[field].map((item) => typeof item === 'string' ? item : item?.name || '').filter(Boolean).join('\n')
    : level[field] || '';
  return `<label class="form-field"><span>${label}</span><textarea rows="${rows}" data-level-field="${field}">${escapeHTML(value)}</textarea>${hint ? `<small class="form-hint">${hint}</small>` : ''}</label>`;
}

function careerLevelCard(level, index, count) {
  return `<article class="career-level-card" data-career-level-id="${escapeHTML(level.id || '')}">
    <header class="career-level-card-header"><div><span class="reference-kind">NIVEAU ${index + 1}</span><strong>${escapeHTML(level.name || 'Nouveau niveau')}</strong></div><div class="career-level-card-actions">
      <button type="button" class="icon-button" data-level-action="up" aria-label="Monter le niveau" title="Monter" ${index === 0 ? 'disabled' : ''}>↑</button>
      <button type="button" class="icon-button" data-level-action="down" aria-label="Descendre le niveau" title="Descendre" ${index === count - 1 ? 'disabled' : ''}>↓</button>
      <button type="button" class="icon-button icon-button-danger" data-level-action="remove" aria-label="Supprimer le niveau" title="Supprimer">×</button>
    </div></header>
    <div class="career-level-fields">
      <label class="form-field"><span>Nom du niveau</span><input data-level-field="name" maxlength="160" value="${escapeHTML(level.name || '')}" placeholder="Nom exact du niveau"></label>
      <label class="form-field"><span>Rang</span><input type="number" data-level-field="rank" min="1" max="99" value="${escapeHTML(level.rank ?? index + 1)}"></label>
      ${levelTextField(level, 'description', 'Description')}
      ${levelTextField(level, 'skills', 'Compétences disponibles')}
      ${levelTextField(level, 'skillIds', 'Identifiants des compétences', { hint: 'Identifiants stables, si votre référentiel de compétences les fournit.' })}
      ${levelTextField(level, 'talents', 'Talents disponibles')}
      ${levelTextField(level, 'talentIds', 'Identifiants des talents', { hint: 'Identifiants stables, si votre référentiel de talents les fournit.' })}
      ${levelTextField(level, 'advancements', 'Avancements disponibles')}
      ${levelTextField(level, 'entryConditions', 'Conditions d’accès')}
      ${levelTextField(level, 'exitConditions', 'Conditions de sortie')}
      ${levelTextField(level, 'equipment', 'Équipement')}
      ${levelTextField(level, 'additionalInformation', 'Informations complémentaires')}
      ${levelTextField(level, 'references', 'Sources et références')}
    </div>
  </article>`;
}

export function renderCareerLevelsEditor(levels = []) {
  const ordered = [...levels].sort((a, b) => (a.rank || 0) - (b.rank || 0));
  return `<div class="career-levels-editor form-field-wide" id="career-level-editor">
    <div class="career-levels-heading"><div><strong>Niveaux de progression</strong><small>Chaque niveau possède son identifiant et reste rattaché à cette carrière.</small></div><button type="button" class="button button-outline" data-level-action="add">＋ Ajouter un niveau</button></div>
    <div class="career-level-list">${ordered.map((level, index) => careerLevelCard(level, index, ordered.length)).join('') || '<p class="career-levels-empty">Aucun niveau renseigné. Ajoutez uniquement des informations vérifiées à partir de vos sources.</p>'}</div>
  </div>`;
}

function relationshipSelect(label, name, entries, selectedIds, kind) {
  const options = entries.filter((entry) => entry.kind === kind).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const selected = new Set(selectedIds || []);
  return `<label class="form-field form-field-wide"><span>${label}</span><select name="${name}" multiple size="${Math.min(Math.max(options.length, 3), 7)}">${options.map((entry) => `<option value="${escapeHTML(entry.id)}" ${selected.has(entry.id) ? 'selected' : ''}>${escapeHTML(entry.name)}${entry.source === 'builtin' ? ' · intégrée' : ''}</option>`).join('')}</select><small class="form-hint">Maintenez Ctrl (ou Cmd) pour sélectionner plusieurs entrées.</small></label>`;
}

export function renderReferenceEditor(kind, entry, allEntries, { levelsOnly = false } = {}) {
  const isEdit = Boolean(entry);
  const value = entry || {};
  let specificFields = '';
  const speciesOnly = value.source === 'builtin' && kind === 'species';
  if (kind === 'religions') {
    specificFields = `${inputField('Origine ou région d’influence', 'origin', value.origin, { placeholder: 'Facultatif' })}${textareaField('Particularités', 'particularities', value.particularities)}${relationshipSelect('Divinités associées', 'deityIds', allEntries, value.deityIds, 'deities')}`;
  } else if (kind === 'deities') {
    specificFields = `${textareaField('Domaines d’influence', 'domains', value.domains)}${textareaField('Symboles', 'symbols', value.symbols)}${textareaField('Informations complémentaires', 'additionalInformation', value.additionalInformation ? [value.additionalInformation] : [])}${relationshipSelect('Religions associées', 'religionIds', allEntries, value.religionIds, 'religions')}`;
  } else if (kind === 'species') {
    const modifierFields = ['CC', 'CT', 'F', 'E', 'I', 'Ag', 'Dex', 'Int', 'FM', 'Soc'].map((key) => (
      `<label class="form-field"><span>${key} · Modificateur à ajouter à 2d10</span><input type="number" min="0" max="99" step="1" name="characteristicModifier.${key}" value="${escapeHTML(value.characteristicModifiers?.[key] ?? '')}" placeholder="À configurer"></label>`
    )).join('');
    specificFields = `${speciesOnly ? '<p class="form-field-wide reference-card-meta">Le nom et la provenance de cette espèce restent protégés. Les dix modificateurs peuvent être ajustés pour correspondre à votre édition ou traduction.</p>' : `${textareaField('Autres noms reconnus pour cette espèce', 'aliases', value.aliases, { hint: 'Une variante par ligne, par exemple pour conserver une ancienne appellation.' })}${textareaField('Particularités et traits documentés', 'particularities', value.particularities)}${textareaField('Compétences associées', 'skills', value.skills, { hint: 'Une par ligne. Un pack JSON peut fournir aussi la caractéristique, le type base/avancée et une référence.' })}${textareaField('Identifiants de compétences', 'skillIds', value.skillIds)}${textareaField('Talents associés', 'talents', value.talents, { hint: 'Une ligne par talent. Les rangs, conditions et effets vérifiés peuvent être conservés dans un pack JSON.' })}${textareaField('Identifiants de talents', 'talentIds', value.talentIds)}`}<div class="form-grid form-field-wide species-modifier-grid">${modifierFields}</div><p class="form-hint form-field-wide">Chaque champ représente le modificateur d’espèce ajouté une seule fois à la somme des deux dés à dix faces. Laissez vide un modificateur non vérifié : la génération de cette espèce restera bloquée tant qu’il manque une valeur.</p>`;
  } else {
    specificFields = `${levelsOnly ? `<p class="reference-card-meta form-field-wide">${escapeHTML(value.name)} · ${escapeHTML(value.className || 'Classe non renseignée')} — les informations intégrées restent protégées ; seuls les niveaux personnels sont modifiables.</p>` : inputField('Classe', 'className', value.className, { placeholder: 'Ex. : Lettrés' })}${renderCareerLevelsEditor(value.levels || [])}${levelsOnly ? '' : `${textareaField('Compétences générales de carrière (facultatif)', 'skills', value.skills)}${textareaField('Identifiants généraux de compétences', 'skillIds', value.skillIds)}${textareaField('Talents généraux de carrière (facultatif)', 'talents', value.talents)}${textareaField('Identifiants généraux de talents', 'talentIds', value.talentIds)}${textareaField('Avancements généraux', 'advancements', value.advancements)}${textareaField('Conditions générales d’entrée', 'entryConditions', value.entryConditions)}${textareaField('Conditions générales de sortie', 'exitConditions', value.exitConditions)}${textareaField('Équipement général', 'equipment', value.equipment)}`}`;
  }
  const headerFields = levelsOnly || speciesOnly
    ? `<input type="hidden" name="name" value="${escapeHTML(value.name || '')}"><input type="hidden" name="description" value="${escapeHTML(value.description || '')}">`
    : `${inputField('Nom', 'name', value.name, { wide: true, placeholder: 'Nom de la référence' })}${textareaField('Description courte', 'description', value.description ? [value.description] : [], { hint: 'Résumé rédigé par vous, sans recopier les textes des ouvrages.' })}`;
  return `<dialog class="editor-dialog reference-editor-dialog" id="reference-editor-dialog" aria-labelledby="reference-editor-title"><div class="editor-shell">
    <header class="editor-header"><div><div class="eyebrow"><span class="eyebrow-line"></span> RÉFÉRENTIEL ${levelsOnly || speciesOnly ? 'INTÉGRÉ' : 'PERSONNALISÉ'}</div><h2 id="reference-editor-title">${levelsOnly ? 'Gérer les niveaux' : speciesOnly ? 'Configurer : espèce' : `${isEdit ? 'Modifier' : 'Ajouter'} : ${kind === 'religions' ? 'religion' : kind === 'deities' ? 'divinité' : kind === 'species' ? 'espèce' : 'carrière'}`}</h2><p>${levelsOnly ? 'Le nom et la classe de cette carrière intégrée sont protégés.' : speciesOnly ? 'Ajustez les modificateurs appliqués aux jets de caractéristiques.' : 'Les données intégrées à l’application ne peuvent pas être modifiées.'}</p></div><button type="button" class="dialog-close" data-action="close-reference-editor" aria-label="Fermer">×</button></header>
    <form id="reference-form" class="character-form" data-reference-kind="${kind}" data-reference-id="${escapeHTML(value.id || '')}">
      <section class="form-section"><div class="form-grid">${headerFields}${specificFields}${levelsOnly || speciesOnly ? '' : textareaField('Références et sources', 'references', value.references, { hint: 'Indiquez les livres, pages ou sources que vous utilisez.' })}</div></section>
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
