# SESMT Web

Aplicação web para o técnico do SESMT, com duas áreas:

- **Controle de Entrega de EPI**: busca de funcionários com filtros combinados, ficha do funcionário, registro de entregas e devoluções com comprovação (assinatura na tela ou foto do rosto) e impressão da ficha de EPI.
- **Controle de Extintores**: lista com a situação de cada extintor (vencido, vence este mês, a vencer, em dia), cadastro com fotos e cálculo da próxima recarga.

Também tem avisos de prazos, relatórios (com impressão e exportação para planilha), importação das listas do sistema da empresa (CSV), configurações e cópia de segurança.

> Todos os dados de exemplo são **fictícios**. Os avisos ajudam a lembrar prazos, mas **não substituem os controles oficiais do SESMT**.

## Como abrir

Não precisa instalar nada.

1. Baixe ou copie a pasta do projeto.
2. Abra o arquivo `index.html` no Google Chrome, no Microsoft Edge ou no Firefox (dois cliques no arquivo).
3. No primeiro acesso, digite o usuário do SESMT (vai no campo **Visto** das entregas) e deixe marcada a opção de carregar os dados de exemplo.

Também funciona por um servidor local, se preferir:

```bash
python -m http.server 8080
# depois abra http://localhost:8080
```

## Importar do sistema da empresa (CSV)

Em **Configurações → Dados → Importar do sistema (CSV)**, escolha o que importar e o arquivo:

- **EPIs**: aceita o arquivo exportado do sistema como está (colunas `desepi`, `cerapr`, `diaval` e `datinu`) ou um CSV com as colunas Descrição, C.A. e Validade (dias). EPI com data de inutilização não entra; C.A. "N/A", "N/A.", "N/D" ou "NA" é gravado como NA.
- **Funcionários**: colunas Nome e, se houver, Matrícula, Cargo, Filial e Setor/Local. Cargos, filiais e setores que ainda não existem nas listas são criados.
- **Filiais, Setores/Locais e Cargos**: uma coluna de nomes, com ou sem título.

Antes de gravar, o app mostra um resumo (quantos entram e quantos ficam de fora, e por quê) e pede confirmação. Nada do que já está cadastrado é apagado ou alterado. Se a mesma descrição de EPI aparecer com C.A. ou validade diferentes, nenhuma das duas entra e o resumo pede para conferir no sistema.

## Onde os dados ficam

Os dados ficam **somente no navegador** em que o app foi aberto (banco IndexedDB). Outro navegador, outro computador ou a limpeza dos dados de navegação não enxergam esses dados.

Para não perder nada, use **Configurações → Dados → Baixar cópia de segurança** (arquivo `.json`) e, se precisar, **Restaurar cópia**.

## Estrutura

```
index.html            página única do app
css/estilo.css        aparência (tema claro e escuro, tela de celular e computador, impressão em A4)
fonts/                fonte Inter embutida, para funcionar sem internet (licença em fonts/OFL.txt)
js/util.js            funções gerais: datas, textos, janelas de confirmação, arquivos
js/icones.js          ícones de linha (Lucide), sem depender da internet
js/regras.js          validações e regras de prazo (EPI e extintores)
js/banco.js           banco de dados no navegador (IndexedDB) e cópia de segurança
js/comprovacao.js     assinatura na tela (canvas)
js/importacao.js      importação das listas do sistema (CSV)
js/exemplos.js        dados fictícios de exemplo
js/telas-epi.js       busca, ficha do funcionário, entrega de EPI e impressão da ficha
js/telas-extintores.js lista e cadastro de extintores
js/telas-avisos.js    avisos, e-mail preparado, notificação do navegador e relatórios
js/telas-config.js    usuário, listas, cadastro de EPIs e dados
js/app.js             menu, primeiro acesso e navegação entre as telas
testes/               testes automatizados (opcionais)
```

## Testes automatizados (opcional)

Precisa do [Node.js](https://nodejs.org/) 18 ou mais novo.

```bash
npm install
npx playwright install chromium
npm test
```

- `testes/teste_regras.mjs`: regras de validação, de prazos e da importação de CSV, sem navegador.
- `testes/teste_telas.mjs`: usa o app no navegador como o técnico usaria (busca, entregas, assinatura, foto, extintores, avisos, relatórios, listas, importação de CSV, cópia de segurança) e confere o que foi gravado.
- `testes/fumaca.mjs`: abre todas as telas e falha se aparecer erro no console.

## Avisos, prazos e comprovação

- E-mail: o app **prepara** a mensagem com os avisos e abre o programa de e-mail; o técnico confere e envia.
- Notificação do navegador: aparece **uma vez por dia, quando o app é aberto**, se o técnico permitir.
- Validade dos EPIs: vem dos dias de validade do cadastro (no arquivo do sistema, a coluna `diaval`); 0 ou vazio significa "sem prazo", e EPIs devolvidos não entram nos vencidos.
- Comprovação: a assinatura na tela ou a foto do rosto fica guardada com cada entrega; na ficha impressa, aparece como "Assinatura Eletrônica".

## Créditos

- Fonte [Inter](https://github.com/rsms/inter), licença SIL Open Font License 1.1 (texto em `fonts/OFL.txt`).
- Ícones [Lucide](https://lucide.dev), licença ISC (aviso no início de `js/icones.js`).

## Publicar no GitHub Pages (opcional)

Use um repositório só com dados fictícios. Em **Settings → Pages**, escolha publicar a partir da branch `main` (pasta raiz). O endereço fica parecido com `https://SEU-USUARIO.github.io/sesmt-web/`.
