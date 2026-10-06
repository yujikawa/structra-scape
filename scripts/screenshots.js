// Captures the README screenshots from the samples: `npm run screenshots`.
// Needs a Chromium for Playwright (npx playwright-core install chromium-headless-shell).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { renderModel } from '../src/build.js';

const out = path.resolve('docs/images');
fs.mkdirSync(out, { recursive: true });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'structra-shots-'));
const file = path.join(dir, 'index.html');
fs.writeFileSync(file, renderModel('samples'));
let browser;
try { browser = await chromium.launch(); } catch {
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  const shell = fs.readdirSync(cache).filter(n => n.startsWith('chromium_headless_shell-')).sort().reverse()[0];
  browser = await chromium.launch({ executablePath: path.join(cache, shell, 'chrome-headless-shell-linux64', 'chrome-headless-shell') });
}
const shots = [['ja', ''], ['en', '-en']];
for (const [language, suffix] of shots) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 820 } });
  await page.addInitScript(lang => localStorage.setItem('structra-language', lang), language);
  await page.goto('file://' + file);
  const shot = async name => { await page.waitForTimeout(150); await page.screenshot({ path: path.join(out, `${name}${suffix}.png`) }); };
  await shot('overview');
  await page.selectOption('#model-choice', { index: [...await page.$$eval('#model-choice option', o => o.map(x => x.textContent))].indexOf('顧客と契約の定義') });
  await page.click('#mode-ontology');
  await page.click('#diagram-toggle');
  await page.click('#concepts button[data-id="Customer"]');
  await page.evaluate(() => { cy.fit(undefined, 60); });
  await shot('terms');
  await page.click('#mode-process');
  await page.evaluate(() => { pickStep('Sign'); pc.fit(undefined, 30); });
  await shot('process');
  await page.click('#mode-unconfirmed');
  await shot('questions');
  await page.close();
}
await browser.close();
fs.rmSync(dir, { recursive: true, force: true });
console.log(`  ✓ Screenshots in ${path.relative(process.cwd(), out)}`);
