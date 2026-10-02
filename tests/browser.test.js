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

  // Business users are the default audience: no IDs, no data mapping tab, terms open on the definitions list.
  assert.equal(await page.inputValue('#audience'), 'business');
  await page.selectOption('#model-choice', { label: '顧客と契約の定義' });
  await page.click('#mode-ontology');
  assert.equal(await page.isVisible('#review-board'), true);
  await page.locator('#concepts button').first().click();
  assert.equal(await page.isVisible('.reader-id'), false);
  assert.equal(await page.locator('.reader-tabs button:visible').count(), 2);
  await page.click('#mode-ontology');
  await page.locator('[data-review-term]').nth(1).click();
  assert.equal(await page.isVisible('#review-board'), false);
  assert.equal(await page.locator('#concepts button.active').count(), 1);
  assert.equal(await page.innerText('#detail h2'), (await page.innerText('#concepts button.active')).trim());
  await page.click('#mode-unconfirmed');
  assert.equal(await page.locator('.completion-issue small[data-category="data"]').count(), 0);
  assert.ok(await page.locator('.completion-issue p', { hasText: 'どんなものが含まれますか？' }).count() > 0);
  // Business users answer in place and export the answers as a file for the data team.
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
  await page.selectOption('#audience', 'data');
  assert.equal(await page.locator('.answer-field').count(), 0);
  assert.ok(await page.locator('.completion-issue small[data-category="data"]').count() > 0);
  assert.ok(await page.locator('.completion-issue p', { hasText: '含む具体例を記録してください。' }).count() > 0);

  for (const [language, audience] of [['ja', 'data'], ['en', 'business']]) {
    await page.selectOption('#ui-language', language);
    await page.selectOption('#audience', audience);
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
