import express from 'express';
import chokidar from 'chokidar';
import path from 'node:path';
import { renderModel } from './build.js';

export async function dev(file, port = 4173) {
  const absolute = path.resolve(process.cwd(), file);
  const app = express();
  const clients = new Set();
  app.get('/', (_req, res) => {
    try {
      const reload = '<script>new EventSource("/events").onmessage=()=>location.reload()</script>';
      res.type('html').send(renderModel(absolute).replace('</body>', `${reload}</body>`));
    } catch (error) {
      res.status(400).type('html').send(`<pre>Model error:\n${error.message}</pre>`);
    }
  });
  app.get('/events', (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    clients.add(res); req.on('close', () => clients.delete(res));
  });
  chokidar.watch(absolute, { ignoreInitial: true }).on('all', () => {
    for (const client of clients) client.write('data: reload\n\n');
    console.log('  ↻ YAML changed; browser reloaded');
  });
  app.listen(port, () => console.log(`  ✓ Preview: http://localhost:${port}\n  Watching: ${file}`));
}
