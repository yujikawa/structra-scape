// Keep translations in the presentation layer, including dynamically rendered panels.
let uiLanguage = 'ja';
try { if (localStorage.getItem('structra-language') === 'en') uiLanguage = 'en'; } catch {}
// A globe menu; the language names and its label are bilingual and never translated.
const languageMenu = document.createElement('details');
languageMenu.className = 'header-menu language-menu';
languageMenu.id = 'ui-language';
languageMenu.innerHTML = '<summary></summary><div class="menu-panel language-panel" role="group" aria-label="表示言語 / Display language"><button data-language="ja" lang="ja">日本語</button><button data-language="en" lang="en">English</button></div>';
iconOnly(languageMenu.querySelector('summary'), 'globe', '表示言語 / Display language');
document.querySelector('header').insertBefore(languageMenu, exportMenu);
const showLanguage = () => languageMenu.querySelectorAll('[data-language]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.language === uiLanguage)));
showLanguage();
// One header menu open at a time.
const headerMenus = () => [...document.querySelectorAll('header details')];
for (const menu of headerMenus()) menu.addEventListener('toggle', () => { if (menu.open) for (const other of headerMenus()) if (other !== menu) other.open = false; });

const translatedNodes = new WeakMap();
const translatedAttributes = new WeakMap();
function modelTextValues(value, result = new Set()) {
  if (typeof value === 'string') result.add(value.trim());
  else if (value && typeof value === 'object') Object.values(value).forEach(item => modelTextValues(item, result));
  return result;
}
function localizeScreen() {
  languageObserver.disconnect();
  const protectedText = modelTextValues(model);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('script,style,textarea,pre,#model-choice,#ui-language')) continue;
    const previous = translatedNodes.get(node);
    const source = previous && node.nodeValue === previous.rendered ? previous.source : node.nodeValue;
    // A model value that happens to equal a UI label must never be translated.
    const rendered = protectedText.has(source.trim()) ? source : translateUI(source, uiLanguage);
    translatedNodes.set(node, { source, rendered });
    if (node.nodeValue !== rendered) node.nodeValue = rendered;
  }
  for (const element of document.querySelectorAll('[aria-label],[title],[placeholder]')) {
    if (element.closest('#ui-language')) continue;
    const prior = translatedAttributes.get(element) || {};
    for (const attribute of ['aria-label', 'title', 'placeholder']) {
      if (!element.hasAttribute(attribute)) continue;
      const current = element.getAttribute(attribute);
      const source = prior[attribute]?.rendered === current ? prior[attribute].source : current;
      const rendered = translateUI(source, uiLanguage);
      prior[attribute] = { source, rendered };
      if (current !== rendered) element.setAttribute(attribute, rendered);
    }
    translatedAttributes.set(element, prior);
  }
  document.documentElement.lang = uiLanguage;
  document.title = `${translateUI('ことばと関係', uiLanguage)} | structra-scape`;
  // Canvas text is not part of the DOM. Only translate framework-generated labels.
  cy.edges().forEach(edge => {
    const kind = edge.data('kind');
    if (kind === 'parent') edge.data('label', uiLanguage === 'en' ? 'is a kind of' : '〜の一種');
    if (kind === 'restriction') {
      const r = model.restrictions.filter(item => item.target && item.operator.endsWith('ValuesFrom'))[Number(edge.id().split(':')[1])];
      if (r) edge.data('label', term(r.property) + (uiLanguage === 'en' ? (r.operator === 'someValuesFrom' ? ': at least one' : ': all targets') : (r.operator === 'someValuesFrom' ? '：1つ以上' : '：相手はすべて')));
    }
  });
  const currentProcess = process();
  pc.nodes().forEach(element => {
    const step = currentProcess?.steps.find(item => item.id === element.id());
    if (step) element.data('label', step.name + '\n' + (step.subprocess ? (uiLanguage === 'en' ? 'Open details ›' : '詳細を開く ›') : translateUI(stepTypes[step.type], uiLanguage)));
  });
  languageObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title', 'placeholder'] });
}
const languageObserver = new MutationObserver(localizeScreen);
languageMenu.querySelectorAll('[data-language]').forEach(button => button.onclick = () => {
  uiLanguage = button.dataset.language;
  try { localStorage.setItem('structra-language', uiLanguage); } catch {}
  showLanguage();
  languageMenu.open = false;
  localizeScreen();
  cy.resize();
  pc.resize();
});
localizeScreen();
