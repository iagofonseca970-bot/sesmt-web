// Testes das telas no navegador (Playwright/Chromium), como o técnico usaria, conferindo o banco depois.
// Uso: node testes/teste_telas.mjs   (sobe um servidor próprio; ou passe o endereço: node testes/teste_telas.mjs http://127.0.0.1:8080)
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { iniciarServidor } from './servidor.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PASTA_APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const servidor = process.argv[2] ? null : await iniciarServidor(PASTA_APP);
const BASE = process.argv[2] || servidor.url;
const URL_ARQUIVO = pathToFileURL(path.join(PASTA_APP, 'index.html')).href; // para o teste aberto direto do arquivo
// Imagem pequena (16x16, cinza) para simular a foto tirada pela câmera.
const IMAGEM = {
  name: 'foto.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGOYNm0BSYhhVMOohuGrAQCCUMwQc+0svQAAAABJRU5ErkJggg==', 'base64'),
};
const browser = await chromium.launch();
const errosConsole = [];
let ok = 0;
async function t(nome, fn) {
  try {
    await fn();
    ok += 1;
    console.log('  ok  ', nome);
  } catch (e) {
    console.log('  FALHOU', nome, '\n', (e.stack || String(e)).split('\n').slice(0, 5).join('\n'));
    process.exitCode = 1;
  }
}

async function novaPagina({ largura = 390, altura = 844 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: largura, height: altura }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errosConsole.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errosConsole.push(`[pageerror] ${e.message}`));
  return { ctx, page };
}
async function entrar(page, { exemplos = true, usuario = 'tecnico.teste', url = BASE + '/index.html' } = {}) {
  await page.goto(url);
  await page.waitForSelector('#usuario');
  await page.fill('#usuario', usuario);
  if (!exemplos) await page.uncheck('#exemplos');
  await page.click('#form-primeiro button[type=submit]');
  await page.waitForSelector('.grade-menu');
}
const ir = async (page, rota) => {
  await page.evaluate((r) => {
    location.hash = r;
  }, rota);
  await page.waitForTimeout(150);
};
const modal = (page) => page.locator('.modal').last();
async function textoModal(page) {
  await modal(page).waitFor();
  return (await modal(page).innerText()).replace(/\s+/g, ' ');
}
const sim = (page) => modal(page).locator('[data-r="sim"]').click();
const nao = (page) => modal(page).locator('[data-r="nao"]').click();
const banco = (page, fn, ...args) => page.evaluate(fn, ...args);
const contar = (page, tabela) => banco(page, (t) => window.SESMT.banco.contar(t), tabela);
const listar = (page, tabela) => banco(page, (t) => window.SESMT.banco.listar(t), tabela);
const idDe = async (page, nome) => (await listar(page, 'funcionarios')).find((f) => f.nome === nome).id;
async function assinar(page) {
  await page.click('#assinar');
  const canvas = modal(page).locator('canvas');
  await canvas.waitFor();
  assert.equal(await modal(page).locator('[data-acao="confirmar"]').isDisabled(), true, 'sem desenho, Confirmar fica desativado');
  const c = await canvas.boundingBox();
  await page.mouse.move(c.x + 30, c.y + 60);
  await page.mouse.down();
  await page.mouse.move(c.x + 120, c.y + 140, { steps: 8 });
  await page.mouse.move(c.x + 220, c.y + 70, { steps: 8 });
  await page.mouse.up();
  await modal(page).locator('[data-acao="confirmar"]').click();
}

// ------------------------------------------------------------------------------------------------
console.log('A) Primeiro acesso');
{
  const { ctx, page } = await novaPagina();
  await t('sem usuário, o app abre no primeiro acesso; usuário em branco não passa', async () => {
    await page.goto(BASE + '/index.html#/epi');
    await page.waitForSelector('#usuario');
    assert.equal(await page.evaluate(() => location.hash), '#/primeiro-acesso');
    await page.click('#form-primeiro button[type=submit]');
    assert.match(await textoModal(page), /Preencha o usuário do sistema/);
    await sim(page);
  });
  await t('sem exemplos: o menu oferece carregar os dados de exemplo; depois há 9 funcionários e 10 extintores', async () => {
    await page.fill('#usuario', 'tecnico.teste');
    await page.uncheck('#exemplos');
    await page.click('#form-primeiro button[type=submit]');
    await page.waitForSelector('#carregar-exemplos');
    assert.equal(await contar(page, 'funcionarios'), 0);
    await page.click('#carregar-exemplos');
    await page.waitForSelector('.contador');
    assert.equal(await contar(page, 'funcionarios'), 9);
    assert.equal(await contar(page, 'extintores'), 10);
    assert.equal(await contar(page, 'episCatalogo'), 13);
    assert.equal(await page.locator('#carregar-exemplos').count(), 0);
  });
  await t('os dados continuam depois de recarregar a página', async () => {
    await page.reload();
    await page.waitForSelector('.grade-menu');
    assert.equal(await contar(page, 'registrosEpi'), 15);
  });
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------
console.log('B) Busca de funcionários (filtros combinados, em tempo real)');
{
  const { ctx, page } = await novaPagina();
  await entrar(page);
  await ir(page, '/epi');
  const contagem = () => page.textContent('#contagem');
  const nomes = () => page.locator('#resultado .item-titulo').allInnerTexts();
  await t('mostra todos ao abrir', async () => assert.equal(await contagem(), '9 de 9 funcionários'));
  await t('nome "ia" (começa com, sem diferenciar maiúsculas) → Iara e Ian; + setor Informática → os dois; + filial Matriz → só Iara', async () => {
    await page.fill('#f-nome', 'ia');
    assert.deepEqual(await nomes(), ['Ian Barbosa Freitas', 'Iara Nogueira Campos']);
    await page.selectOption('#f-setor', { label: 'Informática' });
    assert.equal(await contagem(), '2 de 9 funcionários');
    await page.selectOption('#f-filial', { label: 'Matriz — Escritório Central' });
    assert.deepEqual(await nomes(), ['Iara Nogueira Campos']);
  });
  await t('os filtros continuam ao abrir uma ficha e voltar', async () => {
    await page.click('#resultado .item');
    await page.waitForSelector('#form-funcionario');
    await page.click('#botao-voltar');
    await page.waitForSelector('#resultado');
    assert.equal(await page.inputValue('#f-nome'), 'ia');
    assert.deepEqual(await nomes(), ['Iara Nogueira Campos']);
  });
  await t('"Limpar filtros" volta a mostrar todos', async () => {
    await page.click('#limpar');
    assert.equal(await contagem(), '9 de 9 funcionários');
    assert.equal(await page.inputValue('#f-nome'), '');
  });
  await t('matrícula "100" → 9; "1009" → Ian; cargo Serrador → Carlos; nome "FERN" → Fernanda; "zzz" → nenhum', async () => {
    await page.fill('#f-matricula', '100');
    assert.equal(await contagem(), '9 de 9 funcionários');
    await page.fill('#f-matricula', '1009');
    assert.deepEqual(await nomes(), ['Ian Barbosa Freitas']);
    await page.fill('#f-matricula', '');
    await page.selectOption('#f-cargo', { label: 'Serrador' });
    assert.deepEqual(await nomes(), ['Carlos Eduardo Lima']);
    await page.selectOption('#f-cargo', '');
    await page.fill('#f-nome', 'FERN');
    assert.deepEqual(await nomes(), ['Fernanda Oliveira Santos']);
    await page.fill('#f-nome', 'zzz');
    assert.match(await page.textContent('#resultado'), /Nenhum funcionário encontrado/);
  });
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------
console.log('C) Ficha do funcionário e D) entregas de EPI');
{
  const { ctx, page } = await novaPagina();
  await entrar(page);
  let fid;
  await t('nova ficha: nome obrigatório; matrícula repetida recusada; ficha válida abre com 0 entregas', async () => {
    await ir(page, '/funcionario/novo');
    await page.click('#form-funcionario button[type=submit]');
    assert.match(await textoModal(page), /Preencha: Nome\./);
    await sim(page);
    await page.fill('#nome', 'Teste Novo da Silva');
    await page.fill('#matricula', '1001');
    await page.click('#form-funcionario button[type=submit]');
    assert.match(await textoModal(page), /matrícula 1001 já está em outra ficha/);
    await sim(page);
    await page.fill('#matricula', '2001');
    await page.selectOption('#cargo', { label: 'Polidor' });
    await page.selectOption('#filial', { label: 'Filial 3 — Fábrica' });
    await page.selectOption('#setor', { label: 'Polimento' });
    await page.click('#form-funcionario button[type=submit]');
    await page.waitForSelector('#titulo-entregas');
    assert.match(await page.textContent('#titulo-entregas'), /Entregas de EPI \(0\)/);
    fid = await idDe(page, 'Teste Novo da Silva');
    assert.match(await page.evaluate(() => location.hash), new RegExp(`#/funcionario/${fid}$`));
    const f = (await listar(page, 'funcionarios')).find((x) => x.id === fid);
    assert.equal(f.matricula, '2001');
    assert.ok(f.cargoId && f.filialId && f.setorId);
  });
  await t('nova entrega vazia: pede EPI, C.A. e comprovação (quantidade 1 e data de hoje já vêm preenchidas)', async () => {
    await page.click('a[href$="/entrega/nova"]');
    await page.waitForSelector('#form-entrega');
    assert.equal(await page.inputValue('#quantidade'), '1');
    assert.equal(await page.inputValue('#entrega'), await page.evaluate(() => window.SESMT.hojeISO()));
    await page.click('#form-entrega button[type=submit]');
    assert.match(await textoModal(page), /Preencha: EPI, C\.A\., Comprovação da entrega \(assinatura na tela ou foto do rosto\)\./);
    await sim(page);
  });
  await t('EPI fora do cadastro é recusado', async () => {
    await page.fill('#epi', 'EPI QUE NAO EXISTE');
    await page.click('#form-entrega button[type=submit]');
    assert.match(await textoModal(page), /EPI fora do cadastro/);
    await sim(page);
  });
  await t('escolher o EPI do cadastro traz o C.A. e a validade (só leitura)', async () => {
    await page.fill('#epi', 'Respirador PFF2');
    assert.equal(await page.inputValue('#ca'), '90018');
    assert.equal(await page.inputValue('#validade'), '7 dias');
    assert.equal(await page.locator('#ca').getAttribute('readonly'), '');
  });
  await t('assinatura desenhada na tela; devolução antes da entrega é recusada; salvar grava tudo (Visto = usuário)', async () => {
    await assinar(page);
    await page.waitForSelector('.assinatura-previa');
    assert.match(await page.textContent('#comprovacao'), /ainda não salva/);
    const hoje = await page.evaluate(() => window.SESMT.hojeISO());
    const ontem = await page.evaluate(() => window.SESMT.somarDias(window.SESMT.hojeISO(), -1));
    await page.fill('#entrega', hoje);
    await page.fill('#devolucao', ontem);
    await page.click('#form-entrega button[type=submit]');
    assert.match(await textoModal(page), /não pode ser antes da data de entrega/);
    await sim(page);
    await page.fill('#devolucao', '');
    await page.click('#form-entrega button[type=submit]');
    await page.waitForSelector('#titulo-entregas');
    assert.match(await page.textContent('#titulo-entregas'), /\(1\)/);
    const [r] = (await listar(page, 'registrosEpi')).filter((x) => x.funcionarioId === fid);
    assert.equal(r.descricao, 'Respirador PFF2');
    assert.equal(r.ca, '90018');
    assert.equal(r.diasValidade, 7);
    assert.equal(r.quantidade, 1);
    assert.equal(r.visto, 'tecnico.teste');
    assert.equal(r.comprovacao.tipo, 'assinatura');
    assert.match(r.comprovacao.dado, /^data:image\/png;base64,/);
  });
  await t('foto do rosto também comprova; EPI sem número de C.A. sai "NA"; botão + soma a quantidade', async () => {
    await page.click('a[href$="/entrega/nova"]');
    await page.waitForSelector('#form-entrega');
    await page.fill('#epi', 'Uniforme (camisa de brim)');
    assert.equal(await page.inputValue('#ca'), 'NA');
    await page.click('#mais');
    await page.setInputFiles('#arquivo-foto', IMAGEM);
    await page.waitForSelector('.foto-previa');
    assert.match(await page.textContent('#comprovacao'), /Foto do rosto \(ainda não salva\)/);
    await page.click('#form-entrega button[type=submit]');
    await page.waitForSelector('#titulo-entregas');
    const r = (await listar(page, 'registrosEpi')).find((x) => x.funcionarioId === fid && x.descricao.startsWith('Uniforme'));
    assert.equal(r.ca, 'NA');
    assert.equal(r.quantidade, 2);
    assert.equal(r.comprovacao.tipo, 'foto');
    assert.match(r.comprovacao.dado, /^data:image\/jpeg;base64,/);
  });
  await t('ao editar, o Visto continua o de quem entregou; uma entrega nova leva o usuário atual', async () => {
    await banco(page, () => window.SESMT.banco.salvarConfig('usuario', 'outro.usuario'));
    const r = (await listar(page, 'registrosEpi')).find((x) => x.funcionarioId === fid && x.descricao === 'Respirador PFF2');
    await ir(page, `/funcionario/${fid}/entrega/${r.id}`);
    await page.waitForSelector('#form-entrega');
    await page.fill('#observacao', 'Trocado o tamanho.');
    assert.match(await page.textContent('#contagem-obs'), /^18\/360$/);
    await page.click('#form-entrega button[type=submit]');
    await page.waitForSelector('#titulo-entregas');
    const editado = (await listar(page, 'registrosEpi')).find((x) => x.id === r.id);
    assert.equal(editado.visto, 'tecnico.teste');
    assert.equal(editado.observacao, 'Trocado o tamanho.');
    await page.click('a[href$="/entrega/nova"]');
    await page.waitForSelector('#form-entrega');
    assert.equal(await page.inputValue('input[aria-label="Visto"]'), 'outro.usuario');
    await banco(page, () => window.SESMT.banco.salvarConfig('usuario', 'tecnico.teste'));
  });
  await t('excluir entrega pede confirmação: Cancelar mantém; Excluir apaga', async () => {
    const r = (await listar(page, 'registrosEpi')).find((x) => x.funcionarioId === fid && x.descricao.startsWith('Uniforme'));
    await ir(page, `/funcionario/${fid}/entrega/${r.id}`);
    await page.waitForSelector('#excluir');
    await page.click('#excluir');
    assert.match(await textoModal(page), /Excluir entrega\?/);
    await nao(page);
    assert.equal((await listar(page, 'registrosEpi')).filter((x) => x.funcionarioId === fid).length, 2);
    await page.click('#excluir');
    await sim(page);
    await page.waitForSelector('#titulo-entregas');
    assert.equal((await listar(page, 'registrosEpi')).filter((x) => x.funcionarioId === fid).length, 1);
  });
  await t('excluir ficha avisa quantas entregas vão junto e apaga tudo', async () => {
    const id = await idDe(page, 'Bruno Henrique Costa');
    await ir(page, `/funcionario/${id}`);
    await page.click('#excluir');
    assert.match(await textoModal(page), /4 entregas registradas/);
    await sim(page);
    await page.waitForSelector('#resultado');
    assert.equal((await listar(page, 'registrosEpi')).filter((x) => x.funcionarioId === id).length, 0);
    assert.equal((await listar(page, 'funcionarios')).some((f) => f.id === id), false);
  });
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------
console.log('E) Impressão da ficha de EPI');
{
  const { ctx, page } = await novaPagina({ largura: 1280, altura: 900 });
  await entrar(page);
  await t('Bruno (4 entregas): 1 frente com 16 linhas, 4 preenchidas, "Assinatura Eletrônica", declaração NR-06, cidade e data', async () => {
    const id = await idDe(page, 'Bruno Henrique Costa');
    await ir(page, `/funcionario/${id}/imprimir`);
    await page.waitForSelector('.folha');
    assert.equal(await page.locator('.folha.frente').count(), 1);
    assert.equal(await page.locator('.folha.verso').count(), 0);
    assert.equal(await page.locator('.folha.frente tbody tr').count(), 16);
    const preenchidas = await page.locator('.folha.frente tbody tr').evaluateAll((trs) => trs.filter((tr) => tr.cells[0].textContent.trim()).length);
    assert.equal(preenchidas, 4);
    assert.equal(await page.locator('td:text-is("Assinatura Eletrônica")').count(), 4);
    const folha = await page.locator('.folha.frente').innerText();
    assert.match(folha, /NR-06/);
    assert.match(folha, /FICHA Nº: 01/);
    assert.match(folha, /Barra de São Francisco – ES, \d{1,2} de [a-zç]+ de \d{4}\./);
    assert.match(folha, /MATRÍCULA: 1002/);
  });
  await t('20 entregas: frente (16) + verso (26 linhas, 4 preenchidas); o botão Imprimir chama a impressão', async () => {
    const id = await idDe(page, 'Gabriel Rocha Pereira');
    await banco(
      page,
      async (fid) => {
        for (let i = 0; i < 19; i += 1) {
          await window.SESMT.banco.salvar('registrosEpi', {
            funcionarioId: fid, descricao: `EPI ${i}`, ca: '1', quantidade: 1, dataEntrega: '2026-01-01', dataDevolucao: '',
            comprovacao: { tipo: 'assinatura', dado: 'x' }, visto: 'v', diasValidade: null,
          });
        }
      },
      id
    );
    await ir(page, `/funcionario/${id}/imprimir`);
    await page.waitForSelector('.folha.verso');
    assert.equal(await page.locator('.folha.verso tbody tr').count(), 26);
    const preenchidas = await page.locator('.folha.verso tbody tr').evaluateAll((trs) => trs.filter((tr) => tr.cells[0].textContent.trim()).length);
    assert.equal(preenchidas, 4);
    await page.evaluate(() => {
      window.__impressoes = 0;
      window.print = () => {
        window.__impressoes += 1;
      };
    });
    await page.click('#imprimir');
    assert.equal(await page.evaluate(() => window.__impressoes), 1);
  });
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------
console.log('F) Cadastro de EPI (Configurações)');
{
  const { ctx, page } = await novaPagina();
  await entrar(page);
  await ir(page, '/configuracoes/epis');
  await t('C.A. obrigatório; descrição repetida recusada', async () => {
    await page.fill('#epi-descricao', 'Cinto de segurança tipo paraquedista');
    await page.click('#form-epi button[type=submit]');
    assert.match(await textoModal(page), /C\.A\. \(escreva NA se o EPI não tiver número\)/);
    await sim(page);
    await page.fill('#epi-descricao', 'luva de VAQUETA');
    await page.fill('#epi-ca', '123');
    await page.click('#form-epi button[type=submit]');
    assert.match(await textoModal(page), /já existe no cadastro/);
    await sim(page);
  });
  await t('"n/d" é gravado como NA; dias de validade guardados', async () => {
    await page.fill('#epi-descricao', 'Cinto de segurança tipo paraquedista');
    await page.fill('#epi-ca', 'n/d');
    await page.fill('#epi-dias', '365');
    await page.click('#form-epi button[type=submit]');
    await page.waitForSelector('text=EPIs cadastrados (14)');
    const e = (await listar(page, 'episCatalogo')).find((x) => x.descricao.startsWith('Cinto'));
    assert.equal(e.ca, 'NA');
    assert.equal(e.diasValidade, 365);
  });
  await t('editar com dias negativos é recusado; busca filtra pela descrição ou C.A.', async () => {
    const linha = page.locator('#corpo-epis tr', { has: page.locator('input[value^="Cinto"]') });
    await linha.locator('[data-campo="dias"]').fill('-1');
    await linha.locator('[data-salvar]').click();
    assert.match(await textoModal(page), /0 ou mais/);
    await sim(page);
    await page.fill('#busca-epi', '90018');
    const visiveis = await page.locator('#corpo-epis tr:not([hidden])').count();
    assert.equal(visiveis, 1);
  });
  await t('remover EPI usado em entregas: sai do cadastro, as entregas continuam com o texto', async () => {
    await page.fill('#busca-epi', '');
    const linha = page.locator('#corpo-epis tr', { has: page.locator('input[value="Respirador PFF2"]') });
    await linha.locator('[data-remover]').click();
    assert.match(await textoModal(page), /As entregas já registradas não mudam/);
    await sim(page);
    await page.waitForSelector('text=EPIs cadastrados (13)');
    assert.equal((await listar(page, 'episCatalogo')).some((x) => x.descricao === 'Respirador PFF2'), false);
    assert.equal((await listar(page, 'registrosEpi')).some((x) => x.descricao === 'Respirador PFF2'), true);
  });
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------
console.log('G) Extintores');
{
  const { ctx, page } = await novaPagina();
  await entrar(page);
  const mesAtual = await page.evaluate(() => window.SESMT.mesAtualISO());
  const somarMeses = (m, n) => page.evaluate(([a, b]) => window.SESMT.somarMeses(a, b), [m, n]);
  await t('lista: 10 extintores; resumo 2 vencidos, 2 vencem este mês, 2 a vencer, 4 em dia; filtro por situação', async () => {
    await ir(page, '/extintores');
    assert.equal(await page.textContent('#contagem-ext'), '10 de 10 extintores');
    assert.deepEqual(await page.locator('#resumo .chip').allInnerTexts(), ['Vencidos: 2', 'Vencem este mês: 2', 'A vencer: 2', 'Em dia: 4']);
    await page.selectOption('#x-situacao', 'vencido');
    assert.equal(await page.locator('#lista-ext .item').count(), 2);
    await page.selectOption('#x-situacao', '');
    await page.fill('#x-texto', 'casa de MAQ');
    assert.equal(await page.locator('#lista-ext .item').count(), 1);
  });
  await t('novo extintor: campos obrigatórios; recarga no futuro, teste fora do prazo e antecedência 13 recusados', async () => {
    await ir(page, '/extintor/novo');
    await page.click('#form-extintor button[type=submit]');
    assert.match(await textoModal(page), /Preencha: Identificação, Agente extintor, Filial, Data da recarga\./);
    await sim(page);
    await page.fill('#identificacao', 'Extintor Teste');
    await page.selectOption('#agente', { label: 'Classe BC (Dióxido de Carbono - CO2)' });
    assert.match(await page.textContent('#dica-agente'), /não conduz eletricidade/);
    await page.selectOption('#filial', { label: 'Filial 3 — Fábrica' });
    await page.fill('#frente', 'Oficina');
    await page.fill('#local', 'Porta dos fundos');
    await page.fill('#recarga', await somarMeses(mesAtual, 1));
    await page.click('#form-extintor button[type=submit]');
    assert.match(await textoModal(page), /até o mês atual/);
    await sim(page);
    const recarga = await somarMeses(mesAtual, -2);
    await page.fill('#recarga', recarga);
    assert.equal(await page.inputValue('#proxima'), await page.evaluate((m) => window.SESMT.mesAnoBR(window.SESMT.somarMeses(m, 12)), recarga));
    await page.fill('#teste', await somarMeses(recarga, -1));
    await page.click('#form-extintor button[type=submit]');
    assert.match(await textoModal(page), /5 anos depois/);
    await sim(page);
    await page.fill('#teste', await somarMeses(recarga, 60));
    await page.fill('#antecedencia', '13');
    await page.click('#form-extintor button[type=submit]');
    assert.match(await textoModal(page), /0 a 12 meses/);
    await sim(page);
  });
  await t('com foto e dados válidos, salva; a lista passa a ter 11', async () => {
    await page.fill('#antecedencia', '2');
    await page.setInputFiles('#arquivo-fotoExtintor', IMAGEM);
    await page.waitForSelector('#previa-fotoExtintor img');
    await page.click('#form-extintor button[type=submit]');
    await page.waitForSelector('#lista-ext');
    assert.equal(await contar(page, 'extintores'), 11);
    const e = (await listar(page, 'extintores')).find((x) => x.identificacao === 'Extintor Teste');
    assert.equal(e.antecedenciaMeses, 2);
    assert.match(e.fotoExtintor, /^data:image\/jpeg/);
    assert.equal(e.fotoLocal, null);
  });
  await t('remover a foto e salvar; excluir pede confirmação e apaga', async () => {
    const e = (await listar(page, 'extintores')).find((x) => x.identificacao === 'Extintor Teste');
    await ir(page, `/extintor/${e.id}`);
    await page.waitForSelector('#previa-fotoExtintor img');
    await page.click('[data-remover="fotoExtintor"]');
    await page.click('#form-extintor button[type=submit]');
    await page.waitForSelector('#lista-ext');
    assert.equal((await listar(page, 'extintores')).find((x) => x.id === e.id).fotoExtintor, null);
    await ir(page, `/extintor/${e.id}`);
    await page.click('#excluir');
    assert.match(await textoModal(page), /anotar em Observação/);
    await sim(page);
    await page.waitForSelector('#lista-ext');
    assert.equal(await contar(page, 'extintores'), 10);
  });
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------
console.log('H) Avisos');
{
  const { ctx, page } = await novaPagina();
  await entrar(page);
  await t('contagens da tela batem com o cálculo (exemplos: 6 extintores; EPIs vencidos e a vencer)', async () => {
    await ir(page, '/avisos');
    const calc = await page.evaluate(async () => {
      const a = await window.SESMT.calcularAvisos();
      return { ext: a.extintores.length, epis: a.epis.length, codigos: a.epis.map((x) => x.situacao.codigo) };
    });
    assert.equal(calc.ext, 6);
    assert.match(await page.textContent('#t-av-ext'), new RegExp(`\\(${calc.ext}\\)`));
    assert.match(await page.textContent('#t-av-epi'), new RegExp(`\\(${calc.epis}\\)`));
    assert.ok(calc.codigos.every((c) => c === 'vencido' || c === 'a-vencer'));
    assert.equal(calc.codigos.filter((c) => c === 'vencido').length, 4);
  });
  await t('sem e-mail cadastrado: oferece abrir Configurações', async () => {
    await page.click('#enviar-email');
    assert.match(await textoModal(page), /E-mail não cadastrado/);
    await sim(page);
    await page.waitForSelector('#form-usuario');
  });
  await t('o e-mail sai pronto (assunto e lista); lista longa é cortada', async () => {
    const r = await page.evaluate(async () => {
      const S = window.SESMT;
      const texto = S.textoAvisos(await S.calcularAvisos(), await S.carregarListas());
      return { link: S.linkEmail('sesmt@empresa.com.br', texto), longo: S.linkEmail('a@b.co', 'x'.repeat(5000)) };
    });
    assert.match(r.link, /^mailto:sesmt%40empresa\.com\.br\?subject=Avisos%20do%20SESMT%20Web/);
    const corpo = decodeURIComponent(r.link.split('&body=')[1]);
    assert.match(corpo, /EXTINTORES \(6\)/);
    assert.match(corpo, /Extintor CO2 \| Filial 1 — Pedreira Norte \| Gerador — Casa de máquinas \| Próxima recarga/);
    assert.match(corpo, /não substituem os controles oficiais do SESMT/);
    assert.match(decodeURIComponent(r.longo.split('&body=')[1]), /lista cortada/);
  });
  await t('notificação do navegador: aparece ao abrir (se permitida) e só uma vez por dia', async () => {
    await ctx.grantPermissions(['notifications']);
    const vezes = await page.evaluate(async () => {
      const chamadas = [];
      window.Notification = class {
        constructor(titulo, op) {
          chamadas.push([titulo, op.body]);
        }
        static get permission() {
          return 'granted';
        }
      };
      try {
        localStorage.removeItem('sesmt-ultima-notificacao');
      } catch (e) {}
      await window.SESMT.notificarAvisosDoDia();
      await window.SESMT.notificarAvisosDoDia();
      return chamadas;
    });
    assert.equal(vezes.length, 1);
    assert.match(vezes[0][1], /6 extintores e \d+ EPIs pedem atenção/);
  });
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------
console.log('I) Relatórios');
{
  const { ctx, page } = await novaPagina({ largura: 1280, altura: 900 });
  await entrar(page);
  await t('relação de extintores: 10 linhas; ordenar por Identificação (A→Z e Z→A)', async () => {
    await ir(page, '/relatorios/extintores');
    assert.equal(await page.locator('#tabela-extintores tbody tr').count(), 10);
    await page.click('[data-coluna="identificacao"]');
    await page.waitForTimeout(150);
    const asc = await page.locator('#tabela-extintores tbody tr td:first-child').allInnerTexts();
    assert.deepEqual(asc, [...asc].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    await page.click('[data-coluna="identificacao"]');
    await page.waitForTimeout(150);
    const desc = await page.locator('#tabela-extintores tbody tr td:first-child').allInnerTexts();
    assert.deepEqual(desc, [...asc].reverse());
  });
  await t('por unidade: soma das filiais = total geral = 10', async () => {
    await ir(page, '/relatorios/unidades');
    const totais = await page.locator('tbody tr td:nth-child(2)').allInnerTexts();
    assert.equal(totais.map(Number).reduce((a, b) => a + b, 0), 10);
    assert.equal(await page.textContent('tfoot td:nth-child(2)'), '10');
  });
  await t('EPIs vencidos: os 4 vencidos dos exemplos; devolvido e sem prazo não entram', async () => {
    await ir(page, '/relatorios/epis');
    const epis = await page.locator('tbody tr td:nth-child(3)').allInnerTexts();
    assert.deepEqual([...epis].sort(), ['Avental de raspa', 'Capacete de segurança com jugular', 'Protetor auricular tipo plug', 'Protetor facial incolor']);
  });
  await t('exportar planilha (CSV) baixa o arquivo com acentos e ";"', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportar')]);
    assert.equal(download.suggestedFilename(), 'epis-vencidos.csv');
    const conteudo = readFileSync(await download.path(), 'utf8');
    assert.equal(conteudo.charCodeAt(0), 0xfeff);
    assert.match(conteudo, /^﻿Funcionário;Matrícula;EPI;C\.A\.;Entrega;Validade \(dias\);Venceu em;Dias vencido/);
    assert.equal(conteudo.trim().split('\r\n').length, 5);
  });
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------
console.log('J) Configurações e listas');
{
  const { ctx, page } = await novaPagina();
  await entrar(page);
  await ir(page, '/configuracoes/usuario');
  await t('usuário obrigatório; e-mail inválido e antecedência fora do limite recusados; dados válidos gravados', async () => {
    await page.fill('#c-usuario', '');
    await page.click('#form-usuario button[type=submit]');
    assert.match(await textoModal(page), /Preencha o usuário/);
    await sim(page);
    await page.fill('#c-usuario', 'tecnico.teste');
    await page.fill('#c-email', 'sesmt@empresa');
    await page.click('#form-usuario button[type=submit]');
    assert.match(await textoModal(page), /E-mail inválido/);
    await sim(page);
    await page.fill('#c-email', '  sesmt@empresa.com.br ');
    await page.fill('#c-antecedencia', '400');
    await page.click('#form-usuario button[type=submit]');
    assert.match(await textoModal(page), /0 a 365/);
    await sim(page);
    await page.fill('#c-antecedencia', '60');
    await page.click('#form-usuario button[type=submit]');
    await page.waitForTimeout(300);
    const cfg = await page.evaluate(async () => ({
      email: await window.SESMT.banco.obterConfig('email'),
      ant: await window.SESMT.banco.obterConfig('antecedenciaEpiDias'),
    }));
    assert.deepEqual(cfg, { email: 'sesmt@empresa.com.br', ant: 60 });
  });
  await t('e-mail em branco apaga o gravado', async () => {
    await page.fill('#c-email', '');
    await page.click('#form-usuario button[type=submit]');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.SESMT.banco.obterConfig('email')), null);
  });
  await t('listas: adicionar, nome repetido recusado, renomear, item em uso não sai, item livre sai com confirmação', async () => {
    await ir(page, '/configuracoes/listas/filiais');
    await page.fill('#novo-item', 'Filial 4 — Teste');
    await page.click('#form-novo-item button[type=submit]');
    await page.waitForSelector('input[value="Filial 4 — Teste"]');
    await page.fill('#novo-item', 'filial 4 — TESTE');
    await page.click('#form-novo-item button[type=submit]');
    assert.match(await textoModal(page), /já está na lista/);
    await sim(page);
    const nova = page.locator('.item-linha', { has: page.locator('input[value="Filial 4 — Teste"]') });
    await nova.locator('input').fill('Filial 4 — Renomeada');
    await nova.locator('[data-salvar]').click();
    await page.waitForSelector('input[value="Filial 4 — Renomeada"]');
    const usada = page.locator('.item-linha', { has: page.locator('input[value="Filial 1 — Pedreira Norte"]') });
    await usada.locator('[data-remover]').click();
    assert.match(await textoModal(page), /está em uso \(2 fichas e 2 extintores\)/);
    await sim(page);
    await page.locator('.item-linha', { has: page.locator('input[value="Filial 4 — Renomeada"]') }).locator('[data-remover]').click();
    await sim(page);
    await page.waitForTimeout(250);
    assert.equal((await listar(page, 'filiais')).length, 4);
  });
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------
console.log('K) Cópia de segurança');
{
  const { ctx, page } = await novaPagina();
  await entrar(page);
  let caminhoCopia;
  await t('baixar a cópia (JSON) e mostrar a data da última cópia', async () => {
    await ir(page, '/configuracoes/dados');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#baixar-copia')]);
    caminhoCopia = await download.path();
    const copia = JSON.parse(readFileSync(caminhoCopia, 'utf8'));
    assert.equal(copia.app, 'SESMT Web');
    assert.equal(copia.dados.funcionarios.length, 9);
    assert.equal(copia.dados.registrosEpi.length, 15);
    await page.waitForSelector('text=Última cópia baixada');
    assert.doesNotMatch(await page.textContent('#conteudo'), /Última cópia baixada: nenhuma/);
  });
  await t('apagar tudo pede confirmação e volta ao primeiro acesso', async () => {
    await page.click('#apagar-tudo');
    assert.match(await textoModal(page), /Não dá para desfazer/);
    await sim(page);
    await page.waitForSelector('#usuario');
    assert.equal(await contar(page, 'funcionarios'), 0);
  });
  await t('arquivo que não é cópia é recusado; a cópia certa restaura tudo', async () => {
    await page.fill('#usuario', 'tecnico.teste');
    await page.uncheck('#exemplos');
    await page.click('#form-primeiro button[type=submit]');
    await page.waitForSelector('.grade-menu');
    await ir(page, '/configuracoes/dados');
    await page.setInputFiles('#arquivo-copia', { name: 'errado.json', mimeType: 'application/json', buffer: Buffer.from('{"oi":1}') });
    assert.match(await textoModal(page), /não é uma cópia de segurança/);
    await sim(page);
    await page.setInputFiles('#arquivo-copia', caminhoCopia);
    assert.match(await textoModal(page), /9 funcionários, 15 entregas e 10 extintores/);
    await sim(page);
    await page.waitForSelector('.grade-menu');
    assert.equal(await contar(page, 'funcionarios'), 9);
    assert.equal(await contar(page, 'registrosEpi'), 15);
    assert.equal(await contar(page, 'extintores'), 10);
  });
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------
console.log('L) Importação do sistema (CSV)');
{
  const { ctx, page } = await novaPagina();
  await entrar(page);
  const csv = (nome, texto) => ({ name: nome, mimeType: 'text/csv', buffer: Buffer.from(texto, 'utf8') });
  const cabSistema = 'codepi,desepi,diaval,diarev,devepi,valepi,numalm,cerapr,carepi,tipepi,insuso,epides,conuso,tipequ,fatred,conest,qtdmin,datinu,cercon,datvcc,catris';
  const linha = (cod, desc, dias, ca, inutil = '1900-12-31 00:00:00.000') =>
    `${cod},"${desc}",${dias},0,S,0.00,,${ca},"Proteção",,S,N,,8,0,0,0,${inutil},,1900-12-31 00:00:00.000,0`;
  await t('EPIs no formato do sistema: resumo antes de importar; inutilizado e repetidos ficam de fora; N/A vira NA', async () => {
    await ir(page, '/configuracoes/dados');
    assert.match(await page.textContent('#colunas-importacao'), /desepi, cerapr, diaval e datinu/);
    const arquivo = [cabSistema, linha(1, 'Cinto paraquedista', 1826, '12345'), linha(2, 'Bota de PVC', 365, 'N/A'), linha(3, 'Luva velha', 90, '1', '2018-12-30 00:00:00.000'),
      linha(4, 'Luva de vaqueta', 90, '90015'), linha(5, 'Bota de PVC', 365, 'N/A')].join('\r\n');
    await page.setInputFiles('#arquivo-csv', csv('epis-do-sistema.csv', arquivo));
    const texto = await textoModal(page);
    assert.match(texto, /Importar EPIs \(cadastro de EPIs\)\?/);
    assert.match(texto, /2 EPIs novos para importar/);
    assert.match(texto, /1 com data de inutilização \(não entra\)/);
    assert.match(texto, /2 já cadastrados ou repetidos no arquivo/);
    await sim(page);
    await page.waitForSelector('#form-epi');
    const epis = await listar(page, 'episCatalogo');
    assert.equal(epis.length, 15);
    const bota = epis.find((e) => e.descricao === 'Bota de PVC');
    assert.deepEqual([bota.ca, bota.diasValidade], ['NA', 365]);
    assert.equal(epis.find((e) => e.descricao === 'Cinto paraquedista').diasValidade, 1826);
    assert.equal(epis.some((e) => e.descricao === 'Luva velha'), false);
  });
  await t('funcionários: matrícula já cadastrada não entra; cargo novo é criado; filial e setor existentes são reaproveitados', async () => {
    await ir(page, '/configuracoes/dados');
    await page.selectOption('#tipo-importacao', 'funcionarios');
    assert.match(await page.textContent('#colunas-importacao'), /Matrícula já cadastrada não entra de novo/);
    await page.setInputFiles('#arquivo-csv', csv('funcionarios.csv', 'Nome;Matrícula;Cargo;Filial;Setor/Local\nJoana Prado;3001;Operador de Ponte Rolante;filial 2 — pedreira sul;PEDREIRA\nCarlos Eduardo Lima;1003;Serrador;Filial 3 — Fábrica;Serraria\n'));
    const texto = await textoModal(page);
    assert.match(texto, /1 funcionário novo para importar/);
    assert.match(texto, /entram também nas listas: 1 cargo/);
    assert.match(texto, /1 já cadastrado ou repetido/);
    await sim(page);
    await page.waitForSelector('#resultado');
    const joana = (await listar(page, 'funcionarios')).find((f) => f.nome === 'Joana Prado');
    const nomeDe = async (tabela, id) => (await listar(page, tabela)).find((x) => x.id === id).nome;
    assert.equal(await nomeDe('cargos', joana.cargoId), 'Operador de Ponte Rolante');
    assert.equal(await nomeDe('filiais', joana.filialId), 'Filial 2 — Pedreira Sul');
    assert.equal(await nomeDe('setores', joana.setorId), 'Pedreira');
    assert.equal((await listar(page, 'funcionarios')).length, 10);
    assert.equal(await page.textContent('#contagem'), '10 de 10 funcionários');
  });
  await t('lista de cargos sem título; arquivo sem as colunas certas é recusado; reimportar não duplica', async () => {
    await ir(page, '/configuracoes/dados');
    await page.selectOption('#tipo-importacao', 'cargos');
    const arquivo = csv('cargos.csv', 'Ajudante Geral\nSerrador\n');
    await page.setInputFiles('#arquivo-csv', arquivo);
    assert.match(await textoModal(page), /1 cargo novo para importar[\s\S]*1 já cadastrado ou repetido/);
    await sim(page);
    await page.waitForSelector('input[value="Ajudante Geral"]');
    await ir(page, '/configuracoes/dados');
    await page.selectOption('#tipo-importacao', 'cargos');
    await page.setInputFiles('#arquivo-csv', arquivo);
    assert.match(await textoModal(page), /Nada novo para importar/);
    await sim(page);
    await page.selectOption('#tipo-importacao', 'epis');
    await page.setInputFiles('#arquivo-csv', csv('precos.csv', 'Produto;Preço\nLuva;10\n'));
    assert.match(await textoModal(page), /Arquivo não reconhecido[\s\S]*descrição do EPI e a do C\.A\./);
    await sim(page);
    assert.equal((await listar(page, 'cargos')).filter((c) => c.nome === 'Ajudante Geral').length, 1);
  });
  await ctx.close();
}

// ------------------------------------------------------------------------------------------------
console.log('M) Aberto direto do arquivo (sem servidor)');
{
  const { ctx, page } = await novaPagina();
  await t('o app funciona aberto como arquivo (file://), com o banco do navegador', async () => {
    await entrar(page, { url: URL_ARQUIVO });
    assert.equal(await contar(page, 'funcionarios'), 9);
    await ir(page, '/epi');
    assert.equal(await page.textContent('#contagem'), '9 de 9 funcionários');
  });
  await ctx.close();
}

await browser.close();
if (servidor) await servidor.fechar();
console.log('\nErros no console do navegador:', errosConsole.length ? '\n' + errosConsole.join('\n') : 'nenhum');
if (errosConsole.length) process.exitCode = 1;
console.log(`${ok} verificações passaram${process.exitCode ? ' — HOUVE FALHAS' : ''}`);
