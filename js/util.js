/* SESMT Web — utilitários gerais (texto, datas, avisos na tela, arquivos).
   Todos os módulos ficam no objeto global SESMT, para o app funcionar também aberto direto do arquivo (file://). */
'use strict';
window.SESMT = window.SESMT || {};

(function (S) {
  // ---------- Texto ----------

  // Escapa texto para colocar dentro do HTML (evita que um dado digitado vire código na página).
  function esc(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Texto para comparar na busca: sem acentos, minúsculo e sem espaços nas pontas.
  function normalizar(texto) {
    return String(texto ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  // "Começa com", sem diferenciar acentos e maiúsculas (é a regra da busca do app de celular).
  function comecaCom(texto, inicio) {
    const i = normalizar(inicio);
    return !i || normalizar(texto).startsWith(i);
  }

  function contem(texto, trecho) {
    const t = normalizar(trecho);
    return !t || normalizar(texto).includes(t);
  }

  function plural(n, singular, pluralTexto) {
    return `${n} ${n === 1 ? singular : pluralTexto}`;
  }

  // ---------- Datas (guardadas como aaaa-mm-dd; meses como aaaa-mm) ----------

  function doisDigitos(n) {
    return String(n).padStart(2, '0');
  }

  // Data de hoje no fuso do aparelho, em aaaa-mm-dd.
  function hojeISO(agora = new Date()) {
    return `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}`;
  }

  function mesAtualISO(agora = new Date()) {
    return hojeISO(agora).slice(0, 7);
  }

  // aaaa-mm-dd -> dd/mm/aaaa
  function dataBR(iso) {
    if (!iso) return '';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }

  // aaaa-mm -> mm/aaaa
  function mesAnoBR(isoMes) {
    if (!isoMes) return '';
    return `${isoMes.slice(5, 7)}/${isoMes.slice(0, 4)}`;
  }

  // Dias corridos entre duas datas aaaa-mm-dd (b - a). Usa meio-dia UTC para não sofrer com horário de verão.
  function diasEntre(a, b) {
    const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10), 12);
    const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10), 12);
    return Math.round((tb - ta) / 86400000);
  }

  function somarDias(iso, dias) {
    const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10), 12));
    d.setUTCDate(d.getUTCDate() + dias);
    return `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`;
  }

  // Número corrido do mês (ano * 12 + mês), para comparar e somar meses.
  function indiceMes(isoMes) {
    return Number(isoMes.slice(0, 4)) * 12 + Number(isoMes.slice(5, 7)) - 1;
  }

  function somarMeses(isoMes, meses) {
    if (!isoMes) return null;
    const i = indiceMes(isoMes) + meses;
    return `${Math.floor(i / 12)}-${doisDigitos((i % 12) + 1)}`;
  }

  function dataValida(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return false;
    const [a, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(a, m - 1, d));
    return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  function mesValido(isoMes) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(isoMes || '');
  }

  // ---------- Aviso rápido na tela (toast) ----------

  function avisar(mensagem, tipo = 'ok') {
    const area = document.getElementById('avisos-rapidos');
    if (!area) return;
    const caixa = document.createElement('div');
    caixa.className = `toast toast-${tipo}`;
    caixa.setAttribute('role', 'status');
    caixa.textContent = mensagem;
    area.appendChild(caixa);
    setTimeout(() => caixa.classList.add('saindo'), 2600);
    setTimeout(() => caixa.remove(), 3100);
  }

  // ---------- Janela de confirmação (substitui o confirm() do navegador) ----------

  // Abre uma janela com título, texto e botões. Devolve uma Promise com true (confirmou) ou false.
  function confirmar({ titulo, texto, confirmar: rotuloConfirmar = 'Confirmar', perigo = false, cancelar = 'Cancelar' }) {
    return new Promise((resolver) => {
      const fundo = document.createElement('div');
      fundo.className = 'modal-fundo';
      fundo.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titulo">
          <h2 id="modal-titulo">${esc(titulo)}</h2>
          <p class="modal-texto">${esc(texto)}</p>
          <div class="modal-botoes">
            ${cancelar ? `<button type="button" class="botao secundario" data-r="nao">${esc(cancelar)}</button>` : ''}
            <button type="button" class="botao ${perigo ? 'perigo' : 'primario'}" data-r="sim">${esc(rotuloConfirmar)}</button>
          </div>
        </div>`;
      function fechar(resposta) {
        fundo.remove();
        document.removeEventListener('keydown', aoTeclar);
        resolver(resposta);
      }
      function aoTeclar(e) {
        if (e.key === 'Escape') fechar(false);
      }
      fundo.addEventListener('click', (e) => {
        const botao = e.target.closest('[data-r]');
        if (botao) fechar(botao.dataset.r === 'sim');
        else if (e.target === fundo) fechar(false);
      });
      document.addEventListener('keydown', aoTeclar);
      document.body.appendChild(fundo);
      fundo.querySelector('[data-r="sim"]').focus();
    });
  }

  // Mensagem com um botão só (por exemplo, "Campos obrigatórios").
  function informar(titulo, texto) {
    return confirmar({ titulo, texto, confirmar: 'OK', cancelar: null });
  }

  // ---------- Arquivos e imagens ----------

  // Lê uma imagem escolhida pelo usuário e devolve um JPEG reduzido (maior lado = maxLado px), em data URL.
  // Reduzir evita encher o armazenamento do navegador com fotos de vários megabytes.
  function lerImagemReduzida(arquivo, maxLado = 900, qualidade = 0.75) {
    return new Promise((resolver, rejeitar) => {
      if (!arquivo || !/^image\//.test(arquivo.type)) {
        rejeitar(new Error('O arquivo escolhido não é uma imagem.'));
        return;
      }
      const leitor = new FileReader();
      leitor.onerror = () => rejeitar(new Error('Não foi possível ler a imagem.'));
      leitor.onload = () => {
        const img = new Image();
        img.onerror = () => rejeitar(new Error('Não foi possível abrir a imagem.'));
        img.onload = () => {
          const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * escala));
          canvas.height = Math.max(1, Math.round(img.height * escala));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolver(canvas.toDataURL('image/jpeg', qualidade));
        };
        img.src = leitor.result;
      };
      leitor.readAsDataURL(arquivo);
    });
  }

  // Faz o navegador baixar um texto como arquivo.
  function baixarArquivo(nome, conteudo, tipo = 'application/json') {
    const blob = new Blob([conteudo], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Monta um CSV com ";" (o separador que o Excel e o Google Planilhas em português abrem direto) e BOM para os acentos.
  function montarCsv(cabecalho, linhas) {
    const celula = (v) => {
      const t = String(v ?? '');
      return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const texto = [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\r\n');
    return '﻿' + texto;
  }

  // As telas se registram aqui ao carregar; o app.js (último script) monta as rotas com elas.
  const rotasPendentes = [];
  function registrarTela(padrao, tela) {
    rotasPendentes.push([padrao, tela]);
  }

  Object.assign(S, {
    rotasPendentes,
    registrarTela,
    esc,
    normalizar,
    comecaCom,
    contem,
    plural,
    doisDigitos,
    hojeISO,
    mesAtualISO,
    dataBR,
    mesAnoBR,
    diasEntre,
    somarDias,
    indiceMes,
    somarMeses,
    dataValida,
    mesValido,
    avisar,
    confirmar,
    informar,
    lerImagemReduzida,
    baixarArquivo,
    montarCsv,
  });
})(window.SESMT);
