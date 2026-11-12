import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, relative, sep } from 'node:path';

const root = fileURLToPath(new URL('../site/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.zip': 'application/zip', '.tgz': 'application/gzip', '.txt': 'text/plain' };
const server = createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path === '/Lateef') { response.writeHead(302, { location: '/Lateef/' }); response.end(); return; }
    if (path.startsWith('/Lateef/')) path = path.slice('/Lateef'.length);
    let file = resolve(root, `.${path}`);
    if (relative(root, file) === '..' || relative(root, file).startsWith(`..${sep}`)) { response.writeHead(403); response.end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    const content = await readFile(file);
    response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404, { 'content-type': 'text/plain' }); response.end('Page not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Lateef: http://127.0.0.1:${port}/Lateef/`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
