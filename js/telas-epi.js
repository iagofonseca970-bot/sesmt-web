/* SESMT Web — Controle de Entrega de EPI: busca de funcionários, ficha, entrega de EPI e impressão da ficha. */
'use strict';
window.SESMT = window.SESMT || {};

(function (S) {
  // Filtros da busca ficam guardados enquanto o app está aberto (ao voltar da ficha, a busca continua igual).
  const filtros = { filialId: '', matricula: '', nome: '', setorId: '', cargoId: '' };

  // Antecedência padrão do aviso de EPI a vencer, em dias (ajustável em Configurações).
  const ANTECEDENCIA_EPI_PADRAO = 30;

  async function antecedenciaEpi() {
    const v = Number(await S.banco.obterConfig('antecedenciaEpiDias', ANTECEDENCIA_EPI_PADRAO));
    return Number.isInteger(v) && v >= 0 ? v : ANTECEDENCIA_EPI_PADRAO;
  }

  function nomeDe(mapa, id, vazio = '') {
    return (id && mapa.get(Number(id))?.nome) || vazio;
  }

  // ---------- Busca ----------

  function filtrar(funcionarios) {
    return funcionarios.filter(
      (f) =>
        (!filtros.filialId || String(f.filialId) === filtros.filialId) &&
        (!filtros.setorId || String(f.setorId) === filtros.setorId) &&
        (!filtros.cargoId || String(f.cargoId) === filtros.cargoId) &&
        S.comecaCom(f.matricula, filtros.matricula) &&
        S.comecaCom(f.nome, filtros.nome)
    );
  }

  async function telaBusca({ token }) {
    const [funcionarios, listas] = await Promise.all([S.banco.listar('funcionarios'), S.carregarListas()]);
    funcionarios.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const raiz = S.pintar(token, {
      titulo: 'Controle de Entrega de EPI',
      voltar: '/',
      html: `
        <section class="cartao" aria-labelledby="titulo-filtros">
          <div class="secao-titulo">
            <h2 id="titulo-filtros">Buscar funcionário</h2>
            <button type="button" class="botao texto" id="limpar">Limpar filtros</button>
          </div>
          <div class="grade-filtros">
            <div class="campo"><label for="f-filial">Filial</label>
              <select id="f-filial">${S.opcoesHtml(listas.filiais, filtros.filialId, 'Todas')}</select></div>
            <div class="campo"><label for="f-matricula">Matrícula</label>
              <input type="search" id="f-matricula" inputmode="numeric" placeholder="Começa com…" value="${S.esc(filtros.matricula)}" /></div>
            <div class="campo"><label for="f-nome">Nome</label>
              <input type="search" id="f-nome" placeholder="Começa com…" value="${S.esc(filtros.nome)}" /></div>
            <div class="campo"><label for="f-setor">Setor/Local</label>
              <select id="f-setor">${S.opcoesHtml(listas.setores, filtros.setorId, 'Todos')}</select></div>
            <div class="campo"><label for="f-cargo">Cargo</label>
              <select id="f-cargo">${S.opcoesHtml(listas.cargos, filtros.cargoId, 'Todos')}</select></div>
          </div>
          <p class="dica">Os filtros se somam e a lista muda enquanto você digita.</p>
        </section>
        <div class="secao-titulo">
          <p class="texto-suave" id="contagem" aria-live="polite"></p>
          <a class="botao primario" href="#/funcionario/novo">${S.icone('mais')}Novo funcionário</a>
        </div>
        <ul class="lista-itens" id="resultado"></ul>`,
    });
    if (!raiz) return;

    function mostrar() {
      const achados = filtrar(funcionarios);
      raiz.querySelector('#contagem').textContent =
        funcionarios.length === 0
          ? 'Nenhum funcionário cadastrado.'
          : `${achados.length} de ${S.plural(funcionarios.length, 'funcionário', 'funcionários')}`;
      raiz.querySelector('#resultado').innerHTML = achados.length
        ? achados
            .map(
              (f) => `<li><a class="item" href="#/funcionario/${f.id}">
                  <span class="item-titulo">${S.esc(f.nome)}</span>
                  <span class="item-detalhe" style="display:block">${S.esc(
                    [f.matricula ? `Matrícula ${f.matricula}` : 'Sem matrícula', nomeDe(listas.cargosPorId, f.cargoId), nomeDe(listas.filiaisPorId, f.filialId), nomeDe(listas.setoresPorId, f.setorId)]
                      .filter(Boolean)
                      .join(' · ')
                  )}</span></a></li>`
            )
            .join('')
        : `<li class="vazio">${funcionarios.length ? 'Nenhum funcionário encontrado com esses filtros.' : 'Cadastre o primeiro funcionário ou carregue os dados de exemplo no menu inicial.'}</li>`;
    }

    const ligar = (id, chave) => {
      const campo = raiz.querySelector(id);
      campo.addEventListener('input', () => {
        filtros[chave] = campo.value;
        mostrar();
      });
    };
    ligar('#f-filial', 'filialId');
    ligar('#f-matricula', 'matricula');
    ligar('#f-nome', 'nome');
    ligar('#f-setor', 'setorId');
    ligar('#f-cargo', 'cargoId');
    raiz.querySelector('#limpar').addEventListener('click', () => {
      Object.keys(filtros).forEach((k) => {
        filtros[k] = '';
      });
      ['#f-filial', '#f-matricula', '#f-nome', '#f-setor', '#f-cargo'].forEach((id) => {
        raiz.querySelector(id).value = '';
      });
      mostrar();
    });
    mostrar();
  }

  // ---------- Ficha do funcionário ----------

  async function telaFicha({ params, token }) {
    const novo = params.id === 'novo';
    const id = novo ? null : Number(params.id);
    const [funcionario, listas, todos] = await Promise.all([
      novo ? null : S.banco.obter('funcionarios', id),
      S.carregarListas(),
      S.banco.listar('funcionarios'),
    ]);
    if (!novo && !funcionario) {
      S.pintar(token, { titulo: 'Ficha', voltar: '/epi', html: '<div class="vazio">Funcionário não encontrado.</div>' });
      return;
    }
    const f = funcionario || { nome: '', matricula: '', cargoId: '', filialId: '', setorId: '' };
    const registros = novo ? [] : await S.banco.listarPorIndice('registrosEpi', 'funcionarioId', id);
    registros.sort((a, b) => (b.dataEntrega || '').localeCompare(a.dataEntrega || '') || b.id - a.id);
    const hoje = S.hojeISO();
    const antecedencia = await antecedenciaEpi();

    const raiz = S.pintar(token, {
      titulo: novo ? 'Novo funcionário' : 'Ficha do funcionário',
      voltar: '/epi',
      html: `
        <form class="cartao" id="form-funcionario" novalidate>
          <h2>Dados do funcionário</h2>
          <div class="campo"><label for="nome">Nome <span class="obrigatorio">*</span></label>
            <input type="text" id="nome" maxlength="${S.LIMITES.nome}" value="${S.esc(f.nome)}" autocomplete="off" /></div>
          <div class="grade-filtros">
            <div class="campo"><label for="matricula">Matrícula</label>
              <input type="text" id="matricula" maxlength="${S.LIMITES.matricula}" inputmode="numeric" value="${S.esc(f.matricula)}" /></div>
            <div class="campo"><label for="cargo">Cargo</label>
              <select id="cargo">${S.opcoesHtml(listas.cargos, f.cargoId, '(nenhum)')}</select></div>
            <div class="campo"><label for="filial">Filial</label>
              <select id="filial">${S.opcoesHtml(listas.filiais, f.filialId, '(nenhuma)')}</select></div>
            <div class="campo"><label for="setor">Setor/Local</label>
              <select id="setor">${S.opcoesHtml(listas.setores, f.setorId, '(nenhum)')}</select></div>
          </div>
          <p class="dica">Cargo, filial e setor/local vêm das listas em Configurações.</p>
          <div class="grupo-botoes"><button type="submit" class="botao primario">Salvar</button></div>
        </form>
        ${
          novo
            ? '<p class="dica">Depois de salvar a ficha, você registra as entregas de EPI.</p>'
            : `<section class="cartao" aria-labelledby="titulo-entregas">
                <div class="secao-titulo">
                  <h2 id="titulo-entregas">Entregas de EPI <span class="contagem-titulo">(${registros.length})</span></h2>
                  <div class="grupo-botoes">
                    <a class="botao secundario" href="#/funcionario/${id}/imprimir">${S.icone('imprimir')}Imprimir ficha de EPI</a>
                    <a class="botao primario" href="#/funcionario/${id}/entrega/nova">${S.icone('mais')}Nova entrega</a>
                  </div>
                </div>
                ${
                  registros.length
                    ? `<ul class="lista-itens">${registros
                        .map((r) => {
                          const sit = S.situacaoEpi(r, hoje, antecedencia);
                          return `<li><a class="item" href="#/funcionario/${id}/entrega/${r.id}">
                            <span class="item-topo"><span class="item-titulo">${S.esc(r.descricao)}</span>
                              <span class="chip ${sit.codigo}">${S.comSelo(S.esc(sit.texto))}</span></span>
                            <span class="item-detalhe" style="display:block">Qtd ${S.esc(r.quantidade)} · C.A. ${S.esc(r.ca)} · Entregue em ${S.dataBR(r.dataEntrega)}${
                              r.dataDevolucao ? ` · Devolvido em ${S.dataBR(r.dataDevolucao)}` : ''
                            }</span>
                            <span class="item-detalhe" style="display:block">${r.comprovacao?.tipo === S.TIPO_FOTO ? 'Foto do rosto' : 'Assinatura na tela'} · Visto: ${S.esc(r.visto)}</span>
                          </a></li>`;
                        })
                        .join('')}</ul>`
                    : '<div class="vazio">Nenhuma entrega registrada.</div>'
                }
              </section>
              <section class="cartao nao-imprimir">
                <h2>Excluir ficha</h2>
                <p class="dica">Apaga o funcionário e todas as entregas dele, com assinaturas e fotos. Não dá para desfazer.</p>
                <button type="button" class="botao perigo" id="excluir">Excluir ficha</button>
              </section>`
        }`,
    });
    if (!raiz) return;

    raiz.querySelector('#form-funcionario').addEventListener('submit', async (e) => {
      e.preventDefault();
      const dados = {
        ...(funcionario || { criadoEm: new Date().toISOString() }),
        nome: raiz.querySelector('#nome').value.trim(),
        matricula: raiz.querySelector('#matricula').value.trim(),
        cargoId: Number(raiz.querySelector('#cargo').value) || null,
        filialId: Number(raiz.querySelector('#filial').value) || null,
        setorId: Number(raiz.querySelector('#setor').value) || null,
        atualizadoEm: new Date().toISOString(),
      };
      if (id) dados.id = id;
      const { faltando, erros } = S.validarFuncionario(dados, todos);
      if (faltando.length) return S.informar('Campos obrigatórios', `Preencha: ${faltando.join(', ')}.`);
      if (erros.length) return S.informar('Confira os dados', erros.join('\n'));
      const novoId = await S.banco.salvar('funcionarios', dados);
      S.avisar('Ficha salva.');
      if (novo) S.ir(`/funcionario/${novoId}`);
      else S.navegar();
    });

    const botaoExcluir = raiz.querySelector('#excluir');
    if (botaoExcluir) {
      botaoExcluir.addEventListener('click', async () => {
        const ok = await S.confirmar({
          titulo: 'Excluir ficha?',
          texto: `${f.nome}\n\nA ficha e ${S.plural(registros.length, 'entrega registrada', 'entregas registradas')} (com assinaturas e fotos) serão apagadas deste aparelho. Não dá para desfazer.`,
          confirmar: 'Excluir',
          perigo: true,
        });
        if (!ok) return;
        await S.banco.excluirFuncionarioComRegistros(id);
        S.avisar('Ficha excluída.');
        S.ir('/epi');
      });
    }
  }

  // ---------- Entrega de EPI ----------

  async function telaEntrega({ params, token }) {
    const funcionarioId = Number(params.id);
    const nova = params.rid === 'nova';
    const [funcionario, registro, catalogo, usuario] = await Promise.all([
      S.banco.obter('funcionarios', funcionarioId),
      nova ? null : S.banco.obter('registrosEpi', Number(params.rid)),
      S.banco.listar('episCatalogo'),
      S.banco.obterConfig('usuario', ''),
    ]);
    const voltar = `/funcionario/${funcionarioId}`;
    if (!funcionario || (!nova && (!registro || registro.funcionarioId !== funcionarioId))) {
      S.pintar(token, { titulo: 'Entrega de EPI', voltar, html: '<div class="vazio">Registro não encontrado.</div>' });
      return;
    }
    catalogo.sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
    const hoje = S.hojeISO();
    const r = registro || {
      funcionarioId,
      epiId: null,
      descricao: '',
      ca: '',
      diasValidade: null,
      quantidade: 1,
      dataEntrega: hoje,
      dataDevolucao: '',
      observacao: '',
      comprovacao: null,
      visto: usuario,
    };
    // Estado da tela (a comprovação nova só é gravada ao salvar).
    let comprovacao = r.comprovacao ? { ...r.comprovacao } : null;
    let comprovacaoSalva = true;
    let epiEscolhido = { epiId: r.epiId, descricao: r.descricao, ca: r.ca, diasValidade: r.diasValidade };

    const raiz = S.pintar(token, {
      titulo: nova ? 'Nova entrega de EPI' : 'Entrega de EPI',
      voltar,
      html: `
        <p class="texto-suave">Funcionário: <strong>${S.esc(funcionario.nome)}</strong>${funcionario.matricula ? ` · Matrícula ${S.esc(funcionario.matricula)}` : ''}</p>
        <form class="cartao" id="form-entrega" novalidate>
          <div class="campo"><label for="epi">EPI <span class="obrigatorio">*</span></label>
            <input type="text" id="epi" list="lista-epis" maxlength="${S.LIMITES.epiDescricao}" value="${S.esc(r.descricao)}" placeholder="Digite para buscar no cadastro de EPI" autocomplete="off" />
            <datalist id="lista-epis">${catalogo.map((e) => `<option value="${S.esc(e.descricao)}"></option>`).join('')}</datalist>
            <span class="dica">Escolha um EPI do cadastro (Configurações → Cadastro de EPI).</span></div>
          <div class="grade-filtros">
            <div class="campo"><label for="ca">C.A. (Certificado de Aprovação) <span class="obrigatorio">*</span></label>
              <input type="text" id="ca" readonly value="${S.esc(r.ca)}" />
              <span class="dica">Vem do cadastro do EPI e não muda aqui.</span></div>
            <div class="campo"><span class="rotulo">Validade</span>
              <input type="text" id="validade" readonly value="" aria-label="Validade" /></div>
          </div>
          <div class="campo"><label for="quantidade">Quantidade <span class="obrigatorio">*</span></label>
            <div class="quantidade">
              <button type="button" class="botao secundario" id="menos" aria-label="Diminuir quantidade">−</button>
              <input type="number" id="quantidade" min="1" step="1" value="${S.esc(r.quantidade)}" />
              <button type="button" class="botao secundario" id="mais" aria-label="Aumentar quantidade">+</button>
            </div></div>
          <div class="grade-filtros">
            <div class="campo"><label for="entrega">Data de entrega <span class="obrigatorio">*</span></label>
              <div class="linha"><input type="date" id="entrega" min="${S.DATA_MINIMA}" max="${hoje}" value="${S.esc(r.dataEntrega)}" />
                <button type="button" class="botao secundario" data-hoje="entrega">Hoje</button></div></div>
            <div class="campo"><label for="devolucao">Data de devolução</label>
              <div class="linha"><input type="date" id="devolucao" min="${S.DATA_MINIMA}" max="${hoje}" value="${S.esc(r.dataDevolucao || '')}" />
                <button type="button" class="botao secundario" data-hoje="devolucao">Hoje</button></div></div>
          </div>
          <div class="campo"><label for="observacao">Observações</label>
            <textarea id="observacao" maxlength="${S.LIMITES.observacao}">${S.esc(r.observacao || '')}</textarea>
            <span class="contagem" id="contagem-obs"></span></div>
          <div class="campo"><span class="rotulo">Visto (usuário do SESMT que registrou)</span>
            <input type="text" readonly value="${S.esc(r.visto)}" aria-label="Visto" /></div>

          <h3>Comprovação da entrega <span class="obrigatorio">*</span></h3>
          <div id="comprovacao"></div>
          <div class="grupo-botoes">
            <button type="button" class="botao secundario" id="assinar">Assinar na tela</button>
            <button type="button" class="botao secundario" id="fotografar">Foto do rosto</button>
            <input type="file" id="arquivo-foto" class="arquivo-escondido" accept="image/*" capture="user" tabindex="-1" aria-hidden="true" />
          </div>
          <p class="dica">Para trocar, assine de novo ou tire outra foto: a nova fica no lugar da atual.</p>

          <div class="grupo-botoes fim" style="margin-top:16px">
            <a class="botao secundario" href="#${voltar}">Cancelar</a>
            <button type="submit" class="botao primario">Salvar</button>
          </div>
        </form>
        ${
          nova
            ? ''
            : `<section class="cartao nao-imprimir">
                <h2>Excluir entrega</h2>
                <p class="dica">Apaga só esta entrega (com a assinatura ou a foto). Não dá para desfazer.</p>
                <button type="button" class="botao perigo" id="excluir">Excluir entrega</button>
              </section>`
        }`,
    });
    if (!raiz) return;

    const campoEpi = raiz.querySelector('#epi');
    const campoCa = raiz.querySelector('#ca');
    const campoValidade = raiz.querySelector('#validade');
    const campoQtd = raiz.querySelector('#quantidade');
    const campoObs = raiz.querySelector('#observacao');

    function mostrarValidade() {
      const dias = Number(epiEscolhido.diasValidade);
      campoValidade.value = Number.isInteger(dias) && dias > 0 ? `${S.plural(dias, 'dia', 'dias')}` : 'Sem prazo informado';
    }
    function mostrarComprovacao() {
      raiz.querySelector('#comprovacao').innerHTML = S.htmlComprovacao(comprovacao, { salva: comprovacaoSalva });
    }
    function contarObs() {
      raiz.querySelector('#contagem-obs').textContent = `${campoObs.value.length}/${S.LIMITES.observacao}`;
    }

    // Ao escolher um EPI do cadastro, o C.A. e a validade vêm junto.
    campoEpi.addEventListener('input', () => {
      const achado = catalogo.find((e) => S.normalizar(e.descricao) === S.normalizar(campoEpi.value));
      if (achado) {
        epiEscolhido = { epiId: achado.id, descricao: achado.descricao, ca: achado.ca, diasValidade: achado.diasValidade };
      } else if (registro && S.normalizar(campoEpi.value) === S.normalizar(registro.descricao)) {
        epiEscolhido = { epiId: registro.epiId, descricao: registro.descricao, ca: registro.ca, diasValidade: registro.diasValidade };
      } else {
        epiEscolhido = { epiId: null, descricao: '', ca: '', diasValidade: null };
      }
      campoCa.value = epiEscolhido.ca || '';
      mostrarValidade();
    });
    raiz.querySelector('#menos').addEventListener('click', () => {
      campoQtd.value = Math.max(1, (parseInt(campoQtd.value, 10) || 1) - 1);
    });
    raiz.querySelector('#mais').addEventListener('click', () => {
      campoQtd.value = (parseInt(campoQtd.value, 10) || 0) + 1;
    });
    raiz.querySelectorAll('[data-hoje]').forEach((b) =>
      b.addEventListener('click', () => {
        raiz.querySelector(`#${b.dataset.hoje}`).value = hoje;
      })
    );
    campoObs.addEventListener('input', contarObs);

    raiz.querySelector('#assinar').addEventListener('click', async () => {
      const imagem = await S.abrirAssinatura();
      if (!imagem) return;
      comprovacao = { tipo: S.TIPO_ASSINATURA, dado: imagem };
      comprovacaoSalva = false;
      mostrarComprovacao();
    });
    const arquivoFoto = raiz.querySelector('#arquivo-foto');
    raiz.querySelector('#fotografar').addEventListener('click', () => arquivoFoto.click());
    arquivoFoto.addEventListener('change', async () => {
      const arquivo = arquivoFoto.files[0];
      arquivoFoto.value = '';
      if (!arquivo) return;
      try {
        comprovacao = { tipo: S.TIPO_FOTO, dado: await S.lerImagemReduzida(arquivo, 720, 0.75) };
        comprovacaoSalva = false;
        mostrarComprovacao();
      } catch (erro) {
        S.informar('Foto', erro.message);
      }
    });

    raiz.querySelector('#form-entrega').addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = campoEpi.value.trim();
      if (texto && !epiEscolhido.descricao) {
        await S.informar(
          'EPI fora do cadastro',
          'Escolha um EPI da lista que aparece ao digitar. Para um EPI novo, cadastre antes em Configurações → Cadastro de EPI (com o C.A. ou "NA").'
        );
        return;
      }
      const dados = {
        ...(registro || { criadoEm: new Date().toISOString() }),
        funcionarioId,
        epiId: epiEscolhido.epiId,
        descricao: epiEscolhido.descricao,
        ca: S.normalizarCa(epiEscolhido.ca),
        diasValidade: epiEscolhido.diasValidade ?? null,
        quantidade: parseInt(campoQtd.value, 10),
        dataEntrega: raiz.querySelector('#entrega').value,
        dataDevolucao: raiz.querySelector('#devolucao').value || '',
        observacao: campoObs.value.trim(),
        comprovacao,
        visto: registro ? registro.visto : usuario,
        atualizadoEm: new Date().toISOString(),
      };
      const { faltando, erros } = S.validarRegistro(dados, hoje);
      if (faltando.length) {
        const dicaCa =
          faltando.includes('C.A.') && dados.descricao
            ? '\n\nO C.A. vem do cadastro do EPI: em Configurações → Cadastro de EPI, preencha o C.A. (NA, se não tiver número) e escolha o EPI de novo.'
            : '';
        await S.informar('Campos obrigatórios', `Preencha: ${faltando.join(', ')}.${dicaCa}`);
        return;
      }
      if (erros.length) {
        await S.informar('Confira os dados', erros.join('\n'));
        return;
      }
      await S.banco.salvar('registrosEpi', dados);
      S.avisar('Entrega salva.');
      S.ir(voltar);
    });

    const botaoExcluir = raiz.querySelector('#excluir');
    if (botaoExcluir) {
      botaoExcluir.addEventListener('click', async () => {
        const ok = await S.confirmar({
          titulo: 'Excluir entrega?',
          texto: `${registro.descricao} — entregue em ${S.dataBR(registro.dataEntrega)}.\n\nA entrega e a comprovação dela serão apagadas. Não dá para desfazer.`,
          confirmar: 'Excluir',
          perigo: true,
        });
        if (!ok) return;
        await S.banco.excluir('registrosEpi', registro.id);
        S.avisar('Entrega excluída.');
        S.ir(voltar);
      });
    }

    mostrarValidade();
    mostrarComprovacao();
    contarObs();
  }

  // ---------- Impressão da ficha "Controle de Entrega de EPI" ----------
  // Mesmo modelo do app de celular: A4 deitada; a frente tem 16 linhas e o verso, 26. Se encher, começa outra folha.
  // Toda comprovação deste app é eletrônica, por isso a coluna de assinatura sai "Assinatura Eletrônica".

  const LINHAS_FRENTE = 16;
  const LINHAS_VERSO = 26;
  const DECLARACAO =
    'DECLARO TER RECEBIDO OS EQUIPAMENTOS DE PROTEÇÃO INDIVIDUAL ABAIXO RELACIONADOS, EM CONFORMIDADE COM A NR-06 E PORTARIA MTB Nº 3.214 DE 08/06/1978. ' +
    'RECEBIDO ORIENTAÇÃO QUANTO A SUA OBRIGATORIEDADE DE UTILIZAÇÃO CORRETA PARA USO EXCLUSIVO A SERVIÇO DESTA EMPRESA E QUE FICARÃO SOB MINHA RESPONSABILIDADE. ' +
    'AUTORIZADO O DESCONTO DOS VALORES RESPECTIVOS EM FOLHA DE PAGAMENTO, POR EXTRAVIO, DANIFICAÇÃO POR USO INADEQUADO, ALTERAÇÃO DE PADRÃO OU POR NÃO DEVOLVER NO ATO DE DESLIGAMENTO DA EMPRESA.';
  const MESES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function dividirEmPaginas(registros) {
    const porFolha = LINHAS_FRENTE + LINHAS_VERSO;
    const paginas = [];
    let inicio = 0;
    let folha = 1;
    do {
      paginas.push({ tipo: 'frente', folha, registros: registros.slice(inicio, inicio + LINHAS_FRENTE) });
      const verso = registros.slice(inicio + LINHAS_FRENTE, inicio + porFolha);
      if (verso.length) paginas.push({ tipo: 'verso', folha, registros: verso });
      inicio += porFolha;
      folha += 1;
    } while (inicio < registros.length);
    return paginas;
  }

  function linhasTabela(registros, total) {
    const linhas = registros.map(
      (r) => `<tr>
        <td title="${S.esc(r.descricao)}">${S.esc(r.descricao)}</td>
        <td class="centro">${S.esc(r.quantidade)}</td>
        <td class="centro">${S.esc(r.ca)}</td>
        <td class="centro">${S.dataBR(r.dataEntrega)}</td>
        <td class="centro">Assinatura Eletrônica</td>
        <td class="centro">${S.dataBR(r.dataDevolucao)}</td>
        <td>${S.esc(r.visto)}</td>
      </tr>`
    );
    for (let i = registros.length; i < total; i += 1) linhas.push('<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>');
    return linhas.join('');
  }

  const CABECALHO_TABELA = `<colgroup><col style="width:30.5%"><col style="width:6%"><col style="width:8.7%"><col style="width:9.6%"><col style="width:22.6%"><col style="width:9.5%"><col style="width:13.1%"></colgroup>
    <thead><tr><th>EPI – DESCRIÇÃO</th><th>QUANT.</th><th>C.A.</th><th>DATA DE ENTREGA</th><th>ASSINATURA DO FUNCIONÁRIO</th><th>DATA DE DEVOLUÇÃO</th><th>VISTO</th></tr></thead>`;

  async function telaImpressao({ params, token }) {
    const id = Number(params.id);
    const [f, listas, registros, empresa, cidade] = await Promise.all([
      S.banco.obter('funcionarios', id),
      S.carregarListas(),
      S.banco.listarPorIndice('registrosEpi', 'funcionarioId', id),
      S.banco.obterConfig('empresa', ''),
      S.banco.obterConfig('cidade', ''),
    ]);
    if (!f) {
      S.pintar(token, { titulo: 'Imprimir', voltar: '/epi', html: '<div class="vazio">Funcionário não encontrado.</div>' });
      return;
    }
    // Na folha, as entregas saem na ordem em que aconteceram.
    registros.sort((a, b) => (a.dataEntrega || '').localeCompare(b.dataEntrega || '') || a.id - b.id);
    const agora = new Date();
    const dataExtenso = `${agora.getDate()} de ${MESES_EXTENSO[agora.getMonth()]} de ${agora.getFullYear()}`;
    const paginas = dividirEmPaginas(registros)
      .map((p) => {
        const ficha = String(p.folha).padStart(2, '0');
        if (p.tipo === 'verso') {
          return `<section class="folha verso" aria-label="Ficha ${ficha}, verso">
            <div class="folha-verso-titulo">CONTROLE DE ENTREGA DE EPI — ${S.esc(f.nome)} — FICHA Nº ${ficha} (VERSO)</div>
            <table class="folha-tabela">${CABECALHO_TABELA}<tbody>${linhasTabela(p.registros, LINHAS_VERSO)}</tbody></table>
          </section>`;
        }
        return `<section class="folha frente" aria-label="Ficha ${ficha}, frente">
          <div class="folha-topo">
            <div class="folha-empresa">${S.esc(empresa || 'EMPRESA')}</div>
            <div class="folha-campos-topo">
              <div><strong>FILIAL:</strong> ${S.esc(nomeDe(listas.filiaisPorId, f.filialId))}</div>
              <div><strong>MATRÍCULA:</strong> ${S.esc(f.matricula)}</div>
              <div><strong>FICHA Nº:</strong> ${ficha}</div>
            </div>
          </div>
          <div class="folha-titulo">CONTROLE DE ENTREGA DE EPI</div>
          <div class="folha-dados">
            <div><strong>NOME:</strong> ${S.esc(f.nome)}</div>
            <div><strong>SETOR/LOCAL:</strong> ${S.esc(nomeDe(listas.setoresPorId, f.setorId))}</div>
            <div><strong>CARGO:</strong> ${S.esc(nomeDe(listas.cargosPorId, f.cargoId))}</div>
          </div>
          <div class="folha-declaracao">${DECLARACAO}
            <div class="folha-local">
              <span>${S.esc(cidade || '________________')}, ${dataExtenso}.</span>
              <span class="folha-assinatura-linha">ASSINATURA DO FUNCIONÁRIO</span>
            </div>
          </div>
          <table class="folha-tabela">${CABECALHO_TABELA}<tbody>${linhasTabela(p.registros, LINHAS_FRENTE)}</tbody></table>
        </section>`;
      })
      .join('');

    const raiz = S.pintar(token, {
      titulo: 'Imprimir ficha de EPI',
      voltar: `/funcionario/${id}`,
      largo: true,
      html: `
        <div class="nao-imprimir">
          <div class="aviso-caixa info">
            <p>Prévia da ficha <strong>Controle de Entrega de EPI</strong> de ${S.esc(f.nome)} (${S.plural(registros.length, 'entrega', 'entregas')}).
            Para gerar o arquivo, escolha <strong>Salvar como PDF</strong> na janela de impressão.</p>
            <button type="button" class="botao primario" id="imprimir">Imprimir</button>
          </div>
        </div>
        <div class="tabela-rolagem" style="background:#fff;border:0">${paginas}</div>`,
    });
    if (!raiz) return;
    raiz.querySelector('#imprimir').addEventListener('click', () => window.print());
  }

  S.registrarTela('/epi', telaBusca);
  S.registrarTela('/funcionario/:id', telaFicha);
  S.registrarTela('/funcionario/:id/entrega/:rid', telaEntrega);
  S.registrarTela('/funcionario/:id/imprimir', telaImpressao);

  Object.assign(S, { antecedenciaEpi, ANTECEDENCIA_EPI_PADRAO, dividirEmPaginas, LINHAS_FRENTE, LINHAS_VERSO });
})(window.SESMT);
