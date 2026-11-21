/* SESMT Web — Controle de Extintores: lista com filtros e situação dos prazos, cadastro, fotos e exclusão. */
'use strict';
window.SESMT = window.SESMT || {};

(function (S) {
  const filtros = { filialId: '', situacao: '', texto: '' };

  const NOMES_SITUACAO = {
    vencido: 'Vencidos',
    'vence-este-mes': 'Vencem este mês',
    'a-vencer': 'A vencer',
    'em-dia': 'Em dia',
  };

  function textoLocal(e) {
    return [e.frenteSetor, e.localInstalacao].filter(Boolean).join(' — ') || 'Local não informado';
  }

  // ---------- Lista ----------

  async function telaLista({ token }) {
    const [extintores, listas] = await Promise.all([S.banco.listar('extintores'), S.carregarListas()]);
    const mesAtual = S.mesAtualISO();
    const comSituacao = extintores.map((e) => ({ ...e, situacao: S.situacaoExtintor(e, mesAtual) }));
    comSituacao.sort(
      (a, b) =>
        S.ORDEM_SITUACAO[a.situacao.codigo] - S.ORDEM_SITUACAO[b.situacao.codigo] ||
        (S.proximaRecarga(a.recarga) || '').localeCompare(S.proximaRecarga(b.recarga) || '') ||
        a.identificacao.localeCompare(b.identificacao, 'pt-BR')
    );

    const raiz = S.pintar(token, {
      titulo: 'Controle de Extintores',
      voltar: '/',
      html: `
        <section class="cartao" aria-labelledby="titulo-filtros-ext">
          <h2 id="titulo-filtros-ext">Filtrar</h2>
          <div class="grade-filtros tres">
            <div class="campo"><label for="x-filial">Filial</label>
              <select id="x-filial">${S.opcoesHtml(listas.filiais, filtros.filialId, 'Todas')}</select></div>
            <div class="campo"><label for="x-situacao">Situação</label>
              <select id="x-situacao"><option value="">Todas</option>${Object.entries(NOMES_SITUACAO)
                .map(([c, n]) => `<option value="${c}" ${filtros.situacao === c ? 'selected' : ''}>${n}</option>`)
                .join('')}</select></div>
            <div class="campo"><label for="x-texto">Identificação ou local</label>
              <input type="search" id="x-texto" placeholder="Buscar" value="${S.esc(filtros.texto)}" /></div>
          </div>
        </section>
        <div class="situacao-geral" id="resumo" aria-live="polite"></div>
        <div class="secao-titulo">
          <p class="texto-suave" id="contagem-ext"></p>
          <a class="botao primario" href="#/extintor/novo">${S.icone('mais')}Novo extintor</a>
        </div>
        <ul class="lista-itens" id="lista-ext"></ul>`,
    });
    if (!raiz) return;

    function mostrar() {
      const achados = comSituacao.filter(
        (e) =>
          (!filtros.filialId || String(e.filialId) === filtros.filialId) &&
          (!filtros.situacao || e.situacao.codigo === filtros.situacao) &&
          (S.contem(e.identificacao, filtros.texto) || S.contem(textoLocal(e), filtros.texto))
      );
      const contagem = {};
      achados.forEach((e) => {
        contagem[e.situacao.codigo] = (contagem[e.situacao.codigo] || 0) + 1;
      });
      // A situação de todos numa barra só, dividida pela quantidade de cada situação, com a legenda embaixo.
      const presentes = Object.keys(NOMES_SITUACAO).filter((c) => contagem[c]);
      raiz.querySelector('#resumo').innerHTML = presentes.length
        ? `<div class="barra-situacao" role="img" aria-label="${presentes.map((c) => `${NOMES_SITUACAO[c]}: ${contagem[c]}`).join(', ')}">${presentes
            .map((c) => `<span class="faixa ${c}" style="flex-grow:${contagem[c]}"></span>`)
            .join('')}</div>
           <div class="legenda-situacao">${presentes.map((c) => `<span class="chip ${c}">${NOMES_SITUACAO[c]}: ${contagem[c]}</span>`).join('')}</div>`
        : '';
      raiz.querySelector('#contagem-ext').textContent =
        extintores.length === 0 ? 'Nenhum extintor cadastrado.' : `${achados.length} de ${S.plural(extintores.length, 'extintor', 'extintores')}`;
      raiz.querySelector('#lista-ext').innerHTML = achados.length
        ? achados
            .map(
              (e) => `<li><a class="item" href="#/extintor/${e.id}">
                <span class="item-topo"><span class="item-titulo">${S.esc(e.identificacao)}</span>
                  <span class="chip ${e.situacao.codigo}">${S.esc(e.situacao.codigo === 'em-dia' ? 'Em dia' : `${e.situacao.prazo}: ${e.situacao.texto}`)}</span></span>
                <span class="item-detalhe" style="display:block">${S.esc(listas.agentesPorId.get(e.agenteId)?.nome || 'Agente não informado')} · ${S.esc(
                  listas.filiaisPorId.get(e.filialId)?.nome || 'Sem filial'
                )}</span>
                <span class="item-detalhe" style="display:block">${S.esc(textoLocal(e))}</span>
                <span class="item-detalhe" style="display:block">Recarga ${S.mesAnoBR(e.recarga)} · Próxima recarga ${S.selo(S.mesAnoBR(S.proximaRecarga(e.recarga)))}${
                  e.testeHidrostatico ? ` · Teste hidrostático ${S.selo(S.mesAnoBR(e.testeHidrostatico))}` : ''
                }</span>
              </a></li>`
            )
            .join('')
        : `<li class="vazio">${extintores.length ? 'Nenhum extintor com esses filtros.' : 'Cadastre o primeiro extintor ou carregue os dados de exemplo no menu inicial.'}</li>`;
    }

    [
      ['#x-filial', 'filialId'],
      ['#x-situacao', 'situacao'],
      ['#x-texto', 'texto'],
    ].forEach(([id, chave]) => {
      const campo = raiz.querySelector(id);
      campo.addEventListener('input', () => {
        filtros[chave] = campo.value;
        mostrar();
      });
    });
    mostrar();
  }

  // ---------- Cadastro / detalhes ----------

  async function telaExtintor({ params, token }) {
    const novo = params.id === 'novo';
    const id = novo ? null : Number(params.id);
    const [extintor, listas] = await Promise.all([novo ? null : S.banco.obter('extintores', id), S.carregarListas()]);
    if (!novo && !extintor) {
      S.pintar(token, { titulo: 'Extintor', voltar: '/extintores', html: '<div class="vazio">Extintor não encontrado.</div>' });
      return;
    }
    const mesAtual = S.mesAtualISO();
    const e = extintor || {
      identificacao: '',
      agenteId: null,
      filialId: null,
      frenteSetor: '',
      localInstalacao: '',
      recarga: '',
      testeHidrostatico: '',
      antecedenciaMeses: 1,
      fotoExtintor: null,
      fotoLocal: null,
      observacao: '',
    };
    const fotos = { fotoExtintor: e.fotoExtintor || null, fotoLocal: e.fotoLocal || null };
    const situacao = novo ? null : S.situacaoExtintor(e, mesAtual);

    const campoFoto = (chave, titulo) => `
      <div class="campo"><span class="rotulo">${titulo}</span>
        <div id="previa-${chave}"></div>
        <div class="grupo-botoes">
          <button type="button" class="botao secundario" data-foto="${chave}">Escolher ou tirar foto</button>
          <button type="button" class="botao texto perigo-texto" data-remover="${chave}">Remover foto</button>
          <input type="file" class="arquivo-escondido" id="arquivo-${chave}" accept="image/*" capture="environment" tabindex="-1" aria-hidden="true" />
        </div></div>`;

    const raiz = S.pintar(token, {
      titulo: novo ? 'Novo extintor' : 'Extintor',
      voltar: '/extintores',
      html: `
        ${
          situacao
            ? `<div class="resumo-situacao">${situacao.prazos
                .map((p) => `<span class="chip ${p.codigo}">${S.esc(p.prazo)} ${S.selo(S.mesAnoBR(p.mes))} · ${S.esc(p.texto)}</span>`)
                .join('')}</div>`
            : ''
        }
        <form class="cartao" id="form-extintor" novalidate>
          <div class="campo"><label for="identificacao">Identificação <span class="obrigatorio">*</span></label>
            <input type="text" id="identificacao" maxlength="${S.LIMITES.extintorTexto}" value="${S.esc(e.identificacao)}" placeholder="Ex.: Extintor CO2" />
            <span class="dica">O nome pode repetir: o local diferencia um extintor do outro.</span></div>
          <div class="grade-filtros">
            <div class="campo"><label for="agente">Agente extintor <span class="obrigatorio">*</span></label>
              <select id="agente">${S.opcoesHtml(listas.agentes, e.agenteId, '(escolha)')}</select>
              <span class="dica" id="dica-agente"></span></div>
            <div class="campo"><label for="filial">Filial <span class="obrigatorio">*</span></label>
              <select id="filial">${S.opcoesHtml(listas.filiais, e.filialId, '(escolha)')}</select></div>
            <div class="campo"><label for="frente">Frente/Setor</label>
              <input type="text" id="frente" maxlength="${S.LIMITES.extintorTexto}" value="${S.esc(e.frenteSetor)}" /></div>
            <div class="campo"><label for="local">Local de instalação</label>
              <input type="text" id="local" maxlength="${S.LIMITES.extintorTexto}" value="${S.esc(e.localInstalacao)}" /></div>
            <div class="campo"><label for="recarga">Data da recarga (mês/ano) <span class="obrigatorio">*</span></label>
              <input type="month" id="recarga" min="${S.MES_MINIMO}" max="${mesAtual}" value="${S.esc(e.recarga)}" /></div>
            <div class="campo"><label for="proxima">Próxima recarga</label>
              <input type="text" id="proxima" readonly value="" />
              <span class="dica">Calculada: 1 ano depois da recarga.</span></div>
            <div class="campo"><label for="teste">Teste hidrostático (mês/ano)</label>
              <input type="month" id="teste" value="${S.esc(e.testeHidrostatico || '')}" />
              <span class="dica">Entre a recarga e 5 anos depois dela.</span></div>
            <div class="campo"><label for="antecedencia">Avisar com antecedência de (meses)</label>
              <input type="number" id="antecedencia" min="0" max="12" step="1" value="${S.esc(e.antecedenciaMeses ?? 1)}" />
              <span class="dica">0 = avisa só no mês do vencimento.</span></div>
          </div>
          ${campoFoto('fotoExtintor', 'Foto do extintor')}
          ${campoFoto('fotoLocal', 'Foto do local')}
          <div class="campo"><label for="observacao">Observação</label>
            <textarea id="observacao" maxlength="${S.LIMITES.observacao}" placeholder="Anomalias da inspeção visual, troca, retirada…">${S.esc(e.observacao || '')}</textarea></div>
          <div class="grupo-botoes fim">
            <a class="botao secundario" href="#/extintores">Cancelar</a>
            <button type="submit" class="botao primario">Salvar</button>
          </div>
        </form>
        ${
          novo
            ? ''
            : `<section class="cartao nao-imprimir">
                <h2>Excluir extintor</h2>
                <p class="dica">Apaga o extintor e as fotos dele deste aparelho. Não dá para desfazer.</p>
                <button type="button" class="botao perigo" id="excluir">Excluir extintor</button>
              </section>`
        }`,
    });
    if (!raiz) return;

    const campoRecarga = raiz.querySelector('#recarga');
    const campoTeste = raiz.querySelector('#teste');
    const campoAgente = raiz.querySelector('#agente');

    function atualizarDatas() {
      const recarga = campoRecarga.value;
      raiz.querySelector('#proxima').value = S.mesValido(recarga) ? S.mesAnoBR(S.proximaRecarga(recarga)) : '';
      if (S.mesValido(recarga)) {
        campoTeste.min = recarga;
        campoTeste.max = S.limiteTesteHidrostatico(recarga);
      } else {
        campoTeste.removeAttribute('min');
        campoTeste.removeAttribute('max');
      }
    }
    function atualizarAgente() {
      const agente = listas.agentesPorId.get(Number(campoAgente.value));
      raiz.querySelector('#dica-agente').textContent = agente?.acao || '';
    }
    function mostrarFoto(chave) {
      const dado = fotos[chave];
      raiz.querySelector(`#previa-${chave}`).innerHTML = dado
        ? `<img class="foto-previa" src="${S.esc(dado)}" alt="${chave === 'fotoExtintor' ? 'Foto do extintor' : 'Foto do local'}" />`
        : '<p class="dica">Sem foto.</p>';
      raiz.querySelector(`[data-remover="${chave}"]`).hidden = !dado;
    }

    campoRecarga.addEventListener('input', atualizarDatas);
    campoAgente.addEventListener('change', atualizarAgente);
    ['fotoExtintor', 'fotoLocal'].forEach((chave) => {
      const arquivo = raiz.querySelector(`#arquivo-${chave}`);
      raiz.querySelector(`[data-foto="${chave}"]`).addEventListener('click', () => arquivo.click());
      arquivo.addEventListener('change', async () => {
        const escolhido = arquivo.files[0];
        arquivo.value = '';
        if (!escolhido) return;
        try {
          fotos[chave] = await S.lerImagemReduzida(escolhido, 1000, 0.75);
          mostrarFoto(chave);
        } catch (erro) {
          S.informar('Foto', erro.message);
        }
      });
      raiz.querySelector(`[data-remover="${chave}"]`).addEventListener('click', () => {
        fotos[chave] = null;
        mostrarFoto(chave);
      });
      mostrarFoto(chave);
    });

    raiz.querySelector('#form-extintor').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const dados = {
        ...(extintor || { criadoEm: new Date().toISOString() }),
        identificacao: raiz.querySelector('#identificacao').value.trim(),
        agenteId: Number(campoAgente.value) || null,
        filialId: Number(raiz.querySelector('#filial').value) || null,
        frenteSetor: raiz.querySelector('#frente').value.trim(),
        localInstalacao: raiz.querySelector('#local').value.trim(),
        recarga: campoRecarga.value,
        testeHidrostatico: campoTeste.value || '',
        antecedenciaMeses: Number(raiz.querySelector('#antecedencia').value === '' ? NaN : raiz.querySelector('#antecedencia').value),
        fotoExtintor: fotos.fotoExtintor,
        fotoLocal: fotos.fotoLocal,
        observacao: raiz.querySelector('#observacao').value.trim(),
        atualizadoEm: new Date().toISOString(),
      };
      if (id) dados.id = id;
      const { faltando, erros } = S.validarExtintor(dados, mesAtual);
      if (faltando.length) return S.informar('Campos obrigatórios', `Preencha: ${faltando.join(', ')}.`);
      if (erros.length) return S.informar('Confira os dados', erros.join('\n'));
      await S.banco.salvar('extintores', dados);
      S.avisar('Extintor salvo.');
      S.ir('/extintores');
    });

    const botaoExcluir = raiz.querySelector('#excluir');
    if (botaoExcluir) {
      botaoExcluir.addEventListener('click', async () => {
        const ok = await S.confirmar({
          titulo: 'Excluir extintor?',
          texto: `${e.identificacao} — ${textoLocal(e)}.\n\nO extintor e as fotos dele serão apagados. Se ele só foi trocado ou retirado, o SESMT pediu para anotar em Observação e atualizar o cadastro. Não dá para desfazer.`,
          confirmar: 'Excluir',
          perigo: true,
        });
        if (!ok) return;
        await S.banco.excluir('extintores', id);
        S.avisar('Extintor excluído.');
        S.ir('/extintores');
      });
    }

    atualizarDatas();
    atualizarAgente();
  }

  S.registrarTela('/extintores', telaLista);
  S.registrarTela('/extintor/:id', telaExtintor);

  Object.assign(S, { textoLocalExtintor: textoLocal, NOMES_SITUACAO });
})(window.SESMT);
