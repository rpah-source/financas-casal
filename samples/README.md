# Arquivos de exemplo (anonimizados)

Formatos reais dos bancos, com **dados inventados**: nomes, finais de cartão,
estabelecimentos, valores e identificadores foram trocados (SPEC 0.4).
Servem para os testes dos leitores de importação.

| arquivo | formato | particularidades observadas no arquivo real |
|---|---|---|
| `nubank-fatura.ofx` | OFX de cartão (Nubank) | `FITID` repetido entre compra e estorno, e entre compra internacional e o IOF dela; parcelas no texto ("Loja - Parcela 3/6"), com a data do início do ciclo; "Pagamento recebido" = pagamento da fatura anterior; `LEDGERBAL` = total da fatura |
| `santander-fatura.txt` | texto copiado do PDF da fatura (Santander) | seções "Pagamento e Demais Créditos", "Parcelamentos" e "Despesas" por cartão (titular, virtual e adicional, cada um com o final); dígitos/@ soltos antes da data (ícones do PDF); várias compras grudadas numa linha; datas sem ano; parcelas como "02/06"; "Vencimento" e "Saldo Desta Fatura" no texto |
| `santander-extrato.csv` | CSV do extrato da conta (Santander) | preâmbulo (nome, agência, período) antes da tabela; `;` e vírgula decimal; descrição com quebra de linha dentro das aspas ("Pix enviado⏎Nome"); "Debito aut. fat.cartao" = pagamento de fatura; "Pix no cartao final NNNN" = dinheiro vindo do cartão; "Contratacao credito consignado" = empréstimo recebido; Pix para "Nu pagamentos" = conta/cartão próprio |
| `nubank-conta.ofx` | OFX do extrato da conta (Nubank) | `BANKMSGSRSV1`; MEMO com CPF mascarado, agência e conta (o app remove); transferências Pix entre contas próprias |
