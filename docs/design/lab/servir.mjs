// Sobe 5 servidores estáticos (5301..5305), um por direção. Uso: node docs/design/lab/servir.mjs
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));
const DIRS = {
  1: { nome: 'Grafite de precisão', modo: 'dark', fontes: 'family=Inter:wght@400;450;500;550;600;650' },
  2: { nome: 'Claro editorial', modo: 'light', fontes: 'family=Geist:wght@400;500;550;600&family=Geist+Mono:wght@400;500' },
  3: { nome: 'Monocromo futurista', modo: 'dark', fontes: 'family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500' },
  4: { nome: 'Serifa e mono', modo: 'light', fontes: 'family=Instrument+Serif&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500' },
  5: { nome: 'Suave e amigável', modo: 'light', fontes: 'family=DM+Sans:wght@400;500;600;700' }
};
const tipos = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.svg': 'image/svg+xml' };

for (const id of Object.keys(DIRS)) {
  const porta = 5300 + Number(id);
  http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/' || url === '/index.html') {
      const d = DIRS[id];
      const links = Object.keys(DIRS).map(k => `<a href="http://localhost:${5300 + Number(k)}/"${k === id ? ' class="on"' : ''}>${k} · ${DIRS[k].nome}</a>`).join('');
      const html = readFileSync(join(raiz, 'index.html'), 'utf8')
        .replaceAll('__ID__', id).replaceAll('__NOME__', d.nome).replaceAll('__FONTES__', d.fontes)
        .replaceAll('__MODO__', d.modo).replaceAll('__LINKS__', links);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(html);
    }
    const arq = join(raiz, url.replace(/\.\.+/g, ''));
    if (!['.css', '.js'].includes(extname(arq)) || !existsSync(arq)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'content-type': tipos[extname(arq)] + '; charset=utf-8', 'cache-control': 'no-store' });
    res.end(readFileSync(arq));
  }).listen(porta, () => console.log(`direção ${id} em http://localhost:${porta}/`));
}
