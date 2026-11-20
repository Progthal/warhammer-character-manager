import { getCharacterName, getExperienceAvailable } from '../models/character.js';
import { escapeHTML, formatRelativeDate, initials } from '../utils/format.js';

function characterCard(character) {
  const identity = character.identity;
  const firstName = identity.firstName || '';
  const lastName = identity.lastName || '';
  const name = getCharacterName(character);
  const species = identity.species || 'Espèce à définir';
  const career = identity.career || 'Carrière à définir';
  const xp = getExperienceAvailable(character);
  return `
    <article class="character-card ${character.isDraft ? 'is-draft' : ''}">
      <button class="card-main" type="button" data-action="open-character" data-id="${escapeHTML(character.id)}" aria-label="Ouvrir ${escapeHTML(name)}">
        <div class="character-avatar"><span>${escapeHTML(initials(firstName, lastName))}</span><i aria-hidden="true"></i></div>
        <div class="card-heading">
          <div class="card-kicker">${escapeHTML(species)}</div>
          <h3>${escapeHTML(name)}</h3>
          <p>${escapeHTML(career)}${identity.careerLevel ? ` <span>·</span> ${escapeHTML(identity.careerLevel)}` : ''}</p>
        </div>
        <div class="card-chevron" aria-hidden="true">↗</div>
      </button>
      <div class="card-meta">
        <span class="xp-value"><strong>${xp.toLocaleString('fr-FR')}</strong> XP disponibles</span>
        <span class="card-updated">${escapeHTML(formatRelativeDate(character.updatedAt))}</span>
      </div>
      <div class="card-footer">
        <span class="status-badge ${character.isDraft ? 'status-draft' : ''}"><i></i>${character.isDraft ? 'Brouillon' : escapeHTML(identity.status || 'Actif')}</span>
        <div class="card-actions">
          <button class="icon-button" type="button" data-action="edit-character" data-id="${escapeHTML(character.id)}" aria-label="Modifier ${escapeHTML(name)}" title="Modifier">✎</button>
          <button class="icon-button" type="button" data-action="duplicate-character" data-id="${escapeHTML(character.id)}" aria-label="Dupliquer ${escapeHTML(name)}" title="Dupliquer">▣</button>
          <button class="icon-button" type="button" data-action="export-character" data-id="${escapeHTML(character.id)}" aria-label="Exporter ${escapeHTML(name)}" title="Exporter">⇩</button>
          <button class="icon-button icon-button-danger" type="button" data-action="delete-character" data-id="${escapeHTML(character.id)}" aria-label="Supprimer ${escapeHTML(name)}" title="Supprimer">×</button>
        </div>
      </div>
    </article>`;
}

export function renderCharacterGrid(characters) {
  if (!characters.length) {
    return `<div class="empty-state compact-empty"><span class="empty-emblem">✧</span><h3>Aucun personnage trouvé</h3><p>Modifiez votre recherche ou créez une nouvelle fiche.</p></div>`;
  }
  return characters.map(characterCard).join('');
}

export function renderDashboard(characters) {
  const totalExperience = characters.reduce((sum, character) => sum + (character.experience?.total || 0), 0);
  const activeCount = characters.filter((character) => !character.isDraft && character.identity.status !== 'Inactif').length;
  const latest = [...characters].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
  return `
    <section class="page-heading">
      <div>
        <div class="eyebrow"><span class="eyebrow-line"></span> VOTRE REGISTRE</div>
        <h1>Vos <em>personnages</em></h1>
        <p class="page-intro">Chaque destinée commence par un nom. Retrouvez ici les héros qui parcourent le Vieux Monde.</p>
      </div>
      <div class="heading-seal" aria-hidden="true"><span>W</span><small>WFRP<br>IV</small></div>
    </section>

    <section class="overview-grid" aria-label="Aperçu du registre">
      <article class="overview-card overview-card-featured"><div class="overview-icon">♙</div><div><span>Fiches enregistrées</span><strong>${characters.length.toLocaleString('fr-FR')}</strong><small>${activeCount} personnage${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''}</small></div><span class="overview-corner">I</span></article>
      <article class="overview-card"><div class="overview-icon">✧</div><div><span>Expérience cumulée</span><strong>${totalExperience.toLocaleString('fr-FR')}</strong><small>Points gagnés sur vos fiches</small></div><span class="overview-corner">II</span></article>
      <article class="overview-card"><div class="overview-icon">◷</div><div><span>Dernière chronique</span><strong class="overview-date">${latest ? escapeHTML(formatRelativeDate(latest.updatedAt)) : '—'}</strong><small>${latest ? escapeHTML(getCharacterName(latest)) : 'Aucune activité récente'}</small></div><span class="overview-corner">III</span></article>
    </section>

    <section class="roster-section">
      <div class="section-heading">
        <div><div class="eyebrow">LE REGISTRE</div><h2>Votre compagnie</h2></div>
        <div class="section-tools"><span class="result-count" id="results-count">${characters.length} fiche${characters.length > 1 ? 's' : ''}</span><button class="button button-outline" type="button" data-action="import-json"><span aria-hidden="true">⇧</span> Importer JSON</button></div>
      </div>
      <div class="toolbar">
        <label class="search-box"><span aria-hidden="true">⌕</span><input id="character-search" type="search" placeholder="Rechercher un personnage…" autocomplete="off"><kbd>⌘ K</kbd></label>
        <label class="filter-select"><span>Afficher</span><select id="character-filter"><option value="all">Tous</option><option value="active">Actifs</option><option value="draft">Brouillons</option><option value="paused">En pause</option><option value="inactive">Inactifs</option></select></label>
        <label class="sort-select"><span>Trier par</span><select id="character-sort"><option value="updated">Récemment modifiés</option><option value="name">Nom (A → Z)</option><option value="experience">Expérience</option><option value="species">Espèce</option></select></label>
      </div>
      <div class="character-grid" id="character-grid">${renderCharacterGrid(characters)}</div>
    </section>

    <section class="privacy-note"><span class="privacy-icon">⌑</span><p><strong>Votre registre vous appartient.</strong> Vos personnages sont enregistrés dans le stockage privé de ce navigateur. Exportez régulièrement une sauvegarde JSON pour les retrouver sur un autre appareil.</p><button type="button" data-action="export-backup" class="text-button">Créer une sauvegarde <span>→</span></button></section>`;
}
