// Opens the built viewer in headless Chromium and walks every view. The vm.Script check in
// ontology.test.js only catches syntax errors; this catches runtime errors in the assembled page.
// Run with `npm run test:browser`. Skipped when no Chromium is installed
// (install one with `npx playwright install chromium-headless-shell`).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { renderModel } from '../src/build.js';
import { loadModel } from '../src/validate.js';
import { exportOntology, exportSkos } from '../src/ontology.js';
import { writeLargeWorkspace } from './fixtures/large-workspace.js';

async function launch() {
  try { return await chromium.launch(); } catch {}
  // Fall back to any headless shell already downloaded by another Playwright version.
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  const shells = fs.existsSync(cache) ? fs.readdirSync(cache).filter(n => n.startsWith('chromium_headless_shell-')).sort().reverse() : [];
  for (const shell of shells) {
    const executable = path.join(cache, shell, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    if (fs.existsSync(executable)) try { return await chromium.launch({ executablePath: executable }); } catch {}
  }
  return null;
}

test('every view of the built reader runs without page errors', async t => {
  const browser = await launch();
  if (!browser) { t.skip('Chromium not found: run `npx playwright install chromium-headless-shell`'); return; }
  t.after(() => browser.close());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-browser-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, renderModel('samples', { compare: 'HEAD' }));

  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('file://' + file);
  const models = await page.$$eval('#model-choice option', options => options.map(o => o.value));
  assert.ok(models.length >= 3);

  // Several domains open on the overview: domains are boxes, and selecting one opens its model.
  assert.equal(await page.getAttribute('#mode-overview', 'aria-pressed'), 'true');
  assert.match(await page.innerText('#overview-summary'), /^3つのドメイン/);
  assert.ok(await page.locator('#overview-details .overview-table').count() === 1);
  const boxes = await page.evaluate(() => overviewGraph.nodes('[kind="domain"]').length);
  assert.equal(boxes, 3);
  const crossing = await page.evaluate(() => overviewGraph.nodes('[kind="concept"]').length);
  await page.uncheck('#overview-cross');
  assert.ok(await page.evaluate(() => overviewGraph.nodes('[kind="concept"]').length) > crossing);
  // Every diagram can be dragged; positions survive a redraw but are never written anywhere.
  const drag = async (container, graph, id) => {
    const area = await page.locator(container).boundingBox();
    const from = await page.evaluate(([g, n]) => window.eval(g).$id(n).renderedPosition(), [graph, id]);
    await page.mouse.move(area.x + from.x, area.y + from.y);
    await page.mouse.down();
    await page.mouse.move(area.x + from.x + 90, area.y + from.y + 70, { steps: 6 });
    await page.mouse.up();
    return page.evaluate(([g, n]) => window.eval(g).$id(n).position(), [graph, id]);
  };
  const invoice = 'concept:billing.yaml#Invoice';
  const before = await page.evaluate(id => overviewGraph.$id(id).position(), invoice);
  const moved = await drag('#overview-cy', 'overviewGraph', invoice);
  assert.notDeepEqual(moved, before);
  await page.check('#overview-cross');
  await page.uncheck('#overview-cross');
  assert.deepEqual(await page.evaluate(id => overviewGraph.$id(id).position(), invoice), moved);
  assert.equal(await page.getAttribute('#mode-overview', 'aria-pressed'), 'true');
  await page.evaluate(() => { overviewGraph.$id('domain:billing.yaml').emit('tap'); });
  assert.equal(await page.$eval('#model-choice', select => select.selectedOptions[0].textContent), '請求の定義');
  assert.equal(await page.getAttribute('#mode-overview', 'aria-pressed'), 'false');
  await page.click('#mode-process');
  const step = await page.evaluate(() => pc.nodes()[1].id());
  const stepMoved = await drag('#process-cy', 'pc', step);
  await page.click('#mode-ontology');
  await page.click('#mode-process');
  assert.deepEqual(await page.evaluate(id => pc.$id(id).position(), step), stepMoved);
  await page.click('#mode-overview');
  await page.evaluate(() => { overviewGraph.$id('concept:customer-contract.yaml#Contract').emit('tap'); });
  assert.equal(await page.innerText('#detail h2'), '契約');

  // One view for everyone: IDs and the data mapping tab are shown; terms open on the definitions list.
  assert.equal(await page.locator('#audience').count(), 0);
  await page.selectOption('#model-choice', { label: '顧客と契約の定義' });
  await page.click('#mode-ontology');
  assert.equal(await page.isVisible('#review-board'), true);
  await page.locator('#concepts button').first().click();
  assert.equal(await page.isVisible('.reader-id'), true);
  assert.equal(await page.locator('.reader-tabs button:visible').count(), 3);
  await page.click('#mode-ontology');
  await page.locator('[data-review-term]').nth(1).click();
  assert.equal(await page.isVisible('#review-board'), false);
  assert.equal(await page.locator('#concepts button.active').count(), 1);
  assert.equal(await page.innerText('#detail h2'), await page.$eval('#concepts button.active', button => button.firstChild.textContent.trim()));
  await page.click('#mode-unconfirmed');
  // Open items read as questions, with the recording task underneath; data mappings have no answer box.
  assert.ok(await page.locator('.completion-issue p', { hasText: 'どんなものが含まれますか？' }).count() > 0);
  assert.ok(await page.locator('.completion-issue p.issue-task', { hasText: '含む具体例を記録してください。' }).count() > 0);
  const dataItems = page.locator('.completion-issue:has(small[data-category="data"])');
  assert.ok(await dataItems.count() > 0);
  assert.equal(await dataItems.locator('.answer-field').count(), 0);
  // Data-mapping work comes after the questions, under its own heading; the tab counts only the questions.
  assert.equal(await page.locator('.completion-section .completion-issue:has(small[data-category="data"])').count(), await dataItems.count());
  assert.equal(await page.locator('.completion-content > .completion-group .completion-issue:has(small[data-category="data"])').count(), 0);
  const questionCount = await page.locator('#unconfirmed-workspace .completion-issue:not(:has(small[data-category="data"]))').count();
  assert.equal(Number(await page.innerText('#mode-unconfirmed .unconfirmed-count')), questionCount);
  // Answers are written in place and exported as a file for whoever maintains the model.
  await page.fill('#answer-name', '営業部 山田');
  await page.locator('.answer-field textarea').first().fill('株式会社や合同会社');
  assert.equal(await page.innerText('.answer-summary'), '1件の回答を入力済み');
  const [saved] = await Promise.all([page.waitForEvent('download'), page.click('#answer-export')]);
  const exported = JSON.parse(fs.readFileSync(await saved.path(), 'utf8'));
  assert.equal(exported.kind, 'strscape-answers');
  assert.equal(exported.model, 'customer-contract.yaml');
  assert.equal(exported.answered_by, '営業部 山田');
  assert.deepEqual(exported.answers.map(a => a.answer), ['株式会社や合同会社']);
  assert.match(exported.answers[0].key, /^q[0-9a-f]{8}$/);
  assert.equal(await page.isVisible('.answer-exported'), true);
  // Answers survive a reload; an answer whose question is no longer asked is dropped.
  await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem(answerStoreKey()));
    stored.answers.qdeadbeef = { answer: '反映済み', exported: true };
    localStorage.setItem(answerStoreKey(), JSON.stringify(stored));
  });
  await page.reload();
  assert.equal(await page.inputValue('.answer-field textarea >> nth=0'), '株式会社や合同会社');
  assert.deepEqual(Object.keys(await page.evaluate(() => JSON.parse(localStorage.getItem(answerStoreKey())).answers)), [exported.answers[0].key]);

  for (const language of ['ja', 'en']) {
    await page.click('#ui-language summary'); await page.click(`[data-language="${language}"]`);
    for (const model of models) {
      await page.selectOption('#model-choice', model);
      await page.click('#mode-ontology');
      // Lists re-render on every click, so address items by position rather than by handle.
      const clickAll = async (selector, each = async () => {}) => {
        const count = await page.locator(selector).count();
        // Retired terms are folded away; unfold them to reach every item.
        const unfold = () => page.$$eval('.retired-list', folds => folds.forEach(fold => { fold.open = true; }));
        for (let i = 0; i < count; i++) { await unfold(); await page.locator(selector).nth(i).click(); await each(); }
      };
      await clickAll('#concepts button', () => clickAll('.reader-tabs button:visible'));
      await clickAll('#properties button');
      await clickAll('#retired button');
      await page.click('#review-toggle');
      await page.click('#diagram-toggle');
      await page.fill('#search', '契約');
      await page.fill('#search', '');
      await page.click('#mode-process');
      // Open each step, and drill into detail flows through the tree.
      await clickAll('#process-list button:not(.tree-toggle)');
      await page.click('#mode-overview');
      await page.click('#overview-fit');
      await page.click('#mode-unconfirmed');
      const targets = await page.$$('[data-completion-target]');
      if (targets.length) { await targets.at(-1).click(); await page.click('#mode-unconfirmed'); }
      if (await page.isVisible('#mode-changes')) {
        await page.click('#mode-changes');
        const change = await page.$('[data-change]');
        if (change) await change.click();
      }
    }
  }
  // State survives a reload.
  await page.click('#mode-unconfirmed');
  await page.reload();
  assert.equal(await page.getAttribute('#mode-unconfirmed', 'aria-pressed'), 'true');
  assert.deepEqual(errors, []);
});

test('the reader shows each thing once, and browser back returns to where people were', async t => {
  const browser = await launch();
  if (!browser) { t.skip('Chromium not found'); return; }
  t.after(() => browser.close());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-browser-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, renderModel('samples/customer-contract.yaml'));
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('file://' + file);
  // One model opens on its business flow; the tabs read flow first, then terms.
  assert.equal(await page.isVisible('#process-workspace'), true);
  assert.deepEqual(await page.$$eval('.mode-bar button:not([hidden])', bs => bs.map(b => b.id)).then(ids => ids.slice(0, 2)), ['mode-process', 'mode-ontology']);
  // Step nodes carry only their name: the shape says what kind of step it is.
  assert.equal(await page.evaluate(() => pc.$id('Sign').data('label')), '契約を締結する');
  // The open question is shown once, above the tabs, and missing fields leave no placeholder.
  await page.click('#mode-ontology');
  await page.click('#diagram-toggle');
  await page.click('#concepts button[data-id="Customer"]');
  assert.equal(await page.locator('#detail .question-banner').count(), 1);
  assert.equal(await page.locator('#detail h3', { hasText: '確認したいこと' }).count(), 0);
  assert.equal(await page.locator('#detail h3', { hasText: '定義の確認状況' }).count(), 0);
  // Retired terms are folded after the terms in use, and open when one of them is selected.
  // They sit in one section at the bottom of the list, just above the legend.
  assert.equal(await page.locator('#concepts button[data-id="Account"]').count(), 0);
  assert.equal(await page.$eval('#retired-section', section => section.nextElementSibling.classList.contains('legend')), true);
  assert.equal(await page.$eval('#retired-fold', fold => fold.open), false);
  await page.click('#retired-fold summary');
  await page.click('#retired button[data-id="Account"]');
  assert.equal(await page.innerText('#detail h2'), '得意先');
  assert.equal(await page.$eval('#retired-fold', fold => fold.open), true);
  await page.click('#review-toggle');
  assert.equal(await page.locator('.retired-heading + .retired-note + .review-grid [data-review-term="Account"]').count(), 1);
  await page.click('#diagram-toggle');
  await page.click('#mode-process');
  await page.locator('#process-list [data-pick="Sign"]').click();
  assert.equal(await page.locator('#process-detail', { hasText: '説明はまだ' }).count(), 0);
  // Back walks the same way: step → process view → term → definitions list.
  await page.click('#mode-unconfirmed');
  await page.locator('[data-completion-target]').first().click();
  const opened = await page.innerText('#detail h2');
  await page.goBack();
  await page.waitForFunction(() => unconfirmedMode);
  await page.goBack();
  await page.waitForFunction(() => processMode && activeStep === 'Sign');
  await page.goBack();
  await page.waitForFunction(() => processMode && !activeStep);
  await page.goForward();
  await page.goForward();
  await page.goForward();
  await page.waitForFunction(() => !processMode && !unconfirmedMode);
  assert.equal(await page.innerText('#detail h2'), opened);
  assert.deepEqual(errors, []);
});

test('a workspace at company scale stays readable: the term diagram narrows, open items filter', async t => {
  const browser = await launch();
  if (!browser) { t.skip('Chromium not found: run `npx playwright install chromium-headless-shell`'); return; }
  t.after(() => browser.close());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-large-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  writeLargeWorkspace(path.join(dir, 'models'));
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, renderModel(path.join(dir, 'models')));
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const started = Date.now();
  await page.goto('file://' + file);
  assert.ok(Date.now() - started < 5000, 'the page loads within 5 seconds');
  await page.selectOption('#model-choice', { label: 'ドメイン0の定義' });
  await page.click('#mode-ontology');
  await page.click('#diagram-toggle');
  // A model with many terms opens on the selection and its neighbours.
  assert.equal(await page.getAttribute('#graph-scope [aria-pressed="true"]', 'data-scope'), '1');
  const shown = () => page.evaluate(() => cy.nodes().not('.out-of-scope').length);
  const narrow = await shown();
  assert.ok(narrow > 1 && narrow < 20, `${narrow} terms shown`);
  assert.match(await page.innerText('#graph-scope-count'), new RegExp(`^${narrow} / 80個のことばを表示$`));
  // Selecting a neighbour walks the diagram.
  const neighbour = await page.evaluate(() => cy.$id(selected.id).neighborhood().nodes().not('.out-of-scope')[0].id());
  await page.evaluate(id => { cy.$id(id).emit('tap'); }, neighbour);
  assert.equal(await page.evaluate(() => selected.id), neighbour);
  assert.equal(await page.evaluate(id => cy.$id(id).hasClass('out-of-scope'), neighbour), false);
  await page.click('[data-scope="2"]');
  assert.ok(await shown() >= narrow);
  await page.click('[data-scope="0"]');
  assert.equal(await shown(), 80);
  // Open items: the count tiles filter by kind, the search box by name.
  await page.click('#mode-unconfirmed');
  const all = await page.locator('#unconfirmed-workspace .completion-issue').count();
  assert.ok(all > 300);
  await page.click('[data-category-filter="未合意"]');
  const unagreed = await page.locator('#unconfirmed-workspace .completion-issue').count();
  assert.ok(unagreed > 0 && unagreed < all);
  assert.equal(await page.locator('#unconfirmed-workspace .completion-issue small[data-category="unagreed"]').count(), unagreed);
  await page.fill('#completion-search', '用語12');
  assert.ok(await page.locator('#unconfirmed-workspace .completion-group').count() >= 1);
  assert.ok((await page.$$eval('#unconfirmed-workspace .completion-group h3 button', b => b.map(x => x.textContent))).every(text => text.includes('用語12')));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'completion-search');
  await page.click('#completion-clear');
  assert.equal(await page.locator('#unconfirmed-workspace .completion-issue').count(), all);
  assert.deepEqual(errors, []);
  console.log(`large workspace: ${Date.now() - started} ms`);
});

test('the export menu saves the model shown as OWL and SKOS, the same as the CLI', async t => {
  const browser = await launch();
  if (!browser) { t.skip('Chromium not found'); return; }
  t.after(() => browser.close());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-browser-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, renderModel('samples'));
  const page = await browser.newPage({ acceptDownloads: true });
  await page.goto('file://' + file);
  // billing imports customer-contract, so the output must carry owl:imports and the imported IRIs.
  const index = await page.$$eval('#model-choice option', options => options.findIndex(o => o.textContent.includes('請求')));
  assert.ok(index >= 0);
  await page.selectOption('#model-choice', String(index));
  const save = async format => {
    await page.click('.header-menu:has([data-export]) summary');
    const [saved] = await Promise.all([page.waitForEvent('download'), page.click(`[data-export="${format}"]`)]);
    return { name: saved.suggestedFilename(), text: fs.readFileSync(await saved.path(), 'utf8') };
  };
  const model = loadModel('samples/billing.yaml');
  assert.deepEqual(await save('owl'), { name: 'billing.owl.ttl', text: exportOntology(model) });
  assert.deepEqual(await save('skos'), { name: 'billing.skos.ttl', text: exportSkos(model) });
});

test('answers from colleagues can be opened next to the questions, and differing ones stand out', async t => {
  const browser = await launch();
  if (!browser) { t.skip('Chromium not found: run `npx playwright install chromium-headless-shell`'); return; }
  t.after(() => browser.close());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-answers-view-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, renderModel('samples/customer-contract.yaml'));
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('file://' + file);
  await page.click('#mode-unconfirmed');
  const key = await page.evaluate(() => assessCompletion(model).issues.find(i => i.ask && i.id === 'Organization').key);
  const answers = (by, answer, model = 'customer-contract.yaml') => ({ name: `${by}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ kind: 'strscape-answers', model, answered_by: by, answers: [{ key, question: 'q', answer }] })) });
  await page.setInputFiles('.answer-open input', [answers('山田', '株式会社'), answers('佐藤', '合同会社'), answers('他', 'x', 'billing.yaml')]);
  const box = page.locator(`.completion-issue[data-issue-key="${key}"] .answer-others`);
  assert.deepEqual(await box.locator('li b').allInnerTexts(), ['山田', '佐藤']);
  assert.equal(await box.locator('.answer-conflict').count(), 1);
  assert.match(await page.innerText('#status'), /2件の回答を読み込みました。このモデルの回答ではないファイルが1件ありました。/);
  assert.deepEqual(errors, []);
});

test('the color scheme follows the system unless the viewer picks light or dark', async t => {
  const browser = await launch();
  if (!browser) { t.skip('Chromium not found: run `npx playwright install chromium-headless-shell`'); return; }
  t.after(() => browser.close());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-theme-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, renderModel('samples/customer-contract.yaml'));
  const page = await browser.newPage({ colorScheme: 'dark' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const paper = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim());
  await page.goto('file://' + file);
  const pick = async theme => { await page.click('.theme-menu summary'); await page.click(`[data-theme-choice="${theme}"]`); };
  const chosen = () => page.getAttribute('[data-theme-choice][aria-pressed="true"]', 'data-theme-choice');
  assert.equal(await chosen(), 'auto');
  assert.equal(await paper(), '#0f141c');
  await pick('light');
  assert.equal(await paper(), '#f3f5f8');
  await page.reload();
  assert.equal(await chosen(), 'light');
  assert.equal(await paper(), '#f3f5f8');
  await page.emulateMedia({ colorScheme: 'light' });
  await pick('dark');
  assert.equal(await paper(), '#0f141c');
  await pick('auto');
  assert.equal(await paper(), '#f3f5f8');
  // Printing stays light even when dark was chosen.
  await pick('dark');
  await page.emulateMedia({ media: 'print' });
  assert.equal(await paper(), '#f3f5f8');
  assert.deepEqual(errors, []);
});
