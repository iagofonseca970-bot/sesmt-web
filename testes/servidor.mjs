// Servidor de arquivos simples, só para os testes: serve a pasta do app em http://127.0.0.1:<porta livre>.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export function iniciarServidor(pasta) {
  const raiz = path.resolve(pasta);
  const servidor = http.createServer(async (req, res) => {
    const caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const arquivo = path.resolve(raiz, '.' + (caminho.endsWith('/') ? caminho + 'index.html' : caminho));
    if (!arquivo.startsWith(raiz)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const conteudo = await readFile(arquivo);
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
      res.end(conteudo);
    } catch {
      res.writeHead(404).end('não encontrado');
    }
  });
  return new Promise((resolve) => {
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address();
      resolve({ url: `http://127.0.0.1:${port}`, fechar: () => new Promise((r) => servidor.close(r)) });
    });
  });
}
