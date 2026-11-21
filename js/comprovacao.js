/* SESMT Web — comprovação da entrega de EPI: assinatura desenhada na tela (Canvas) ou foto do rosto.
   A foto é só um registro visual da entrega; o app não faz reconhecimento facial. */
'use strict';
window.SESMT = window.SESMT || {};

(function (S) {
  const TIPO_ASSINATURA = 'assinatura';
  const TIPO_FOTO = 'foto';

  // Abre a área de assinatura. Devolve uma Promise com a imagem (PNG em data URL) ou null se cancelar.
  function abrirAssinatura() {
    return new Promise((resolver) => {
      const fundo = document.createElement('div');
      fundo.className = 'modal-fundo';
      fundo.innerHTML = `
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="titulo-assinatura">
          <h2 id="titulo-assinatura">Assinatura do funcionário</h2>
          <p class="dica">Peça ao funcionário para assinar com o dedo (ou com o mouse) na área branca.</p>
          <div class="pad">
            <canvas id="pad-assinatura" aria-label="Área para assinar"></canvas>
          </div>
          <div class="modal-botoes">
            <button type="button" class="botao texto" data-acao="limpar">Limpar</button>
            <button type="button" class="botao secundario" data-acao="cancelar">Cancelar</button>
            <button type="button" class="botao primario" data-acao="confirmar" disabled>Confirmar</button>
          </div>
        </div>`;
      document.body.appendChild(fundo);

      const canvas = fundo.querySelector('canvas');
      const botaoConfirmar = fundo.querySelector('[data-acao="confirmar"]');
      const ctx = canvas.getContext('2d');
      let desenhando = false;
      let tracos = 0;

      // Ajusta a resolução do desenho à tela (fica nítido em celulares com tela de alta densidade).
      function preparar() {
        const caixa = canvas.getBoundingClientRect();
        const escala = window.devicePixelRatio || 1;
        canvas.width = Math.round(caixa.width * escala);
        canvas.height = Math.round(caixa.height * escala);
        ctx.setTransform(escala, 0, 0, escala, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, caixa.width, caixa.height);
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#111111';
      }
      preparar();

      function ponto(e) {
        const caixa = canvas.getBoundingClientRect();
        return { x: e.clientX - caixa.left, y: e.clientY - caixa.top };
      }
      canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        canvas.setPointerCapture(e.pointerId);
        desenhando = true;
        const p = ponto(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 0.1, p.y + 0.1);
        ctx.stroke();
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!desenhando) return;
        const p = ponto(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      });
      function terminar() {
        if (!desenhando) return;
        desenhando = false;
        tracos += 1;
        botaoConfirmar.disabled = false;
      }
      canvas.addEventListener('pointerup', terminar);
      canvas.addEventListener('pointercancel', terminar);

      function fechar(resultado) {
        fundo.remove();
        resolver(resultado);
      }
      fundo.addEventListener('click', (e) => {
        const acao = e.target.closest('[data-acao]')?.dataset.acao;
        if (acao === 'limpar') {
          tracos = 0;
          botaoConfirmar.disabled = true;
          preparar();
        } else if (acao === 'cancelar') {
          fechar(null);
        } else if (acao === 'confirmar' && tracos > 0) {
          fechar(canvas.toDataURL('image/png'));
        }
      });
    });
  }

  // HTML da comprovação já registrada (para mostrar na tela da entrega).
  function htmlComprovacao(comprovacao, { salva = true } = {}) {
    if (!comprovacao || !comprovacao.dado) {
      return '<div class="comprovacao-vazia">Nenhuma comprovação ainda. Ela é obrigatória para salvar.</div>';
    }
    const sufixo = salva ? '' : ' (ainda não salva)';
    if (comprovacao.tipo === TIPO_ASSINATURA) {
      return `<p class="dica">Assinatura na tela${sufixo}</p>
              <img class="assinatura-previa" src="${S.esc(comprovacao.dado)}" alt="Assinatura do funcionário" />`;
    }
    return `<p class="dica">Foto do rosto${sufixo}</p>
            <img class="foto-previa" src="${S.esc(comprovacao.dado)}" alt="Foto do rosto do funcionário na entrega" />`;
  }

  Object.assign(S, { TIPO_ASSINATURA, TIPO_FOTO, abrirAssinatura, htmlComprovacao });
})(window.SESMT);
