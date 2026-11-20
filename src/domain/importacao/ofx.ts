import { montarData } from '../dates';
import type { ArquivoLido, LinhaImportada } from './tipos';
import { extrairParcela } from './tipos';

/**
 * OFX (SGML ou XML). Usa FITID como identificador da transação (SPEC 8.2).
 * Atenção (visto em arquivo real): alguns bancos repetem o FITID entre uma
 * compra e o estorno dela, ou entre a compra e o IOF; por isso a chave de
 * deduplicação também leva o valor com sinal (ver conciliacao.ts).
 */
export function lerOFX(texto: string): ArquivoLido {
  const tag = (bloco: string, nome: string) => {
    const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'));
    return m ? m[1].trim() : undefined;
  };
  const data = (v?: string) => {
    const m = v?.match(/^(\d{4})(\d{2})(\d{2})/);
    return m ? montarData(Number(m[1]), Number(m[2]), Number(m[3])) : undefined;
  };
  const cartao = /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(texto);
  const linhas: LinhaImportada[] = [];
  let ignoradas = 0;
  for (const m of texto.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi)) {
    const b = m[1];
    const d = data(tag(b, 'DTPOSTED'));
    const valor = Number((tag(b, 'TRNAMT') ?? '').replace(',', '.'));
    const memo = tag(b, 'MEMO') || tag(b, 'NAME') || '';
    if (!d || !Number.isFinite(valor) || valor === 0) {
      ignoradas++;
      continue;
    }
    const { parcela } = extrairParcela(memo);
    linhas.push({
      data: d,
      descricao: memo,
      valor: Math.abs(Math.round(valor * 100) / 100),
      sentido: valor < 0 ? 'saida' : 'entrada',
      fitid: tag(b, 'FITID'),
      parcela,
    });
  }
  const saldo = Number((tag(texto.slice(texto.search(/<LEDGERBAL>/i)), 'BALAMT') ?? 'NaN').replace(',', '.'));
  return {
    formato: 'ofx',
    tipoConta: cartao ? 'cartao' : 'corrente',
    banco: tag(texto, 'ORG'),
    contaExterna: tag(texto, 'ACCTID'),
    inicio: data(tag(texto, 'DTSTART')),
    fim: data(tag(texto, 'DTEND')),
    total: cartao && Number.isFinite(saldo) ? Math.abs(saldo) : undefined,
    linhas,
    ignoradas,
  };
}
