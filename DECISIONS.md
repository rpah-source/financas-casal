# Decisões

Registro de escolhas não especificadas no SPEC (SPEC, cabeçalho: "registre a opção mais simples").

## M0
- **D1 · Preact** em vez de React: mais leve (~10 kB), mesma API. SPEC 4.1 permite os dois.
- **D2 · Versões das ferramentas:** Vite 8, Vitest 5, TypeScript 5.8. As versões anteriores do Vitest tinham alertas de segurança críticos (`npm audit`).
- **D3 · Service worker escrito à mão** (gerado no build por um plugin de 60 linhas em `vite.config.ts`) em vez de `vite-plugin-pwa`: menos dependências (SPEC 11). Estratégia: app shell em cache; navegação tenta a rede e cai no cache sem internet; APIs do Google nunca passam pelo cache.
- **D4 · Aviso de atualização:** quando há versão nova, aparece "Atualização disponível · Recarregar". Só recarrega quando o usuário toca. O app também procura versão nova ao voltar para a tela (comum no iPhone).
- **D5 · `base: './'`** (caminhos relativos) para o mesmo build funcionar no GitHub Pages (`/financas-casal/`) e no Cloudflare Pages (`/`).
- **D6 · Fonte do sistema** (San Francisco no iPhone) em vez de baixar a Inter: evita carregar arquivos de terceiros e funciona offline. A pilha de fontes já começa por Inter, caso esteja instalada.
- **D7 · CSP só no build:** o servidor de desenvolvimento do Vite usa scripts inline, incompatíveis com a política.
- **D8 · Navegação por hash** (`#/semana`, `#/extrato`…): funciona no GitHub Pages sem configuração de servidor.
- **D9 · No M0 o app roda sempre em modo demonstração**, porque o login Google só chega no M1. Os dados fictícios usam datas relativas a "hoje" para a demonstração parecer viva.
- **D10 · Valores arredondados no destaque:** o "Ainda podemos gastar" e o "por dia" arredondam **para baixo** (nunca mostram mais do que existe); "acima da semanada" arredonda para cima. A conta detalhada mostra os centavos.
- **D11 · Cortes de semana inválidos** em `semana.cortes` voltam ao padrão `1-8,9-15,16-22,23-fim`, sem travar (princípio 5).
- **D12 · Publicação:** o GitHub Actions publica a cada push na `main` (SPEC 4.1). O trabalho de cada marco é feito num ramo próprio e chega à `main` com a autorização do usuário.

## M1
- **D13 · Leitura sem formatação:** a planilha é lida com `UNFORMATTED_VALUE` (números chegam como números, sem ambiguidade de vírgula) e datas como texto formatado. Escrita sempre com `RAW` (o Google não reinterpreta "2026-11-19" nem "68.9").
- **D14 · Números digitados como texto:** se houver vírgula, ela é o decimal e os pontos são milhar (`1.234,56`). Sem vírgula, o ponto é decimal (`68.9`).
- **D15 · Referência por nome** (ex.: `conta_id` = "Conta Azul") compara sem diferenciar maiúsculas e acentos. Apelidos não valem como referência (só no texto livre, M2). Ambíguo ou inexistente → "Linhas com problema".
- **D16 · Colunas extras** que o usuário criar são preservadas nas regravações. Colunas da SPEC que faltarem são acrescentadas no fim do cabeçalho; abas que faltarem são criadas.
- **D17 · `excluido`, `criado_em` e `atualizado_em`** em todas as abas com id (Contas, Lancamentos, Recorrencias, Faturas, Parcelamentos, Dividas, Regras, CaixaEntrada, Importacoes). Categorias, Parametros e ProjetosAreas não têm id (são listas de configuração).
- **D18 · id duplicado** (linha copiada à mão): a primeira mantém o id, as outras ganham um id novo.
- **D19 · Linhas sem id gravadas de volta pela posição** lida no mesmo carregamento (não há id para relocalizar). Linhas com id sempre são relocalizadas relendo a coluna `id`.
- **D20 · Parâmetros do bootstrap** valem desde `2000-01-01`, para qualquer data passada usar o padrão. Pasta de entrada e índice escolhidos depois entram como linha nova, vigente a partir de hoje.
- **D21 · `semanada.valor` começa em 0** na planilha nova: a tela Semana explica que falta definir (na carga inicial ou em Ajustes, M7). A pasta `Comprovantes/` só é criada quando o primeiro comprovante for anexado (M7).
- **D22 · Token do Google guardado no aparelho só até expirar (~1 h)**, para o app abrir já com os dados. Os dados também ficam em cache no IndexedDB e aparecem na hora; a atualização vem em seguida.
- **D23 · Status inicial (SPEC 6.1) já aplicado na leitura** de linhas sem status. Linhas do cartão ficam com `data_caixa` = data da compra até o M4 (faturas).
- **D24 · Fila offline:** só falta de conexão e sessão expirada vão para a fila; outros erros aparecem na hora. Reenvio é idempotente (antes de acrescentar, confere se o id já está na planilha).
- **D25 · CSP ampliada** para os domínios do Google usados pelo login e pelo Picker (gstatic, content.googleapis.com, fonts do Google para o Picker).

## M2
- **D26 · Sugestão sem regra:** quando nenhuma Regra casa, o app sugere a categoria se uma palavra do "Onde?" for o nome de uma subcategoria ou categoria (ex.: "farmácia" → Saúde › Farmácia). A tela diz "Sugestão" (e não "Pela regra").
- **D27 · Desempate das regras:** maior `prioridade`; depois regra específica da conta; depois padrão mais longo; depois `vezes_usada`. Usar uma regra soma 1 em `vezes_usada`.
- **D28 · "Lembrar para…":** ao escolher a categoria à mão, o app oferece (marcado por padrão) criar uma Regra com o padrão limpo do texto.
- **D29 · Texto livre:** `dd/mm` usa o ano corrente; se cair mais de 60 dias no futuro, entende como ano passado. "1.850" (ponto + 3 dígitos) é milhar. Aceita também "anteontem" e as palavras literais `pessoa1`/`pessoa2`.
- **D30 · Conta e pessoa automáticas:** conta = a última usada nessa categoria (senão a última usada); pessoa = a última usada.
- **D31 · Parcelas no cartão** ficam para o M4 (o texto livre já reconhece `3x`). Casamento com previstos ao salvar (8.1) entra no M3, junto com as recorrências.
- **D32 · Lista de projetos e áreas** do índice fica em cache no aparelho (atualiza pelo botão "Atualizar listas"). A aba `ProjetosAreas` da planilha é usada quando não há índice. Status vazio no índice conta como ativo.
- **D33 · Total do filtro no Extrato** soma com sinal (despesa −, receita +, ajuste conforme o sinal); transferências não entram no total.
- **D34 · Filtros do Extrato** usam seletores nativos do iPhone em forma de chip; ficam salvos no aparelho.

## M2.1 (carga inicial)
- **D35 · Sem caixinhas de marcar:** colunas sim/não usam lista suspensa TRUE/FALSE. A caixinha fazia o Google gravar FALSE em todas as linhas vazias, e o `append` passava a escrever depois da linha 1000. A leitura também ignora linhas só com vazios/FALSE.
- **D36 · Apelidos com várias palavras** ("crédito laranja") valem no texto livre; o nome ou apelido mais longo vence.
- **D37 · Saldo de fatura na carga inicial:** entra como um lançamento `despesa` agendado no cartão, natureza `nenhuma` e `excluir_da_analise = TRUE` ("Fatura atual (saldo de abertura)"). Conta para o total da fatura e o caixa reservado (M4), mas não para semanada nem fotografia, porque são compras anteriores ao app.

## M3
- **D38 · `dia_mes = primeiro_util`** acrescentado (além de número, `ultimo`, `penultimo_util`, `ultimo_util`), porque o salário cai no 1º dia útil.
- **D39 · Feriados calculados** para qualquer ano (Páscoa por algoritmo), em vez de uma lista fixa 2026–2028. Inclui Carnaval (seg/ter), Sexta-feira Santa e Corpus Christi, porque os bancos fecham nesses dias.
- **D40 · Idempotência dos previstos:** conta todo lançamento da recorrência que não está excluído, em qualquer status. Por isso, "excluir" um previsto de recorrência no app marca como **cancelado** (pulado), e não como excluído; senão ele voltaria na próxima abertura.
- **D41 · "Adiar"** em "Isso aconteceu?" muda a data do previsto para hoje; ele volta a perguntar depois da janela de conciliação.
- **D42 · Saldo da conta** soma os realizados com `data_caixa` desde a `data_saldo_inicial` (inclusive) até hoje: o saldo informado é o do começo daquele dia.
- **D43 · "Já reservado"** vai de hoje até o próximo salário (recorrência de receita com categoria "Salário" na conta); sem salário, até o fim do mês. Faturas de cartão entram nessa conta no M4.
- **D44 · Faturas abertas na Semana (provisório até o M4):** total = compras agendadas no cartão − estornos, dividido por pessoa; fechamento/vencimento pelos Parâmetros vigentes. Compras no cartão não aparecem em "Próximos 7 dias" (saem na fatura).
- **D45 · Contas da Fotografia (9.2) já implementadas** porque a Semana mostra a projeção do mês (9.5). A tela da Fotografia continua no M6. A provisão de sazonais soma os lançamentos sazonais dos próximos 12 meses e as ocorrências de recorrências sazonais ainda não geradas, ÷ 12.
- **D46 · Pergunta de casamento** sem gênero gramatical: "É **Faxina** (previsão de amanhã, R$ 180,00)?".

## M4
- **D47 · Fatura identificada pelo mês do vencimento** (`competencia`), criada sob demanda e ligada pelas compras via `fatura_id`; `data_caixa` da compra = vencimento da fatura. Ao abrir, o app liga compras de cartão sem fatura (inclusive previstos de assinaturas e linhas escritas por fora) e fecha as faturas cujo fechamento chegou.
- **D48 · Cartão sem fechamento/vencimento cadastrados:** a compra fica sem fatura (data de caixa = data da compra) e a Semana avisa o que falta cadastrar.
- **D49 · Total da fatura** = compras − estornos, inclusive previstos de assinatura que já caíram nela. Pagamento quita com 1% de folga.
- **D50 · Situação da fatura sempre recalculada** a partir dos pagamentos realizados (pagar, editar, excluir ou desfazer um pagamento): paga → compras realizadas na data do último pagamento; parcial ou nada pago → compras agendadas com caixa no vencimento.
- **D51 · Pagamento agendado para o futuro** liga à fatura, mas só quita quando vira realizado.
- **D52 · Excluir uma parcela exclui a compra parcelada inteira** (todas as parcelas e a linha em Parcelamentos); desfazer restaura todas.
- **D53 · Parcelas: de 2 a 48.** Cada parcela mantém a natureza e a categoria da compra; competência = data da compra (SPEC 6.3), então a compra inteira pesa no mês/semana da compra.
- **D54 · Entrada no cartão = estorno:** categoria "Estorno" quando não houver outra, natureza `nenhuma`.
- **D55 · Na Semana, por cartão:** faturas fechadas ainda não pagas + a fatura aberta atual. As futuras (parcelas, assinaturas) aparecem no detalhe e no Extrato.
- **D56 · Ajuste de saldo:** no detalhe do saldo, "O saldo do banco está diferente? Ajustar" lança a diferença como `ajuste` (`sinal` + ou −), fora das análises.
- **D57 · Empréstimo recebido:** opção em "Mais detalhes" da Entrada; marca `excluir_da_analise`.

## M5
- **D58 · Chave de deduplicação com FITID inclui o valor com sinal** (`conta|FITID|±centavos`): no arquivo real do Nubank, compra e estorno (e compra e IOF) vêm com o mesmo FITID. Sem FITID: `conta|data|±centavos|descrição normalizada|n` (SPEC 8.3, com o sinal). Linha cuja chave já está em Lançamentos **ou na CaixaEntrada** (inclusive descartada) é ignorada — assim importar de novo não muda nada.
- **D59 · Texto colado do PDF de fatura:** o leitor entende seções (créditos/pagamentos, parcelamentos, despesas), cabeçalho de cada cartão com o final (→ pessoa por `finais_cartao`), ícones soltos antes da data e várias compras na mesma linha. Ano inferido: o mais recente que não passa do vencimento (ou de hoje).
- **D60 · Parcela vinda da fatura** (ex.: "Loja - Parcela 3/6" ou "LOJA 03/06") vira um lançamento com `parcela_num`/`parcela_total`, sem criar as parcelas futuras (elas chegam nas próximas faturas). Casa com parcela já lançada no app pelo número e valor.
- **D61 · Pagamento visto na fatura** ("Pagamento recebido", "DEB AUTOM DE FATURA") vira transferência da conta que paga o cartão; casa com o pagamento já registrado (mesmo valor, dentro da janela) e quita a fatura certa pelo valor.
- **D62 · Fatura da importação:** pelo vencimento informado (texto) ou escolhido na tela; sem ele, a de fechamento mais próximo do fim do período do arquivo (OFX). Total do banco fica em `valor_importado`; o arquivo em `doc`.
- **D63 · Original no Drive** em `Faturas e extratos/AAAA/` (pasta do ano criada pelo app), com o nome de 4.5 b. Se o envio falhar (sem internet), a importação continua sem o link.
- **D64 · Conta lembrada por arquivo:** o identificador da conta no banco (OFX `ACCTID`) fica em Parametros (`importacao.conta_externa`) para pré-selecionar a conta nas próximas importações. Perfis de CSV salvos em Parametros (`csv.perfil`, valor JSON).
- **D65 · "Aceitar todos"** grava os novos em lote (uma escrita); transferências são aceitas uma a uma (precisam achar a fatura que quitam). Itens sem conta ou valor ficam para o usuário completar.
- **D66 · "Manter"** em "Lançados no app, mas não estão na fatura" só esconde o aviso neste aparelho (não muda o lançamento).
- **D67 · @types/node** como dependência de desenvolvimento, só para os testes lerem os arquivos de `samples/`.

## Ajustes do segundo cérebro (20/11/2026)
- **D68 · Sem subpastas no Drive:** a pasta de faturas (`ids.pasta_faturas`, hoje "Finanças Pessoais - Comprovantes", fora da pasta de Finanças) recebe os arquivos direto, sem `AAAA/`. O bootstrap não cria mais "Faturas e extratos": a pasta de faturas começa igual à de Finanças e pode ser trocada em Ajustes › Segundo cérebro. Substitui a tabela de destinos de SPEC 4.5 b.
- **D69 · Nomes:** fatura `AAAA-MM – Fatura – <conta>` (mês do vencimento), extrato `AAAA-MM – Extrato – <conta>` (mês do fim do período). Comprovante sem mudança.
- **D70 · Destino de comprovante (M7):** sem projeto/área → direto na pasta de faturas e comprovantes; com outro projeto/área → pasta de Entrada com `[financas] destino: <nome exato da pasta no Índice>`. Contrato completo em `docs/integracao-segundo-cerebro.md`.
- **D71 · CaixaEntrada externa:** `status` aceita `pendente` como sinônimo de `novo` (o app regrava `novo`). Item externo com mesmo valor, mesma conta e data ±janela de um lançamento existente mostra "Parece ser… É esse?", que liga o comprovante (`doc`) ao lançamento em vez de duplicar.
- **D72 · Extratos reais:** CSV com preâmbulo e quebra de linha dentro das aspas; "Debito aut. fat.cartao" = pagamento de fatura; "Pix no cartao final NNNN" = transferência do cartão (pelo final) para a conta; "Contratacao credito consignado" = empréstimo recebido (`tipo_sugerido = emprestimo`, fora da análise); Pix para nome jurídico de banco próprio (ex.: "Nu pagamentos") ou para o titular = transferência. Transferência que chega usa `tipo_sugerido = transferencia_entrada`. Quando o app não sabe a outra conta, a Revisar pede para escolher.
- **D73 · Texto de extrato sem CPF/agência/conta:** o leitor de OFX remove CPF mascarado, agência e número de conta do MEMO.
- **D74 · Parâmetros duplicados:** linhas genéricas `pessoa1.nome`/`pessoa2.nome` removidas da planilha do usuário (mesma vigência das reais). Em empate de vigência continua valendo a linha mais abaixo.
- **D75 · Recorrência semanal sem cortes do mês:** um previsto semanal já existe se houver lançamento da recorrência a até 3 dias da data prevista (a faxina muda de dia; a semana 1–8 dos cortes pode ter duas quintas). Substitui "mesma semana" de SPEC 5.3 para semanais.
- **D76 · Conta lembrada sem número:** a conta do banco (OFX `ACCTID` ou agência/conta do cabeçalho do CSV) é guardada só como resumo (hash FNV-1a, `h1a2b3c4d`) em `importacao.conta_externa`; o número nunca vai para a planilha.
- **D77 · Fatura antiga já paga:** ao importar fatura com vencimento no passado, a tela oferece "Esta fatura já foi paga" (marcado): a fatura fica `paga` e as compras entram realizadas, sem precisar do pagamento.
- **D78 · Pagamento sem valor igual** só quita fatura com vencimento a até 10 dias da data do pagamento; senão fica transferência sem fatura (pagamento antigo não quita a fatura atual).

## Próximas versões (pós-M5)
- **D79 · Categorias com tipo:** nova coluna `tipo` em Categorias (`despesa` · `receita` · `transferencia`, padrão `despesa`). Telas de escolha, sugestões por nome e filtro do Extrato mostram só as do tipo do lançamento. Padrões novos: "Presentes" e "Doações" separados, "Rendimentos" e "Outras entradas" (receitas) e "Transferências › Pagamento de fatura / Entre contas próprias" (gerencial). Transferência recebe essa categoria ao ser criada (se existir na planilha); continua fora de semanada, fotografia e categorias de gasto. Categorias pessoais (ex.: repasse para a parceira) ficam só na planilha do usuário.
- **D80 · Revisar abre o item:** tocar num item da revisão abre a folha com o texto completo do banco e campos para ajustar (descrição, categoria, conta, contas da transferência, quem, criar regra) antes de lançar.
- **D81 · Empréstimo ↔ dívida:** categoria de entrada "Empréstimo" (marca `excluir_da_analise`). Ao lançar/aceitar um empréstimo, o app abre o cadastro da dívida (credor, parcela, parcelas que faltam, dia, conta ou "descontada no salário", juros e valor para quitar opcionais); a entrada guarda `divida_id`. As parcelas viram agendadas (mês atual + 2), a partir da data de cadastro. Parcela que vira realizada baixa `parcelas_restantes`. No detalhe da entrada: dívida ligada, ou "Cadastrar a dívida" / "ligar a uma existente".
- **D82 · Anexos (SPEC 8.6, antecipado do M7):** "Anexar documento ou foto" no detalhe de qualquer lançamento. Arquivo vai para o Drive com o nome `AAAA-MM-DD – Comprovante – <Descrição> – R$ <valor>`; com projeto/área diferente de Finanças → pasta de Entrada com o bloco `[financas]`; senão → pasta de faturas e comprovantes. Link em `docs`.
- **D83 · "Aplicativo/Táxi"** substitui a subcategoria "Aplicativo" de Transporte.
