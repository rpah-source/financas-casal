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
