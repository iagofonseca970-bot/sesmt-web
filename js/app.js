/* SESMT Web — navegação entre telas (rotas pelo endereço #/...), menu inicial e primeiro acesso. */
'use strict';
window.SESMT = window.SESMT || {};

(function (S) {
  const rotas = [];
  let token = 0; // cada navegação ganha um número; uma tela lenta não desenha por cima da tela nova

  // padrao: texto como '/funcionario/:id'. tela: função async ({ params, token }).
  function rota(padrao, tela) {
    const nomes = [];
    const regex = new RegExp(
      '^' +
        padrao.replace(/:[a-z]+/gi, (m) => {
          nomes.push(m.slice(1));
          return '([^/]+)';
        }) +
        '$'
    );
    rotas.push({ regex, nomes, tela });
  }

  function caminhoAtual() {
    const h = location.hash.replace(/^#/, '');
    return h || '/';
  }

  function ir(caminho) {
    if (caminhoAtual() === caminho) navegar();
    else location.hash = caminho;
  }

  // Desenha a tela, se ela ainda for a atual. Devolve o elemento do conteúdo (ou null).
  // largo: telas com tabela ou folha A4 (relatórios e impressão) usam mais largura no computador.
  function pintar(tk, { titulo, voltar = null, html, largo = false }) {
    if (tk !== token) return null;
    document.title = titulo === 'SESMT Web' ? 'SESMT Web' : `${titulo} · SESMT Web`;
    document.getElementById('titulo-tela').textContent = titulo;
    const botaoVoltar = document.getElementById('botao-voltar');
    botaoVoltar.hidden = !voltar;
    botaoVoltar.onclick = voltar ? () => ir(voltar) : null;
    document.getElementById('botao-inicio').hidden = caminhoAtual() === '/' || caminhoAtual() === '/primeiro-acesso';
    const conteudo = document.getElementById('conteudo');
    conteudo.classList.toggle('largo', largo);
    conteudo.innerHTML = html;
    window.scrollTo(0, 0);
    return conteudo;
  }

  async function navegar() {
    const meu = ++token;
    const caminho = caminhoAtual();
    try {
      await S.banco.abrir();
      const usuario = await S.banco.obterConfig('usuario');
      if (!usuario && caminho !== '/primeiro-acesso') {
        ir('/primeiro-acesso');
        return;
      }
      for (const r of rotas) {
        const m = caminho.match(r.regex);
        if (!m) continue;
        const params = {};
        r.nomes.forEach((nome, i) => {
          params[nome] = decodeURIComponent(m[i + 1]);
        });
        await r.tela({ params, token: meu });
        return;
      }
      ir('/');
    } catch (erro) {
      console.error(erro);
      pintar(meu, {
        titulo: 'Erro',
        voltar: '/',
        html: `<div class="aviso-caixa perigo"><strong>Algo deu errado.</strong><br>${S.esc(erro.message || erro)}</div>`,
      });
    }
  }

  // ---------- Menu inicial ----------

  async function telaMenu({ token: tk }) {
    const [usuario, funcionarios, extintores, avisos] = await Promise.all([
      S.banco.obterConfig('usuario'),
      S.banco.contar('funcionarios'),
      S.banco.contar('extintores'),
      S.calcularAvisos(),
    ]);
    const totalAvisos = avisos.extintores.length + avisos.epis.length;
    const semDados = funcionarios === 0 && extintores === 0;
    const raiz = pintar(tk, {
      titulo: 'SESMT Web',
      html: `
        <p class="meta-usuario">Usuário: <strong>${S.esc(usuario)}</strong></p>
        ${
          semDados
            ? `<div class="aviso-caixa info">
                 <p><strong>Ainda não há dados.</strong> Para conhecer o app, carregue os dados fictícios de exemplo.</p>
                 <button type="button" class="botao primario" id="carregar-exemplos">Carregar dados de exemplo</button>
               </div>`
            : ''
        }
        <nav class="grade-menu" aria-label="Menu principal">
          ${[
            ['#/epi', 'capacete', 'Controle de Entrega de EPI', 'Buscar funcionário, ficha, entregas e devoluções', 'principal'],
            ['#/extintores', 'extintor', 'Controle de Extintores', 'Lista, cadastro, fotos e prazos de recarga', 'principal'],
            [
              '#/avisos',
              'sino',
              'Avisos',
              totalAvisos
                ? `${S.plural(avisos.extintores.length, 'extintor', 'extintores')} e ${S.plural(avisos.epis.length, 'EPI', 'EPIs')} pedem atenção`
                : 'Nada vencido ou a vencer',
              '',
              totalAvisos ? `<span class="contador" aria-label="${totalAvisos} avisos">${totalAvisos}</span>` : '',
            ],
            ['#/relatorios', 'grafico', 'Relatórios', 'Extintores, quantidade por unidade e EPIs vencidos', ''],
            ['#/configuracoes', 'engrenagem', 'Configurações', 'Usuário, listas, cadastro de EPI e cópia de segurança', ''],
          ]
            .map(
              ([href, icone, titulo, desc, classe, extra = '']) => `<a class="botao-menu ${classe}" href="${href}">
                <span class="icone">${S.icone(icone, 20)}</span>
                <span class="texto-menu"><strong>${titulo}</strong><span class="desc">${desc}</span></span>
                <span class="fim-menu">${extra}${S.icone('seta')}</span>
              </a>`
            )
            .join('')}
        </nav>
        <p class="dica nota-dados">Os dados ficam guardados neste navegador. Faça a cópia de segurança em Configurações.</p>`,
    });
    if (!raiz) return;
    const botao = raiz.querySelector('#carregar-exemplos');
    if (botao) {
      botao.addEventListener('click', async () => {
        botao.disabled = true;
        await S.carregarExemplos();
        S.avisar('Dados de exemplo carregados.');
        navegar();
      });
    }
  }

  // ---------- Primeiro acesso ----------

  async function telaPrimeiroAcesso({ token: tk }) {
    const usuario = await S.banco.obterConfig('usuario');
    if (usuario) {
      ir('/');
      return;
    }
    const raiz = pintar(tk, {
      titulo: 'Primeiro acesso',
      html: `
        <form class="cartao" id="form-primeiro" novalidate>
          <h2>Bem-vindo ao SESMT Web</h2>
          <p class="texto-suave">Informe o seu usuário do sistema. Ele vai no campo <strong>Visto</strong> de cada entrega de EPI que você registrar e pode ser trocado depois em Configurações.</p>
          <div class="campo">
            <label for="usuario">Usuário do sistema <span class="obrigatorio">*</span></label>
            <input type="text" id="usuario" maxlength="${S.LIMITES.usuario}" autocomplete="username" placeholder="Ex.: nome.sobrenome" />
          </div>
          <label class="linha" style="align-items:center;gap:8px;margin-bottom:14px">
            <input type="checkbox" id="exemplos" checked style="flex:none;width:20px;height:20px" />
            <span>Carregar dados fictícios de exemplo (funcionários, EPIs e extintores)</span>
          </label>
          <button type="submit" class="botao primario largo">Começar</button>
        </form>`,
    });
    if (!raiz) return;
    raiz.querySelector('#usuario').focus();
    raiz.querySelector('#form-primeiro').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = raiz.querySelector('#usuario').value.trim();
      if (!nome) {
        await S.informar('Campo obrigatório', 'Preencha o usuário do sistema.');
        return;
      }
      await S.banco.salvarConfig('usuario', nome);
      if (raiz.querySelector('#exemplos').checked) await S.carregarExemplos();
      ir('/');
    });
  }

  rota('/', telaMenu);
  rota('/primeiro-acesso', telaPrimeiroAcesso);
  S.rotasPendentes.forEach(([padrao, tela]) => rota(padrao, tela));

  Object.assign(S, { rota, ir, pintar, navegar, caminhoAtual });

  // Inicia depois que todos os scripts carregaram (as outras telas se registram antes disto rodar).
  window.addEventListener('hashchange', navegar);
  window.addEventListener('DOMContentLoaded', () => {
    navegar();
    if (S.notificarAvisosDoDia) S.notificarAvisosDoDia();
  });
})(window.SESMT);
