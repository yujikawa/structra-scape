import express from 'express';
import chokidar from 'chokidar';
import path from 'node:path';
import { renderModel } from './build.js';

export async function dev(file, port = 4173) {
  const absolute = path.resolve(process.cwd(), file);
  const app = express();
  const clients = new Set();
  let html = '', issue = '';
  const refresh = () => { try { html = renderModel(absolute); issue = ''; } catch(error) { issue = error.message; } };
  refresh();
  app.get('/', (_req, res) => {
    try {
      const reload = '<script>const stream=new EventSource("/events");stream.onmessage=e=>{const message=JSON.parse(e.data);if(message.reload){location.reload();return}let panel=document.getElementById("sync-status");if(!message.error){panel?.remove();return}if(!panel){panel=document.createElement("div");panel.id="sync-status";panel.setAttribute("role","alert");panel.style.cssText="padding:10px 20px;background:#fff3d5;white-space:pre-wrap;font:12px system-ui";document.body.prepend(panel)}panel.textContent="YAMLの修正待ち（最後の正常な図を表示）\\n"+message.error};stream.onerror=()=>{document.title="接続待ち · structra-scape"}</script>';
      res.type('html').send((html || '<html><body><h1>YAMLの修正を待っています</h1></body></html>').replace('</body>', `${reload}</body>`));
    } catch (error) {
      res.status(400).type('html').send(`<pre>Model error:\n${error.message}</pre>`);
    }
  });
  app.get('/events', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    clients.add(res); req.on('close', () => clients.delete(res));
    res.write(`data: ${JSON.stringify({error:issue})}\n\n`);
  });
  chokidar.watch(absolute, { ignoreInitial: true, awaitWriteFinish: {stabilityThreshold:250,pollInterval:100} }).on('all', () => {
    refresh();
    for (const client of clients) client.write(`data: ${JSON.stringify(issue?{error:issue}:{reload:true})}\n\n`);
    console.log(issue?'  ! Invalid YAML; keeping last valid view':'  ↻ YAML updated');
  });
  app.listen(port, () => console.log(`  ✓ Preview: http://localhost:${port}\n  Watching: ${file}`));
}
