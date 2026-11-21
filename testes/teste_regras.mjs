// Testes das regras (sem navegador): carrega util.js, regras.js e telas-epi.js num contexto isolado.
// Uso: node testes/teste_regras.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const raiz = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contexto = { window: {}, console };
contexto.window.window = contexto.window;
vm.createContext(contexto);
for (const arquivo of ['js/util.js', 'js/regras.js', 'js/telas-epi.js', 'js/telas-avisos.js', 'js/importacao.js']) {
  vm.runInContext(readFileSync(`${raiz}/${arquivo}`, 'utf8'), contexto, { filename: arquivo });
}
const S = contexto.window.SESMT;

let ok = 0;
const t = (nome, fn) => {
  try {
    fn();
    ok += 1;
    console.log('  ok  ', nome);
  } catch (e) {
    console.log('  FALHOU', nome, '\n', e.message);
    process.exitCode = 1;
  }
};

console.log('C.A., e-mail e texto');
t('C.A.: as 4 formas sem número viram NA (maiúsculas, minúsculas, espaços); o resto só perde os espaços', () => {
  for (const v of ['N/A', ' n/a ', 'na', 'N/A.', 'n/d', 'N/D']) assert.equal(S.normalizarCa(v), 'NA', v);
  for (const [v, e] of [['12345', '12345'], [' 123 ', '123'], ['', ''], [null, ''], ['N.A.', 'N.A.']]) assert.equal(S.normalizarCa(v), e);
});
t('e-mail: formato nome@dominio.ext, sem espaços, até 254 caracteres', () => {
  for (const v of ['sesmt@empresa.com.br', 'a.b@c.co']) assert.equal(S.emailValido(v), true, v);
  for (const v of ['', 'abc', 'a@b', 'a b@c.com', '@c.com', 'a@.com']) assert.equal(S.emailValido(v), false, v);
  assert.equal(S.emailValido(`${'a'.repeat(242)}@empresa.com`), true);
  assert.equal(S.emailValido(`${'a'.repeat(243)}@empresa.com`), false);
});
t('busca "começa com" ignora acentos e maiúsculas; "contém" também', () => {
  assert.equal(S.comecaCom('Iara Nogueira', 'ia'), true);
  assert.equal(S.comecaCom('Ian Barbosa', 'IA'), true);
  assert.equal(S.comecaCom('Fabiana', 'ia'), false);
  assert.equal(S.comecaCom('Óculos', 'ocu'), true);
  assert.equal(S.contem('Casa de máquinas', 'MAQUI'), true);
  assert.equal(S.comecaCom('qualquer', ''), true);
});
t('CSV: separador ";", BOM e aspas quando precisa', () => {
  const csv = S.montarCsv(['A', 'B'], [['x;y', 'diz "oi"'], ['simples', 2]]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(csv.slice(1), 'A;B\r\n"x;y";"diz ""oi"""\r\nsimples;2');
});

console.log('Datas');
t('dias entre datas e soma de dias (ano bissexto e virada de ano)', () => {
  assert.equal(S.diasEntre('2024-02-28', '2024-03-01'), 2);
  assert.equal(S.diasEntre('2026-12-31', '2027-01-01'), 1);
  assert.equal(S.somarDias('2026-11-20', 180), '2027-05-19');
  assert.equal(S.somarDias('2026-03-01', -1), '2026-02-28');
});
t('meses: soma, índice e validação', () => {
  assert.equal(S.somarMeses('2026-11', 12), '2027-11');
  assert.equal(S.somarMeses('2026-11', 2), '2027-01');
  assert.equal(S.somarMeses('2026-01', -1), '2025-12');
  assert.equal(S.mesValido('2026-13'), false);
  assert.equal(S.dataValida('2026-02-30'), false);
  assert.equal(S.dataValida('2028-02-29'), true);
});

console.log('Validações');
const hoje = '2026-11-20';
const registroOk = { descricao: 'Luva', quantidade: 1, ca: '123', dataEntrega: hoje, dataDevolucao: '', comprovacao: { tipo: 'assinatura', dado: 'data:image/png;base64,x' } };
t('entrega completa: nada falta', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(S.validarRegistro(registroOk, hoje))), { faltando: [], erros: [] });
});
t('entrega: EPI, C.A., data e comprovação são obrigatórios; quantidade mínima 1', () => {
  const r = S.validarRegistro({ descricao: ' ', quantidade: 0, ca: '  ', dataEntrega: '', comprovacao: null }, hoje);
  assert.deepEqual([...r.faltando], ['EPI', 'Quantidade (mínimo 1)', 'C.A.', 'Data de entrega', 'Comprovação da entrega (assinatura na tela ou foto do rosto)']);
  assert.deepEqual([...S.validarRegistro({ ...registroOk, comprovacao: { tipo: 'foto', dado: '' } }, hoje).faltando], ['Comprovação da entrega (assinatura na tela ou foto do rosto)']);
});
t('entrega: data no futuro, antes de 1992 e devolução antes da entrega são recusadas', () => {
  assert.equal(S.validarRegistro({ ...registroOk, dataEntrega: '2026-11-21' }, hoje).erros.length, 1);
  assert.equal(S.validarRegistro({ ...registroOk, dataEntrega: '1991-12-31' }, hoje).erros.length, 1);
  assert.match(S.validarRegistro({ ...registroOk, dataEntrega: '2026-11-10', dataDevolucao: '2026-11-09' }, hoje).erros[0], /antes da data de entrega/);
  assert.equal(S.validarRegistro({ ...registroOk, dataEntrega: '2026-11-10', dataDevolucao: '2026-11-10' }, hoje).erros.length, 0);
});
t('funcionário: nome obrigatório; matrícula repetida em outra ficha é recusada', () => {
  assert.deepEqual([...S.validarFuncionario({ nome: '' }).faltando], ['Nome']);
  const outros = [{ id: 1, matricula: '1001' }];
  assert.equal(S.validarFuncionario({ id: 2, nome: 'X', matricula: '1001' }, outros).erros.length, 1);
  assert.equal(S.validarFuncionario({ id: 1, nome: 'X', matricula: '1001' }, outros).erros.length, 0, 'a própria ficha pode manter a matrícula');
  assert.equal(S.validarFuncionario({ nome: 'X', matricula: '' }, outros).erros.length, 0);
});
const mes = '2026-11';
const extOk = { identificacao: 'Extintor CO2', agenteId: 1, filialId: 1, recarga: '2026-05', testeHidrostatico: '', antecedenciaMeses: 1 };
t('extintor: identificação, agente, filial e data da recarga obrigatórios', () => {
  assert.deepEqual([...S.validarExtintor({ antecedenciaMeses: 1 }, mes).faltando], ['Identificação', 'Agente extintor', 'Filial', 'Data da recarga']);
  assert.equal(S.validarExtintor(extOk, mes).erros.length, 0);
});
t('extintor: recarga no futuro recusada; teste hidrostático entre a recarga e +5 anos; antecedência 0 a 12', () => {
  assert.equal(S.validarExtintor({ ...extOk, recarga: '2026-12' }, mes).erros.length, 1);
  assert.equal(S.validarExtintor({ ...extOk, testeHidrostatico: '2026-04' }, mes).erros.length, 1);
  assert.equal(S.validarExtintor({ ...extOk, testeHidrostatico: '2031-05' }, mes).erros.length, 0);
  assert.equal(S.validarExtintor({ ...extOk, testeHidrostatico: '2031-06' }, mes).erros.length, 1);
  assert.equal(S.validarExtintor({ ...extOk, antecedenciaMeses: 13 }, mes).erros.length, 1);
  assert.equal(S.validarExtintor({ ...extOk, antecedenciaMeses: NaN }, mes).erros.length, 1);
});

console.log('Prazos dos extintores');
t('próxima recarga = recarga + 12 meses; limite do teste = recarga + 60 meses', () => {
  assert.equal(S.proximaRecarga('2025-11'), '2026-11');
  assert.equal(S.limiteTesteHidrostatico('2025-11'), '2030-11');
});
t('situação por mês: vencido, vence este mês, a vencer (dentro da antecedência) e em dia', () => {
  assert.equal(S.situacaoPrazoMes('2026-10', 1, mes).codigo, 'vencido');
  assert.equal(S.situacaoPrazoMes('2026-10', 1, mes).texto, 'Venceu no mês passado');
  assert.equal(S.situacaoPrazoMes('2026-08', 1, mes).texto, 'Venceu há 3 meses');
  assert.equal(S.situacaoPrazoMes('2026-11', 0, mes).codigo, 'vence-este-mes');
  assert.equal(S.situacaoPrazoMes('2026-12', 1, mes).codigo, 'a-vencer');
  assert.equal(S.situacaoPrazoMes('2026-12', 0, mes).codigo, 'em-dia', 'antecedência 0 avisa só no mês');
  assert.equal(S.situacaoPrazoMes('2027-02', 3, mes).texto, 'Vence em 3 meses');
  assert.equal(S.situacaoPrazoMes('2027-03', 3, mes).codigo, 'em-dia');
});
t('situação do extintor = a pior entre próxima recarga e teste hidrostático', () => {
  const e = { recarga: '2026-06', testeHidrostatico: '2026-11', antecedenciaMeses: 1 };
  const s = S.situacaoExtintor(e, mes);
  assert.equal(s.codigo, 'vence-este-mes');
  assert.equal(s.prazo, 'Teste hidrostático');
  assert.equal(s.prazos.length, 2);
  assert.equal(S.situacaoExtintor({ recarga: '2025-10', antecedenciaMeses: 1 }, mes).codigo, 'vencido');
});

console.log('Validade dos EPIs');
const r = (dataEntrega, diasValidade, dataDevolucao = '') => ({ dataEntrega, diasValidade, dataDevolucao });
t('vencimento = entrega + dias de validade; 0 ou vazio = sem prazo', () => {
  assert.equal(S.vencimentoEpi(r('2026-05-24', 180)), '2026-11-20');
  assert.equal(S.vencimentoEpi(r('2026-05-24', 0)), null);
  assert.equal(S.vencimentoEpi(r('2026-05-24', null)), null);
});
t('situação: devolvido, sem prazo, vencido, vence hoje, a vencer (limite da antecedência) e em dia', () => {
  assert.equal(S.situacaoEpi(r('2026-01-01', 30, '2026-01-10'), hoje, 30).codigo, 'devolvido');
  assert.equal(S.situacaoEpi(r('2026-01-01', null), hoje, 30).codigo, 'sem-prazo');
  assert.equal(S.situacaoEpi(r('2026-05-23', 180), hoje, 30).codigo, 'vencido');
  assert.equal(S.situacaoEpi(r('2026-05-24', 180), hoje, 30).texto, 'Vence hoje');
  assert.equal(S.situacaoEpi(r('2026-06-23', 180), hoje, 30).codigo, 'a-vencer', '30 dias = dentro da antecedência');
  assert.equal(S.situacaoEpi(r('2026-06-24', 180), hoje, 30).codigo, 'em-dia', '31 dias = fora');
});

console.log('Ficha impressa');
t('páginas: frente com 16 linhas, verso com 26; depois começa outra folha', () => {
  const lista = (n) => Array.from({ length: n }, (_, i) => i);
  const resumo = (n) => S.dividirEmPaginas(lista(n)).map((p) => `${p.tipo}${p.folha}:${p.registros.length}`).join(' ');
  assert.equal(resumo(0), 'frente1:0');
  assert.equal(resumo(16), 'frente1:16');
  assert.equal(resumo(17), 'frente1:16 verso1:1');
  assert.equal(resumo(42), 'frente1:16 verso1:26');
  assert.equal(resumo(43), 'frente1:16 verso1:26 frente2:1');
});
t('sigla do agente extintor para a tabela por unidade', () => {
  assert.equal(S.siglaAgente('Classe BC (Dióxido de Carbono - CO2)'), 'CO2');
  assert.equal(S.siglaAgente('Classe D (Pó Especial)'), 'Pó Especial');
  assert.equal(S.siglaAgente('Sem parênteses'), 'Sem parênteses');
});

const copia = (x) => JSON.parse(JSON.stringify(x));
console.log('Importação do sistema (CSV)');
t('CSV: separador detectado (; , tab), aspas com separador, quebra de linha e aspas dentro do campo; BOM e linhas vazias ignorados', () => {
  const a = S.lerCsv('\uFEFFNome;Obs\r\n"Silva; Ana";"linha 1\nlinha 2"\r\n\r\n"Diz ""oi""";x\r\n');
  assert.equal(a.separador, ';');
  assert.deepEqual(copia(a.linhas), [['Nome', 'Obs'], ['Silva; Ana', 'linha 1\nlinha 2'], ['Diz "oi"', 'x']]);
  assert.equal(S.lerCsv('a,b\n1,"2,5"').separador, ',');
  assert.deepEqual(copia(S.lerCsv('a,b\n1,"2,5"').linhas[1]), ['1', '2,5']);
  assert.equal(S.lerCsv('a\tb\n1\t2').separador, '\t');
  assert.deepEqual(copia(S.lerCsv('').linhas), []);
});
const CAB_SISTEMA = 'codepi,desepi,diaval,diarev,devepi,valepi,numalm,cerapr,carepi,tipepi,insuso,epides,conuso,tipequ,fatred,conest,qtdmin,datinu,cercon,datvcc,catris';
const linhaSistema = (cod, desc, dias, ca, inutil = '1900-12-31 00:00:00.000') =>
  `${cod},"${desc}",${dias},0,S,0.00,,${ca},"Proteção, uso geral",,S,N,,8,0,0,0,${inutil},,1900-12-31 00:00:00.000,0`;
t('EPIs no formato do sistema: descrição, C.A. (N/A, N/A., N/D e NA viram NA), dias de validade e inutilizados de fora', () => {
  const csv = [CAB_SISTEMA,
    linhaSistema(1, 'AVENTAL DE PVC', 90, '11022'),
    linhaSistema(2, 'CAMISA DE BRIM', 180, 'N/A'),
    linhaSistema(3, 'LUVA INUTILIZADA', 90, '123', '2018-12-30 00:00:00.000'),
    linhaSistema(4, 'BONÉ ÁRABE', 0, 'N/D'),
    linhaSistema(5, 'avental de pvc', 90, '11022'),
    linhaSistema(6, 'LUVA DE VAQUETA', 90, '45'),
    linhaSistema(7, 'SEM CA', 90, ''),
    linhaSistema(8, 'PROTETOR', 365, 'N/A.'),
    linhaSistema(9, 'Protetor', 180, 'N/A'),
  ].join('\n');
  const p = S.planoEpis(S.lerCsv(csv).linhas, [{ descricao: 'Luva de vaqueta' }]);
  assert.deepEqual(copia(p.novos), [
    { descricao: 'AVENTAL DE PVC', ca: '11022', diasValidade: 90 },
    { descricao: 'CAMISA DE BRIM', ca: 'NA', diasValidade: 180 },
    { descricao: 'BONÉ ÁRABE', ca: 'NA', diasValidade: 0 },
  ]);
  // "PROTETOR" aparece duas vezes com validades diferentes (365 e 180): nenhuma entra, e o resumo pede conferência.
  assert.deepEqual(copia([p.total, p.inutilizados, p.repetidos, p.incompletos, p.divergentes]), [9, 1, 2, 1, 2]);
  assert.deepEqual(copia(p.listaDivergentes), ['PROTETOR']);
  assert.match(S.resumoPlano('epis', p, 'epis.csv'), /2 com a mesma descrição, mas C\.A\. ou validade diferentes \(não entram; confira no sistema\): PROTETOR/);
});
t('EPIs com títulos comuns (Descrição; C.A.; Validade (dias)) e arquivo sem as colunas obrigatórias', () => {
  const p = S.planoEpis(S.lerCsv('Descrição;C.A.;Validade (dias)\nÓculos incolor;12345;365\nCapacete; n/a ;').linhas, []);
  assert.deepEqual(copia(p.novos), [{ descricao: 'Óculos incolor', ca: '12345', diasValidade: 365 }, { descricao: 'Capacete', ca: 'NA', diasValidade: null }]);
  assert.match(S.planoEpis(S.lerCsv('Produto;Preço\nLuva;10').linhas, []).erro, /descrição do EPI e a do C\.A\./);
});
t('listas: com ou sem título; nomes repetidos (sem diferenciar maiúsculas e acentos) não entram', () => {
  const comTitulo = S.planoLista('cargos', S.lerCsv('Cargo\nSerrador\nPOLIDOR\nSerrador\n').linhas, [{ nome: 'Polidor' }]);
  assert.deepEqual(copia(comTitulo.novos), [{ nome: 'Serrador' }]);
  assert.deepEqual(copia([comTitulo.total, comTitulo.repetidos]), [3, 2]);
  const semTitulo = S.planoLista('filiais', S.lerCsv('Filial 1 — Pedreira Norte\nMatriz — Escritório\n').linhas, []);
  assert.deepEqual(copia(semTitulo.novos.map((x) => x.nome)), ['Filial 1 — Pedreira Norte', 'Matriz — Escritório']);
});
t('funcionários: matrícula já cadastrada não entra; cargo, filial e setor novos entram nas listas uma vez só', () => {
  const listas = { filiais: [{ id: 7, nome: 'Matriz' }], setores: [], cargos: [{ id: 3, nome: 'Serrador' }] };
  const csv = 'Nome;Matrícula;Cargo;Filial;Setor/Local\nAna Lima;2001;Polidor;MATRIZ;Polimento\nBeto Reis;2002;polidor;Filial 9;Polimento\nCaio Dias;1001;Serrador;Matriz;\n;2003;Serrador;Matriz;\n';
  const p = S.planoFuncionarios(S.lerCsv(csv).linhas, [{ nome: 'Antigo', matricula: '1001' }], listas);
  assert.deepEqual(copia(p.novos.map((f) => [f.nome, f.matricula])), [['Ana Lima', '2001'], ['Beto Reis', '2002']]);
  assert.deepEqual(copia(p.novos[0].filial), { id: 7 });
  assert.deepEqual(copia(p.novos[0].cargo), { novo: 'polidor' });
  assert.deepEqual(copia(p.novos[1].cargo), { novo: 'polidor' });
  assert.deepEqual(copia(p.novosItens), { filiais: [['filial 9', 'Filial 9']], setores: [['polimento', 'Polimento']], cargos: [['polidor', 'Polidor']] });
  assert.deepEqual(copia([p.total, p.repetidos, p.incompletos]), [4, 1, 1]);
  assert.match(S.planoFuncionarios(S.lerCsv('Matrícula\n1').linhas, [], listas).erro, /nome do funcionário/);
});
t('resumo da importação mostra o que entra e o que fica de fora', () => {
  const p = { novos: [1, 2], total: 5, inutilizados: 1, repetidos: 1, incompletos: 1 };
  const texto = S.resumoPlano('epis', p, 'epis.csv');
  assert.match(texto, /Arquivo: epis\.csv \(5 linhas de dados\)/);
  assert.match(texto, /2 EPIs novos para importar/);
  assert.match(texto, /1 com data de inutilização \(não entra\)/);
  assert.match(texto, /Nada do que já está cadastrado é apagado/);
});

console.log(`\n${ok} verificações passaram${process.exitCode ? ' — HOUVE FALHAS' : ''}`);
