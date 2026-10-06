// 配色: follow the system (default), or keep this viewer light or dark whatever the system says.
// The choice is remembered per browser; the <head> applies it before the page paints.
const themeMenu = document.createElement('details');
themeMenu.className = 'header-menu theme-menu';
// Icons only; the names are in the tooltip and for screen readers.
const themeChoices = [['auto', 'monitor', '自動（OSの設定に合わせる）'], ['light', 'sun', 'ライト'], ['dark', 'moon', 'ダーク']];
themeMenu.innerHTML = `<summary aria-label="配色" title="配色"></summary><div class="menu-panel theme-panel" role="group" aria-label="配色">${themeChoices.map(([value, icon, label]) => `<button data-theme-choice="${value}" aria-label="${label}" title="${label}">${uiIcon(icon)}</button>`).join('')}</div>`;
document.querySelector('header').insertBefore(themeMenu, exportMenu);
function showTheme() {
  const current = document.documentElement.dataset.theme || 'auto';
  // The header button shows the scheme in use.
  themeMenu.querySelector('summary').innerHTML = uiIcon(themeChoices.find(([value]) => value === current)[1]);
  for (const button of themeMenu.querySelectorAll('[data-theme-choice]')) button.setAttribute('aria-pressed', String(button.dataset.themeChoice === current));
}
for (const button of themeMenu.querySelectorAll('[data-theme-choice]')) button.onclick = () => {
  const theme = button.dataset.themeChoice;
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try { if (theme === 'auto') localStorage.removeItem('structra-theme'); else localStorage.setItem('structra-theme', theme); } catch { /* Lasts until the page closes. */ }
  showTheme();
  themeMenu.open = false;
};
showTheme();
// One header menu open at a time.
themeMenu.addEventListener('toggle', () => { if (themeMenu.open) { exportMenu.open = false; helpMenu.open = false; } });
for (const menu of [exportMenu, helpMenu]) menu.addEventListener('toggle', () => { if (menu.open) themeMenu.open = false; });
