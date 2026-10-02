import express from 'express';
import chokidar from 'chokidar';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderBundle } from './build.js';
import { saveAnswers } from './answers.js';

export function dev(file, { port = 4173, host = '127.0.0.1', compare = 'HEAD' } = {}) {
  const absolute = path.resolve(process.cwd(), file);
  if (!fs.existsSync(absolute)) throw new Error(`File not found: ${file}`);
  const app = express();
  // Answer only requests addressed to this machine. Without this, a web page on another origin
  // could use DNS rebinding to read the model through the browser.
  const allowed = allowedHosts(host);
  app.use((req, res, next) => {
    if (allowed.has(hostname(req.headers.host))) return next();
    res.status(403).type('text').send(`Host not allowed: ${req.headers.host}. Open http://localhost:${port} or start strscape dev with --host <name>.`);
  });
  const clients = new Set();
  let html = '', issue = '';
  // Imported definition files are watched too; the list is updated on every successful render.
  const watcher = chokidar.watch(absolute, { ignoreInitial: true, awaitWriteFinish: {stabilityThreshold:250,pollInterval:100} });
  const refresh = () => {
    try { const bundle = renderBundle(absolute, { compare }); html = bundle.html; issue = ''; watcher.add(bundle.files); }
    catch(error) { issue = error.message; }
  };
  refresh();
  app.get('/', (_req, res) => {
    // Re-render on each page load so a new commit is picked up as the comparison baseline.
    refresh();
    try {
      const reload = '<script>window.__STRUCTRA_DEV__=true;const stream=new EventSource("/events");stream.onmessage=e=>{const message=JSON.parse(e.data);if(message.reload){location.reload();return}let panel=document.getElementById("sync-status");if(!message.error){panel?.remove();return}if(!panel){panel=document.createElement("div");panel.id="sync-status";panel.setAttribute("role","alert");panel.style.cssText="padding:10px 20px;background:#fff3d5;white-space:pre-wrap;font:12px system-ui";document.body.prepend(panel)}panel.textContent="YAMLの修正待ち（最後の正常な図を表示）\\n"+message.error};stream.onerror=()=>{document.title="接続待ち · structra-scape"}</script>';
      res.type('html').send((html || '<html><body><h1>YAMLの修正を待っています</h1></body></html>').replace('</body>', `${reload}</body>`));
    } catch (error) {
      res.status(400).type('text').send(`Model error:\n${error.message}`);
    }
  });
  // Answers from the viewer go to answers/ next to the models, for the AI to pick up. Only this
  // page may post: a JSON body needs a CORS preflight, which is never granted, and the Origin
  // must be the page itself.
  const answersDir = fs.statSync(absolute).isDirectory() ? absolute : path.dirname(absolute);
  app.post('/answers', express.json({ limit: '2mb' }), (req, res) => {
    if (req.headers.origin !== `http://${req.headers.host}`) return res.status(403).json({ ok: false, errors: ['Origin not allowed'] });
    try {
      const file = saveAnswers(answersDir, req.body);
      console.log(`  ✓ Answers saved: ${path.relative(process.cwd(), file)}`);
      res.json({ ok: true, file: path.relative(process.cwd(), file) });
    } catch (error) { res.status(error.code === 'INVALID' ? 400 : 500).json({ ok: false, errors: [error.message] }); }
  });
  app.get('/events', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    clients.add(res); req.on('close', () => clients.delete(res));
    res.write(`data: ${JSON.stringify({error:issue})}\n\n`);
  });
  // Only YAML matters: answers saved under the models folder (and the folder itself) must not reload the page.
  watcher.on('all', (_event, changed) => {
    if (!/\.ya?ml$/i.test(changed)) return;
    refresh();
    for (const client of clients) client.write(`data: ${JSON.stringify(issue?{error:issue}:{reload:true})}\n\n`);
    console.log(issue?'  ! Invalid YAML; keeping last valid view':'  ↻ YAML updated');
  });
  const server = app.listen(port, host, () => console.log(`  ✓ Preview: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}\n  Watching: ${file}`));
  if (host === '0.0.0.0' || host === '::') console.log('  ! Listening on every network interface: anyone who can reach this machine can read the models');
  server.on('close', () => watcher.close());
  server.on('error', error => {
    console.error(`  ✗ ${error.code === 'EADDRINUSE' ? `Port ${port} is already in use; choose another with --port` : error.message}`);
    process.exit(1);
  });
  return server;
}

// The Host header without its port, lower-cased ("[::1]:4173" → "[::1]").
function hostname(header = '') {
  const value = String(header).toLowerCase();
  return value.startsWith('[') ? value.slice(0, value.indexOf(']') + 1) : value.split(':')[0];
}
function allowedHosts(host) {
  const names = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (host === '0.0.0.0' || host === '::') {
    // Shared on the network: accept this machine's own names and addresses.
    names.add(os.hostname().toLowerCase()).add(`${os.hostname().toLowerCase()}.local`);
    for (const address of Object.values(os.networkInterfaces()).flat()) names.add(address.family === 'IPv6' ? `[${address.address}]` : address.address);
  } else names.add(host.includes(':') ? `[${host}]` : host.toLowerCase());
  return names;
}
