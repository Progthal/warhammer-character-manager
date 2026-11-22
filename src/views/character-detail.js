import { CHARACTERISTICS, getCharacterName, getExperienceAvailable } from '../models/character.js';
import { findCareerLevel, getCareerLevels } from '../services/reference-catalog.js';
import { escapeHTML, formatDate } from '../utils/format.js';
import { calculateCharacterSheet } from '../rules/character-calculations.js';
import { getRefundableProgressionCount, quoteProgressionRefund } from '../services/progression.js';
import { CAREER_CHANGE_COST, getNextAdvancementCost } from '../rules/progression-costs.js';


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

function valueOrDash(value, suffix = '') {
  return value === null || value === undefined || value === '' ? '—' : `${escapeHTML(value)}${suffix}`;
}

function detailBlock(label, value) {
  return `<div class="detail-block"><span>${label}</span><strong>${value || '—'}</strong></div>`;
}

function careerLevelSection(character, referenceEntries) {
  const { identity } = character;
  const career = referenceEntries.find((entry) => entry.kind === 'careers' && (entry.id === identity.careerId || entry.name.toLocaleLowerCase('fr-FR') === (identity.career || '').toLocaleLowerCase('fr-FR')));
  if (!career) return '';
  const level = findCareerLevel(career, identity.careerLevelId, identity.careerLevel);
  const levels = getCareerLevels(career);
  const detailList = (label, values) => values?.length ? `<div class="detail-block"><span>${label}</span><strong>${escapeHTML(values.join(' · '))}</strong></div>` : '';
  const selectedDetails = level ? [
    detailList('Compétences du niveau', level.skills),
    detailList('Talents du niveau', level.talents),
    detailList('Avancements', level.advancements),
    detailList('Conditions d’accès', level.entryConditions),
    detailList('Conditions de sortie', level.exitConditions),
    detailList('Équipement', level.equipment)
  ].join('') : '';
  return `<section class="detail-section"><div class="detail-section-heading"><div><div class="eyebrow">CARRIÈRE</div><h2>Progression et niveau</h2></div><span class="section-caption">${levels.length} niveau(x) référencé(s)</span></div>
    <div class="detail-grid">
      ${detailBlock('Carrière', escapeHTML(career.name))}
      ${detailBlock('Classe', escapeHTML(career.className || ''))}
      ${detailBlock('Niveau sélectionné', level ? `${escapeHTML(level.rank)} · ${escapeHTML(level.name)}` : escapeHTML(identity.careerLevel || 'À réassocier'))}
      ${detailBlock('État de la carrière', identity.careerCompleted ? 'Terminée · achèvement confirmé' : 'En cours · achèvement non confirmé')}
      ${level?.description ? detailBlock('Description', escapeHTML(level.description)) : ''}
      ${selectedDetails}
      ${level?.additionalInformation ? detailBlock('Informations complémentaires', escapeHTML(level.additionalInformation)) : ''}
      ${!level && levels.length ? detailBlock('Niveaux disponibles', escapeHTML(levels.map((item) => item.name).join(' · '))) : ''}
      ${!levels.length ? detailBlock('Référentiel', 'Aucun niveau renseigné pour cette carrière.') : ''}
      ${identity.careerCompleted ? `<div class="career-change-action form-field-wide"><span>Le changement de carrière est disponible pour ${CAREER_CHANGE_COST} XP.</span><button class="button button-outline" type="button" data-action="change-career" data-character-id="${escapeHTML(character.id)}">Changer de carrière · ${CAREER_CHANGE_COST} XP</button></div>` : ''}
    </div>
  </section>`;
}

export function renderCharacterDetail(character, referenceEntries = []) {
  const { identity, secondary, experience, profile } = character;
  const name = getCharacterName(character);
  const xpAvailable = getExperienceAvailable(character);
  const calculated = calculateCharacterSheet(character);
  const characteristicRows = CHARACTERISTICS.map(({ key, label, shortLabel }) => {
    const stat = calculated.characteristics[key];
    const nextCost = getNextAdvancementCost('characteristic', character.characteristicAdvances?.[key] || 0);
    const refundableCount = getRefundableProgressionCount(character, { type: 'characteristic', key });
    return `<tr>
      <th scope="row"><abbr title="${escapeHTML(label)}">${escapeHTML(shortLabel)}</abbr><span>${escapeHTML(label)}</span></th>
      <td>${valueOrDash(stat.initial)}</td>
      <td>${stat.speciesBonus > 0 ? '+' : ''}${stat.speciesBonus}</td>
      <td>${stat.talentBonus > 0 ? '+' : ''}${stat.talentBonus}</td>
      <td>${stat.advances > 0 ? '+' : ''}${stat.advances}</td>
      <td class="calculated-value">${valueOrDash(stat.current)}</td>
      <td class="calculated-bonus">${valueOrDash(stat.bonus)}</td>
      <td>${nextCost !== null ? `<button class="table-action" type="button" data-action="purchase-advancement" data-character-id="${escapeHTML(character.id)}" data-target-type="characteristic" data-target-key="${key}">+1 · ${nextCost} XP</button>` : '<span class="muted-copy">Maximum 20</span>'}</td>
      <td>${refundableCount ? `${renderRefundAdvancementButton(character, { type: 'characteristic', key: key })}` : '<span class="muted-copy">—</span>'}</td>
    </tr>`;
  }).join('');
  const skillRows = calculated.skills.map((skill) => {
    const nextCost = getNextAdvancementCost('skill', skill.advances || 0);
    const refundableCount = getRefundableProgressionCount(character, { type: 'skill', id: skill.id });
    return `<tr>
    <th scope="row">${escapeHTML(skill.name)}${skill.skillType === 'basic' ? '<span class="table-tag">Base</span>' : skill.skillType === 'advanced' ? '<span class="table-tag">Avancée</span>' : ''}${skill.career ? '<span class="table-tag">Carrière</span>' : ''}${skill.acquired === false ? '<span class="table-tag">À confirmer</span>' : ''}</th>
    <td>${escapeHTML(skill.characteristicLabel)}</td><td>${valueOrDash(skill.base)}</td>
    <td>${skill.advances > 0 ? '+' : ''}${skill.advances}</td><td class="calculated-value">${valueOrDash(skill.total)}</td>
    <td>${skill.acquired !== false && nextCost !== null ? `<button class="table-action" type="button" data-action="purchase-advancement" data-character-id="${escapeHTML(character.id)}" data-target-type="skill" data-target-id="${escapeHTML(skill.id)}">+1 · ${nextCost} XP</button>` : skill.acquired === false ? '<span class="muted-copy">Compétence à acquérir</span>' : '<span class="muted-copy">Maximum 20</span>'}</td>
    <td>${refundableCount ? `${renderRefundAdvancementButton(character, { type: 'skill', id: skill.id })}` : '<span class="muted-copy">—</span>'}</td>
  </tr>`;
  }).join('');
  const talentCards = (character.talents || []).map((talent) => {
    const currentRank = talent.acquired === false ? 0 : (talent.rank || 1);
    const nextCost = getNextAdvancementCost('talent', currentRank);
    const canAdvance = !talent.maxRank || currentRank < talent.maxRank;
    const refundableCount = getRefundableProgressionCount(character, { type: 'talent', id: talent.id });
    const verifiedEffects = (talent.effects || []).filter((effect) => effect.verified && effect.reference?.trim() && effect.type === 'characteristicBonus');
    const effects = verifiedEffects.map((effect) => `+${effect.value} ${effect.characteristic}`).join(' · ');
    return `<article class="collection-card"><div><h3>${escapeHTML(talent.name)}</h3><span class="collection-rank">Rang ${escapeHTML(talent.rank)}</span></div>
      ${talent.nameOriginal && talent.nameOriginal !== talent.name ? `<small class="muted-copy">Nom original : ${escapeHTML(talent.nameOriginal)}</small>` : ''}
      ${talent.acquired === false ? '<small class="muted-copy">Sélectionné · acquisition à confirmer</small>' : ''}
      ${talent.category ? `<small class="muted-copy">Catégorie : ${escapeHTML(talent.category)}</small>` : ''}
      ${talent.tests?.length ? `<small class="muted-copy">Tests : ${escapeHTML(talent.tests.join(' · '))}</small>` : ''}
      ${talent.skills?.length ? `<small class="muted-copy">Compétences : ${escapeHTML(talent.skills.join(' · '))}</small>` : ''}
      ${talent.conditions ? `<p class="collection-description">Conditions : ${escapeHTML(talent.conditions)}</p>` : ''}
      ${talent.description ? `<p>${escapeHTML(talent.description)}</p>` : '<p class="muted-copy">Aucune description renseignée.</p>'}
      ${(talent.references || []).length ? `<small class="muted-copy">Références : ${escapeHTML(talent.references.join(' · '))}</small>` : ''}
      ${talent.sourceInfo?.title ? `<small class="muted-copy">Source : ${escapeHTML([talent.sourceInfo.title, talent.sourceInfo.publisher, talent.sourceInfo.page ? `p. ${talent.sourceInfo.page}` : ''].filter(Boolean).join(' · '))}</small>` : ''}
      ${effects ? `<small class="verified-effect">Effet vérifié : ${escapeHTML(effects)}</small>` : '<small class="muted-copy">Aucun effet mécanique vérifié configuré.</small>'}
      ${canAdvance && (talent.acquired !== false || !((talent.conditions || '').trim() || talent.prerequisites?.length) || talent.prerequisitesVerified === true)
    ? `<button class="table-action" type="button" data-action="purchase-advancement" data-character-id="${escapeHTML(character.id)}" data-target-type="talent" data-target-id="${escapeHTML(talent.id)}">${talent.acquired === false ? 'Acquérir' : 'Acheter le rang suivant'} · ${nextCost} XP</button>`
    : `<small class="muted-copy">${!canAdvance ? `Rang maximal atteint (${talent.maxRank}).` : 'Vérifiez les conditions / prérequis avant acquisition.'}</small>`}
      ${refundableCount ? `${renderRefundAdvancementButton(character, { type: 'talent', id: talent.id })}` : ''}
    </article>`;
  }).join('');
  const equipmentGroups = [
    ['Armes', 'weapons'], ['Armures', 'armour'], ['Objets et possessions', 'possessions'],
    ['Sorts', 'spells'], ['Prières', 'prayers']
  ];
  const equipmentSections = equipmentGroups.map(([label, key]) => {
    const items = character.equipment?.[key] || [];
    if (!items.length) return '';
    const rows = items.map((item) => `<tr><th scope="row">${escapeHTML(item.name)}</th>
      <td>${escapeHTML(item.type || item.location || '—')}</td>
      <td>${key === 'weapons' ? escapeHTML(item.damage || '—') : key === 'armour' ? valueOrDash(item.armourPoints) : escapeHTML(item.qualities || item.description || '—')}</td>
      <td>${valueOrDash(item.quantity)}</td><td>${valueOrDash(item.encumbrance)}</td></tr>`).join('');
    return `<div class="equipment-group"><h3>${label}</h3><div class="responsive-table"><table class="data-table"><thead><tr><th>Objet</th><th>Type / localisation</th><th>Détails</th><th>Qté</th><th>Enc.</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }).join('');
  const historyRows = [...(experience.history || [])].reverse().map((entry) => {
    const labels = { gain: 'Gain', purchase: 'Achat', refund: 'Remboursement', undo: 'Annulation', correction: 'Correction', 'career-change': 'Changement de carrière' };
    const xpDelta = Number.isFinite(entry.xpBefore) && Number.isFinite(entry.xpAfter)
      ? entry.xpAfter - entry.xpBefore
      : (entry.type === 'gain' || (entry.type === 'undo' && ['purchase', 'career-change'].includes(entry.originalOperationType)) || (entry.type === 'refund') ? entry.amount : -entry.amount);
    const count = entry.count ? `${entry.count} ${entry.type === 'career-change' ? 'changement(s)' : entry.targetPath?.startsWith('talents.') ? 'rang(s)' : 'avancement(s)'}` : '—';
    const balance = Number.isFinite(entry.xpBefore) && Number.isFinite(entry.xpAfter)
      ? `${entry.xpBefore} → ${entry.xpAfter}`
      : 'Ancien historique';
    return `<tr>
      <td>${escapeHTML(formatDate(entry.date, { hour: '2-digit', minute: '2-digit', second: '2-digit' }))}</td><td>${escapeHTML(labels[entry.type] || 'Opération')}</td>
      <td>${escapeHTML(entry.note || entry.targetPath || '—')}</td><td>${escapeHTML(count)}</td>
      <td class="${xpDelta < 0 ? 'xp-negative' : 'xp-positive'}">${xpDelta > 0 ? '+' : ''}${xpDelta} XP</td><td>${escapeHTML(balance)} XP</td>
    </tr>`;
  }).join('');
  const encumbrance = calculated.encumbrance;
  const corruption = calculated.corruption;
  const history = experience.history || [];
  const reversedHistoryIds = new Set(history.filter((entry) => entry.type === 'undo').map((entry) => entry.reversedEntryId));
  const canUndoPurchase = history.some((entry) => ['gain', 'purchase', 'refund', 'correction', 'career-change'].includes(entry.type) && !reversedHistoryIds.has(entry.id));
  const hasEquipment = equipmentSections.length > 0;
  const encumbranceStatus = encumbrance.capacity === null
    ? 'Capacité non configurée : le total est indicatif.'
    : encumbrance.overloaded ? 'Surcharge : capacité configurée dépassée.' : 'Capacité configurée respectée.';
  const corruptionStatus = corruption.threshold === null
    ? 'Seuil non configuré dans cette fiche.'
    : corruption.exceeded ? 'Seuil de corruption dépassé.' : 'Seuil de corruption non dépassé.';
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
        <article class="detail-summary detail-summary-highlight"><span>Expérience disponible</span><strong class="${xpAvailable < 0 ? 'xp-negative' : ''}">${xpAvailable.toLocaleString('fr-FR')} <small>XP</small></strong></article>
      </section>

      <section class="detail-section"><div class="detail-section-heading"><div><div class="eyebrow">IDENTITÉ</div><h2>Informations générales</h2></div></div><div class="detail-grid">
        ${detailBlock('Prénom', escapeHTML(identity.firstName))}${detailBlock('Nom', escapeHTML(identity.lastName))}${detailBlock('Genre', escapeHTML(identity.gender))}${detailBlock('Âge', valueOrDash(identity.age, ' ans'))}
        ${detailBlock('Origine', escapeHTML(identity.origin))}${detailBlock('Religion', escapeHTML(identity.religion))}${detailBlock('Divinité', escapeHTML(identity.deity))}${detailBlock('Niveau de carrière', escapeHTML(identity.careerLevel))}
        ${detailBlock('Taille', escapeHTML(identity.height))}${detailBlock('Poids', escapeHTML(identity.weight))}${detailBlock('Yeux', escapeHTML(identity.eyeColor))}${detailBlock('Cheveux', escapeHTML(identity.hairColor))}
      </div></section>

      ${careerLevelSection(character, referenceEntries)}

      <section class="detail-section"><div class="detail-section-heading"><div><div class="eyebrow">CARACTÉRISTIQUES</div><h2>Caractéristiques principales</h2></div><span class="section-caption">Valeurs actuelles calculées</span></div>
        <div class="responsive-table"><table class="data-table characteristic-data-table"><thead><tr><th>Caractéristique</th><th>Initiale</th><th>Espèce</th><th>Talents</th><th>Augmentations</th><th>Actuelle</th><th>Bonus</th><th>Prochain avancement</th><th>Remboursement</th></tr></thead><tbody>${characteristicRows}</tbody></table></div>
        <p class="form-hint">Le bonus est le chiffre des dizaines de la valeur actuelle. Les modificateurs d’espèce sont conservés séparément des jets. Un effet de talent doit être structuré, marqué comme vérifié et accompagné de sa référence pour être appliqué.</p>
      </section>

      <section class="detail-section"><div class="detail-section-heading"><div><div class="eyebrow">COMPÉTENCES</div><h2>Compétences du personnage</h2></div><span class="section-caption">${calculated.skills.length} compétence(s)</span></div>
        ${skillRows ? `<div class="responsive-table"><table class="data-table"><thead><tr><th>Compétence</th><th>Carac.</th><th>Base</th><th>Avancements</th><th>Valeur totale</th><th>Progression XP</th><th>Remboursement</th></tr></thead><tbody>${skillRows}</tbody></table></div>` : '<p class="empty-inline">Aucune compétence n’a encore été ajoutée à cette fiche.</p>'}
      </section>

      <section class="detail-section"><div class="detail-section-heading"><div><div class="eyebrow">TALENTS</div><h2>Talents et aptitudes</h2></div><span class="section-caption">${(character.talents || []).length} talent(s)</span></div>
        ${talentCards ? `<div class="collection-grid" data-refund-scope="talents" data-character-id="${escapeHTML(character.id)}">${talentCards}</div>` : '<p class="empty-inline">Aucun talent n’a encore été ajouté à cette fiche.</p>'}
      </section>

      <section class="detail-section"><div class="detail-section-heading"><div><div class="eyebrow">RÉSISTANCE ET RESSOURCES</div><h2>Caractéristiques secondaires</h2></div></div><div class="detail-grid detail-grid-small">
        ${detailBlock('Mouvement', valueOrDash(calculated.secondary.movement))}${detailBlock('Blessures', `${valueOrDash(calculated.secondary.woundsCurrent)} / ${valueOrDash(calculated.secondary.woundsMax)}`)}${detailBlock('Résistance', valueOrDash(calculated.secondary.resistance))}${detailBlock('Bonus de Force', valueOrDash(calculated.secondary.strengthBonus))}${detailBlock('Bonus d’Endurance', valueOrDash(calculated.secondary.enduranceBonus))}${detailBlock('Points de destin', valueOrDash(calculated.secondary.fate))}${detailBlock('Points de chance', valueOrDash(calculated.secondary.fortune))}${detailBlock('Résilience', valueOrDash(calculated.secondary.resilience))}${detailBlock('Motivation', valueOrDash(calculated.secondary.resolve))}
      </div><p class="form-hint">Le bonus de Force et le bonus d’Endurance sont dérivés du chiffre des dizaines de F et E. Mouvement et blessures maximales restent des valeurs saisies manuellement tant qu’une formule propre à l’espèce n’a pas été configurée et vérifiée.</p></section>

      <section class="detail-section"><div class="detail-section-heading"><div><div class="eyebrow">ÉQUIPEMENT</div><h2>Armes, armures et possessions</h2></div><span class="section-caption">Encombrement : ${encumbrance.total.toLocaleString('fr-FR')}</span></div>
        <div class="resource-status ${encumbrance.overloaded ? 'resource-warning' : ''}"><strong>${escapeHTML(encumbranceStatus)}</strong><span>${encumbrance.capacity === null ? 'Définissez la capacité dans les paramètres de la fiche.' : `${encumbrance.remaining.toLocaleString('fr-FR')} point(s) restant(s) sur ${encumbrance.capacity}.`}</span></div>
        ${hasEquipment ? equipmentSections : '<p class="empty-inline">Aucun équipement n’a encore été ajouté à cette fiche.</p>'}
      </section>

      <section class="detail-section"><div class="detail-section-heading"><div><div class="eyebrow">CORRUPTION</div><h2>Suivi de la corruption</h2></div></div>
        <div class="resource-status ${corruption.exceeded ? 'resource-warning' : ''}"><strong>${corruption.current} point(s) de corruption</strong><span>${escapeHTML(corruptionStatus)}${corruption.threshold === null ? '' : ` Seuil : ${corruption.threshold}.`}</span></div>
      </section>

      <section class="detail-section"><div class="detail-section-heading"><div><div class="eyebrow">EXPÉRIENCE</div><h2>Historique des gains et dépenses</h2></div><div class="section-tools"><button class="button button-outline" type="button" data-action="grant-experience" data-character-id="${escapeHTML(character.id)}">＋ Ajouter un gain XP</button><button class="button button-quiet" type="button" data-action="correct-experience" data-character-id="${escapeHTML(character.id)}">Corriger les XP</button>${canUndoPurchase ? `<button class="button button-quiet" type="button" data-action="undo-last-purchase" data-character-id="${escapeHTML(character.id)}">↶ Annuler la dernière opération</button>` : ''}</div></div>
        ${historyRows ? `<div class="responsive-table"><table class="data-table"><thead><tr><th>Date</th><th>Opération</th><th>Détail</th><th>Quantité</th><th>Variation</th><th>Solde avant → après</th></tr></thead><tbody>${historyRows}</tbody></table></div>` : '<p class="empty-inline">Aucun mouvement d’expérience enregistré dans l’historique.</p>'}
      </section>

      <section class="detail-section"><div class="detail-section-heading"><div><div class="eyebrow">CHRONIQUE</div><h2>Histoire et notes</h2></div></div><div class="narrative-grid">
        <article class="narrative-card"><h3>Description physique</h3><p>${escapeHTML(profile.description) || 'Aucune description renseignée.'}</p></article>
        <article class="narrative-card"><h3>Histoire personnelle</h3><p>${escapeHTML(profile.history) || 'Aucune histoire renseignée.'}</p></article>
        <article class="narrative-card"><h3>Objectifs</h3><p>${escapeHTML(profile.goals) || 'Aucun objectif renseigné.'}</p></article>
        <article class="narrative-card"><h3>Notes personnelles</h3><p>${escapeHTML(profile.notes) || 'Aucune note.'}</p></article>
      </div></section>
    </div>`;
}
