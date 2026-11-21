/* SESMT Web — regras do negócio (validações, prazos e situação de extintores e EPIs).
   Funções puras: recebem dados e devolvem resultados, sem mexer na tela nem no banco. Assim dá para testá-las sozinhas.
   As regras vêm das respostas do SESMT e do app de celular. */
'use strict';
window.SESMT = window.SESMT || {};

(function (S) {
  const LIMITES = {
    nome: 80,
    matricula: 20,
    usuario: 40,
    email: 254,
    empresa: 80,
    cidade: 60,
    lista: 60, // nome de filial, setor/local, cargo ou agente
    epiDescricao: 120,
    ca: 10,
    extintorTexto: 40, // identificação, frente/setor e local de instalação (como no app de celular)
    observacao: 360,
  };

  // Data mínima aceita nas datas (a mesma do app de celular).
  const DATA_MINIMA = '1992-01-01';
  const MES_MINIMO = '1992-01';

  // Extintor: a próxima recarga é 1 ano depois da recarga (SESMT: vale para todos os agentes extintores).
  const MESES_ATE_PROXIMA_RECARGA = 12;
  // Teste hidrostático: até 5 anos depois da recarga (regra do app de celular).
  const MESES_MAXIMOS_TESTE_HIDROSTATICO = 60;

  // ---------- C.A. ----------

  // C.A. de EPI sem número: o SESMT pediu "NA". Na Senior aparece de 4 formas.
  const CA_SEM_NUMERO = 'NA';
  const FORMAS_CA_SEM_NUMERO = ['N/A', 'NA', 'N/A.', 'N/D'];

  function normalizarCa(ca) {
    const texto = String(ca ?? '').trim();
    return FORMAS_CA_SEM_NUMERO.includes(texto.toUpperCase()) ? CA_SEM_NUMERO : texto;
  }

  // ---------- E-mail ----------

  function emailValido(email) {
    const texto = String(email ?? '').trim();
    return texto.length <= LIMITES.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto);
  }

  // ---------- Validações (devolvem a lista do que falta e a lista de erros) ----------

  function validarFuncionario(f, outros = []) {
    const faltando = [];
    const erros = [];
    if (!String(f.nome ?? '').trim()) faltando.push('Nome');
    const matricula = String(f.matricula ?? '').trim();
    if (matricula && outros.some((o) => o.id !== f.id && String(o.matricula ?? '').trim() === matricula)) {
      erros.push(`A matrícula ${matricula} já está em outra ficha.`);
    }
    return { faltando, erros };
  }

  // Entrega de EPI. Obrigatórios (SESMT, 19/11/2026): EPI, data de entrega, C.A. e comprovação (assinatura na tela ou
  // foto do rosto). A quantidade é exigida (mínimo 1), como no app de celular.
  function validarRegistro(r, hoje) {
    const faltando = [];
    const erros = [];
    if (!String(r.descricao ?? '').trim()) faltando.push('EPI');
    const qtd = Number(r.quantidade);
    if (!Number.isInteger(qtd) || qtd < 1) faltando.push('Quantidade (mínimo 1)');
    if (!normalizarCa(r.ca)) faltando.push('C.A.');
    if (!r.dataEntrega) faltando.push('Data de entrega');
    if (!r.comprovacao || !r.comprovacao.tipo || !r.comprovacao.dado) {
      faltando.push('Comprovação da entrega (assinatura na tela ou foto do rosto)');
    }
    if (r.dataEntrega && (!S.dataValida(r.dataEntrega) || r.dataEntrega < DATA_MINIMA || r.dataEntrega > hoje)) {
      erros.push('A data de entrega precisa ser uma data válida, de 01/01/1992 até hoje.');
    }
    if (r.dataDevolucao) {
      if (!S.dataValida(r.dataDevolucao) || r.dataDevolucao > hoje) {
        erros.push('A data de devolução precisa ser uma data válida, até hoje.');
      } else if (r.dataEntrega && r.dataDevolucao < r.dataEntrega) {
        erros.push('A data de devolução não pode ser antes da data de entrega.');
      }
    }
    return { faltando, erros };
  }

  // Extintor. Obrigatórios como no app de celular (Identificação, Agente Extintor e Data da recarga) e, na versão web,
  // a Filial, usada no relatório por unidade que o SESMT pediu.
  function validarExtintor(e, mesAtual) {
    const faltando = [];
    const erros = [];
    if (!String(e.identificacao ?? '').trim()) faltando.push('Identificação');
    if (!e.agenteId) faltando.push('Agente extintor');
    if (!e.filialId) faltando.push('Filial');
    if (!e.recarga) faltando.push('Data da recarga');
    if (e.recarga && (!S.mesValido(e.recarga) || e.recarga < MES_MINIMO || e.recarga > mesAtual)) {
      erros.push('A data da recarga precisa ser um mês de 01/1992 até o mês atual.');
    }
    if (e.testeHidrostatico) {
      const limite = e.recarga ? S.somarMeses(e.recarga, MESES_MAXIMOS_TESTE_HIDROSTATICO) : null;
      if (!S.mesValido(e.testeHidrostatico) || !e.recarga || e.testeHidrostatico < e.recarga || e.testeHidrostatico > limite) {
        erros.push('O teste hidrostático precisa ficar entre a data da recarga e 5 anos depois dela.');
      }
    }
    const antecedencia = Number(e.antecedenciaMeses);
    if (!Number.isInteger(antecedencia) || antecedencia < 0 || antecedencia > 12) {
      erros.push('A antecedência do aviso precisa ser de 0 a 12 meses.');
    }
    return { faltando, erros };
  }

  // ---------- Prazos dos extintores (por mês e ano, como o SESMT trabalha) ----------

  function proximaRecarga(recarga) {
    return recarga ? S.somarMeses(recarga, MESES_ATE_PROXIMA_RECARGA) : null;
  }

  function limiteTesteHidrostatico(recarga) {
    return recarga ? S.somarMeses(recarga, MESES_MAXIMOS_TESTE_HIDROSTATICO) : null;
  }

  // Ordem de gravidade, da pior para a melhor.
  const ORDEM_SITUACAO = { vencido: 0, 'vence-este-mes': 1, 'a-vencer': 2, 'em-dia': 3, 'sem-data': 4 };

  // Situação de um prazo por mês: vencido (mês já passou), vence este mês, a vencer (dentro da antecedência) ou em dia.
  function situacaoPrazoMes(mesPrazo, antecedenciaMeses, mesAtual) {
    if (!mesPrazo) return { codigo: 'sem-data', meses: null, texto: 'Sem data' };
    const meses = S.indiceMes(mesPrazo) - S.indiceMes(mesAtual);
    if (meses < 0) return { codigo: 'vencido', meses, texto: meses === -1 ? 'Venceu no mês passado' : `Venceu há ${-meses} meses` };
    if (meses === 0) return { codigo: 'vence-este-mes', meses, texto: 'Vence este mês' };
    if (meses <= antecedenciaMeses) return { codigo: 'a-vencer', meses, texto: meses === 1 ? 'Vence no mês que vem' : `Vence em ${meses} meses` };
    return { codigo: 'em-dia', meses, texto: 'Em dia' };
  }

  // Situação do extintor = a pior entre a próxima recarga e o teste hidrostático.
  function situacaoExtintor(e, mesAtual) {
    const antecedencia = Number.isInteger(Number(e.antecedenciaMeses)) ? Number(e.antecedenciaMeses) : 1;
    const recarga = { prazo: 'Próxima recarga', mes: proximaRecarga(e.recarga), ...situacaoPrazoMes(proximaRecarga(e.recarga), antecedencia, mesAtual) };
    const teste = e.testeHidrostatico
      ? { prazo: 'Teste hidrostático', mes: e.testeHidrostatico, ...situacaoPrazoMes(e.testeHidrostatico, antecedencia, mesAtual) }
      : null;
    const prazos = [recarga, teste].filter(Boolean);
    const pior = prazos.reduce((a, b) => (ORDEM_SITUACAO[b.codigo] < ORDEM_SITUACAO[a.codigo] ? b : a));
    return { ...pior, prazos };
  }

  // ---------- Validade dos EPIs ----------
  // SESMT: "dias de validade" = tempo que o funcionário pode ficar com o mesmo EPI; passado o prazo, troca.
  // Vencimento = data de entrega + dias de validade (dias corridos).
  // Validade do EPI: dias de validade do cadastro (no sistema, coluna diaval). EPI com 0 dia ou sem prazo fica fora da conta ("sem prazo informado");
  // EPI já devolvido não entra como vencido.

  function vencimentoEpi(r) {
    const dias = Number(r.diasValidade);
    if (!r.dataEntrega || !Number.isInteger(dias) || dias <= 0) return null;
    return S.somarDias(r.dataEntrega, dias);
  }

  function situacaoEpi(r, hoje, antecedenciaDias) {
    if (r.dataDevolucao) return { codigo: 'devolvido', vence: null, dias: null, texto: `Devolvido em ${S.dataBR(r.dataDevolucao)}` };
    const vence = vencimentoEpi(r);
    if (!vence) return { codigo: 'sem-prazo', vence: null, dias: null, texto: 'Sem prazo informado' };
    const dias = S.diasEntre(hoje, vence);
    if (dias < 0) return { codigo: 'vencido', vence, dias, texto: `Venceu em ${S.dataBR(vence)}` };
    if (dias <= antecedenciaDias) return { codigo: 'a-vencer', vence, dias, texto: dias === 0 ? 'Vence hoje' : `Vence em ${S.plural(dias, 'dia', 'dias')}` };
    return { codigo: 'em-dia', vence, dias, texto: `Válido até ${S.dataBR(vence)}` };
  }

  Object.assign(S, {
    LIMITES,
    DATA_MINIMA,
    MES_MINIMO,
    MESES_ATE_PROXIMA_RECARGA,
    MESES_MAXIMOS_TESTE_HIDROSTATICO,
    CA_SEM_NUMERO,
    FORMAS_CA_SEM_NUMERO,
    ORDEM_SITUACAO,
    normalizarCa,
    emailValido,
    validarFuncionario,
    validarRegistro,
    validarExtintor,
    proximaRecarga,
    limiteTesteHidrostatico,
    situacaoPrazoMes,
    situacaoExtintor,
    vencimentoEpi,
    situacaoEpi,
  });
})(window.SESMT);
