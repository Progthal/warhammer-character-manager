const STORAGE_KEY = 'wcm-theme';
const THEMES = new Set(['dark', 'light']);

export function getStoredTheme() {
  try {
    const theme = localStorage.getItem(STORAGE_KEY);
    return THEMES.has(theme) ? theme : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme = getStoredTheme()) {
  const selected = THEMES.has(theme) ? theme : 'dark';
  document.documentElement.dataset.theme = selected;
  const button = document.querySelector('[data-action="toggle-theme"]');
  if (button) {
    const next = selected === 'dark' ? 'light' : 'dark';
    button.dataset.theme = selected;
    button.setAttribute('aria-pressed', String(selected === 'light'));
    button.setAttribute('aria-label', `Activer le thème ${next === 'dark' ? 'sombre' : 'clair'}`);
    button.title = `Activer le thème ${next === 'dark' ? 'sombre' : 'clair'}`;
    const label = button.querySelector('[data-theme-label]');
    if (label) label.textContent = selected === 'dark' ? 'Clair' : 'Sombre';
    const icon = button.querySelector('[data-theme-icon]');
    if (icon) icon.textContent = selected === 'dark' ? '☼' : '☾';
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', selected === 'dark' ? '#171816' : '#eee7d8');
  return selected;
}

export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Le changement reste appliqué à l'onglet même si le stockage des préférences est bloqué.
  }
  return applyTheme(next);
}
