# Changelog

## M5.2 · Importar o histórico — 21/11/2026
- Importar: aviso claro quando falta escolher a conta; o app lembra a conta do CSV do Santander pelo cabeçalho (sem guardar o número da conta).
- Fatura antiga: opção "Esta fatura já foi paga" — as compras entram como realizadas e a fatura não aparece como aberta.
- Pagamento antigo visto numa fatura não quita mais a fatura atual.

## M5.1 · Extratos reais e regras do segundo cérebro — 20/11/2026
- Previsto semanal (ex.: faxina) conta a semana a partir do dia previsto (±3 dias), sem pular quando o mês tem duas quintas na mesma "semana".
- Arquivos importados vão direto para "Finanças Pessoais - Comprovantes", sem pasta por ano, com o nome "AAAA-MM – Fatura (ou Extrato) – conta".
- Extrato CSV do Santander e OFX da conta do Nubank lidos do jeito que os bancos mandam.
- Reconhece sozinho: pagamento de fatura, Pix entre contas próprias, "Pix no cartão" e empréstimo recebido (não conta como renda).
- Na Revisar, transferência sem a outra conta conhecida pede para escolher; item da caixa de entrada que já foi lançado mostra "Parece ser… É esse?" e liga o comprovante, sem duplicar.
- Ajustes › Segundo cérebro: escolher a pasta de faturas e comprovantes.
- Contrato para quem escreve na planilha: `docs/integracao-segundo-cerebro.md`.

## M5 · Importar faturas e extratos — 20/11/2026
**O que dá para testar no celular**
- **Extrato › Importar** (ou Revisar › Trazer outra fatura ou extrato): escolha a conta/cartão e um arquivo **OFX** ou **CSV** do app Arquivos, ou **cole o texto** da fatura (ex.: copiado do PDF do Santander).
- A tela mostra o que encontrou e confere com o total do banco ("Compras − créditos lidos" × "Total informado pelo banco"). No cartão, confirme o vencimento da fatura.
- O arquivo original vai para "Faturas e extratos/AAAA/" no Drive.
- **Revisar**: contadores (já batiam · para confirmar · novos), cartões "Parece ser…" com **É esse / Não, é outro**, lista de novos já categorizados com **Aceitar todos**, toque na categoria para trocar e oferta **"Criar regra para…"**, e "Lançados no app, mas não estão na fatura" (Manter / Excluir / Mover).
- Importar o mesmo arquivo de novo não duplica nada.
- Itens escritos na aba **CaixaEntrada** por fora (ex.: pelo assistente) aparecem em Revisar para aceitar ou descartar.
- PDF: por enquanto só é salvo no Drive e ligado à fatura (leitura automática numa próxima versão).

## M4 · Cartões e faturas — 20/11/2026
**O que dá para testar no celular**
- Compra no cartão cai na **fatura certa** pelo dia de fechamento. A tela de lançar diz em qual fatura cai ("Cai na fatura que vence 07/12").
- **Parcelado:** `geladeira 3x 2400 nubank` (ou Mais detalhes › Parcelas) cria uma parcela em cada fatura. No Extrato aparece "1/3, 2/3, 3/3".
- **Semana › Faturas abertas:** total, "fecha em N dias · vence dd/mm", divisão por pessoa. Tocar abre a fatura com as compras e o botão **Registrar pagamento**.
- **Pagar o total** marca todas as compras da fatura como realizadas. **Pagar menos** deixa a fatura "paga parcialmente", com aviso em âmbar sobre o rotativo.
- Transferência para um cartão (no +) também conta como pagamento e mostra quanto falta.
- **"Já reservado"** da conta passa a incluir as faturas que vencem antes do próximo salário. **Próximos 7 dias** mostra faturas vencendo.
- **Ajustar saldo** (tocar no saldo da conta ou do vale) e **empréstimo recebido** (Entrada › Mais detalhes).

## M3 · Previstos e Semana completa — 19/11/2026
**O que dá para testar no celular**
- Ao abrir, o app cria os **previstos** das recorrências (salário, crédito do vale…) do mês atual e dos 2 seguintes. Eles aparecem no Extrato com o ponto tracejado.
- **Semana** agora mostra: pendências para revisar, saldo do vale ("até o crédito de dd/mm"), saldo de cada conta corrente com o "já reservado", faturas abertas por cartão (fecha em N dias · vence dd/mm, dividido por pessoa), próximos 7 dias e "Novembro deve fechar em R$ X". Tocar em cada bloco mostra a conta.
- Ao lançar algo parecido com um previsto (mesmo valor ± 15%, data próxima, descrição parecida), o app pergunta **"É … (previsão de …)?"**. No Sim, o previsto vira o lançamento real, sem duplicar.
- **Revisar**: previstos que passaram da data perguntam **"Isso aconteceu?"** (Sim / Não / Adiar).

## M2.1 · Ajustes da carga inicial — 19/11/2026
- Corrigido: planilhas novas criavam caixinhas de marcar que enchiam a aba de "FALSE" e empurravam linhas novas para depois da linha 1000. Agora são listas TRUE/FALSE, e linhas só com FALSE são ignoradas.
- Texto livre reconhece apelidos com mais de uma palavra.

## M2 · Lançar e Extrato — 19/11/2026
**O que dá para testar no celular**
- Botão **+**: digite o valor no teclado do app (6890 = R$ 68,90), escreva "Onde?" e toque em **Salvar**. A categoria aparece sozinha ("Pela regra" ou "Sugestão"); conta e pessoa vêm da última vez.
- **Escrever tudo de uma vez**: `45 farmácia azul ontem` preenche valor, conta e data (o ditado por voz do teclado funciona).
- Depois de salvar: aviso **"Lançado · Desfazer"** por 5 segundos.
- Ao escolher a categoria à mão: opção **"Lembrar para…"** cria uma regra para as próximas vezes.
- **Extrato**: mês, busca, filtros (pessoa, conta, categoria, natureza, status, origem, não conciliados, sem categoria), total do filtro, lista por dia.
- Na lista: tocar abre o detalhe para editar; deslizar ← exclui (com desfazer); deslizar → duplica para hoje.
- **Mais detalhes › Projeto ou área**: vem da sua planilha-índice (Ajustes › Atualizar listas).

## M1.1 · Login Google ligado — 19/11/2026
- Client ID, chave do Picker (restrita ao site) e número do projeto configurados em `src/config.ts`. O botão **Ajustes › Entrar com Google** passa a aparecer.

## M1 · Conexão com o Google e a planilha — 19/11/2026
**O que dá para testar no celular**
- Sem configurar nada: o modo demonstração continua igual.
- Depois da Parte 3 do SETUP.md (Google Cloud): **Ajustes › Entrar com Google**, escolher a pasta de Finanças e ver a planilha "Finanças do Casal — Base" aparecer no seu Drive, com as 12 abas, as listas suspensas e as categorias padrão.
- Escrever uma linha à mão na planilha (ex.: em Lancamentos, valor `45,90`, data `19/11/2026`, conta pelo nome) e tocar em **Atualizar dados**: o app completa id, status e natureza na planilha.
- Escrever uma data errada de propósito: a linha aparece em **Ajustes › Linhas com problema** e o resto continua funcionando.
- Fechar e reabrir o app: abre direto com os seus dados (do cache), mesmo sem internet.

Por dentro: leitura por nome de coluna, referências por nome, fila offline (IndexedDB), cache, login com Google (escopo drive.file) e Picker.

## M0 · Base do app — 19/11/2026
**O que dá para testar no celular** (modo demonstração, com dados fictícios):
- Abrir o site no Safari e ver a tela **Semana** com "Ainda podemos gastar", a barra de progresso e o "por dia".
- Tocar em **"Como chegamos nesse número?"** e ver a conta passo a passo.
- Tocar nos 5 botões da barra de baixo (as outras telas mostram o que vem em cada marco).
- **Compartilhar › Adicionar à Tela de Início**: o app abre em tela cheia, com ícone próprio, e abre mesmo sem internet.

Por dentro: projeto Vite + TypeScript + Preact, PWA (manifesto, ícones, service worker com aviso de atualização), testes automáticos (Vitest) e publicação automática no GitHub Pages.
