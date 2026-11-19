// Mural de referências em http://localhost:5300/ . Uso: node docs/design/mural/servir.mjs
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));
const tipos = { '.html': 'text/html', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const arq = join(raiz, url === '/' ? 'index.html' : url.replace(/\.\.+/g, ''));
  if (!tipos[extname(arq)] || !existsSync(arq)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': tipos[extname(arq)] + (extname(arq) === '.html' ? '; charset=utf-8' : ''), 'cache-control': 'no-store' });
  res.end(readFileSync(arq));
}).listen(5300, () => console.log('mural em http://localhost:5300/'));
