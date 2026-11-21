/* SESMT Web — Avisos (extintores e EPIs que pedem atenção, e-mail de aviso e notificação do navegador) e Relatórios. */
'use strict';
window.SESMT = window.SESMT || {};

(function (S) {
  // ---------- Cálculo dos avisos ----------

  async function calcularAvisos() {
    const [extintores, registros, funcionarios, antecedencia] = await Promise.all([
      S.banco.listar('extintores'),
      S.banco.listar('registrosEpi'),
      S.banco.listar('funcionarios'),
      S.antecedenciaEpi(),
    ]);
    const mesAtual = S.mesAtualISO();
    const hoje = S.hojeISO();
    const funcionariosPorId = new Map(funcionarios.map((f) => [f.id, f]));

    const ext = extintores
      .map((e) => {
        const sit = S.situacaoExtintor(e, mesAtual);
        const pedem = sit.prazos.filter((p) => p.codigo === 'vencido' || p.codigo === 'vence-este-mes' || p.codigo === 'a-vencer');
        return { extintor: e, situacao: sit, prazos: pedem };
      })
      .filter((x) => x.prazos.length > 0)
      .sort((a, b) => S.ORDEM_SITUACAO[a.situacao.codigo] - S.ORDEM_SITUACAO[b.situacao.codigo] || (a.situacao.mes || '').localeCompare(b.situacao.mes || ''));

    const epis = registros
      .map((r) => ({ registro: r, funcionario: funcionariosPorId.get(r.funcionarioId), situacao: S.situacaoEpi(r, hoje, antecedencia) }))
      .filter((x) => x.funcionario && (x.situacao.codigo === 'vencido' || x.situacao.codigo === 'a-vencer'))
      .sort((a, b) => (a.situacao.vence || '').localeCompare(b.situacao.vence || ''));

    return { extintores: ext, epis, antecedencia };
  }

  // Texto dos avisos para o e-mail.
  function textoAvisos(avisos, listas) {
    const linhas = [];
    linhas.push('Avisos do SESMT Web — ' + S.dataBR(S.hojeISO()));
    linhas.push('');
    linhas.push(`EXTINTORES (${avisos.extintores.length})`);
    avisos.extintores.forEach(({ extintor: e, prazos }) => {
      const filial = listas.filiaisPorId.get(e.filialId)?.nome || 'Sem filial';
      prazos.forEach((p) => linhas.push(`- ${e.identificacao} | ${filial} | ${S.textoLocalExtintor(e)} | ${p.prazo} ${S.mesAnoBR(p.mes)}: ${p.texto}`));
    });
    linhas.push('');
    linhas.push(`EPIs (${avisos.epis.length})`);
    avisos.epis.forEach(({ registro: r, funcionario: f, situacao }) =>
      linhas.push(`- ${f.nome}${f.matricula ? ` (${f.matricula})` : ''} | ${r.descricao} | entregue em ${S.dataBR(r.dataEntrega)} | ${situacao.texto}`)
    );
    linhas.push('');
    linhas.push('Os avisos ajudam a lembrar os prazos, mas não substituem os controles oficiais do SESMT.');
    return linhas.join('\n');
  }

  // Monta o link mailto (abre o aplicativo de e-mail com o aviso pronto). Listas grandes são cortadas: alguns
  // aplicativos de e-mail não abrem endereços muito longos.
  function linkEmail(email, texto) {
    const LIMITE = 1800;
    let corpo = texto;
    if (corpo.length > LIMITE) corpo = corpo.slice(0, LIMITE) + '\n…\n(lista cortada: veja todos os avisos no app)';
    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Avisos do SESMT Web — ' + S.dataBR(S.hojeISO()))}&body=${encodeURIComponent(corpo)}`;
  }

  // Notificação do navegador: aparece uma vez por dia, ao abrir o app, se houver avisos e se o usuário permitiu.
  async function notificarAvisosDoDia() {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      await S.banco.abrir();
      if (!(await S.banco.obterConfig('usuario'))) return;
      const hoje = S.hojeISO();
      let ultima = null;
      try {
        ultima = localStorage.getItem('sesmt-ultima-notificacao');
      } catch (e) {
        /* armazenamento indisponível: notifica mesmo assim */
      }
      if (ultima === hoje) return;
      const avisos = await calcularAvisos();
      const total = avisos.extintores.length + avisos.epis.length;
      if (!total) return;
      new Notification('SESMT Web', {
        body: `${S.plural(avisos.extintores.length, 'extintor', 'extintores')} e ${S.plural(avisos.epis.length, 'EPI', 'EPIs')} pedem atenção.`,
      });
      try {
        localStorage.setItem('sesmt-ultima-notificacao', hoje);
      } catch (e) {
        /* sem problema */
      }
    } catch (erro) {
      console.warn('Notificação não enviada:', erro);
    }
  }

  // ---------- Tela de avisos ----------

  async function telaAvisos({ token }) {
    const [avisos, listas, email] = await Promise.all([calcularAvisos(), S.carregarListas(), S.banco.obterConfig('email', '')]);
    const suporteNotificacao = 'Notification' in window;
    const permissao = suporteNotificacao ? Notification.permission : 'indisponivel';

    // EPIs agrupados por funcionário.
    const porFuncionario = new Map();
    avisos.epis.forEach((x) => {
      if (!porFuncionario.has(x.funcionario.id)) porFuncionario.set(x.funcionario.id, { funcionario: x.funcionario, itens: [] });
      porFuncionario.get(x.funcionario.id).itens.push(x);
    });

    const raiz = S.pintar(token, {
      titulo: 'Avisos',
      voltar: '/',
      html: `
        <div class="aviso-caixa info">Os avisos ajudam a lembrar os prazos, mas não substituem os controles oficiais do SESMT.</div>
        <section class="cartao" aria-labelledby="t-av-ext">
          <h2 id="t-av-ext">Extintores (${avisos.extintores.length})</h2>
          ${
            avisos.extintores.length
              ? `<ul class="lista-itens">${avisos.extintores
                  .map(
                    ({ extintor: e, prazos }) => `<li><a class="item" href="#/extintor/${e.id}">
                      <span class="item-titulo">${S.esc(e.identificacao)}</span>
                      <span class="item-detalhe" style="display:block">${S.esc(listas.filiaisPorId.get(e.filialId)?.nome || 'Sem filial')} · ${S.esc(S.textoLocalExtintor(e))}</span>
                      <span class="resumo-situacao" style="margin:6px 0 0">${prazos
                        .map((p) => `<span class="chip ${p.codigo}">${S.esc(p.prazo)} ${S.selo(S.mesAnoBR(p.mes))} · ${S.esc(p.texto)}</span>`)
                        .join('')}</span></a></li>`
                  )
                  .join('')}</ul>`
              : '<div class="vazio">Nenhum extintor vencido ou a vencer.</div>'
          }
          <p class="dica" style="margin-top:8px">Cada extintor avisa com a antecedência definida no cadastro dele (em meses).</p>
        </section>
        <section class="cartao" aria-labelledby="t-av-epi">
          <h2 id="t-av-epi">EPIs vencidos ou a vencer (${avisos.epis.length})</h2>
          ${
            porFuncionario.size
              ? [...porFuncionario.values()]
                  .map(
                    ({ funcionario: f, itens }) => `<h3 style="margin-top:12px">${S.esc(f.nome)}${f.matricula ? ` <span class="texto-suave pequeno">(${S.esc(f.matricula)})</span>` : ''}</h3>
                    <ul class="lista-itens">${itens
                      .map(
                        ({ registro: r, situacao }) => `<li><a class="item" href="#/funcionario/${f.id}/entrega/${r.id}">
                          <span class="item-topo"><span class="item-titulo">${S.esc(r.descricao)}</span><span class="chip ${situacao.codigo}">${S.comSelo(S.esc(situacao.texto))}</span></span>
                          <span class="item-detalhe" style="display:block">Entregue em ${S.dataBR(r.dataEntrega)} · validade de ${S.plural(Number(r.diasValidade), 'dia', 'dias')}</span></a></li>`
                      )
                      .join('')}</ul>`
                  )
                  .join('')
              : '<div class="vazio">Nenhum EPI vencido ou a vencer.</div>'
          }
          <p class="dica" style="margin-top:8px">Vencimento = data de entrega + dias de validade do EPI. Entram os vencidos e os que vencem nos próximos ${S.plural(
            avisos.antecedencia,
            'dia',
            'dias'
          )}. EPI sem prazo informado ou já devolvido não entra.</p>
        </section>
        <section class="cartao nao-imprimir" aria-labelledby="t-av-enviar">
          <h2 id="t-av-enviar">Enviar aviso</h2>
          <div class="grupo-botoes">
            <button type="button" class="botao primario" id="enviar-email">Enviar aviso por e-mail</button>
            <button type="button" class="botao secundario" id="ativar-notificacao" ${!suporteNotificacao || permissao === 'granted' ? 'disabled' : ''}>${
              permissao === 'granted' ? 'Notificações ativadas' : 'Ativar notificações do navegador'
            }</button>
          </div>
          <p class="dica">O e-mail abre no seu aplicativo de e-mail, já preenchido${email ? ` para ${S.esc(email)}` : ''}; é só enviar.
          A notificação aparece quando o app é aberto, uma vez por dia. Com o navegador fechado não há aviso: isso exigiria um servidor.</p>
          ${!suporteNotificacao ? '<p class="dica">Este navegador não oferece notificações.</p>' : ''}
          ${permissao === 'denied' ? '<p class="dica">As notificações estão bloqueadas nas configurações do navegador.</p>' : ''}
        </section>`,
    });
    if (!raiz) return;

    raiz.querySelector('#enviar-email').addEventListener('click', async () => {
      if (!email) {
        const ir = await S.confirmar({
          titulo: 'E-mail não cadastrado',
          texto: 'Cadastre o e-mail do usuário em Configurações para enviar o aviso.',
          confirmar: 'Abrir Configurações',
        });
        if (ir) S.ir('/configuracoes');
        return;
      }
      if (avisos.extintores.length + avisos.epis.length === 0) {
        await S.informar('Nada para avisar', 'Não há extintor nem EPI vencido ou a vencer.');
        return;
      }
      window.location.href = linkEmail(email, textoAvisos(avisos, listas));
    });
    raiz.querySelector('#ativar-notificacao').addEventListener('click', async () => {
      const resposta = await Notification.requestPermission();
      if (resposta === 'granted') {
        new Notification('SESMT Web', { body: 'Notificações ativadas. Os avisos aparecem ao abrir o app.' });
        S.avisar('Notificações ativadas.');
      } else {
        S.avisar('O navegador não permitiu as notificações.', 'erro');
      }
      S.navegar();
    });
  }

  // ---------- Relatórios ----------

  const ordem = { coluna: 'situacao', direcao: 1 };

  function siglaAgente(nome) {
    const dentro = String(nome || '').match(/\(([^)]*)\)/);
    if (!dentro) return nome || '—';
    const partes = dentro[1].split(' - ');
    return partes[partes.length - 1].trim();
  }

  function linhasExtintores(extintores, listas, mesAtual) {
    return extintores.map((e) => {
      const sit = S.situacaoExtintor(e, mesAtual);
      return {
        id: e.id,
        identificacao: e.identificacao,
        agente: listas.agentesPorId.get(e.agenteId)?.nome || '',
        filial: listas.filiaisPorId.get(e.filialId)?.nome || '',
        frente: e.frenteSetor || '',
        local: e.localInstalacao || '',
        recarga: e.recarga || '',
        proxima: S.proximaRecarga(e.recarga) || '',
        teste: e.testeHidrostatico || '',
        situacao: sit,
      };
    });
  }

  const COLUNAS_EXT = [
    ['identificacao', 'Identificação'],
    ['agente', 'Agente extintor'],
    ['filial', 'Filial'],
    ['frente', 'Frente/Setor'],
    ['local', 'Local de instalação'],
    ['recarga', 'Recarga'],
    ['proxima', 'Próxima recarga'],
    ['teste', 'Teste hidrostático'],
    ['situacao', 'Situação'],
  ];

  function ordenarLinhas(linhas) {
    const { coluna, direcao } = ordem;
    return [...linhas].sort((a, b) => {
      const va = coluna === 'situacao' ? S.ORDEM_SITUACAO[a.situacao.codigo] : a[coluna];
      const vb = coluna === 'situacao' ? S.ORDEM_SITUACAO[b.situacao.codigo] : b[coluna];
      const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      return c * direcao || a.identificacao.localeCompare(b.identificacao, 'pt-BR');
    });
  }

  function textoSituacao(sit) {
    return sit.codigo === 'em-dia' ? 'Em dia' : `${sit.prazo}: ${sit.texto}`;
  }

  async function telaRelatorios({ params, token }) {
    const aba = params.aba || 'extintores';
    const [extintores, listas, registros, funcionarios, empresa] = await Promise.all([
      S.banco.listar('extintores'),
      S.carregarListas(),
      S.banco.listar('registrosEpi'),
      S.banco.listar('funcionarios'),
      S.banco.obterConfig('empresa', ''),
    ]);
    const mesAtual = S.mesAtualISO();
    const hoje = S.hojeISO();
    const cabecalhoImpressao = (titulo) =>
      `<p class="pequeno texto-suave">${S.esc(empresa || '')}${empresa ? ' · ' : ''}${titulo} · emitido em ${S.dataBR(hoje)}</p>`;

    let corpo = '';
    let csv = null;

    if (aba === 'extintores') {
      const linhas = ordenarLinhas(linhasExtintores(extintores, listas, mesAtual));
      corpo = `${cabecalhoImpressao('Relação de local e instalação de extintores')}
        <div class="tabela-rolagem"><table class="tabela" id="tabela-extintores">
          <thead><tr>${COLUNAS_EXT.map(
            ([c, n]) => `<th scope="col" aria-sort="${ordem.coluna === c ? (ordem.direcao === 1 ? 'ascending' : 'descending') : 'none'}">
              <button type="button" class="ordenar" data-coluna="${c}">${n}<span class="seta" aria-hidden="true">${ordem.coluna === c ? (ordem.direcao === 1 ? '▲' : '▼') : '↕'}</span></button></th>`
          ).join('')}</tr></thead>
          <tbody>${
            linhas.length
              ? linhas
                  .map(
                    (l) => `<tr><td>${S.esc(l.identificacao)}</td><td>${S.esc(l.agente)}</td><td>${S.esc(l.filial)}</td><td>${S.esc(l.frente)}</td><td>${S.esc(
                      l.local
                    )}</td><td>${S.mesAnoBR(l.recarga)}</td><td>${S.mesAnoBR(l.proxima)}</td><td>${S.mesAnoBR(l.teste)}</td>
                    <td><span class="chip ${l.situacao.codigo}">${S.esc(textoSituacao(l.situacao))}</span></td></tr>`
                  )
                  .join('')
              : `<tr><td colspan="${COLUNAS_EXT.length}">Nenhum extintor cadastrado.</td></tr>`
          }</tbody></table></div>
        <p class="dica nao-imprimir" style="margin-top:8px">Toque no título de uma coluna para ordenar.</p>`;
      csv = () => [
        'extintores.csv',
        S.montarCsv(
          COLUNAS_EXT.map(([, n]) => n),
          linhas.map((l) => [l.identificacao, l.agente, l.filial, l.frente, l.local, S.mesAnoBR(l.recarga), S.mesAnoBR(l.proxima), S.mesAnoBR(l.teste), textoSituacao(l.situacao)])
        ),
      ];
    } else if (aba === 'unidades') {
      const agentes = listas.agentes;
      const linhas = listas.filiais
        .map((filial) => {
          const daFilial = extintores.filter((e) => e.filialId === filial.id);
          const porAgente = agentes.map((a) => daFilial.filter((e) => e.agenteId === a.id).length);
          const vencidos = daFilial.filter((e) => S.situacaoExtintor(e, mesAtual).codigo === 'vencido').length;
          return { filial: filial.nome, total: daFilial.length, porAgente, vencidos };
        })
        .filter((l) => l.total > 0);
      const semFilial = extintores.filter((e) => !listas.filiaisPorId.has(e.filialId)).length;
      const totalGeral = linhas.reduce((s, l) => s + l.total, 0);
      corpo = `${cabecalhoImpressao('Quantidade de extintores por unidade')}
        <div class="tabela-rolagem"><table class="tabela">
          <thead><tr><th scope="col">Filial</th><th scope="col" class="numero">Total</th>${agentes
            .map((a) => `<th scope="col" class="numero" title="${S.esc(a.nome)}">${S.esc(siglaAgente(a.nome))}</th>`)
            .join('')}<th scope="col" class="numero">Vencidos</th></tr></thead>
          <tbody>${
            linhas.length
              ? linhas
                  .map(
                    (l) => `<tr><td>${S.esc(l.filial)}</td><td class="numero">${l.total}</td>${l.porAgente
                      .map((n) => `<td class="numero">${n || ''}</td>`)
                      .join('')}<td class="numero">${l.vencidos || ''}</td></tr>`
                  )
                  .join('')
              : `<tr><td colspan="${agentes.length + 3}">Nenhum extintor cadastrado.</td></tr>`
          }</tbody>
          <tfoot><tr><td>Total</td><td class="numero">${totalGeral}</td>${agentes
            .map((a, i) => `<td class="numero">${linhas.reduce((s, l) => s + l.porAgente[i], 0) || ''}</td>`)
            .join('')}<td class="numero">${linhas.reduce((s, l) => s + l.vencidos, 0) || ''}</td></tr></tfoot>
        </table></div>
        ${semFilial ? `<p class="dica">${S.plural(semFilial, 'extintor está', 'extintores estão')} sem filial e não entram na tabela.</p>` : ''}
        <p class="dica">Colunas por agente extintor: ${agentes.map((a) => `${S.esc(siglaAgente(a.nome))} = ${S.esc(a.nome)}`).join('; ')}.</p>`;
      csv = () => [
        'extintores-por-unidade.csv',
        S.montarCsv(
          ['Filial', 'Total', ...agentes.map((a) => a.nome), 'Vencidos'],
          [...linhas.map((l) => [l.filial, l.total, ...l.porAgente, l.vencidos]), ['Total', totalGeral, ...agentes.map((a, i) => linhas.reduce((s, l) => s + l.porAgente[i], 0)), linhas.reduce((s, l) => s + l.vencidos, 0)]]
        ),
      ];
    } else {
      const funcionariosPorId = new Map(funcionarios.map((f) => [f.id, f]));
      const antecedencia = await S.antecedenciaEpi();
      const vencidos = registros
        .map((r) => ({ r, f: funcionariosPorId.get(r.funcionarioId), sit: S.situacaoEpi(r, hoje, antecedencia) }))
        .filter((x) => x.f && x.sit.codigo === 'vencido')
        .sort((a, b) => a.f.nome.localeCompare(b.f.nome, 'pt-BR') || a.sit.vence.localeCompare(b.sit.vence));
      corpo = `${cabecalhoImpressao('EPIs vencidos por funcionário')}
        <div class="tabela-rolagem"><table class="tabela">
          <thead><tr><th scope="col">Funcionário</th><th scope="col">Matrícula</th><th scope="col">EPI</th><th scope="col">C.A.</th><th scope="col">Entrega</th>
          <th scope="col" class="numero">Validade (dias)</th><th scope="col">Venceu em</th><th scope="col" class="numero">Dias vencido</th></tr></thead>
          <tbody>${
            vencidos.length
              ? vencidos
                  .map(
                    ({ r, f, sit }) => `<tr><td>${S.esc(f.nome)}</td><td>${S.esc(f.matricula || '')}</td><td>${S.esc(r.descricao)}</td><td>${S.esc(r.ca)}</td>
                    <td>${S.dataBR(r.dataEntrega)}</td><td class="numero">${S.esc(r.diasValidade)}</td><td>${S.dataBR(sit.vence)}</td><td class="numero">${-sit.dias}</td></tr>`
                  )
                  .join('')
              : '<tr><td colspan="8">Nenhum EPI vencido.</td></tr>'
          }</tbody></table></div>
        <p class="dica" style="margin-top:8px">Vencimento = data de entrega + dias de validade. EPI devolvido ou sem prazo informado não entra.</p>`;
      csv = () => [
        'epis-vencidos.csv',
        S.montarCsv(
          ['Funcionário', 'Matrícula', 'EPI', 'C.A.', 'Entrega', 'Validade (dias)', 'Venceu em', 'Dias vencido'],
          vencidos.map(({ r, f, sit }) => [f.nome, f.matricula || '', r.descricao, r.ca, S.dataBR(r.dataEntrega), r.diasValidade, S.dataBR(sit.vence), -sit.dias])
        ),
      ];
    }

    const abas = [
      ['extintores', 'Extintores'],
      ['unidades', 'Por unidade'],
      ['epis', 'EPIs vencidos'],
    ];
    const raiz = S.pintar(token, {
      titulo: 'Relatórios',
      voltar: '/',
      largo: true,
      html: `
        <div class="abas nao-imprimir" role="tablist">${abas
          .map(([c, n]) => `<a class="aba" role="tab" href="#/relatorios/${c}" aria-selected="${c === aba}">${n}</a>`)
          .join('')}</div>
        <div class="grupo-botoes nao-imprimir" style="margin:0 0 12px">
          <button type="button" class="botao secundario" id="imprimir">Imprimir ou salvar PDF</button>
          <button type="button" class="botao secundario" id="exportar">Exportar planilha (CSV)</button>
        </div>
        <section class="cartao">${corpo}</section>`,
    });
    if (!raiz) return;
    raiz.querySelector('#imprimir').addEventListener('click', () => window.print());
    raiz.querySelector('#exportar').addEventListener('click', () => {
      const [nome, conteudo] = csv();
      S.baixarArquivo(nome, conteudo, 'text/csv;charset=utf-8');
    });
    raiz.querySelectorAll('[data-coluna]').forEach((b) =>
      b.addEventListener('click', () => {
        if (ordem.coluna === b.dataset.coluna) ordem.direcao *= -1;
        else {
          ordem.coluna = b.dataset.coluna;
          ordem.direcao = 1;
        }
        S.navegar();
      })
    );
  }

  S.registrarTela('/avisos', telaAvisos);
  S.registrarTela('/relatorios', telaRelatorios);
  S.registrarTela('/relatorios/:aba', telaRelatorios);

  Object.assign(S, { calcularAvisos, textoAvisos, linkEmail, notificarAvisosDoDia, siglaAgente });
})(window.SESMT);
