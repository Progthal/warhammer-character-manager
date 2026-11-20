import { CHARACTERISTICS, getCharacterName, getExperienceAvailable } from '../models/character.js';
import { escapeHTML, formatDate } from '../utils/format.js';

function valueOrDash(value, suffix = '') {
  return value === null || value === undefined || value === '' ? '—' : `${escapeHTML(value)}${suffix}`;
}

function detailBlock(label, value) {
  return `<div class="detail-block"><span>${label}</span><strong>${value || '—'}</strong></div>`;
}

export function renderCharacterDetail(character) {
  const { identity, characteristics, secondary, experience, profile } = character;
  const name = getCharacterName(character);
  const xpAvailable = getExperienceAvailable(character);
  const characteristicCards = CHARACTERISTICS.map(({ key, label }) => `
    <div class="stat-tile"><span>${escapeHTML(label)}</span><strong>${valueOrDash(characteristics[key])}</strong></div>`).join('');
  return `
    <div class="detail-page">
      <a class="back-link" href="#/">← Retour au registre</a>
      <section class="character-hero">
        <div class="hero-avatar">${escapeHTML(`${identity.firstName?.charAt(0) || ''}${identity.lastName?.charAt(0) || ''}`.toLocaleUpperCase('fr-FR') || 'W')}</div>
        <div class="hero-copy"><div class="eyebrow"><span class="eyebrow-line"></span> FICHE PERSONNAGE</div><h1>${escapeHTML(name)}</h1><p>${escapeHTML(identity.species || 'Espèce à définir')} <span>·</span> ${escapeHTML(identity.career || 'Carrière à définir')}</p><div class="hero-tags"><span class="status-badge ${character.isDraft ? 'status-draft' : ''}"><i></i>${character.isDraft ? 'Brouillon' : escapeHTML(identity.status || 'Actif')}</span><span>Mis à jour le ${escapeHTML(formatDate(character.updatedAt))}</span></div></div>
        <div class="hero-actions"><button class="button button-outline" type="button" data-action="export-character" data-id="${escapeHTML(character.id)}">⇩ Exporter</button><button class="button button-primary" type="button" data-action="edit-character" data-id="${escapeHTML(character.id)}">✎ Modifier la fiche</button></div>
      </section>

      <section class="detail-summary-grid">
        <article class="detail-summary"><span>Expérience totale</span><strong>${(experience.total || 0).toLocaleString('fr-FR')} <small>XP</small></strong></article>
        <article class="detail-summary"><span>Expérience dépensée</span><strong>${(experience.spent || 0).toLocaleString('fr-FR')} <small>XP</small></strong></article>
        <article class="detail-summary detail-summary-highlight"><span>Expérience disponible</span><strong>${xpAvailable.toLocaleString('fr-FR')} <small>XP</small></strong></article>
      </section>

      <section class="detail-section"><div class="detail-section-heading"><div><div class="eyebrow">IDENTITÉ</div><h2>Informations générales</h2></div></div><div class="detail-grid">
        ${detailBlock('Prénom', escapeHTML(identity.firstName))}${detailBlock('Nom', escapeHTML(identity.lastName))}${detailBlock('Genre', escapeHTML(identity.gender))}${detailBlock('Âge', valueOrDash(identity.age, ' ans'))}
        ${detailBlock('Origine', escapeHTML(identity.origin))}${detailBlock('Religion', escapeHTML(identity.religion))}${detailBlock('Divinité', escapeHTML(identity.deity))}${detailBlock('Niveau de carrière', escapeHTML(identity.careerLevel))}
        ${detailBlock('Taille', escapeHTML(identity.height))}${detailBlock('Poids', escapeHTML(identity.weight))}${detailBlock('Yeux', escapeHTML(identity.eyeColor))}${detailBlock('Cheveux', escapeHTML(identity.hairColor))}
      </div></section>

      <section class="detail-section"><div class="detail-section-heading"><div><div class="eyebrow">CARACTÉRISTIQUES</div><h2>Profil du personnage</h2></div><span class="section-caption">Valeurs saisies manuellement</span></div><div class="stats-grid">${characteristicCards}</div></section>

      <section class="detail-section"><div class="detail-section-heading"><div><div class="eyebrow">RÉSISTANCE ET RESSOURCES</div><h2>Caractéristiques secondaires</h2></div></div><div class="detail-grid detail-grid-small">
        ${detailBlock('Mouvement', valueOrDash(secondary.movement))}${detailBlock('Blessures', `${valueOrDash(secondary.woundsCurrent)} / ${valueOrDash(secondary.woundsMax)}`)}${detailBlock('Résistance', valueOrDash(secondary.resistance))}${detailBlock('Bonus de Force', valueOrDash(secondary.strengthBonus))}${detailBlock('Bonus d’Endurance', valueOrDash(secondary.enduranceBonus))}${detailBlock('Points de destin', valueOrDash(secondary.fate))}${detailBlock('Points de chance', valueOrDash(secondary.fortune))}${detailBlock('Résilience', valueOrDash(secondary.resilience))}${detailBlock('Motivation', valueOrDash(secondary.resolve))}
      </div></section>

      <section class="detail-section"><div class="detail-section-heading"><div><div class="eyebrow">CHRONIQUE</div><h2>Histoire et notes</h2></div></div><div class="narrative-grid">
        <article class="narrative-card"><h3>Description physique</h3><p>${escapeHTML(profile.description) || 'Aucune description renseignée.'}</p></article>
        <article class="narrative-card"><h3>Histoire personnelle</h3><p>${escapeHTML(profile.history) || 'Aucune histoire renseignée.'}</p></article>
        <article class="narrative-card"><h3>Objectifs</h3><p>${escapeHTML(profile.goals) || 'Aucun objectif renseigné.'}</p></article>
        <article class="narrative-card"><h3>Notes personnelles</h3><p>${escapeHTML(profile.notes) || 'Aucune note.'}</p></article>
      </div></section>
    </div>`;
}
