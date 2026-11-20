# Integração com o Segundo Cérebro

Como outros sistemas (ex.: a rotina do segundo cérebro, o assistente Claude) podem
escrever na planilha **Finanças do Casal — Base** sem quebrar nada.
Atualizado em 20/11/2026.

## Regra de ouro
Fontes externas escrevem **só** nas abas `CaixaEntrada` e `Importacoes`. Nunca em
`Lancamentos`. O app mostra cada item em **Revisar** e só lança quando o usuário aceita.

## CaixaEntrada — uma linha por gasto ou entrada
| coluna | preencher? | formato |
|---|---|---|
| `id` | **deixe em branco** | o app gera `cxe_` + ULID (26 caracteres, base32 de Crockford) e grava na própria linha ao abrir |
| `recebido_em` | sim | data/hora ISO (ex.: `2026-11-20T14:30:00-03:00`) |
| `fonte` | sim | texto livre (ex.: `segundo-cerebro`). Não use `importacao` (reservado ao app) |
| `texto` | **obrigatório** | o que foi lido (ex.: `Farmácia Exemplo 45,90`) |
| `valor` | sim | número **positivo**, vírgula ou ponto decimal (`45,90`) |
| `data` | sim | `AAAA-MM-DD` ou `dd/mm/aaaa` |
| `conta` | sim | nome **ou** apelido da aba `Contas` |
| `categoria`, `subcategoria` | se souber | nomes da aba `Categorias` |
| `quem` | se souber | `pessoa1`, `pessoa2` ou `casal` (aceita também os nomes das pessoas) |
| `doc` | se houver | link do arquivo no Drive (vai para o campo `docs` do lançamento) |
| `status` | sim | `novo` (o app também aceita `pendente` e grava como `novo`) |
| `tipo_sugerido` | **só se não for gasto** | vazio = gasto (`despesa`). Use `receita` para entradas e estornos, `transferencia` para movimento entre contas próprias |
| `lancamento_id`, `chave_dedupe`, `importacao_id`, `conta_id` | deixe em branco | uso interno do app |

Status que o app reconhece: `novo` (pendente de revisão), `aceito` (virou lançamento;
`lancamento_id` aponta para ele) e `descartado`.

`chave_dedupe`: deixe em branco. É a chave que o app usa nas importações dele
(`conta|data|±centavos|descrição normalizada|n`, ou `conta|FITID|±centavos` em OFX).
Para itens externos o app procura duplicidade por **mesmo valor, mesma conta e data
±5 dias** e, se achar, mostra "Parece ser: … — É esse?" (o comprovante é ligado ao
lançamento existente, sem duplicar).

## Importacoes — uma linha por fatura ou extrato processado
`data`, `tipo_arquivo` (`pdf`, `csv`, `ofx` ou `texto`), `nome_arquivo`, `doc`,
`linhas_lidas`, `novos`, `casados`, `ignorados`. `id` em branco (o app gera `imp_…`).
`conta_id` aceita o **nome** da conta.

## Arquivos que o app grava no Drive
- **Fatura/extrato importado no app:** direto na pasta `ids.pasta_faturas`
  ("Finanças Pessoais - Comprovantes"), sem subpastas, com o nome
  `AAAA-MM – Fatura – <conta>` ou `AAAA-MM – Extrato – <conta>`.
- **Comprovante anexado a um lançamento (M7):**
  - sem projeto/área (ou com a área de finanças): direto em "Finanças Pessoais - Comprovantes";
  - com outro projeto/área: na pasta de Entrada, com a descrição
    `[financas] destino: <nome exato da pasta> | pasta_id: <ID> | lancamento: <id> | tipo: comprovante`.
  - nome: `AAAA-MM-DD – Comprovante – <Descrição> – R$ <valor>`.
- O app **nunca cria subpastas** (3 níveis fixos do segundo cérebro).

## Dados que nunca vão para a planilha
Número completo de conta ou cartão. No máximo os 4 finais (`finais_cartao` em `Contas`).
O app remove CPF mascarado, agência e conta dos textos de extrato que importa.
