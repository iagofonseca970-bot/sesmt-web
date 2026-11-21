/* SESMT Web — Importação das listas exportadas do sistema da empresa (CSV): EPIs, funcionários, filiais, setores/locais e cargos.
   As regras (leitura do CSV e o que entra ou não) ficam separadas da tela para poderem ser testadas sem navegador. */
'use strict';
window.SESMT = window.SESMT || {};

(function (S) {
  // ---------- Leitura do arquivo ----------

  // Tenta UTF-8; se o arquivo não for UTF-8, lê como Windows-1252 (comum em CSV salvo no Windows).
  function decodificar(bytes) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
      return new TextDecoder('windows-1252').decode(bytes);
    }
  }

  // Separador: o que mais aparece na primeira linha, fora de aspas (ponto e vírgula, vírgula ou tabulação).
  function separador(linha) {
    const cont = { ';': 0, ',': 0, '\t': 0 };
    let aspas = false;
    for (const c of linha) {
      if (c === '"') aspas = !aspas;
      else if (!aspas && c in cont) cont[c] += 1;
    }
    const [sep, n] = Object.entries(cont).sort((a, b) => b[1] - a[1])[0];
    return n ? sep : ';';
  }

  // CSV com aspas: um campo entre aspas pode ter o separador, quebra de linha e aspas duplicadas ("").
  function lerCsv(texto) {
    const t = String(texto ?? '').replace(/^﻿/, '');
    const sep = separador(t.split(/\r?\n/, 1)[0] || '');
    const linhas = [];
    let campo = '';
    let linha = [];
    let aspas = false;
    const fecharLinha = () => {
      linha.push(campo);
      campo = '';
      if (linha.some((x) => x.trim() !== '')) linhas.push(linha);
      linha = [];
    };
    for (let i = 0; i < t.length; i += 1) {
      const c = t[i];
      if (aspas) {
        if (c === '"' && t[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else if (c === '"') aspas = false;
        else campo += c;
      } else if (c === '"') aspas = true;
      else if (c === sep) {
        linha.push(campo);
        campo = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && t[i + 1] === '\n') i += 1;
        fecharLinha();
      } else campo += c;
    }
    fecharLinha();
    return { separador: sep, linhas };
  }

  // Nome de coluna comparável: sem acento, sem pontuação e em minúsculas ("C.A." → "ca"; "Matrícula" → "matricula").
  const chaveColuna = (nome) => S.normalizar(nome).replace(/[^a-z0-9]/g, '');
  const limpar = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');

  // Nomes de coluna aceitos. Os primeiros de cada lista são os do arquivo exportado do sistema (por exemplo, desepi e cerapr).
  const COLUNAS = {
    descricao: ['desepi', 'descricao', 'descricaodoepi', 'epi', 'nomedoepi'],
    ca: ['cerapr', 'ca', 'nca', 'numeroca', 'numerodoca', 'certificadodeaprovacao', 'certificado'],
    validade: ['diaval', 'diasdevalidade', 'validadedias', 'diasvalidade', 'validade'],
    inutilizacao: ['datinu', 'datadeinutilizacao', 'datainutilizacao', 'inutilizacao'],
    nome: ['nome', 'nomfun', 'nomedofuncionario', 'funcionario', 'colaborador', 'nomecompleto'],
    matricula: ['matricula', 'numcad', 'cadastro', 'registro', 'chapa', 'numerodamatricula'],
    cargo: ['cargo', 'titcar', 'titulodocargo', 'nomedocargo', 'funcao'],
    filial: ['filial', 'empresa', 'unidade', 'nomfil', 'nomedafilial', 'razaosocial'],
    setor: ['setorlocal', 'setor', 'local', 'lotacao', 'nomloc', 'posto'],
  };
  function coluna(cabecalho, campo) {
    const chaves = cabecalho.map(chaveColuna);
    for (const nome of COLUNAS[campo]) {
      const i = chaves.indexOf(nome);
      if (i >= 0) return i;
    }
    return -1;
  }

  // Datas "vazias" do sistema (31/12/1900) contam como sem data.
  function dataPreenchida(valor) {
    const t = limpar(valor);
    return t !== '' && !/^1900-12-31|^31\/12\/1900/.test(t);
  }

  // ---------- O que entra em cada importação ----------

  function planoEpis(linhas, existentes) {
    const [cabecalho = [], ...registros] = linhas;
    const iDesc = coluna(cabecalho, 'descricao');
    const iCa = coluna(cabecalho, 'ca');
    const iVal = coluna(cabecalho, 'validade');
    const iInu = coluna(cabecalho, 'inutilizacao');
    if (iDesc < 0 || iCa < 0) {
      return { erro: 'O arquivo precisa ter a coluna da descrição do EPI e a do C.A. (por exemplo, "Descrição" e "C.A.", ou "desepi" e "cerapr", como no arquivo exportado do sistema).' };
    }
    const cadastrados = new Set(existentes.map((e) => S.normalizar(e.descricao)));
    const plano = { novos: [], repetidos: 0, inutilizados: 0, incompletos: 0, divergentes: 0, listaDivergentes: [], total: registros.length };
    // A mesma descrição pode aparecer mais de uma vez no sistema. Se os dados forem iguais, entra uma vez só; se o C.A.
    // ou a validade forem diferentes, não entra nenhuma (não dá para saber qual está certa) e o resumo pede conferência.
    const doArquivo = new Map();
    for (const r of registros) {
      if (iInu >= 0 && dataPreenchida(r[iInu])) {
        plano.inutilizados += 1;
        continue;
      }
      const descricao = limpar(r[iDesc]);
      const ca = S.normalizarCa(r[iCa]);
      if (!descricao || !ca || descricao.length > S.LIMITES.epiDescricao || ca.length > S.LIMITES.ca) {
        plano.incompletos += 1;
        continue;
      }
      const chave = S.normalizar(descricao);
      if (cadastrados.has(chave)) {
        plano.repetidos += 1;
        continue;
      }
      let diasValidade = null;
      const dias = limpar(r[iVal]);
      if (iVal >= 0 && dias !== '' && /^\d+$/.test(dias)) diasValidade = Number(dias);
      const anterior = doArquivo.get(chave);
      if (!anterior) {
        doArquivo.set(chave, { epi: { descricao, ca, diasValidade }, linhas: 1, divergente: false });
        continue;
      }
      anterior.linhas += 1;
      if (anterior.epi.ca !== ca || anterior.epi.diasValidade !== diasValidade) anterior.divergente = true;
    }
    for (const { epi, linhas, divergente } of doArquivo.values()) {
      if (divergente) {
        plano.divergentes += linhas;
        plano.listaDivergentes.push(epi.descricao);
      } else {
        plano.novos.push(epi);
        plano.repetidos += linhas - 1;
      }
    }
    return plano;
  }

  const CAMPO_DA_LISTA = { filiais: 'filial', setores: 'setor', cargos: 'cargo' };

  // Lista simples (filiais, setores/locais ou cargos): uma coluna de nomes, com ou sem título na primeira linha.
  function planoLista(tipo, linhas, existentes) {
    let registros = linhas;
    let i = 0;
    const cabecalho = linhas[0] || [];
    const iTitulo = Math.max(coluna(cabecalho, CAMPO_DA_LISTA[tipo]), cabecalho.map(chaveColuna).indexOf('nome'));
    if (iTitulo >= 0) {
      registros = linhas.slice(1);
      i = iTitulo;
    }
    const vistos = new Set(existentes.map((e) => S.normalizar(e.nome)));
    const plano = { novos: [], repetidos: 0, incompletos: 0, total: registros.length };
    for (const r of registros) {
      const nome = limpar(r[i]);
      if (!nome || nome.length > S.LIMITES.lista) {
        plano.incompletos += 1;
        continue;
      }
      const chave = S.normalizar(nome);
      if (vistos.has(chave)) {
        plano.repetidos += 1;
        continue;
      }
      vistos.add(chave);
      plano.novos.push({ nome });
    }
    return plano;
  }

  // Funcionários: nome obrigatório; matrícula já cadastrada não entra de novo; cargo, filial e setor/local que ainda
  // não existem nas listas são criados uma vez só.
  function planoFuncionarios(linhas, existentes, listas) {
    const [cabecalho = [], ...registros] = linhas;
    const iNome = coluna(cabecalho, 'nome');
    const iMat = coluna(cabecalho, 'matricula');
    const iCol = { cargos: coluna(cabecalho, 'cargo'), filiais: coluna(cabecalho, 'filial'), setores: coluna(cabecalho, 'setor') };
    if (iNome < 0) return { erro: 'O arquivo precisa ter a coluna com o nome do funcionário (por exemplo, "Nome" ou "nomfun").' };
    const matriculas = new Set(existentes.map((f) => limpar(f.matricula)).filter(Boolean));
    const semMatricula = new Set(existentes.filter((f) => !limpar(f.matricula)).map((f) => S.normalizar(f.nome)));
    const conhecidos = {};
    const novosItens = { filiais: new Map(), setores: new Map(), cargos: new Map() };
    for (const tipo of Object.keys(novosItens)) conhecidos[tipo] = new Map(listas[tipo].map((x) => [S.normalizar(x.nome), x.id]));
    const item = (tipo, valor) => {
      const nome = limpar(valor);
      if (!nome || nome.length > S.LIMITES.lista) return null;
      const chave = S.normalizar(nome);
      if (conhecidos[tipo].has(chave)) return { id: conhecidos[tipo].get(chave) };
      if (!novosItens[tipo].has(chave)) novosItens[tipo].set(chave, nome);
      return { novo: chave };
    };
    const plano = { novos: [], repetidos: 0, incompletos: 0, total: registros.length };
    for (const r of registros) {
      const nome = limpar(r[iNome]);
      const matricula = iMat >= 0 ? limpar(r[iMat]) : '';
      if (!nome || nome.length > S.LIMITES.nome || matricula.length > S.LIMITES.matricula) {
        plano.incompletos += 1;
        continue;
      }
      const jaExiste = matricula ? matriculas.has(matricula) : semMatricula.has(S.normalizar(nome));
      if (jaExiste) {
        plano.repetidos += 1;
        continue;
      }
      if (matricula) matriculas.add(matricula);
      else semMatricula.add(S.normalizar(nome));
      const ref = (tipo) => (iCol[tipo] >= 0 ? item(tipo, r[iCol[tipo]]) : null);
      plano.novos.push({ nome, matricula, cargo: ref('cargos'), filial: ref('filiais'), setor: ref('setores') });
    }
    plano.novosItens = Object.fromEntries(Object.entries(novosItens).map(([tipo, m]) => [tipo, [...m.entries()]]));
    return plano;
  }

  // ---------- Gravação (uma transação por importação: ou entra tudo, ou nada) ----------

  async function aplicar(tipo, plano) {
    const agora = new Date().toISOString();
    const { transacao, promessa } = S.banco;
    if (tipo === 'epis' || CAMPO_DA_LISTA[tipo]) {
      const tabela = tipo === 'epis' ? 'episCatalogo' : tipo;
      await transacao([tabela], 'readwrite', async (tx) => {
        for (const novo of plano.novos) await promessa(tx.objectStore(tabela).add(tipo === 'epis' ? { ...novo, criadoEm: agora } : novo));
      });
      return;
    }
    await transacao(['filiais', 'setores', 'cargos', 'funcionarios'], 'readwrite', async (tx) => {
      const ids = { filiais: new Map(), setores: new Map(), cargos: new Map() };
      for (const lista of Object.keys(ids)) {
        for (const [chave, nome] of plano.novosItens[lista]) ids[lista].set(chave, await promessa(tx.objectStore(lista).add({ nome })));
      }
      const idDe = (lista, ref) => (!ref ? null : ref.id !== undefined ? ref.id : ids[lista].get(ref.novo));
      for (const f of plano.novos) {
        await promessa(tx.objectStore('funcionarios').add({
          nome: f.nome,
          matricula: f.matricula,
          cargoId: idDe('cargos', f.cargo),
          filialId: idDe('filiais', f.filial),
          setorId: idDe('setores', f.setor),
          criadoEm: agora,
          atualizadoEm: agora,
        }));
      }
    });
  }

  // ---------- Textos da tela ----------

  const TIPOS_IMPORTACAO = {
    epis: {
      titulo: 'EPIs (cadastro de EPIs)',
      nomes: ['EPI', 'EPIs'],
      colunas: 'Colunas usadas: descrição do EPI e C.A. e, se houver, dias de validade e data de inutilização. O arquivo exportado do sistema (colunas desepi, cerapr, diaval e datinu) é aceito como está. EPI com data de inutilização não entra, e C.A. "N/A", "N/A.", "N/D" ou "NA" é gravado como NA.',
      depois: '/configuracoes/epis',
    },
    funcionarios: {
      titulo: 'Funcionários',
      nomes: ['funcionário', 'funcionários'],
      colunas: 'Colunas usadas: nome e, se houver, matrícula, cargo, filial e setor/local. Cargos, filiais e setores que ainda não estão nas listas são criados. Matrícula já cadastrada não entra de novo.',
      depois: '/epi',
    },
    filiais: { titulo: 'Filiais (empresas)', nomes: ['filial', 'filiais'], colunas: 'Uma coluna com os nomes das filiais, com ou sem título na primeira linha. Nome já cadastrado não se repete.', depois: '/configuracoes/listas/filiais' },
    setores: { titulo: 'Setores/Locais', nomes: ['setor/local', 'setores/locais'], colunas: 'Uma coluna com os nomes dos setores ou locais, com ou sem título na primeira linha. Nome já cadastrado não se repete.', depois: '/configuracoes/listas/setores' },
    cargos: { titulo: 'Cargos', nomes: ['cargo', 'cargos'], colunas: 'Uma coluna com os nomes dos cargos, com ou sem título na primeira linha. Nome já cadastrado não se repete.', depois: '/configuracoes/listas/cargos' },
  };

  function resumoPlano(tipo, plano, nomeArquivo) {
    const [um, varios] = TIPOS_IMPORTACAO[tipo].nomes;
    const linhas = [`Arquivo: ${nomeArquivo} (${S.plural(plano.total, 'linha', 'linhas')} de dados)`, ''];
    linhas.push(`• ${plano.novos.length === 1 ? `1 ${um} novo` : `${plano.novos.length} ${varios} novos`} para importar`);
    if (plano.novosItens) {
      const criar = Object.entries(plano.novosItens).filter(([, l]) => l.length).map(([lista, l]) => `${l.length} ${TIPOS_IMPORTACAO[lista].nomes[l.length === 1 ? 0 : 1]}`);
      if (criar.length) linhas.push(`• entram também nas listas: ${criar.join(', ')}`);
    }
    if (plano.inutilizados) linhas.push(`• ${plano.inutilizados} com data de inutilização (não ${plano.inutilizados === 1 ? 'entra' : 'entram'})`);
    if (plano.repetidos) linhas.push(`• ${plano.repetidos} já ${plano.repetidos === 1 ? 'cadastrado ou repetido' : 'cadastrados ou repetidos'} no arquivo (não ${plano.repetidos === 1 ? 'entra' : 'entram'})`);
    if (plano.divergentes) {
      const nomes = plano.listaDivergentes.slice(0, 3).join('; ') + (plano.listaDivergentes.length > 3 ? '; …' : '');
      linhas.push(`• ${plano.divergentes} com a mesma descrição, mas C.A. ou validade diferentes (não entram; confira no sistema): ${nomes}`);
    }
    if (plano.incompletos) linhas.push(`• ${plano.incompletos} sem os dados obrigatórios ou com texto longo demais (não ${plano.incompletos === 1 ? 'entra' : 'entram'})`);
    linhas.push('', 'Nada do que já está cadastrado é apagado ou alterado.');
    return linhas.join('\n');
  }

  async function montarPlano(tipo, texto) {
    const { linhas } = lerCsv(texto);
    if (!linhas.length) return { erro: 'O arquivo está vazio.' };
    if (tipo === 'epis') return planoEpis(linhas, await S.banco.listar('episCatalogo'));
    if (tipo === 'funcionarios') return planoFuncionarios(linhas, await S.banco.listar('funcionarios'), await S.carregarListas());
    return planoLista(tipo, linhas, await S.banco.listar(tipo));
  }

  // Do arquivo escolhido até a gravação, com o resumo e a confirmação no meio.
  async function importarArquivo(tipo, arquivo) {
    let texto;
    try {
      texto = decodificar(new Uint8Array(await arquivo.arrayBuffer()));
    } catch (erro) {
      await S.informar('Não deu para ler o arquivo', 'Escolha um arquivo CSV (texto separado por vírgula ou ponto e vírgula).');
      return false;
    }
    const plano = await montarPlano(tipo, texto);
    if (plano.erro) {
      await S.informar('Arquivo não reconhecido', plano.erro);
      return false;
    }
    const texto2 = resumoPlano(tipo, plano, arquivo.name);
    if (!plano.novos.length) {
      await S.informar('Nada novo para importar', texto2);
      return false;
    }
    const ok = await S.confirmar({ titulo: `Importar ${TIPOS_IMPORTACAO[tipo].titulo}?`, texto: texto2, confirmar: 'Importar' });
    if (!ok) return false;
    await aplicar(tipo, plano);
    const [um, varios] = TIPOS_IMPORTACAO[tipo].nomes;
    S.avisar(plano.novos.length === 1 ? `1 ${um} importado.` : `${plano.novos.length} ${varios} importados.`);
    S.ir(TIPOS_IMPORTACAO[tipo].depois);
    return true;
  }

  Object.assign(S, { lerCsv, planoEpis, planoLista, planoFuncionarios, resumoPlano, importarArquivo, TIPOS_IMPORTACAO });
})(window.SESMT);
