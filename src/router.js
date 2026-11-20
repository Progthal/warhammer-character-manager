export function getRoute() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const parts = hash.split('/').filter(Boolean);
  if (parts[0] === 'character' && parts[1]) {
    return { name: 'character', id: decodeURIComponent(parts.slice(1).join('/')) };
  }
  if (parts[0] === 'references') return { name: 'references' };
  return { name: 'dashboard' };
}

export function navigate(path = '/') {
  const hash = `#${path.startsWith('/') ? path : `/${path}`}`;
  if (window.location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = hash;
}
