// Who the screen is for. Business users (the default) see names, definitions and questions;
// the data view adds IDs, data mappings and data-side open items. CSS hides `.data-only`
// and IDs unless the body has `audience-data`.
let audience = 'business';
try { if (localStorage.getItem('structra-audience') === 'data') audience = 'data'; } catch {}
const showsDataLayer = () => audience === 'data';
const audienceSelect = document.createElement('select');
audienceSelect.id = 'audience';
audienceSelect.setAttribute('aria-label', '表示対象');
audienceSelect.innerHTML = '<option value="business">業務向け</option><option value="data">データ向け</option>';
audienceSelect.value = audience;
document.querySelector('header').insertBefore(audienceSelect, exportMenu);
document.body.classList.toggle('audience-data', showsDataLayer());
// Business users start from the definitions list; the relationship diagram is one click away.
function openTerms() {
  setProcessMode(false);
  if (!showsDataLayer()) setReview(true);
}
$('mode-ontology').onclick = () => openTerms();
audienceSelect.onchange = () => {
  audience = audienceSelect.value;
  try { localStorage.setItem('structra-audience', audience); } catch {}
  document.body.classList.toggle('audience-data', showsDataLayer());
  const dataTab = document.querySelector('.reader-tabs button.data-only');
  if (!showsDataLayer() && dataTab?.getAttribute('aria-pressed') === 'true') document.querySelector('.reader-tabs button')?.click();
  renderUnconfirmed();
};
