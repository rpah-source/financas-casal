# SPEC — App de Finanças do Casal (V1)

Versão 1.1 · 17/11/2026 · Idioma do produto: português do Brasil

> **Para quem vai construir (Claude Code):** este documento é a fonte da verdade. Leia-o inteiro antes de escrever código. Quando algo não estiver especificado, **não invente**: registre em `DECISIONS.md` a opção mais simples que respeite os princípios da seção 2 e siga em frente. Se a dúvida bloquear o trabalho, pergunte.
>
> **Privacidade:** este repositório e o site publicado podem ser públicos. **Nunca** coloque dados pessoais no código, em seeds, testes ou exemplos: nomes reais, valores reais, nomes de bancos ligados a pessoas, categorias pessoais. Use dados fictícios. Os dados reais vivem só na planilha do usuário, no Google Drive dele.

## 0. Primeiros passos para o Claude Code
1. Leia este documento inteiro. Crie `CLAUDE.md` com o resumo das convenções (stack, camadas, nomes das abas, regra de não usar dados pessoais, comandos de teste).
2. Crie `DECISIONS.md` e `CHANGELOG.md`.
3. Siga os marcos da seção 13, **um por vez**. Cada marco termina com testes passando, deploy e uma mensagem curta ao usuário dizendo o que ele pode testar no celular. Escreva essa mensagem em português simples: o usuário não é desenvolvedor.
4. Antes do M5 (importação), peça ao usuário arquivos de exemplo de extrato e fatura de cada banco. Anonimize-os (troque nomes, números de cartão e valores) e salve-os em `samples/`.
5. Nunca peça ao usuário para usar terminal ou computador. Tudo o que ele precisar fazer tem que funcionar pelo navegador do iPhone, e o passo a passo vai em `SETUP.md`.

---

## 1. Contexto e objetivo

Um casal quer **fechar o mês sem déficit**. O app é o "método de acompanhamento" diário. Ele precisa responder, em 2 segundos e pelo celular:

> **"Quanto ainda podemos gastar nesta semana sem estourar o mês?"**

Todo o resto (extrato, fotografia do mês, conciliação, dívidas) existe para que esse número seja confiável.

- **Usuário da V1:** uma pessoa só (o titular), num iPhone, pelo Safari, com o app adicionado à Tela de Início como PWA. O titular **não usa computador**: tudo, inclusive a configuração inicial, precisa ser possível pelo celular.
- **Pessoas da casa:** duas (o titular e a parceira). A parceira não usa o app na V1, mas os gastos dela entram no sistema (ela usa um cartão adicional do titular). Cada lançamento tem o campo "quem" (Pessoa 1 / Pessoa 2 / Casal). Os nomes ficam em Parâmetros.
- **Onde ficam os dados:** numa planilha Google Sheets, no Drive do usuário. A planilha é o banco de dados. O usuário precisa conseguir abrir, ler e até corrigir a planilha à mão, e o app deve continuar funcionando depois disso.
- **Documentos** (faturas, extratos, comprovantes) importados ou anexados vão para uma pasta no Drive do usuário e ficam linkados aos lançamentos.

## 2. Princípios de produto (desempate para qualquer decisão)

1. **Simples e claríssimo.** Uma pergunta principal por tela. Um "planejamento nota 7 que funciona" vale mais que um nota 10 abandonado.
2. **Fonte de alívio, não de culpa.** Nada de vermelho para saldo negativo. Use âmbar para "atenção". Os textos são neutros e firmes, sem julgamento ("Novembro deve fechar em −R$ 500", e não "Você gastou demais!").
3. **Todo número explica sua origem.** Qualquer valor calculado pode ser tocado para mostrar a conta.
4. **Lançar é rápido.** Um gasto comum entra em até 4 toques, com bons padrões.
5. **Recomeçável e tolerante a erro.** O app aceita dados incompletos, atrasados ou duplicados e ajuda a corrigir. Nunca trava por falta de informação.
6. **Mobile-first.** A largura de referência é 390 px. Áreas de toque têm no mínimo 44×44 px. Navegação por barra inferior, sem menu hambúrguer.

## 3. Escopo

### 3.1 Dentro da V1
- Lançamento rápido: digitação manual (o ditado por voz do iPhone funciona em qualquer campo de texto, sem precisar de nada a mais).
- Lançamento por **texto livre curto** com parser determinístico (ex.: `45 farmácia azul`).
- **Importação de arquivos de extrato e fatura: CSV e OFX** (obrigatório), mais **texto colado** de fatura ou extrato. O arquivo original é salvo no Drive.
- Conciliação: casar o que foi importado com o que já existe, sem duplicar.
- Recorrências (semanais e mensais) que geram lançamentos *previstos*.
- Cartões de crédito: ciclo de fatura, compras parceladas e pagamento de fatura.
- Transferências entre contas.
- Tela Semana (semanada), Extrato com filtros, Fotografia do mês, Dívidas e Ajustes (parâmetros com data de vigência).
- Anexar um documento (qualquer arquivo ou foto) a um lançamento, salvo no Drive, **sem leitura automática**.
- "Caixa de entrada": uma aba da planilha onde fontes externas (por exemplo, o assistente Claude, via conector do Google Sheets) podem depositar lançamentos para revisão no app.

### 3.2 Fora da V1 (não implementar; deixar a arquitetura preparada)
- Leitura por IA de fotos de recibo, PDFs e texto livre longo (V2, via API da Anthropic).
- Leitura automática de PDF (na V1, o PDF é apenas salvo e linkado).
- Open Finance / sincronização bancária.
- Vários usuários com login próprio.
- Gravação de áudio no app.
- Semanada ou mesada individual por pessoa.
- Escrever no Índice do segundo cérebro (V1 só **lê** projetos e áreas; ver seção 4.5).

## 4. Arquitetura

### 4.1 Stack (obrigatória, salvo motivo forte registrado em `DECISIONS.md`)
- **Front-end estático**: Vite + TypeScript + Preact (ou React), sem back-end próprio.
- **Hospedagem**: GitHub Pages via GitHub Actions (deploy a cada push na `main`). Deixe a pasta de build agnóstica para permitir migrar para Cloudflare Pages. No plano gratuito do GitHub, o Pages exige repositório público. Por isso o código não pode ter nenhum dado pessoal, e o site é só a "casca": sem login Google, nada aparece.
- **Autenticação**: Google Identity Services (token client, OAuth 2.0 no navegador).
- **Escopo OAuth: somente `https://www.googleapis.com/auth/drive.file`**. Esse escopo dá acesso apenas aos arquivos que o próprio app cria ou que o usuário escolhe, e não exige verificação do Google. Não peça outros escopos.
- **APIs**: Google Sheets API v4 e Google Drive API v3, chamadas direto do navegador com `fetch`.
- **PWA**: `manifest.webmanifest` com nome, ícones e `display: standalone`, e service worker que faz cache só do *app shell* (dados sempre online na V1).
- **Testes**: Vitest para regras de negócio e parsers. Playwright opcional para fluxos principais em modo demonstração.

### 4.2 Camadas
```
UI (telas) → Serviços de domínio (regras: status, faturas, semanada, conciliação)
           → Repositório (interface) → SheetsRepository | MemoryRepository
           → DriveStorage (interface) → GoogleDriveStorage | MemoryStorage
```
- **Modo demonstração obrigatório**: `MemoryRepository` + `MemoryStorage` com dados fictícios, ativado por `?demo=1` ou quando não há login. Todo o desenvolvimento e todos os testes rodam sem Google, porque quem constrói **não tem** acesso à conta do usuário.
- As regras de negócio são funções puras, testadas, sem depender da UI nem do Google.

### 4.3 Sessão Google no iPhone
- O token de acesso dura cerca de 1 hora. Renove em silêncio quando possível (`prompt: ''`). Se não der, mostre um botão "Entrar de novo", sem perder o que estava sendo digitado.
- Escritas pendentes (por exemplo, um lançamento salvo sem conexão ou com o token expirado) vão para uma fila local (IndexedDB) e são reenviadas depois. Mostre um indicador discreto de "1 item aguardando envio".

### 4.4 Primeira execução (bootstrap)
1. Login com Google.
2. O app procura, no `localStorage`, o ID de uma planilha já criada por ele. Se não houver, abre um assistente de 3 passos. Em cada passo, o usuário escolhe um item pelo **Google Picker**, e com isso o app ganha acesso, via `drive.file`, **só ao que foi escolhido**:
   1. **Pasta da área de finanças**: a pasta da área "Finanças" do sistema PARA do usuário. O app cria ali a planilha `Finanças do Casal — Base` e a subpasta `Faturas e extratos/`. (Escolher uma pasta pelo Picker permite ao app **criar** arquivos dentro dela, mas não ler o que já existe lá.)
   2. **Pasta de entrada** do sistema PARA (a "caixa de entrada" do segundo cérebro). É para onde vão os comprovantes que pertencem a outras áreas ou projetos (4.5).
   3. **Planilha-índice do segundo cérebro** (somente leitura), de onde vêm as listas de projetos e áreas.
   Os passos 2 e 3 podem ser pulados e feitos depois, em Ajustes. Também existe a opção **"Já tenho a planilha base"**, que abre o Picker para escolher a planilha existente.
3. Ao criar a planilha, o app monta todas as abas da seção 5, com cabeçalhos, validações de dados (listas suspensas) e as categorias padrão genéricas da seção 12.
4. Grava os IDs (planilha base, pasta de finanças, pasta Faturas e extratos, pasta de entrada, índice) na aba `Parametros` e no `localStorage`.
5. Mostra a tela Ajustes com um aviso: "Complete contas, cartões e salário para a semana ficar certa."
6. **Mover arquivos não quebra nada**: o app usa sempre o ID do arquivo, nunca o caminho. Se o usuário mover a planilha ou um documento de pasta, tudo continua funcionando.

### 4.5 Integração com o segundo cérebro (sistema PARA)
O usuário organiza a vida digital no método PARA (pastas numeradas: Entrada, Projetos, Áreas, Referências e Arquivo), com uma planilha-índice que lista projetos e áreas. **O nome da área ou do projeto no índice é igual ao nome da pasta.** O app se encaixa nesse sistema em vez de criar uma organização paralela:

**a) Projetos e áreas nos lançamentos**
- O campo `projeto_area` dos lançamentos usa as listas da planilha-índice: abas `Projetos` e `Áreas`. As colunas são localizadas pelo cabeçalho, e os nomes ficam configuráveis em `Parametros`: `indice.aba_projetos`, `indice.col_projeto_nome`, `indice.col_projeto_id`, `indice.col_projeto_status`, `indice.aba_areas`, `indice.col_area_nome`, `indice.col_area_status` e `indice.col_pasta` (padrão: "Pasta").
- A coluna **Pasta** do índice tem uma fórmula `HYPERLINK` com o link da pasta no Drive. Leia o link com `spreadsheets.get`, pedindo os campos `hyperlink` e `userEnteredValue`, e extraia o **ID da pasta**. O roteamento de comprovantes usa esse ID, e o nome serve só para exibição. Assim, nada quebra se o nome da área no índice e o da pasta ficarem diferentes.
- Mostre só projetos com status ativo ou incubado e áreas ativas. A lista é cacheada; o botão "Atualizar listas" relê o índice.
- Guarde em `projeto_area` o **nome**. Quando for projeto, guarde também o ID do projeto (ex.: `P-0007`) em `projeto_id`, uma coluna nova em `Lancamentos`.
- Sem acesso ao índice, use a aba local `ProjetosAreas` (5.10) como alternativa.
- Sugestão automática: a categoria pode ter uma área padrão (coluna `area_padrao` em `Categorias`; ex.: Bichos → a área de pets). O usuário pode trocar.

**b) Onde cada documento é salvo**
| documento | destino | nome do arquivo |
|---|---|---|
| Planilha base | pasta da área de finanças | `Finanças do Casal — Base` |
| Fatura ou extrato importado (CSV, OFX, PDF, texto colado salvo como .txt) | `<finanças>/Faturas e extratos/AAAA/` | `AAAA-MM-DD – Fatura – <Conta> – <competência AAAA-MM>.<ext>` ou `AAAA-MM-DD – Extrato – <Conta> – <período>.<ext>` |
| Comprovante ou recibo anexado a um lançamento **sem** área/projeto, ou com a área de finanças | `<finanças>/Comprovantes/AAAA/` | `AAAA-MM-DD – Comprovante – <Descrição> – R$ <valor>.<ext>` |
| Comprovante de lançamento **com outra área ou projeto** (ex.: veterinário → área de pets; consulta → área de saúde) | **pasta de entrada do PARA** | o mesmo nome acima |

- Nos arquivos enviados para a pasta de entrada, preencha a **descrição do arquivo no Drive** com um bloco que a rotina de organização do usuário consegue ler: `[financas] destino: <nome da área ou projeto> | pasta_id: <ID da pasta, quando conhecido> | lancamento: <id> | tipo: comprovante`. A rotina (fora deste app) move o arquivo para a pasta certa, usando `pasta_id` primeiro e o nome como alternativa. Como o link usa o ID, ele continua válido depois de movido.
- Sem a pasta de entrada configurada, o comprovante vai para `<finanças>/Comprovantes/AAAA/`.
- O separador nos nomes é " – " (travessão com espaços), seguindo a convenção do usuário.

**c) O que fica para a V2**
- Escrever resumos de gasto por projeto e área de volta no índice.
- Criar tarefas no índice a partir de pendências (ex.: "fatura vence amanhã").

> A carga inicial com os dados reais (contas, categorias pessoais, fixos, dívidas) é feita **fora do app**, direto na planilha, pelo usuário ou pelo assistente Claude via conector. O app precisa ler qualquer dado válido que já esteja na planilha.

## 5. Modelo de dados (abas da planilha)

Nomes exatos das abas: `Contas`, `Lancamentos`, `Recorrencias`, `Faturas`, `Parcelamentos`, `Dividas`, `Categorias`, `Regras`, `Parametros`, `ProjetosAreas`, `CaixaEntrada`, `Importacoes`.

Regras gerais:
- **Linha 1 = cabeçalho.** Os nomes das colunas são exatamente os listados abaixo, em `snake_case`. O app localiza colunas **pelo nome do cabeçalho, não pela posição**, para continuar funcionando se o usuário reordenar ou acrescentar colunas.
- **IDs**: texto com prefixo + ULID (ex.: `lan_01JD…`). Nunca reutilize.
- **Datas**: `AAAA-MM-DD`, como texto ISO. **Valores**: número decimal positivo em reais (ex.: `68.9`); o sinal vem de `tipo`. Na exibição, use `R$ 1.234,56`.
- **Fuso**: America/Sao_Paulo. "Hoje" é calculado nesse fuso.
- Colunas `criado_em` e `atualizado_em` (timestamp ISO) em todas as abas de entidades. Exclusão é lógica (`excluido = TRUE`), nunca física.
- **Linhas escritas por fora do app** (à mão ou pelo assistente via API) podem vir **sem `id`, `criado_em` ou campos opcionais**. Ao ler, o app gera os campos que faltam, aplica os padrões (ex.: natureza vinda da categoria) e grava de volta. Booleans aceitam `TRUE/FALSE`, `sim/não` e `1/0`. Datas aceitam também `dd/mm/aaaa`; números aceitam vírgula decimal.
- **Colunas de referência** (`*_id`) aceitam o id **ou** o nome exato do registro (ex.: o nome da conta). O app resolve nome → id ao ler e regrava o id. Se o nome for ambíguo ou não existir, a linha vai para "Linhas com problema".
- **Editar uma linha**: antes de cada `batchUpdate`, releia a coluna `id` para achar a linha atual, porque o usuário pode ter ordenado a planilha.

### 5.1 `Contas`
| coluna | tipo | notas |
|---|---|---|
| id | texto | `cta_…` |
| nome | texto | ex.: "Conta principal" |
| apelidos | texto | palavras que identificam a conta no texto livre, separadas por vírgula (ex.: `azul, principal`) |
| tipo | enum | `corrente` · `cartao` · `prepago` (vale-alimentação) · `dinheiro` |
| titular | texto | nome da pessoa |
| finais_cartao | texto | finais dos plásticos separados por vírgula, mapeados a pessoas: `1234:pessoa1,5678:pessoa2` |
| conta_pagamento_id | ref Contas | só para cartão: de onde sai o pagamento da fatura |
| saldo_inicial | número | saldo na `data_saldo_inicial`; cartão = 0 |
| data_saldo_inicial | data | |
| cor | texto | hex, para chips |
| ativa | bool | |
| ordem | número | ordem de exibição |

Fechamento e vencimento do cartão ficam em `Parametros`, porque mudam com o tempo. O crédito do pré-pago é uma Recorrência (9.4).

### 5.2 `Lancamentos`, a tabela central
| coluna | tipo | notas |
|---|---|---|
| id | texto | `lan_…` |
| tipo | enum | `despesa` · `receita` · `transferencia` · `ajuste` |
| status | enum | `previsto` · `agendado` · `realizado` · `cancelado` (seção 6) |
| descricao | texto | nome amigável (já passado pelas regras de nomes) |
| descricao_original | texto | texto cru do banco, se veio de importação |
| valor | número | > 0 |
| data_competencia | data | quando o gasto aconteceu (data da compra) |
| data_caixa | data | quando o dinheiro sai ou entra da conta corrente ou pré-paga. Cartão = vencimento da fatura |
| conta_id | ref Contas | origem (despesa/transferência) ou destino (receita) |
| conta_destino_id | ref Contas | só em `transferencia` |
| categoria | texto | ref Categorias.categoria |
| subcategoria | texto | ref Categorias.subcategoria |
| natureza | enum | `fixa` · `variavel` · `sazonal` · `divida` · `sonho` · `nenhuma` (padrão vem da categoria) |
| quem | enum | `pessoa1` · `pessoa2` · `casal` |
| fatura_id | ref Faturas | compras de cartão e pagamento de fatura |
| parcelamento_id | ref Parcelamentos | |
| parcela_num | número | 1..N |
| parcela_total | número | N |
| recorrencia_id | ref Recorrencias | se foi gerado por uma recorrência |
| divida_id | ref Dividas | parcela de dívida ou entrada de empréstimo |
| projeto_area | texto | nome do projeto ou da área (4.5) |
| projeto_id | texto | ID do projeto no índice, se for projeto |
| tags | texto | separadas por vírgula |
| docs | texto | URLs de arquivos do Drive, separadas por espaço |
| origem | enum | `manual` · `texto` · `importacao` · `recorrencia` · `caixa_entrada` · `parcelamento` |
| importacao_id | ref Importacoes | |
| chave_dedupe | texto | seção 8.3 |
| conciliado | bool | bateu com um extrato ou fatura importada |
| excluir_da_analise | bool | ex.: empréstimo recebido não é renda |
| sinal | enum | só em `ajuste`: `+` aumenta o saldo da conta, `-` diminui |
| observacao | texto | |
| excluido | bool | |
| criado_em / atualizado_em | timestamp | |

### 5.3 `Recorrencias`
| coluna | notas |
|---|---|
| id | `rec_…` |
| descricao, tipo, valor, conta_id, conta_destino_id, categoria, subcategoria, natureza, quem | iguais a Lançamentos (o valor é a estimativa) |
| frequencia | `semanal` · `mensal` |
| dia_semana | 1–7 (seg=1), se semanal |
| dia_mes | 1–31, ou `ultimo` · `penultimo_util` · `ultimo_util`, se mensal (dia 31 em mês curto = último dia) |
| inicio, fim | datas; `fim` vazio = sem fim |
| padrao_banco | texto ou regex que identifica a linha no extrato (ex.: `SPOTIFY`) |
| tolerancia_valor_pct | padrão 15 |
| ativa | bool |

**Geração de previstos:** ao abrir o app (e depois de editar uma recorrência), gere os previstos do **mês atual e dos 2 seguintes**, de forma idempotente: não crie se já existir um lançamento com o mesmo `recorrencia_id` na mesma data ou semana (para semanais) ou no mesmo mês (para mensais), em qualquer status. Editar uma recorrência "a partir de D" apaga (exclusão lógica) os previstos dela com data ≥ D ainda não casados e gera de novo. Desativar uma recorrência faz o mesmo a partir de hoje.

### 5.4 `Faturas`
| coluna | notas |
|---|---|
| id | `fat_…` |
| cartao_id | ref Contas |
| competencia | `AAAA-MM`, o mês do **vencimento** |
| data_fechamento, data_vencimento | datas calculadas pelos Parâmetros vigentes; editáveis |
| status | `aberta` · `fechada` · `paga` · `paga_parcial`. A fatura é criada sob demanda, quando a primeira compra cai nela. `aberta` → `fechada` automaticamente quando hoje ≥ data de fechamento. |
| valor_importado | total da fatura oficial, se importada |
| doc | URL no Drive |

### 5.5 `Parcelamentos`
`id` (`par_…`), `descricao`, `valor_total`, `parcelas`, `valor_parcela`, `data_compra`, `cartao_id`, `primeira_fatura` (`AAAA-MM`), `categoria`, `subcategoria`, `quem`.

### 5.6 `Dividas`
`id` (`div_…`), `credor`, `tipo` (`emprestimo_pessoal` · `consignado` · `familiar` · `cartao` · `outro`), `controlada` (bool), `juros_mes_pct`, `valor_para_quitar`, `total_parcelado`, `parcelas_restantes`, `valor_parcela`, `dia_vencimento`, `conta_pagamento_id`, `descontada_em_folha` (bool: se TRUE, a parcela não gera saída de caixa, porque o salário já vem líquido; aparece só na tabulação), `observacao`.

**Parcelas de dívida**: para cada dívida com `valor_parcela`, `dia_vencimento` e `descontada_em_folha = FALSE`, o app gera lançamentos `despesa` com natureza `divida` e status **`agendado`** (é um compromisso contratado), um por mês, até acabarem as `parcelas_restantes`, com a mesma janela de geração dos previstos (mês atual + 2). Quando um pagamento casa com uma parcela, ela vira `realizado` e `parcelas_restantes` diminui. Dívidas sem parcela fixa (ex.: familiar, sem prazo) não geram lançamentos; pagamentos avulsos são lançados à mão com `divida_id`.

### 5.7 `Categorias`
`categoria`, `subcategoria` (vazia = a categoria em si), `natureza_padrao`, `area_padrao` (opcional, 4.5), `orcamento_mensal` (opcional), `ativa`, `ordem`.

### 5.8 `Regras` (de-para de nomes)
| coluna | notas |
|---|---|
| id | `reg_…` |
| padrao | texto contido (sem diferenciar maiúsculas e acentos) ou `/regex/` |
| conta_id | opcional: a regra só vale para essa conta |
| descricao | nome amigável |
| categoria, subcategoria, natureza, quem | valores aplicados (vazio = não mexe) |
| recorrencia_id | opcional: liga a linha a uma recorrência |
| prioridade | número; a maior vence |
| vezes_usada | contador |
| ativa | bool |

### 5.9 `Parametros` (valores com data de vigência)
| coluna | notas |
|---|---|
| chave | ex.: `cartao.fechamento_dia` |
| escopo | ex.: id da conta; vazio = global |
| valor | texto ou número |
| vigente_desde | data |

Para ler um parâmetro numa data D, use a linha com `vigente_desde <= D` mais recente. Mudar um valor = **acrescentar uma linha nova**, nunca editar a antiga.

Chaves da V1:
- `pessoa1.nome`, `pessoa2.nome`
- `semanada.valor` e `semanada.modo` (`manual` · `sugerida`)
- `margem.pct` (padrão 15)
- `semana.cortes` (padrão `1-8,9-15,16-22,23-fim`)
- `cartao.fechamento_dia` e `cartao.vencimento_dia` (escopo = cartão)
- `conciliacao.janela_dias` (padrão 5)
- `ids.planilha`, `ids.pasta_financas`, `ids.pasta_faturas`, `ids.pasta_comprovantes`, `ids.pasta_entrada`, `ids.indice`
- `indice.*` (nomes de abas e colunas do índice; 4.5)

### 5.10 `ProjetosAreas`
`nome`, `tipo` (`projeto` · `area`), `id_indice`, `ativo`. É a **alternativa** quando o índice do segundo cérebro não está configurado, e também o cache das listas lidas do índice (4.5).

### 5.11 `CaixaEntrada`
Ponto de entrada para fontes externas (ex.: o assistente Claude escrevendo pela API do Sheets). **O app nunca confia cegamente nela.**
`id`, `recebido_em`, `fonte` (texto livre, ex.: `claude`; para importações, `importacao`), `texto` (frase livre), `valor`, `data`, `conta`, `categoria`, `subcategoria`, `quem`, `doc`, `status` (`novo` · `aceito` · `descartado`), `lancamento_id` (preenchido ao aceitar; em sugestões de importação, aponta para o candidato sugerido), `tipo_sugerido`, `descricao_original`, `chave_dedupe`, `importacao_id`, `conta_id`.

A mesma aba guarda as **linhas importadas pendentes de revisão** (`fonte = importacao`). Assim, a revisão pode ser interrompida e retomada, e nada entra em `Lancamentos` sem confirmação, a não ser os casamentos fortes.
Só `texto` é obrigatório. O app aplica o parser da seção 8.1 e as regras, mostra o resultado na fila de revisão e, ao aceitar, cria o lançamento e marca `aceito`.

### 5.12 `Importacoes`
`id` (`imp_…`), `data`, `conta_id`, `tipo_arquivo` (`csv` · `ofx` · `texto` · `pdf`), `nome_arquivo`, `doc` (URL no Drive), `linhas_lidas`, `casados`, `sugeridos`, `novos`, `ignorados`, `fatura_id`.

## 6. Status do lançamento: regras exatas

Analogia: **previsto** é um compromisso anotado a lápis na agenda (pode mudar ou nem acontecer); **agendado** é um compromisso assinado (vai sair de qualquer jeito, só não saiu ainda); **realizado** é o dinheiro que já saiu ou entrou da conta.

| status | significado | exemplos |
|---|---|---|
| `previsto` | Esperado, ainda não aconteceu. O valor é uma estimativa. | faxinas das próximas semanas, assinatura do mês que vem, salário do mês que vem, crédito futuro do vale |
| `agendado` | Já aconteceu ou está contratado, e o dinheiro ainda não saiu da conta. | compra no cartão (fatura aberta ou fechada e ainda não paga), parcelas futuras de compra parcelada, boleto agendado |
| `realizado` | O dinheiro saiu ou entrou da conta corrente ou pré-paga. | Pix, débito, compra no vale, compra no cartão **depois que a fatura é paga** |
| `cancelado` | Previsto que não aconteceu (pulado). Fica fora de todas as somas. | faxina desmarcada |

**`conciliado`** é outro campo, independente: indica que o lançamento bateu com uma linha de extrato ou fatura importada.

### 6.1 Status inicial ao criar
| situação | status |
|---|---|
| gerado por recorrência (qualquer data; se já passou, aparece como "Isso aconteceu?") | `previsto` |
| parcela de dívida gerada (5.6) | `agendado` |
| manual ou importado, conta `corrente`, `prepago` ou `dinheiro`, data ≤ hoje | `realizado` |
| manual, conta `corrente` ou `prepago`, data > hoje | `agendado` (o usuário pode trocar para `previsto`) |
| despesa em `cartao` (qualquer data) | `agendado`, ligada à fatura certa (6.3) |
| parcelas 2..N de um parcelamento | `agendado`, cada uma na sua fatura |
| transferência / pagamento de fatura, data ≤ hoje | `realizado` |

### 6.2 Transições
- **previsto → agendado ou realizado**: quando um lançamento real casa com ele (manual, importado ou da caixa de entrada; seção 8.4). O previsto **é atualizado no lugar**, ficando com o mesmo id, valor e data reais e `recorrencia_id` mantido. **Nunca** fica um previsto e um real duplicados.
- **previsto vencido**: se `data_competencia + janela_dias < hoje` e nada casou, ele continua previsto, mas aparece na revisão como **"Isso aconteceu?"**, com três ações: *Sim (lançar)*, *Não (cancelar)* e *Adiar*. O valor dele conta na projeção do mês até ser resolvido.
- **agendado (cartão) → realizado**: quando a fatura dele recebe um pagamento que cobre o total. Todas as despesas da fatura passam juntas para realizado, com `data_caixa` = data do pagamento.
- **Pagamento parcial de fatura**: a fatura fica `paga_parcial`, os lançamentos continuam agendados e aparece um alerta âmbar: "Fatura paga parcialmente: o saldo vira rotativo, a dívida mais cara que existe."
- O usuário pode mudar o status manualmente a qualquer momento. O app só pede confirmação se a mudança afetar uma fatura já paga.

### 6.3 Cartão: em qual fatura cai uma compra
- Fechamento F e vencimento V vêm dos Parâmetros vigentes na data da compra.
- Compra com data **antes** do dia de fechamento do mês M → fatura que fecha em M. **No dia do fechamento ou depois** → fatura que fecha em M+1. A fatura é identificada pelo mês do vencimento.
- Uma fatura importada é a fonte da verdade: se ela trouxer a compra em outra fatura, o app move a compra para lá.
- **Parcelamento** de N vezes: cria 1 linha em `Parcelamentos` e N lançamentos (`valor_total/N`; o último absorve a diferença de centavos), da fatura da compra em diante, cada um com `data_competencia` = data da compra e `data_caixa` = vencimento da sua fatura.
- **Assinatura no cartão**: a recorrência gera previstos com `conta_id` = cartão. Quando a assinatura aparece na fatura importada, casa com o previsto e vira agendado. Quando a fatura é paga, vira realizado.
- **Estorno ou crédito na fatura**: lançamento `receita` na conta cartão, ligado à fatura, com `categoria` = a do item estornado se houver regra, senão "Estorno". Ele abate o total da fatura.

## 7. Movimentações "gerenciais" (não são gasto nem renda)

| situação | como registrar | efeito |
|---|---|---|
| Transferência entre contas | `tipo=transferencia`, `conta_id` = origem, `conta_destino_id` = destino | sai de uma, entra na outra; **fora** de fotografia, semanada e categorias |
| Pagamento de fatura | `transferencia` da conta corrente para o cartão, com `fatura_id` | quita a fatura (6.2); não é despesa, porque as despesas são as compras |
| Crédito do vale-alimentação | `receita` na conta `prepago`, categoria "Benefício" | é renda: entra na fotografia em Entradas |
| Empréstimo recebido | `receita` com `divida_id` e `excluir_da_analise=TRUE` | entra no saldo, mas não é renda na fotografia |
| Parcela de dívida paga | `despesa`, natureza `divida`, com `divida_id` | entra em Dívidas/parcelas; reduz `parcelas_restantes` |
| Ajuste de saldo | `tipo=ajuste` com `sinal` `+` ou `-` | corrige diferenças entre o saldo do app e o do banco; fora das análises |

**Casar o pagamento de fatura:** uma transferência para o cartão (manual ou importada da conta corrente) é ligada à fatura `fechada` ou `aberta` de vencimento mais próximo cujo total esteja dentro de ±1% (forte) ou que seja a única em aberto (sugestão). Se o valor for menor que o total → `paga_parcial`.

Na importação, o app reconhece automaticamente "PAGAMENTO DE FATURA", "PAG FATURA", "PAGTO CARTAO", "TRANSF" e "PIX ENVIADO/RECEBIDO entre contas próprias" (por regra e pelas contas cadastradas) e sugere o tipo `transferencia`, sem nunca classificar como despesa.

## 8. Entradas de dados e conciliação

### 8.1 Texto livre curto (parser determinístico, sem IA)
Gramática tolerante, com ordem livre. Primeiro extraia os tokens especiais (`\d+x` = parcelas, `dd/mm` = data, `hoje`/`ontem`) e só depois procure o valor:
- **Valor**: o primeiro número (`45`, `45,90`, `45.90`, `R$45`).
- **Conta**: palavra que bate com o nome ou um apelido da conta (`azul`, `verde`, `vale`, `pix`; contas fictícias nos testes).
- **Data**: `hoje` (padrão), `ontem`, `dd/mm`.
- **Pessoa**: o nome de pessoa1 ou pessoa2 → `quem`.
- **Parcelas**: `3x`.
- **Descrição**: o resto, passado pelas Regras para sugerir categoria e natureza.

O resultado aparece **sempre como pré-visualização editável** antes de salvar.

**Casamento ao salvar lançamento manual:** antes de salvar, procure um `previsto` com a mesma regra ou recorrência (ou descrição semelhante, similaridade ≥ 0,6), valor dentro da tolerância e data dentro da janela, **em qualquer conta**. Se encontrar, pergunte em uma linha: "É a *Faxina* prevista de sexta?" [Sim] [Não, é outro]. No Sim, o previsto é atualizado no lugar (6.2).

Exemplos que precisam passar nos testes: `45 farmácia azul` · `ifood 68,90` · `uber 23,4 ontem` · `mercado 312 vale` · `geladeira 3x 2400 verde` · `30 padaria Pessoa2`.

### 8.2 Importação de arquivo (V1: CSV, OFX e texto colado)
Fluxo no iPhone: o usuário salva o arquivo no app Arquivos (ex.: anexo do e-mail → Salvar em Arquivos) → toca "Importar" no app → `<input type=file>` → escolhe a conta ou cartão → o app lê.

1. **Salva o original no Drive**, no destino e com o nome definidos em 4.5 b. Registra em `Importacoes`.
2. **Detecta o formato** e faz o parse:
   - **OFX**: use `FITID` como identificador estável da transação.
   - **CSV**: há um **perfil de colunas por banco**, configurável (delimitador, colunas de data, descrição e valor, formato de data, sinal). Comece pelos perfis genéricos e acrescente perfis específicos **a partir dos arquivos de exemplo** em `samples/` (anonimizados). Se não reconhecer o formato, mostre um assistente de mapeamento de colunas e salve o perfil.
   - **Texto colado**: um parser de linhas com data, descrição e valor, tolerante aos formatos `dd/mm`, `dd MMM` e `R$ 1.234,56`. Linhas sem valor são ignoradas e contadas.
   - **PDF**: na V1, apenas salva no Drive, liga à fatura ou ao lançamento escolhido e avisa "leitura automática de PDF chega numa próxima versão; cole o texto ou importe CSV/OFX".
3. Para fatura de cartão, identifica a fatura (pelo vencimento informado ou inferido) e, quando houver, os finais do cartão de cada linha → `quem`.
4. Roda a conciliação (8.4) e mostra a **tela de revisão**.

### 8.3 Chave de deduplicação
`chave_dedupe = conta_id | data_competencia | valor_em_centavos | descricao_original_normalizada | n`, em que `n` é o índice da ocorrência dentro do mesmo arquivo para linhas idênticas. Em OFX, use `conta_id|FITID`. Uma linha cuja chave já existe em Lançamentos é **ignorada** e contada como "já importado". Importar o mesmo arquivo duas vezes não muda nada.

### 8.4 Conciliação (casar importados com o que já existe)
**Similaridade de descrição**: coeficiente de Dice sobre bigramas de caracteres, depois de normalizar (minúsculas, sem acentos, sem números, sem prefixos de adquirente como `PAG*`, `IFD*`, `MP*`, `EC*`).

Para cada linha importada L, procure candidatos C na mesma conta (e, só para **sugestões**, também em outras contas, porque o usuário pode ter escolhido o cartão errado), não excluídos, ainda não conciliados:
1. **Casamento forte** (aplica sozinho): mesma `chave_dedupe`, **ou** mesmo valor exato + `|data| ≤ 2 dias` + (regra igual ou descrição semelhante, similaridade ≥ 0,6), **ou** previsto de recorrência cujo `padrao_banco` bate + valor dentro da tolerância + data dentro da janela. → Atualiza C com os dados reais (valor e datas do banco, `descricao_original`, `fatura_id`), status conforme 6.1, `conciliado=TRUE`.
2. **Sugestão** (o usuário confirma, e fica em `CaixaEntrada` com `lancamento_id` = candidato): valor exato e data dentro da janela, mas descrição diferente; ou valor dentro da tolerância de um previsto. → Card "Parece ser: …" com **É esse** / **Não, é outro**.
3. **Novo**: aplica as Regras e grava a linha em `CaixaEntrada` (`status=novo`), **pré-categorizada**, na lista "Novos". Ao aceitar, vira lançamento com o status de 6.1. Há o botão **Aceitar todos**. Sem regra = "Sem categoria", e tocar abre a categorização.
4. Ao categorizar um item novo à mão, ofereça **"Criar regra para ‘PADRAO’?"**, com o padrão já preenchido a partir do texto do banco.
5. Lançamentos **manuais** do período que não casaram com nada ficam listados ao final ("Lançados no app, mas não estão na fatura"), com as ações *Manter*, *Excluir* e *Mover para outra fatura*.

A revisão pode ser interrompida e retomada; o estado fica salvo na planilha.

### 8.5 Caixa de entrada
Na tela Semana, um aviso mostra a contagem de pendências (caixa de entrada + sugestões de importação + previstos vencidos). Tocar abre a mesma fila de revisão.

### 8.6 Anexar documento
Em qualquer lançamento ou fatura: **Anexar** → arquivo ou foto da câmera → envio ao Drive com o destino e o nome de 4.5 b → URL acrescentada em `docs`. A V1 não lê o conteúdo.

## 9. Cálculos

### 9.1 Semanas e semanada
- As semanas do mês seguem `semana.cortes` (padrão: 1–8, 9–15, 16–22, 23–fim do mês).
- **Gasto da semana** = soma das `despesa` com `natureza = variavel`, `data_competencia` dentro da semana, status `agendado` ou `realizado`, não excluídas e sem `excluir_da_analise`. A forma de pagamento não importa (cartão, vale, Pix, tudo conta).
- **Semanada da semana** = `semanada.valor` vigente (modo manual) ou a sugestão de 9.3 (modo sugerida). Sem acúmulo de sobras na V1.
- **Ainda podemos gastar** = semanada − gasto da semana. Pode ser negativo; aí aparece como "R$ 120 acima da semanada", em âmbar.
- **Por dia** = (ainda podemos gastar) ÷ (dias restantes da semana, incluindo hoje). Não mostre quando o valor for ≤ 0.
- O link **"Como chegamos nesse número?"** abre a conta passo a passo.

### 9.2 Fotografia do mês (visão por competência)
Para o mês M, usando `data_competencia` e excluindo transferências, ajustes, cancelados e `excluir_da_analise`:
- **Entradas** = receitas (realizadas + agendadas + previstas).
- Por natureza: **Fixas**, **Variáveis**, **Sazonais**, **Dívidas/parcelas**, **Sonhos/projetos** = despesas (realizadas + agendadas + previstas).
- **Variáveis na projeção** = o maior entre (realizado + agendado de variáveis no mês) e (semanada vigente × número de semanas do mês). Assim, a projeção não subestima o mês quando os gastos do dia a dia ainda não aconteceram.
- **Sazonais**: além dos lançamentos do mês, some 1/12 do total anual das recorrências e lançamentos marcados como sazonais nos próximos 12 meses (provisão), mostrando as duas parcelas separadas: "no mês" e "provisão".
- **Margem** = `margem.pct` × (fixas + variáveis + sazonais + dívidas + sonhos).
- **Resultado projetado** = entradas − todas as naturezas − margem.
- Cada bloco mostra quanto já foi realizado e quanto falta (previsto ou agendado).
- **Completude**: um bloco conta como "preenchido" se tiver pelo menos 1 lançamento ou recorrência no mês, ou um valor manual. Mostre "Fotografia X% pronta — faltam: …".

### 9.3 Semanada sugerida
Seja F = fixas + dívidas + sazonais (no mês + provisão) + sonhos de M, E = entradas de M e m = `margem.pct`/100. Variáveis do mês V = E ÷ (1 + m) − F, de modo que E = (F + V) × (1 + m). **Semanada sugerida** = V ÷ número de semanas de M, arredondada para baixo a múltiplos de R$ 10. Se V ≤ 0, mostre R$ 0 e a frase "Os compromissos do mês já passam das entradas. Veja a Fotografia.". Sempre exibida junto com a conta.

### 9.4 Saldos
- **Conta corrente ou pré-paga**: `saldo_inicial` + receitas − despesas ± transferências, somando só `realizado` com `data_caixa ≤ hoje`.
- **"Já reservado"** na conta: agendados e previstos com `data_caixa` até o próximo crédito de salário (faturas a vencer, boletos, fixos).
- **Pré-pago (vale)**: saldo atual e **"até o crédito de dd/mm"**. O crédito do vale é uma **Recorrência** de receita (mensal, `dia_mes = penultimo_util` ou `ultimo_util`) na conta pré-paga, que é a única fonte da data e do valor. O mesmo vale para o salário. Dia útil = segunda a sexta; feriados nacionais numa lista fixa `holidays-br.ts` de 2026 a 2028.
- **Fatura aberta**: soma das despesas menos os estornos, com o total dividido por `quem`.

### 9.5 Previsto do mês na tela Semana
"Novembro deve fechar em R$ X" = resultado projetado de 9.2. Quando for negativo, o texto é neutro, em âmbar, com o link "Veja onde dá para abrir espaço" levando à Fotografia.

## 10. Telas (critérios de aceitação)

A barra inferior é fixa, com 5 itens: **Semana · Extrato · [+] · Fotografia · Ajustes**. O botão central [+] abre o Lançamento rápido. Paleta calma: fundo `#F6F5F1`, cartões brancos com borda `#E6E3DB`, destaque verde-petróleo `#2E6B5A`, atenção em âmbar (`#9A5B00` sobre `#FBEFD9`). Nunca vermelho para "negativo". Fonte Inter ou a do sistema. Contraste ≥ 4,5:1.

### 10.1 Semana (tela inicial)
1. Cabeçalho: "Semana 3 · 16 a 22 nov".
2. Cartão de destaque: **"Ainda podemos gastar R$ X"**, "até dia 22 · cerca de R$ Y por dia" (o fim da semana corrente pelos cortes), barra de progresso, "Usado R$ A · Semanada R$ B" e o link "Como chegamos nesse número?".
3. Aviso de pendências (8.5), escondido quando a contagem for zero.
4. Dois cartões: **vale** (saldo + "até o crédito de dd/mm") e **conta corrente** (saldo + "R$ Z já reservados").
5. **Faturas abertas**: por cartão, total, "fecha em N dias" ou "vence dd/mm", e barra dividida por pessoa com legenda.
6. **Próximos 7 dias**: previstos e agendados com `data_caixa` nos próximos 7 dias.
7. Linha da projeção do mês (9.5).
- Critério de aceitação: abrir o app logado mostra o valor principal em até 2 s, com cache; os demais blocos podem carregar em seguida.

### 10.2 Lançamento rápido [+]
- Seletor Gasto / Entrada / Transferência, com Gasto como padrão.
- **Teclado numérico próprio** no topo, com o valor em destaque. O valor fica em centavos: digitar `6890` mostra `68,90`.
- Campo **"Onde?"** (texto, com o ditado por voz funcionando). Ao digitar, as Regras sugerem descrição, categoria, subcategoria e natureza, numa linha "Pela regra: Comida › Delivery · Variável" com a opção **trocar**.
- **Pagou com**: chips das contas ativas, pré-selecionando a última usada nessa categoria.
- **Quem**: chips Pessoa 1 / Pessoa 2 / Casal (padrão: o último usado).
- Data: "Hoje" com a opção **mudar**.
- **Mais detalhes** (recolhido): parcelas (só para cartão), projeto/área, tags, anexar documento, observação, status (só visualização, com opção de mudar).
- Uma frase sob os campos explica o status automático: "No cartão, entra como agendado até a fatura ser paga."
- Também aceita colar ou ditar uma frase inteira (8.1) num campo "Escrever tudo de uma vez".
- **Salvar** volta para a tela anterior e mostra um toast "Lançado · Desfazer" por 5 s.
- Critério de aceitação: um gasto repetido (ex.: iFood no cartão) entra em ≤ 4 toques depois de digitar o valor.

### 10.3 Extrato
- Busca (ícone) e chips de filtro: mês, pessoa, conta, categoria, natureza, status, origem, "não conciliados" e "sem categoria". Os filtros ficam salvos entre sessões.
- Linha de resumo: "Filtro: … · R$ total em N itens".
- Lista agrupada por dia, com ícone da categoria, descrição, "subcategoria · conta", valor e um **ponto de status** (cheio = realizado; vazado = agendado; tracejado = previsto) com legenda no rodapé.
- Toque abre o detalhe, com edição, anexos, link para a fatura e o parcelamento e histórico de origem.
- Deslizar à esquerda: excluir (com desfazer). Deslizar à direita: duplicar.
- Agrupamento opcional "por compra parcelada": mostra o total da compra, as parcelas pagas e as restantes.

### 10.4 Revisar (conciliação e pendências)
- Contadores: **já batiam · para confirmar · novos** (+ "lançados no app, mas não estão na fatura").
- Cartões de sugestão com "Na fatura: …" / "Parece ser: …" e os botões **É esse** / **Não, é outro**.
- Lista de novos, já categorizados, com **Aceitar todos** e toque para editar.
- Previstos vencidos: "Isso aconteceu?" (Sim / Não / Adiar).
- Itens da caixa de entrada.
- Botão "Trazer outra fatura ou extrato": arquivo ou texto colado.

### 10.5 Fotografia
- Seletor de mês e abas **Mês · Categorias · Dívidas**.
- **Mês**: barra de completude e o bloco "Como o mês se divide" (Entradas → − cada natureza → − margem → Resultado), em que cada linha mostra realizado e falta e abre a lista filtrada no Extrato. Depois vêm as Fixas por item, com barras, e os Projetos/sonhos.
- **Categorias**: ranking do mês com barras, comparação com a média dos 3 meses anteriores (quando houver dados) e corte por pessoa.
- **Dívidas**: tabulação no formato credor · juros ao mês · valor para quitar · total parcelado · parcelas restantes · valor da parcela, com o selo controlada/descontrolada e o total de parcelas mensais. Não oriente sobre quais dívidas quitar: só mostre os dados.
- Visão por parcelamentos: compras parceladas ativas, com valor total, parcelas pagas e quanto ainda compromete cada mês futuro (próximos 6 meses).

### 10.6 Ajustes
- **Entradas**: salário e outras receitas recorrentes (editar uma recorrência).
- **Contas e cartões**: lista; no cartão, fechamento e vencimento (Parâmetros); no vale, atalho para editar a recorrência do crédito (valor e regra de dia útil).
- **Toda edição de valor que muda com o tempo pergunta "Vale a partir de quando?"** (padrão: hoje) e grava uma linha nova em `Parametros` ou ajusta a recorrência a partir daquela data, sem reescrever o passado.
- **Semana**: semanada (valor ou modo sugerida), margem % e cortes das semanas.
- **Organização**: categorias, regras (com contagem de uso), recorrências e projetos/áreas.
- **Segundo cérebro**: pasta de finanças, pasta de entrada e índice, cada um com "trocar" (abre o Picker) e "Atualizar listas".
- **Dados**: abrir a planilha no Google Sheets, abrir a pasta de faturas e sair.

## 11. Segurança (modelo de ameaças resumido)
- **O código e o site são públicos; os dados não.** O site é só a interface. Os dados ficam no Drive do usuário e só aparecem depois do login Google dele.
- **Ninguém além do usuário consegue usar o app com dados.** A tela de consentimento OAuth fica em modo Teste, com só o e-mail do usuário como usuário de teste. Mesmo que alguém abra o site, cada pessoa só enxergaria o próprio Drive, porque não há servidor nem banco compartilhado.
- **Acesso mínimo**: o escopo `drive.file` limita o app aos arquivos que ele criou e aos itens escolhidos no Picker. O resto do Drive é inacessível, mesmo com um bug no código.
- **Sem segredos no repositório.** O Client ID e a chave do Picker são públicos por natureza; restrinja a chave ao domínio do site.
- **Dependências mínimas** e Dependabot ativo. Nada de scripts de terceiros carregados de CDN, exceto as bibliotecas oficiais do Google (GIS e Picker).
- **Sem analytics, sem logs remotos.** Os dados não saem do navegador, a não ser para as APIs do Google.
- **Content-Security-Policy** restrita (via meta tag) aos domínios do Google necessários.

## 11b. Requisitos não funcionais
- Funciona no Safari do iOS 17+ e como PWA instalada. Use `env(safe-area-inset-*)`.
- **Desempenho**: carregue as abas com uma chamada `spreadsheets.values.batchGet` e mantenha um cache em memória e em IndexedDB. Escreva por `append` (novas linhas) e por `batchUpdate` com localização por id (edições). Volume esperado: menos de 5 mil lançamentos por ano.
- **Robustez**: valide cada linha lida. Linha inválida não derruba o app: é ignorada e listada em "Ajustes › Dados › Linhas com problema".
- **Acessibilidade**: elementos nativos (`button`, `a`, `input` com `label`), `aria-label` em botões só com ícone e foco visível.
- O Client ID e a chave do Picker ficam em `src/config.ts`.

## 12. Dados padrão genéricos (criados no bootstrap)
Categorias genéricas, que o usuário vai substituir pelas próprias na carga inicial:
Moradia (Aluguel, Condomínio, IPTU, Contas da casa, Manutenção) · Alimentação (Supermercado, Feira, Delivery, Restaurante/Bar, Padaria) · Transporte (Aplicativo, Público, Combustível) · Saúde (Farmácia, Consultas, Terapia, Academia) · Assinaturas (Streaming de vídeo, Streaming de áudio, Software/apps, Armazenamento em nuvem) · Serviços (Faxina, Outros) · Lazer · Compras · Educação · Pets · Presentes/Doações · Taxas/Impostos · Dívidas (Parcela de empréstimo, Juros) · Benefício · Salário · Estorno · Sem categoria.
Natureza padrão: Assinaturas e Moradia = `fixa`; Alimentação, Transporte e Lazer = `variavel`; Taxas/Impostos = `sazonal`; Dívidas = `divida`; Benefício e Salário = `nenhuma` (receitas).

## 13. Plano de entrega (marcos pequenos, cada um demonstrável em `?demo=1`)
- **M0** · Projeto Vite + TS + PWA, CI com testes e deploy no GitHub Pages; `SETUP.md` (seção 15); modo demonstração com dados fictícios.
- **M1** · Repositório (interface + Memory + Sheets), bootstrap da planilha e da pasta no Drive, leitura por nome de cabeçalho, fila offline.
- **M2** · Lançamento rápido (+ parser 8.1 + Regras) e Extrato com filtros.
- **M3** · Recorrências → previstos; status (seção 6); tela Semana completa.
- **M4** · Cartões: faturas, parcelamentos, pagamento de fatura, transferências (seção 7).
- **M5** · Importação OFX, CSV e texto + salvar no Drive + conciliação + tela Revisar + caixa de entrada.
- **M6** · Fotografia (mês, categorias, dívidas, parcelamentos) e cálculos da seção 9.
- **M7** · Ajustes com vigência; anexos; acabamento visual; testes de aceitação.

Ao fim de cada marco: os testes passam, há deploy, e uma nota curta em `CHANGELOG.md` diz o que dá para testar no celular.

O service worker avisa quando há versão nova ("Atualização disponível · Recarregar").

## 14. Testes de aceitação mínimos (automatizados, sobre as funções de domínio)
1. Compra no cartão um dia antes do fechamento cai na fatura do mês; no dia do fechamento, cai na seguinte.
2. Um parcelamento de 3× R$ 100,00 cria 3 agendados em 3 faturas consecutivas; 3× R$ 100,01 tem a última parcela ajustada nos centavos.
3. Pagar o total da fatura muda todas as despesas dela para realizado; pagar metade deixa `paga_parcial` e as despesas agendadas.
4. Uma recorrência semanal de faxina gera previstos às sextas; importar a linha da faxina casa com o previsto daquela semana, sem duplicar.
5. Importar o mesmo OFX duas vezes não cria nada na segunda vez.
6. Uma linha "PAGAMENTO DE FATURA" importada vira `transferencia` e não aparece em categorias nem na semanada.
7. Um empréstimo recebido não entra em Entradas na fotografia.
8. Um parâmetro de fechamento alterado com vigência a partir de 01/12 não muda as faturas de novembro.
9. A semanada considera só `variavel` e ignora `previsto`, transferências e cancelados.
10. O parser 8.1 resolve os 6 exemplos da seção.
11. O próximo crédito do vale no penúltimo dia útil de nov/2026 é 27/11/2026 (30/11 cai numa segunda, 28 e 29 são fim de semana, 27 é sexta → último útil = 30/11 e penúltimo = 27/11).
12. Uma linha da planilha com data inválida é ignorada e listada como problema, e o app continua.
13. Uma linha escrita sem `id` na aba `CaixaEntrada` aparece na revisão e, ao ser aceita, vira lançamento com id e marca `aceito`.
14. Um lançamento manual "faxina 180" numa sexta com faxina prevista pergunta se é a prevista; no Sim, sobra um único lançamento realizado.
15. A projeção de variáveis usa semanada × semanas quando o gasto real do mês ainda é menor.
16. Uma parcela de dívida com `descontada_em_folha=TRUE` aparece na tabulação, mas não gera saída de caixa nem entra duas vezes na fotografia.
17. Um comprovante anexado a um lançamento com área diferente da de finanças vai para a pasta de entrada, com o nome padrão e o bloco `[financas] destino: … | lancamento: …` na descrição. Sem área, vai para `Comprovantes/AAAA/`.
18. Com o índice configurado, a lista de projetos e áreas mostra só os ativos e incubados, e o lançamento guarda o nome e o `projeto_id`.

## 15. `SETUP.md`, que o Claude Code deve escrever para um usuário **só com celular**
Passo a passo numerado, com prints opcionais, sem jargão:
1. **GitHub**: confirmar o repositório e ativar o Pages (Settings › Pages › Source: GitHub Actions). Anotar a URL do site.
2. **Google Cloud Console** (console.cloud.google.com, no Safari): criar o projeto "Finanças do Casal" → ativar Google Sheets API, Google Drive API e Google Picker API → criar a tela de consentimento OAuth (tipo Externo, modo **Teste**, com o e-mail do usuário como usuário de teste) → criar a credencial **ID do cliente OAuth (Aplicativo da Web)**, com a origem JavaScript autorizada = URL do site → criar a **chave de API** restrita ao Picker e ao domínio do site → anotar o **número do projeto** (usado como `appId` do Picker).
3. **Colar o Client ID e a chave de API** onde o `SETUP.md` indicar. Preferência: o Claude Code edita `src/config.ts` depois que o usuário cola os valores no chat.
4. Abrir o site no Safari → Entrar com Google → assistente de 3 passos (pasta de finanças, pasta de entrada, índice do segundo cérebro).
5. Compartilhar → **Adicionar à Tela de Início**.
6. Avisar o assistente (Claude, no chat) que a planilha foi criada, para ele fazer a carga inicial.

Inclua também: ativar a **verificação em duas etapas** no GitHub e no Google, e manter o compartilhamento da planilha restrito.

Explique em uma linha cada aviso que o Google mostrar ("app não verificado": normal em modo Teste; toque em Avançado › Continuar).

## 16. Perguntas em aberto (não bloqueiam a V1; registrar a escolha em `DECISIONS.md`)
- Formatos exatos de exportação de cada banco: os perfis de CSV serão ajustados com os arquivos em `samples/`.
- Acúmulo de sobra da semanada entre semanas: desligado na V1.
- Feriados municipais: fora da V1.

## 17. Glossário
- **Semanada**: valor por semana para os gastos variáveis do dia a dia.
- **Fotografia do mês**: o retrato de quanto entra e sai num mês comum, por natureza.
- **Natureza**: como o gasto se comporta — fixa (padrão estável), variável (recorrente, valor oscila), sazonal (algumas vezes por ano), dívida (parcelas), sonho/projeto (objetivos).
- **Competência × caixa**: competência é quando o gasto aconteceu; caixa é quando o dinheiro sai da conta.
- **Conciliar**: conferir o que está no app com o extrato ou a fatura do banco.
- **Regra (de-para)**: tradução do texto do banco ("IFD*IFOOD") para nome, categoria e natureza.
