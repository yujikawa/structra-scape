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
  await page.evaluate(() => overviewGraph.$id('domain:billing.yaml').emit('tap'));
  assert.equal(await page.$eval('#model-choice', select => select.selectedOptions[0].textContent), '請求の定義');
  assert.equal(await page.getAttribute('#mode-overview', 'aria-pressed'), 'false');
  await page.click('#mode-process');
  const step = await page.evaluate(() => pc.nodes()[1].id());
  const stepMoved = await drag('#process-cy', 'pc', step);
  await page.click('#mode-ontology');
  await page.click('#mode-process');
  assert.deepEqual(await page.evaluate(id => pc.$id(id).position(), step), stepMoved);
  await page.click('#mode-overview');
  await page.evaluate(() => overviewGraph.$id('concept:customer-contract.yaml#Contract').emit('tap'));
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
    await page.selectOption('#ui-language', language);
    for (const model of models) {
      await page.selectOption('#model-choice', model);
      await page.click('#mode-ontology');
      // Lists re-render on every click, so address items by position rather than by handle.
      const clickAll = async (selector, each = async () => {}) => {
        const count = await page.locator(selector).count();
        for (let i = 0; i < count; i++) { await page.locator(selector).nth(i).click(); await each(); }
      };
      await clickAll('#concepts button', () => clickAll('.reader-tabs button:visible'));
      await clickAll('#properties button');
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
