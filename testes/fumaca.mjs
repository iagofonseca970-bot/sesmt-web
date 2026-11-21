// Varredura rápida: abre cada tela com os dados de exemplo e junta erros e avisos do console e da página.
// Uso: node testes/fumaca.mjs   (sobe um servidor próprio; ou passe o endereço)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { iniciarServidor } from './servidor.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const servidor = process.argv[2] ? null : await iniciarServidor(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = process.argv[2] || servidor.url;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
const page = await ctx.newPage();
const erros = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') erros.push(`[console.${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => erros.push(`[pageerror] ${e.message}`));
await page.goto(base + '/index.html');
await page.waitForSelector('#usuario');
await page.fill('#usuario', 'tecnico.teste');
await page.click('button[type=submit]');
await page.waitForSelector('.grade-menu');
const rotas = ['#/epi', '#/funcionario/novo', '#/funcionario/2', '#/funcionario/2/entrega/nova', '#/funcionario/2/entrega/1', '#/funcionario/2/imprimir',
  '#/extintores', '#/extintor/novo', '#/extintor/1', '#/avisos', '#/relatorios', '#/relatorios/unidades', '#/relatorios/epis',
  '#/configuracoes', '#/configuracoes/listas', '#/configuracoes/listas/agentes', '#/configuracoes/epis', '#/configuracoes/dados', '#/'];
for (const r of rotas) {
  await page.goto(base + '/index.html' + r);
  await page.waitForTimeout(250);
  const titulo = await page.textContent('#titulo-tela');
  const texto = (await page.textContent('#conteudo')).replace(/\s+/g, ' ').slice(0, 90);
  console.log(r.padEnd(32), '|', titulo.padEnd(26), '|', texto);
}
await browser.close();
if (servidor) await servidor.fechar();
console.log('\nERROS:', erros.length ? '\n' + erros.join('\n') : 'nenhum');
if (erros.length) process.exitCode = 1;
