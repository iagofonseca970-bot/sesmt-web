/* SESMT Web — Configurações: usuário (Visto), e-mail, empresa, listas, cadastro de EPI, importação do sistema (CSV) e cópia de segurança. */
'use strict';
window.SESMT = window.SESMT || {};

(function (S) {
  const TIPOS_LISTA = {
    filiais: { titulo: 'Filiais', singular: 'filial', usadoEm: [['funcionarios', 'filialId', 'ficha'], ['extintores', 'filialId', 'extintor']] },
    setores: { titulo: 'Setores/Locais', singular: 'setor/local', usadoEm: [['funcionarios', 'setorId', 'ficha']] },
    cargos: { titulo: 'Cargos', singular: 'cargo', usadoEm: [['funcionarios', 'cargoId', 'ficha']] },
    agentes: { titulo: 'Agentes extintores', singular: 'agente extintor', usadoEm: [['extintores', 'agenteId', 'extintor']] },
  };

  // ---------- Listas usadas nas outras telas ----------

  async function carregarListas() {
    const [filiais, setores, cargos, agentes] = await Promise.all(['filiais', 'setores', 'cargos', 'agentes'].map((t) => S.banco.listar(t)));
    const ordenar = (l) => l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const mapa = (l) => new Map(l.map((x) => [x.id, x]));
    return {
      filiais: ordenar(filiais),
      setores: ordenar(setores),
      cargos: ordenar(cargos),
      agentes: ordenar(agentes),
      filiaisPorId: mapa(filiais),
      setoresPorId: mapa(setores),
      cargosPorId: mapa(cargos),
      agentesPorId: mapa(agentes),
    };
  }

  function opcoesHtml(lista, selecionado, rotuloVazio) {
    const sel = selecionado === null || selecionado === undefined ? '' : String(selecionado);
    return (
      `<option value="">${S.esc(rotuloVazio)}</option>` +
      lista.map((x) => `<option value="${x.id}" ${String(x.id) === sel ? 'selected' : ''}>${S.esc(x.nome)}</option>`).join('')
    );
  }

  // Quantos registros usam um item da lista (para não apagar algo em uso).
  async function contarUso(tipo, id) {
    const usos = [];
    for (const [tabela, campo, nome] of TIPOS_LISTA[tipo].usadoEm) {
      const n = (await S.banco.listarPorIndice(tabela, campo, id)).length;
      if (n) usos.push(S.plural(n, nome, nome === 'ficha' ? 'fichas' : `${nome}es`));
    }
    return usos;
  }

  // ---------- Tela ----------

  async function telaConfiguracoes({ params, token }) {
    const secao = params.secao || 'usuario';
    const cfg = {
      usuario: await S.banco.obterConfig('usuario', ''),
      email: await S.banco.obterConfig('email', ''),
      empresa: await S.banco.obterConfig('empresa', ''),
      cidade: await S.banco.obterConfig('cidade', ''),
      antecedenciaEpi: await S.antecedenciaEpi(),
      ultimaCopia: await S.banco.obterConfig('ultimaCopia', ''),
    };
    const abas = [
      ['usuario', 'Usuário'],
      ['listas', 'Listas'],
      ['epis', 'EPIs'],
      ['dados', 'Dados'],
    ];
    let corpo = '';
    if (secao === 'usuario') corpo = htmlUsuario(cfg);
    else if (secao === 'listas') corpo = await htmlListas(params.lista || 'filiais');
    else if (secao === 'epis') corpo = await htmlEpis();
    else corpo = htmlDados(cfg);

    const raiz = S.pintar(token, {
      titulo: 'Configurações',
      voltar: '/',
      html: `<div class="abas" role="tablist">${abas
        .map(([c, n]) => `<a class="aba" role="tab" href="#/configuracoes/${c}" aria-selected="${c === secao}">${n}</a>`)
        .join('')}</div>${corpo}`,
    });
    if (!raiz) return;
    if (secao === 'usuario') ligarUsuario(raiz);
    else if (secao === 'listas') ligarListas(raiz, params.lista || 'filiais');
    else if (secao === 'epis') ligarEpis(raiz);
    else ligarDados(raiz);
  }

  // ---------- Usuário, e-mail e empresa ----------

  function htmlUsuario(cfg) {
    return `<form class="cartao" id="form-usuario" novalidate>
      <h2>Usuário do SESMT (Visto)</h2>
      <p class="dica">Vai no campo Visto de cada entrega de EPI registrada a partir de agora. As entregas já registradas continuam com o usuário de quando foram feitas.</p>
      <div class="campo"><label for="c-usuario">Usuário do sistema <span class="obrigatorio">*</span></label>
        <input type="text" id="c-usuario" maxlength="${S.LIMITES.usuario}" value="${S.esc(cfg.usuario)}" /></div>
      <div class="campo"><label for="c-email">E-mail do usuário</label>
        <input type="email" id="c-email" maxlength="${S.LIMITES.email}" value="${S.esc(cfg.email)}" placeholder="Ex.: sesmt@empresa.com.br" autocomplete="email" />
        <span class="dica">É para onde vai o aviso por e-mail (na tela Avisos).</span></div>
      <h2 style="margin-top:8px">Empresa</h2>
      <div class="grade-filtros">
        <div class="campo"><label for="c-empresa">Nome da empresa (sai na ficha de EPI)</label>
          <input type="text" id="c-empresa" maxlength="${S.LIMITES.empresa}" value="${S.esc(cfg.empresa)}" /></div>
        <div class="campo"><label for="c-cidade">Cidade – UF (sai na declaração da ficha)</label>
          <input type="text" id="c-cidade" maxlength="${S.LIMITES.cidade}" value="${S.esc(cfg.cidade)}" /></div>
      </div>
      <h2 style="margin-top:8px">Avisos de EPI</h2>
      <div class="campo"><label for="c-antecedencia">Avisar EPI a vencer com antecedência de (dias)</label>
        <input type="number" id="c-antecedencia" min="0" max="365" step="1" value="${S.esc(cfg.antecedenciaEpi)}" />
        <span class="dica">Os extintores têm a antecedência no cadastro de cada um (em meses).</span></div>
      <div class="grupo-botoes"><button type="submit" class="botao primario">Salvar</button></div>
    </form>`;
  }

  function ligarUsuario(raiz) {
    raiz.querySelector('#form-usuario').addEventListener('submit', async (e) => {
      e.preventDefault();
      const usuario = raiz.querySelector('#c-usuario').value.trim();
      const email = raiz.querySelector('#c-email').value.trim();
      const antecedencia = Number(raiz.querySelector('#c-antecedencia').value);
      if (!usuario) return S.informar('Campo obrigatório', 'Preencha o usuário do sistema.');
      if (email && !S.emailValido(email)) return S.informar('E-mail inválido', 'Confira o endereço. Ele precisa ter o formato nome@empresa.com.br, sem espaços.');
      if (!Number.isInteger(antecedencia) || antecedencia < 0 || antecedencia > 365) return S.informar('Confira os dados', 'A antecedência precisa ser um número de 0 a 365 dias.');
      await S.banco.salvarConfig('usuario', usuario);
      if (email) await S.banco.salvarConfig('email', email);
      else await S.banco.excluirConfig('email');
      await S.banco.salvarConfig('empresa', raiz.querySelector('#c-empresa').value.trim());
      await S.banco.salvarConfig('cidade', raiz.querySelector('#c-cidade').value.trim());
      await S.banco.salvarConfig('antecedenciaEpiDias', antecedencia);
      S.avisar('Configurações salvas.');
      S.navegar();
    });
  }

  // ---------- Listas (filiais, setores/locais, cargos e agentes extintores) ----------

  async function htmlListas(tipo) {
    const def = TIPOS_LISTA[tipo] || TIPOS_LISTA.filiais;
    const itens = await S.banco.listar(tipo);
    itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return `<section class="cartao">
      <div class="campo"><label for="tipo-lista">Lista</label>
        <select id="tipo-lista">${Object.entries(TIPOS_LISTA)
          .map(([c, d]) => `<option value="${c}" ${c === tipo ? 'selected' : ''}>${d.titulo}</option>`)
          .join('')}</select></div>
      <form class="linha" id="form-novo-item" novalidate>
        <input type="text" id="novo-item" maxlength="${S.LIMITES.lista}" placeholder="Nova ${S.esc(def.singular)}" aria-label="Novo item da lista" />
        <button type="submit" class="botao primario">Adicionar</button>
      </form>
      <p class="dica" style="margin-top:6px">${S.plural(itens.length, 'item', 'itens')}. Para renomear, mude o texto e toque em Salvar.</p>
      <div id="itens-lista">${
        itens.length
          ? itens
              .map(
                (x) => `<div class="item-linha" data-id="${x.id}">
                  <input type="text" maxlength="${S.LIMITES.lista}" value="${S.esc(x.nome)}" aria-label="Nome" data-original="${S.esc(x.nome)}" />
                  <button type="button" class="botao texto" data-salvar>Salvar</button>
                  <button type="button" class="botao texto perigo-texto" data-remover>Remover</button>
                </div>`
              )
              .join('')
          : '<div class="vazio">Lista vazia.</div>'
      }</div>
    </section>`;
  }

  async function nomeRepetido(tipo, nome, id = null) {
    const itens = await S.banco.listar(tipo);
    return itens.some((x) => x.id !== id && S.normalizar(x.nome) === S.normalizar(nome));
  }

  function ligarListas(raiz, tipo) {
    const def = TIPOS_LISTA[tipo] || TIPOS_LISTA.filiais;
    raiz.querySelector('#tipo-lista').addEventListener('change', (e) => S.ir(`/configuracoes/listas/${e.target.value}`));
    raiz.querySelector('#form-novo-item').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = raiz.querySelector('#novo-item').value.trim();
      if (!nome) return S.informar('Campo obrigatório', `Digite o nome da ${def.singular}.`);
      if (await nomeRepetido(tipo, nome)) return S.informar('Já existe', `"${nome}" já está na lista.`);
      await S.banco.salvar(tipo, { nome });
      S.avisar('Item adicionado.');
      S.navegar();
    });
    raiz.querySelectorAll('.item-linha').forEach((linha) => {
      const id = Number(linha.dataset.id);
      const campo = linha.querySelector('input');
      linha.querySelector('[data-salvar]').addEventListener('click', async () => {
        const nome = campo.value.trim();
        if (!nome) return S.informar('Campo obrigatório', 'O nome não pode ficar em branco.');
        if (await nomeRepetido(tipo, nome, id)) return S.informar('Já existe', `"${nome}" já está na lista.`);
        const atual = await S.banco.obter(tipo, id);
        await S.banco.salvar(tipo, { ...atual, nome });
        S.avisar('Item salvo.');
        S.navegar();
      });
      linha.querySelector('[data-remover]').addEventListener('click', async () => {
        const usos = await contarUso(tipo, id);
        if (usos.length) {
          await S.informar('Item em uso', `"${campo.dataset.original}" está em uso (${usos.join(' e ')}). Troque nesses cadastros antes de remover.`);
          return;
        }
        const ok = await S.confirmar({
          titulo: 'Remover da lista?',
          texto: `"${campo.dataset.original}" sai da lista de ${def.titulo.toLowerCase()}.`,
          confirmar: 'Remover',
          perigo: true,
        });
        if (!ok) return;
        await S.banco.excluir(tipo, id);
        S.avisar('Item removido.');
        S.navegar();
      });
    });
  }

  // ---------- Cadastro de EPI ----------

  async function htmlEpis() {
    const epis = await S.banco.listar('episCatalogo');
    epis.sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
    return `<section class="cartao">
      <h2>Novo EPI</h2>
      <form id="form-epi" novalidate>
        <div class="campo"><label for="epi-descricao">Descrição <span class="obrigatorio">*</span></label>
          <input type="text" id="epi-descricao" maxlength="${S.LIMITES.epiDescricao}" /></div>
        <div class="grade-filtros">
          <div class="campo"><label for="epi-ca">C.A. (Certificado de Aprovação) <span class="obrigatorio">*</span></label>
            <input type="text" id="epi-ca" maxlength="${S.LIMITES.ca}" autocapitalize="characters" />
            <span class="dica">Sem número de C.A.? Escreva NA.</span></div>
          <div class="campo"><label for="epi-dias">Dias de validade</label>
            <input type="number" id="epi-dias" min="0" step="1" />
            <span class="dica">Tempo que o funcionário pode ficar com o mesmo EPI. Em branco = sem prazo.</span></div>
        </div>
        <div class="grupo-botoes"><button type="submit" class="botao primario">Adicionar EPI</button></div>
      </form>
    </section>
    <section class="cartao">
      <h2>EPIs cadastrados (${epis.length})</h2>
      <div class="campo"><label for="busca-epi">Buscar</label><input type="search" id="busca-epi" placeholder="Descrição ou C.A." /></div>
      <div class="tabela-rolagem"><table class="tabela editavel">
        <thead><tr><th scope="col">Descrição</th><th scope="col">C.A.</th><th scope="col">Validade (dias)</th><th scope="col"><span class="sr">Ações</span></th></tr></thead>
        <tbody id="corpo-epis">${
          epis.length
            ? epis
                .map(
                  (x) => `<tr data-id="${x.id}" data-busca="${S.esc(S.normalizar(`${x.descricao} ${x.ca}`))}">
                    <td><input type="text" data-campo="descricao" maxlength="${S.LIMITES.epiDescricao}" value="${S.esc(x.descricao)}" aria-label="Descrição" /></td>
                    <td style="width:110px"><input type="text" data-campo="ca" maxlength="${S.LIMITES.ca}" value="${S.esc(x.ca)}" aria-label="C.A." /></td>
                    <td style="width:120px"><input type="number" data-campo="dias" min="0" step="1" value="${S.esc(x.diasValidade ?? '')}" aria-label="Dias de validade" /></td>
                    <td style="white-space:nowrap"><button type="button" class="botao texto" data-salvar>Salvar</button>
                      <button type="button" class="botao texto perigo-texto" data-remover>Remover</button></td>
                  </tr>`
                )
                .join('')
            : '<tr><td colspan="4">Nenhum EPI cadastrado.</td></tr>'
        }</tbody></table></div>
      <p class="dica" style="margin-top:8px">Remover um EPI não mexe nas entregas já registradas: elas guardam a descrição, o C.A. e a validade da época.</p>
    </section>`;
  }

  // Confere e monta o EPI. Devolve { dados } ou { erro }.
  async function montarEpi({ id = null, descricao, ca, dias }) {
    const d = String(descricao ?? '').trim();
    const c = S.normalizarCa(ca);
    if (!d || !c) return { erro: `Preencha: ${[!d && 'Descrição', !c && 'C.A. (escreva NA se o EPI não tiver número)'].filter(Boolean).join(', ')}.` };
    let diasValidade = null;
    if (String(dias ?? '').trim() !== '') {
      diasValidade = Number(dias);
      if (!Number.isInteger(diasValidade) || diasValidade < 0) return { erro: 'Os dias de validade precisam ser um número inteiro, 0 ou mais.' };
    }
    const todos = await S.banco.listar('episCatalogo');
    if (todos.some((x) => x.id !== id && S.normalizar(x.descricao) === S.normalizar(d))) return { erro: 'Esse EPI já existe no cadastro.' };
    return { dados: { descricao: d, ca: c, diasValidade } };
  }

  function ligarEpis(raiz) {
    raiz.querySelector('#form-epi').addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await montarEpi({
        descricao: raiz.querySelector('#epi-descricao').value,
        ca: raiz.querySelector('#epi-ca').value,
        dias: raiz.querySelector('#epi-dias').value,
      });
      if (r.erro) return S.informar('Confira os dados', r.erro);
      await S.banco.salvar('episCatalogo', r.dados);
      S.avisar('EPI cadastrado.');
      S.navegar();
    });
    raiz.querySelector('#busca-epi').addEventListener('input', (e) => {
      const termo = S.normalizar(e.target.value);
      raiz.querySelectorAll('#corpo-epis tr[data-id]').forEach((tr) => {
        tr.hidden = !!termo && !tr.dataset.busca.includes(termo);
      });
    });
    raiz.querySelectorAll('#corpo-epis tr[data-id]').forEach((tr) => {
      const id = Number(tr.dataset.id);
      const valor = (campo) => tr.querySelector(`[data-campo="${campo}"]`).value;
      tr.querySelector('[data-salvar]').addEventListener('click', async () => {
        const r = await montarEpi({ id, descricao: valor('descricao'), ca: valor('ca'), dias: valor('dias') });
        if (r.erro) return S.informar('Confira os dados', r.erro);
        await S.banco.salvar('episCatalogo', { id, ...r.dados });
        S.avisar('EPI salvo.');
        S.navegar();
      });
      tr.querySelector('[data-remover]').addEventListener('click', async () => {
        const ok = await S.confirmar({
          titulo: 'Remover EPI do cadastro?',
          texto: `${valor('descricao')}\n\nEle deixa de aparecer para novas entregas. As entregas já registradas não mudam.`,
          confirmar: 'Remover',
          perigo: true,
        });
        if (!ok) return;
        await S.banco.excluir('episCatalogo', id);
        S.avisar('EPI removido do cadastro.');
        S.navegar();
      });
    });
  }

  // ---------- Dados: importação do sistema, cópia de segurança e exemplos ----------

  function htmlDados(cfg) {
    return `<section class="cartao">
      <h2>Importar do sistema (CSV)</h2>
      <p class="dica">Traga as listas exportadas do sistema da empresa em arquivo CSV, sem digitar. O que já está cadastrado não se repete, e nada é apagado.</p>
      <div class="campo"><label for="tipo-importacao">O que importar</label>
        <select id="tipo-importacao">${Object.entries(S.TIPOS_IMPORTACAO)
          .map(([k, t]) => `<option value="${k}">${S.esc(t.titulo)}</option>`)
          .join('')}</select></div>
      <p class="dica" id="colunas-importacao">${S.esc(S.TIPOS_IMPORTACAO.epis.colunas)}</p>
      <button type="button" class="botao primario" id="importar-csv">Escolher arquivo CSV</button>
      <input type="file" id="arquivo-csv" class="arquivo-escondido" accept=".csv,text/csv,text/plain" tabindex="-1" aria-hidden="true" />
    </section>
    <section class="cartao">
      <h2>Cópia de segurança</h2>
      <p class="dica">Os dados ficam só neste navegador. Se o navegador for limpo ou o aparelho for perdido, eles se perdem: baixe a cópia com frequência e guarde em lugar seguro (por exemplo, na pasta do setor na rede).</p>
      <p>Última cópia baixada: <strong>${cfg.ultimaCopia ? S.dataBR(cfg.ultimaCopia) : 'nenhuma'}</strong></p>
      <div class="grupo-botoes">
        <button type="button" class="botao primario" id="baixar-copia">Baixar cópia de segurança</button>
        <button type="button" class="botao secundario" id="restaurar-copia">Restaurar uma cópia</button>
        <input type="file" id="arquivo-copia" class="arquivo-escondido" accept="application/json,.json" tabindex="-1" aria-hidden="true" />
      </div>
    </section>
    <section class="cartao">
      <h2>Dados de exemplo</h2>
      <p class="dica">Funcionários, EPIs, extintores e listas fictícios, para conhecer o app.</p>
      <button type="button" class="botao secundario" id="exemplos">Carregar dados de exemplo</button>
    </section>
    <section class="cartao">
      <h2>Apagar todos os dados</h2>
      <p class="dica">Apaga fichas, entregas, extintores, listas e configurações deste navegador. Não dá para desfazer.</p>
      <button type="button" class="botao perigo" id="apagar-tudo">Apagar todos os dados</button>
    </section>`;
  }

  function ligarDados(raiz) {
    const tipoImportacao = raiz.querySelector('#tipo-importacao');
    tipoImportacao.addEventListener('change', () => {
      raiz.querySelector('#colunas-importacao').textContent = S.TIPOS_IMPORTACAO[tipoImportacao.value].colunas;
    });
    const arquivoCsv = raiz.querySelector('#arquivo-csv');
    raiz.querySelector('#importar-csv').addEventListener('click', () => arquivoCsv.click());
    arquivoCsv.addEventListener('change', async () => {
      const escolhido = arquivoCsv.files[0];
      arquivoCsv.value = '';
      if (escolhido) await S.importarArquivo(tipoImportacao.value, escolhido);
    });
    raiz.querySelector('#baixar-copia').addEventListener('click', async () => {
      const copia = await S.banco.exportarTudo();
      const hoje = S.hojeISO();
      S.baixarArquivo(`sesmt-web-copia-${hoje}.json`, JSON.stringify(copia));
      await S.banco.salvarConfig('ultimaCopia', hoje);
      S.avisar('Cópia de segurança baixada.');
      S.navegar();
    });
    const arquivo = raiz.querySelector('#arquivo-copia');
    raiz.querySelector('#restaurar-copia').addEventListener('click', () => arquivo.click());
    arquivo.addEventListener('change', async () => {
      const escolhido = arquivo.files[0];
      arquivo.value = '';
      if (!escolhido) return;
      let copia;
      try {
        copia = JSON.parse(await escolhido.text());
        S.banco.conferirCopia(copia);
      } catch (erro) {
        await S.informar('Cópia inválida', erro instanceof SyntaxError ? 'O arquivo não é uma cópia de segurança do SESMT Web.' : erro.message);
        return;
      }
      const d = copia.dados;
      const ok = await S.confirmar({
        titulo: 'Restaurar esta cópia?',
        texto: `Cópia de ${S.dataBR(String(copia.exportadoEm).slice(0, 10))}: ${S.plural((d.funcionarios || []).length, 'funcionário', 'funcionários')}, ${S.plural(
          (d.registrosEpi || []).length,
          'entrega',
          'entregas'
        )} e ${S.plural((d.extintores || []).length, 'extintor', 'extintores')}.\n\nTodos os dados atuais deste navegador serão trocados pelos da cópia. Não dá para desfazer.`,
        confirmar: 'Restaurar',
        perigo: true,
      });
      if (!ok) return;
      await S.banco.importarTudo(copia);
      S.avisar('Cópia restaurada.');
      S.ir('/');
    });
    raiz.querySelector('#exemplos').addEventListener('click', async () => {
      const temDados = (await S.banco.contar('funcionarios')) + (await S.banco.contar('extintores')) > 0;
      if (temDados) {
        const ok = await S.confirmar({
          titulo: 'Trocar pelos exemplos?',
          texto: 'As fichas, entregas, extintores, listas e EPIs atuais serão apagados e trocados pelos dados de exemplo. O usuário e o e-mail continuam. Não dá para desfazer.',
          confirmar: 'Trocar pelos exemplos',
          perigo: true,
        });
        if (!ok) return;
      }
      await S.carregarExemplos();
      S.avisar('Dados de exemplo carregados.');
      S.ir('/');
    });
    raiz.querySelector('#apagar-tudo').addEventListener('click', async () => {
      const ok = await S.confirmar({
        titulo: 'Apagar todos os dados?',
        texto: 'Fichas, entregas (com assinaturas e fotos), extintores, listas e configurações serão apagados deste navegador. Baixe antes a cópia de segurança, se precisar. Não dá para desfazer.',
        confirmar: 'Apagar tudo',
        perigo: true,
      });
      if (!ok) return;
      await S.banco.apagarTudo();
      S.avisar('Dados apagados.');
      S.ir('/primeiro-acesso');
    });
  }

  S.registrarTela('/configuracoes', telaConfiguracoes);
  S.registrarTela('/configuracoes/:secao', telaConfiguracoes);
  S.registrarTela('/configuracoes/:secao/:lista', telaConfiguracoes);

  Object.assign(S, { carregarListas, opcoesHtml, TIPOS_LISTA, montarEpi });
})(window.SESMT);
