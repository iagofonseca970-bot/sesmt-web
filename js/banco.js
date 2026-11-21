/* SESMT Web — banco de dados no navegador (IndexedDB).
   Cada "store" funciona como uma tabela. Os dados ficam só neste navegador, neste aparelho:
   por isso existe a cópia de segurança (exportar/importar) em Configurações. */
'use strict';
window.SESMT = window.SESMT || {};

(function (S) {
  const NOME_BANCO = 'sesmt-web';
  const VERSAO_BANCO = 1;

  // Tabelas e seus índices (campos por onde se busca).
  const TABELAS = {
    configuracoes: { chave: 'chave', auto: false, indices: [] },
    filiais: { chave: 'id', auto: true, indices: ['nome'] },
    setores: { chave: 'id', auto: true, indices: ['nome'] },
    cargos: { chave: 'id', auto: true, indices: ['nome'] },
    agentes: { chave: 'id', auto: true, indices: ['nome'] },
    funcionarios: { chave: 'id', auto: true, indices: ['nome', 'matricula', 'filialId', 'cargoId', 'setorId'] },
    episCatalogo: { chave: 'id', auto: true, indices: ['descricao'] },
    registrosEpi: { chave: 'id', auto: true, indices: ['funcionarioId'] },
    extintores: { chave: 'id', auto: true, indices: ['filialId', 'agenteId'] },
  };
  const NOMES_TABELAS = Object.keys(TABELAS);

  let conexao = null;

  function abrir() {
    if (conexao) return Promise.resolve(conexao);
    return new Promise((resolver, rejeitar) => {
      if (!window.indexedDB) {
        rejeitar(new Error('Este navegador não oferece o banco de dados local (IndexedDB).'));
        return;
      }
      const pedido = indexedDB.open(NOME_BANCO, VERSAO_BANCO);
      // Cria as tabelas na primeira abertura (ou quando a versão do banco sobe).
      pedido.onupgradeneeded = () => {
        const db = pedido.result;
        for (const [nome, def] of Object.entries(TABELAS)) {
          if (db.objectStoreNames.contains(nome)) continue;
          const store = db.createObjectStore(nome, { keyPath: def.chave, autoIncrement: def.auto });
          def.indices.forEach((campo) => store.createIndex(campo, campo, { unique: false }));
        }
      };
      pedido.onsuccess = () => {
        conexao = pedido.result;
        resolver(conexao);
      };
      pedido.onerror = () => rejeitar(pedido.error || new Error('Não foi possível abrir o banco de dados.'));
    });
  }

  // Transforma um pedido do IndexedDB em Promise.
  function promessa(pedido) {
    return new Promise((resolver, rejeitar) => {
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => rejeitar(pedido.error);
    });
  }

  // Roda "trabalho" numa transação com as tabelas pedidas. Se algo falhar, nada é gravado (tudo ou nada).
  async function transacao(tabelas, modo, trabalho) {
    const db = await abrir();
    return new Promise((resolver, rejeitar) => {
      const tx = db.transaction(tabelas, modo);
      let resultado;
      tx.oncomplete = () => resolver(resultado);
      tx.onerror = () => rejeitar(tx.error);
      tx.onabort = () => rejeitar(tx.error || new Error('Operação cancelada.'));
      // O trabalho começa na hora (a transação do IndexedDB só fica ativa enquanto há pedidos pendentes).
      let execucao;
      try {
        execucao = Promise.resolve(trabalho(tx));
      } catch (erro) {
        execucao = Promise.reject(erro);
      }
      execucao
        .then((r) => {
          resultado = r;
        })
        .catch((erro) => {
          try {
            tx.abort();
          } catch (e) {
            /* a transação já terminou */
          }
          rejeitar(erro);
        });
    });
  }

  async function listar(tabela) {
    return transacao([tabela], 'readonly', (tx) => promessa(tx.objectStore(tabela).getAll()));
  }

  async function obter(tabela, chave) {
    if (chave === undefined || chave === null || chave === '') return null;
    const r = await transacao([tabela], 'readonly', (tx) => promessa(tx.objectStore(tabela).get(chave)));
    return r ?? null;
  }

  async function listarPorIndice(tabela, indice, valor) {
    return transacao([tabela], 'readonly', (tx) => promessa(tx.objectStore(tabela).index(indice).getAll(valor)));
  }

  async function contar(tabela) {
    return transacao([tabela], 'readonly', (tx) => promessa(tx.objectStore(tabela).count()));
  }

  // Grava (cria ou atualiza). Devolve a chave gravada.
  async function salvar(tabela, registro) {
    const copia = { ...registro };
    if (TABELAS[tabela].auto && (copia.id === undefined || copia.id === null || copia.id === '')) delete copia.id;
    return transacao([tabela], 'readwrite', (tx) => promessa(tx.objectStore(tabela).put(copia)));
  }

  async function excluir(tabela, chave) {
    return transacao([tabela], 'readwrite', (tx) => promessa(tx.objectStore(tabela).delete(chave)));
  }

  // ---------- Configurações (chave e valor) ----------

  async function obterConfig(chave, padrao = null) {
    const r = await obter('configuracoes', chave);
    return r ? r.valor : padrao;
  }

  async function salvarConfig(chave, valor) {
    return salvar('configuracoes', { chave, valor });
  }

  async function excluirConfig(chave) {
    return excluir('configuracoes', chave);
  }

  // ---------- Operações que mexem em mais de uma tabela ----------

  // Exclui o funcionário e as entregas dele, juntos (como no app de celular).
  async function excluirFuncionarioComRegistros(id) {
    return transacao(['funcionarios', 'registrosEpi'], 'readwrite', async (tx) => {
      const registros = await promessa(tx.objectStore('registrosEpi').index('funcionarioId').getAllKeys(id));
      for (const chave of registros) await promessa(tx.objectStore('registrosEpi').delete(chave));
      await promessa(tx.objectStore('funcionarios').delete(id));
      return registros.length;
    });
  }

  // ---------- Cópia de segurança ----------

  async function exportarTudo() {
    const dados = {};
    for (const tabela of NOMES_TABELAS) dados[tabela] = await listar(tabela);
    return { app: 'SESMT Web', formato: 1, exportadoEm: new Date().toISOString(), dados };
  }

  // Confere o arquivo antes de apagar qualquer coisa: precisa ser uma cópia do SESMT Web.
  function conferirCopia(copia) {
    if (!copia || copia.app !== 'SESMT Web' || !copia.dados || typeof copia.dados !== 'object') {
      throw new Error('Este arquivo não é uma cópia de segurança do SESMT Web.');
    }
    for (const tabela of NOMES_TABELAS) {
      if (copia.dados[tabela] !== undefined && !Array.isArray(copia.dados[tabela])) {
        throw new Error(`A cópia está com a tabela "${tabela}" em formato errado.`);
      }
    }
  }

  // Troca todos os dados pelos da cópia, numa transação só (se falhar, os dados atuais continuam).
  async function importarTudo(copia) {
    conferirCopia(copia);
    return transacao(NOMES_TABELAS, 'readwrite', async (tx) => {
      let total = 0;
      for (const tabela of NOMES_TABELAS) {
        const store = tx.objectStore(tabela);
        await promessa(store.clear());
        for (const registro of copia.dados[tabela] || []) {
          await promessa(store.put(registro));
          total += 1;
        }
      }
      return total;
    });
  }

  async function apagarTudo() {
    return transacao(NOMES_TABELAS, 'readwrite', async (tx) => {
      for (const tabela of NOMES_TABELAS) await promessa(tx.objectStore(tabela).clear());
    });
  }

  S.banco = {
    TABELAS,
    NOMES_TABELAS,
    abrir,
    transacao,
    promessa,
    listar,
    obter,
    listarPorIndice,
    contar,
    salvar,
    excluir,
    obterConfig,
    salvarConfig,
    excluirConfig,
    excluirFuncionarioComRegistros,
    exportarTudo,
    conferirCopia,
    importarTudo,
    apagarTudo,
  };
})(window.SESMT);
