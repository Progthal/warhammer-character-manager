export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function formatDate(value, options = {}) {
  if (!value) return 'Date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', ...options
  }).format(date);
}

export function formatRelativeDate(value) {
  if (!value) return 'Jamais modifié';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'À l’instant';
  if (diff < 3_600_000) return `Il y a ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `Il y a ${Math.floor(diff / 3_600_000)} h`;
  if (diff < 172_800_000) return 'Hier';
  return formatDate(value);
}

export function initials(firstName = '', lastName = '') {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  return (first + last || 'W').toLocaleUpperCase('fr-FR');
}
