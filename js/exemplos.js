/* SESMT Web — dados fictícios de exemplo (para conhecer e testar o app). Nenhum dado é real:
   nomes, matrículas, C.A., assinaturas e fotos são inventados. As datas são calculadas a partir de hoje, para sempre
   haver itens vencidos, a vencer e em dia. */
'use strict';
window.SESMT = window.SESMT || {};

(function (S) {
  const FILIAIS = ['Matriz — Escritório Central', 'Filial 1 — Pedreira Norte', 'Filial 2 — Pedreira Sul', 'Filial 3 — Fábrica'];
  const SETORES = ['Almoxarifado', 'Escritório', 'Informática', 'Manutenção', 'Pedreira', 'Polimento', 'Serraria'];
  const CARGOS = [
    'Auxiliar de Produção',
    'Encarregado de Pedreira',
    'Mecânico de Manutenção',
    'Operador de Máquinas',
    'Polidor',
    'Serrador',
    'Técnico de Informática',
    'Técnico de Segurança do Trabalho',
  ];
  // Agentes extintores com a classe de fogo (mesma lista do app de celular).
  const AGENTES = [
    { nome: 'Classe A (Água Pressurizada - AP)', classes: ['A'], acao: 'Indicado apenas para a Classe A. Atua por resfriamento.' },
    { nome: 'Classe BC (Dióxido de Carbono - CO2)', classes: ['B', 'C'], acao: 'Ideal para as Classes B e C: não deixa resíduos e não conduz eletricidade.' },
    { nome: 'Classe BC (Pó Químico Seco - PQS)', classes: ['B', 'C'], acao: 'Utilizado nas Classes B e C. Atua por quebra da reação química em cadeia.' },
    { nome: 'Classe ABC (Pó Químico Seco - ABC)', classes: ['A', 'B', 'C'], acao: 'O modelo mais versátil: combina ação química e abafamento.' },
    { nome: 'Classe AB (Espuma Mecânica - Espuma)', classes: ['A', 'B'], acao: 'Forma uma camada que isola o oxigênio e resfria o combustível.' },
    { nome: 'Classe D (Pó Especial)', classes: ['D'], acao: 'Exclusivo para metais pirofóricos; é específico para cada tipo de metal.' },
    { nome: 'Classe K (Acetato de Potássio)', classes: ['K'], acao: 'Específico para cozinhas industriais, contra incêndios em óleos e gorduras quentes.' },
  ];
  // C.A. fictícios (série 900xx). "NA" = EPI sem número de C.A.
  const EPIS = [
    ['Abafador de ruído tipo concha', '90013', 365],
    ['Avental de raspa', '90019', 180],
    ['Botina de segurança com biqueira', '90017', 180],
    ['Capacete de segurança com jugular', '90011', 365],
    ['Creme de proteção para as mãos', '90022', null],
    ['Luva de vaqueta', '90015', 30],
    ['Luva nitrílica', '90016', 15],
    ['Óculos de proteção incolor', '90014', 180],
    ['Perneira de segurança', '90020', 365],
    ['Protetor auricular tipo plug', '90012', 90],
    ['Protetor facial incolor', '90021', 365],
    ['Respirador PFF2', '90018', 7],
    ['Uniforme (camisa de brim)', 'NA', 180],
  ];
  // [nome, matrícula, cargo, filial, setor]
  const FUNCIONARIOS = [
    ['Ana Paula Ribeiro', '1001', 'Técnico de Segurança do Trabalho', 0, 'Escritório'],
    ['Bruno Henrique Costa', '1002', 'Operador de Máquinas', 1, 'Pedreira'],
    ['Carlos Eduardo Lima', '1003', 'Serrador', 3, 'Serraria'],
    ['Daniela Souza Martins', '1004', 'Polidor', 3, 'Polimento'],
    ['Eduardo Ferreira Alves', '1005', 'Mecânico de Manutenção', 2, 'Manutenção'],
    ['Fernanda Oliveira Santos', '1006', 'Auxiliar de Produção', 3, 'Almoxarifado'],
    ['Gabriel Rocha Pereira', '1007', 'Encarregado de Pedreira', 2, 'Pedreira'],
    ['Iara Nogueira Campos', '1008', 'Técnico de Informática', 0, 'Informática'],
    ['Ian Barbosa Freitas', '1009', 'Técnico de Informática', 1, 'Informática'],
  ];
  // [matrícula, EPI, dias atrás da entrega, dias atrás da devolução (ou null), comprovação: 'a' assinatura | 'f' foto]
  const ENTREGAS = [
    ['1002', 'Capacete de segurança com jugular', 400, null, 'a'],
    ['1002', 'Protetor auricular tipo plug', 100, null, 'a'],
    ['1002', 'Botina de segurança com biqueira', 60, null, 'f'],
    ['1002', 'Óculos de proteção incolor', 170, null, 'a'],
    ['1003', 'Luva de vaqueta', 10, null, 'a'],
    ['1003', 'Avental de raspa', 200, null, 'a'],
    ['1003', 'Uniforme (camisa de brim)', 30, null, 'a'],
    ['1004', 'Respirador PFF2', 3, null, 'a'],
    ['1004', 'Luva nitrílica', 40, 26, 'a'],
    ['1004', 'Abafador de ruído tipo concha', 90, null, 'f'],
    ['1001', 'Capacete de segurança com jugular', 20, null, 'a'],
    ['1001', 'Botina de segurança com biqueira', 20, null, 'a'],
    ['1005', 'Protetor facial incolor', 380, null, 'a'],
    ['1005', 'Creme de proteção para as mãos', 15, null, 'a'],
    ['1007', 'Perneira de segurança', 120, null, 'a'],
  ];
  // [identificação, agente (índice), filial (índice), frente/setor, local, recarga (meses atrás), teste hidrostático (meses depois da recarga ou null), antecedência, foto?, observação]
  const EXTINTORES = [
    ['Extintor CO2', 1, 3, 'Serraria', 'Ao lado do quadro elétrico', 13, 36, 1, true, 'Inspeção visual: lacre rompido. Aguardando recarga.'],
    ['Extintor PQS', 2, 1, 'Frente de lavra', 'Contêiner de ferramentas', 12, 48, 1, false, ''],
    ['Extintor ABC', 3, 0, 'Escritório', 'Recepção', 11, 24, 1, true, ''],
    ['Extintor AP', 0, 3, 'Almoxarifado', 'Entrada', 3, 30, 1, false, ''],
    ['Extintor CO2', 1, 2, 'Oficina', 'Bancada de solda', 6, 6, 1, false, ''],
    ['Extintor PQS', 2, 2, 'Frente de lavra', 'Compressor', 2, 40, 1, false, ''],
    ['Extintor ABC', 3, 0, 'Escritório', 'Sala do SESMT', 10, 30, 3, false, ''],
    ['Extintor Espuma', 4, 3, 'Polimento', 'Depósito de resina', 8, 20, 1, false, ''],
    ['Extintor CO2', 1, 1, 'Gerador', 'Casa de máquinas', 14, 30, 1, false, ''],
    ['Extintor PQS', 2, 3, 'Serraria', 'Ponte rolante', 1, 50, 1, false, ''],
  ];

  // ---------- Imagens fictícias desenhadas na hora ----------

  // "Assinatura" fictícia: um rabisco diferente para cada número.
  function gerarAssinatura(semente) {
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 200;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const voltas = 5 + (semente % 4);
    for (let i = 0; i <= 220; i += 1) {
      const t = i / 220;
      const x = 50 + t * 480;
      const y = 110 + Math.sin(t * Math.PI * voltas + semente) * (28 + (semente % 3) * 6) * (1 - t * 0.4) + Math.sin(t * 31 + semente * 2) * 6;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(90, 150 + (semente % 5));
    ctx.quadraticCurveTo(300, 175, 520, 140 - (semente % 7));
    ctx.stroke();
    return c.toDataURL('image/png');
  }

  // "Foto" fictícia do rosto: silhueta com a palavra EXEMPLO (não é foto de pessoa real).
  function gerarFotoRosto() {
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = 600;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 600);
    g.addColorStop(0, '#dfe7ef');
    g.addColorStop(1, '#b9c7d6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 480, 600);
    ctx.fillStyle = '#7d8fa3';
    ctx.beginPath();
    ctx.arc(240, 230, 105, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(240, 560, 200, 170, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('FOTO DE EXEMPLO', 240, 70);
    return c.toDataURL('image/jpeg', 0.8);
  }

  // "Foto" fictícia de um extintor na parede.
  function gerarFotoExtintor(rotulo) {
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 800;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#d9d4cc';
    ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = '#c62828';
    ctx.fillRect(170, 700, 260, 60); // demarcação no piso
    ctx.fillStyle = '#b71c1c';
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(220, 230, 160, 420, 40);
      ctx.fill();
    } else {
      ctx.fillRect(220, 230, 160, 420); // navegadores antigos, sem cantos arredondados
    }
    ctx.fillStyle = '#222';
    ctx.fillRect(270, 170, 60, 70);
    ctx.beginPath();
    ctx.arc(300, 165, 34, 0, Math.PI * 2);
    ctx.fillStyle = '#eee';
    ctx.fill();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(330, 200);
    ctx.bezierCurveTo(470, 230, 450, 520, 400, 600);
    ctx.lineWidth = 14;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(240, 360, 120, 90);
    ctx.fillStyle = '#b71c1c';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(rotulo, 300, 418);
    ctx.fillStyle = '#333';
    ctx.font = 'bold 26px Arial';
    ctx.fillText('FOTO DE EXEMPLO', 300, 80);
    return c.toDataURL('image/jpeg', 0.8);
  }

  // ---------- Carga ----------

  // Troca os dados (menos usuário, e-mail e demais configurações) pelos exemplos.
  async function carregarExemplos() {
    const hoje = S.hojeISO();
    const mesAtual = S.mesAtualISO();
    const usuario = await S.banco.obterConfig('usuario', 'tecnico.sesmt');
    const fotoRosto = gerarFotoRosto();
    const fotosExtintor = { CO2: gerarFotoExtintor('CO2'), ABC: gerarFotoExtintor('ABC') };
    const assinaturas = ENTREGAS.map((_, i) => gerarAssinatura(i + 3));
    const tabelasDados = S.banco.NOMES_TABELAS.filter((t) => t !== 'configuracoes');

    await S.banco.transacao(S.banco.NOMES_TABELAS, 'readwrite', async (tx) => {
      const p = S.banco.promessa;
      for (const t of tabelasDados) await p(tx.objectStore(t).clear());
      const ids = { filiais: [], setores: {}, cargos: {}, agentes: [], epis: {}, funcionarios: {} };
      for (const nome of FILIAIS) ids.filiais.push(await p(tx.objectStore('filiais').add({ nome })));
      for (const nome of SETORES) ids.setores[nome] = await p(tx.objectStore('setores').add({ nome }));
      for (const nome of CARGOS) ids.cargos[nome] = await p(tx.objectStore('cargos').add({ nome }));
      for (const a of AGENTES) ids.agentes.push(await p(tx.objectStore('agentes').add({ ...a })));
      for (const [descricao, ca, diasValidade] of EPIS) {
        ids.epis[descricao] = { id: await p(tx.objectStore('episCatalogo').add({ descricao, ca, diasValidade })), ca, diasValidade };
      }
      const agora = new Date().toISOString();
      for (const [nome, matricula, cargo, filial, setor] of FUNCIONARIOS) {
        ids.funcionarios[matricula] = await p(
          tx.objectStore('funcionarios').add({
            nome,
            matricula,
            cargoId: ids.cargos[cargo],
            filialId: ids.filiais[filial],
            setorId: ids.setores[setor],
            criadoEm: agora,
            atualizadoEm: agora,
          })
        );
      }
      for (const [i, [matricula, descricao, diasEntrega, diasDevolucao, tipo]] of ENTREGAS.entries()) {
        const epi = ids.epis[descricao];
        await p(
          tx.objectStore('registrosEpi').add({
            funcionarioId: ids.funcionarios[matricula],
            epiId: epi.id,
            descricao,
            ca: epi.ca,
            diasValidade: epi.diasValidade,
            quantidade: 1,
            dataEntrega: S.somarDias(hoje, -diasEntrega),
            dataDevolucao: diasDevolucao === null ? '' : S.somarDias(hoje, -diasDevolucao),
            observacao: '',
            comprovacao: tipo === 'f' ? { tipo: S.TIPO_FOTO, dado: fotoRosto } : { tipo: S.TIPO_ASSINATURA, dado: assinaturas[i] },
            visto: usuario,
            criadoEm: agora,
            atualizadoEm: agora,
          })
        );
      }
      for (const [identificacao, agente, filial, frenteSetor, localInstalacao, mesesAtras, testeDepois, antecedenciaMeses, foto, observacao] of EXTINTORES) {
        const recarga = S.somarMeses(mesAtual, -mesesAtras);
        const sigla = identificacao.replace('Extintor ', '');
        await p(
          tx.objectStore('extintores').add({
            identificacao,
            agenteId: ids.agentes[agente],
            filialId: ids.filiais[filial],
            frenteSetor,
            localInstalacao,
            recarga,
            testeHidrostatico: testeDepois === null ? '' : S.somarMeses(recarga, testeDepois),
            antecedenciaMeses,
            fotoExtintor: foto ? fotosExtintor[sigla] || null : null,
            fotoLocal: null,
            observacao,
            criadoEm: agora,
            atualizadoEm: agora,
          })
        );
      }
      const cfg = tx.objectStore('configuracoes');
      const empresa = await p(cfg.get('empresa'));
      if (!empresa || !empresa.valor) await p(cfg.put({ chave: 'empresa', valor: 'EMPRESA EXEMPLO LTDA' }));
      const cidade = await p(cfg.get('cidade'));
      if (!cidade || !cidade.valor) await p(cfg.put({ chave: 'cidade', valor: 'Barra de São Francisco – ES' }));
    });
  }

  Object.assign(S, { carregarExemplos, gerarAssinatura });
})(window.SESMT);
