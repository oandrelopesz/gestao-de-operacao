// Sobe as 3 direções do laboratório 2 (5301..5303). Uso: node docs/design/lab2/servir.mjs
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));
const PAGINAS = { 5301: 'instrumento.html', 5302: 'painel.html', 5303: 'editorial.html' };
const tipos = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html' };

for (const [porta, pagina] of Object.entries(PAGINAS)) {
  http.createServer((req, res) => {
    let url = req.url.split('?')[0];
    if (url === '/') url = '/' + pagina;
    const arq = join(raiz, url.replace(/\.\.+/g, ''));
    if (!tipos[extname(arq)] || !existsSync(arq)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'content-type': tipos[extname(arq)] + '; charset=utf-8', 'cache-control': 'no-store' });
    res.end(readFileSync(arq));
  }).listen(Number(porta), () => console.log(`${pagina} em http://localhost:${porta}/`));
}
