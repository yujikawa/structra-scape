// Keep translations in the presentation layer, including dynamically rendered panels.
let uiLanguage = 'ja';
try { if (localStorage.getItem('structra-language') === 'en') uiLanguage = 'en'; } catch {}
const languageSelect = document.createElement('select');
languageSelect.id = 'ui-language';
languageSelect.setAttribute('aria-label', '表示言語 / Display language');
languageSelect.innerHTML = '<option value="ja">日本語</option><option value="en">English</option>';
languageSelect.value = uiLanguage;
document.querySelector('header').insertBefore(languageSelect, exportMenu);
readerStyle.textContent += '#ui-language{width:auto;font-size:12px;padding:8px;flex-shrink:0}.graph-controls button[aria-label="Zoom in"] .ui-icon,.graph-controls button[aria-label="Zoom out"] .ui-icon{margin:0}';

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
    if (node.parentElement?.closest('script,style,textarea,pre,option,#ui-language')) continue;
    const previous = translatedNodes.get(node);
    const source = previous && node.nodeValue === previous.rendered ? previous.source : node.nodeValue;
    // A model value that happens to equal a UI label must never be translated.
    const rendered = protectedText.has(source.trim()) ? source : translateUI(source, uiLanguage);
    translatedNodes.set(node, { source, rendered });
    if (node.nodeValue !== rendered) node.nodeValue = rendered;
  }
  for (const element of document.querySelectorAll('[aria-label],[title],[placeholder]')) {
    if (element === languageSelect) continue;
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
    if (step) element.data('label', step.name + '\n' + translateUI(stepTypes[step.type], uiLanguage));
  });
  languageObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'title', 'placeholder'] });
}
const languageObserver = new MutationObserver(localizeScreen);
languageSelect.onchange = () => {
  uiLanguage = languageSelect.value;
  try { localStorage.setItem('structra-language', uiLanguage); } catch {}
  localizeScreen();
  cy.resize();
  pc.resize();
};
localizeScreen();
