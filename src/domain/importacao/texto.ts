import { montarData, partesData } from '../dates';
import { lerNumero } from '../valores';
import type { DataISO } from '../types';
import type { ArquivoLido, LinhaImportada } from './tipos';

/**
 * Texto colado de fatura ou extrato (SPEC 8.2): linhas com data, descrição
 * e valor, tolerante a `dd/mm`, `dd MMM` e `R$ 1.234,56`. Também entende o
 * texto copiado do PDF de fatura: seções (créditos, parcelamentos, despesas),
 * cabeçalho de cada cartão com o final, ícones soltos antes da data e várias
 * compras grudadas numa linha.
 */
const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

const VALOR = String.raw`(-\s?)?(?:R\$\s?)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})(?:\s?([DC])\b)?`;
// Transação: [ícone] dd/mm | dd MMM, descrição, [parcela nn/nn], valor.
const RE_TRANSACAO = new RegExp(
  String.raw`(?:^|\s)(?:[0-9@]\s+)?(?:(\d{2})\/(\d{2})|(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?)\s+(\S.*?)\s+(?:(\d{2})\/(\d{2})\s+)?` +
    VALOR +
    String.raw`(?=\s|$)`,
  'gi',
);
const RE_TITULAR = /(?:@\s*)?([A-ZÀ-Ú][A-ZÀ-Ú .']{2,}?)\s+-\s+\d{4}\s+X{4}\s+X{4}\s+(\d{4})/g;
const RE_SECAO = /(Pagamentos? e Demais Cr[eé]ditos|Parcelamentos|Despesas|Resumo da Fatura|Hist[oó]rico de Faturas)/gi;

export function lerTexto(texto: string, opcoes: { tipoConta: 'cartao' | 'corrente'; hoje: DataISO }): ArquivoLido {
  const t = texto.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const venc = t.match(/Vencimento\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const vencimento = venc ? montarData(Number(venc[3]), Number(venc[2]), Number(venc[1])) : undefined;
  const totalM = t.match(/Saldo Desta Fatura\s+(-?[\d.]+,\d{2})/i) ?? t.match(/Total a Pagar\s*R?\$?\s*([\d.]+,\d{2})/i);
  const total = totalM ? Math.abs(lerNumero(totalM[1]) ?? 0) : undefined;
  const referencia = vencimento ?? opcoes.hoje;

  // Eventos em ordem: cabeçalhos de cartão, seções e transações.
  type Evento = { pos: number; fim: number } & (
    | { tipo: 'titular'; final: string }
    | { tipo: 'secao'; nome: string }
    | { tipo: 'linha'; m: RegExpExecArray }
  );
  const eventos: Evento[] = [];
  for (const m of t.matchAll(RE_TITULAR)) eventos.push({ tipo: 'titular', final: m[2], pos: m.index!, fim: m.index! + m[0].length });
  for (const m of t.matchAll(RE_SECAO)) eventos.push({ tipo: 'secao', nome: m[1].toLowerCase(), pos: m.index!, fim: m.index! + m[0].length });
  const reT = new RegExp(RE_TRANSACAO.source, 'gi');
  let m: RegExpExecArray | null;
  while ((m = reT.exec(t))) {
    eventos.push({ tipo: 'linha', m, pos: m.index, fim: m.index + m[0].length });
    // Permite a próxima transação começar logo depois do valor (linhas grudadas).
    reT.lastIndex = m.index + m[0].length;
  }
  eventos.sort((a, b) => a.pos - b.pos);

  const linhas: LinhaImportada[] = [];
  let final: string | undefined;
  let secao = '';
  for (const e of eventos) {
    if (e.tipo === 'titular') {
      final = e.final;
      continue;
    }
    if (e.tipo === 'secao') {
      secao = e.nome;
      continue;
    }
    if (secao.startsWith('resumo') || secao.startsWith('hist')) continue;
    // Linha que é só o cabeçalho de um cartão (ex.: "... - 1111 XXXX ...") não é transação.
    if (eventos.some((x) => x.tipo === 'titular' && x.pos <= e.pos && x.fim > e.pos)) continue;
    const g = e.m;
    const dia = Number(g[1] ?? g[3]);
    const mes = g[2] ? Number(g[2]) : MESES[g[4].slice(0, 3).toLowerCase()];
    const data = inferirAno(dia, mes, referencia);
    if (!data) continue;
    const negativo = Boolean(g[8]);
    const valor = lerNumero(g[9]);
    if (!valor) continue;
    const dc = g[10]?.toUpperCase();
    let sentido: 'saida' | 'entrada';
    if (opcoes.tipoConta === 'cartao') sentido = negativo || secao.startsWith('pagamento') ? 'entrada' : 'saida';
    else sentido = dc === 'C' ? 'entrada' : dc === 'D' || negativo ? 'saida' : 'entrada';
    const descricao = g[5].replace(/\s{2,}/g, ' ').trim();
    if (/^(valor total|total|saldo)/i.test(descricao)) continue;
    linhas.push({
      data,
      descricao: g[6] ? `${descricao} (${g[6]}/${g[7]})` : descricao,
      valor,
      sentido,
      parcela: g[6] ? { num: Number(g[6]), total: Number(g[7]) } : undefined,
      finalCartao: final,
    });
  }

  // Linhas com data e dinheiro que não viraram transação (para o usuário saber).
  const reLinha = new RegExp(RE_TRANSACAO.source, 'i');
  const ignoradas = t
    .split('\n')
    .filter((l) => /\b\d{2}\/\d{2}\b(?!\/)/.test(l) && /\d,\d{2}/.test(l) && !reLinha.test(l) && !/\d{2}\/\d{2}\/\d{2}/.test(l) && !/total|saldo|limite|per[ií]odo|vencimento/i.test(l)).length;

  return {
    formato: 'texto',
    tipoConta: /fatura|cart[aã]o/i.test(t) && opcoes.tipoConta === 'cartao' ? 'cartao' : opcoes.tipoConta,
    vencimento,
    total,
    linhas,
    ignoradas,
  };
}

/** dd/mm sem ano: o ano que deixa a data mais perto (e não depois) da referência. */
export function inferirAno(dia: number, mes: number, referencia: DataISO): DataISO | null {
  if (!(mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)) return null;
  const { ano } = partesData(referencia);
  const tentar = (a: number) => {
    const d = new Date(Date.UTC(a, mes - 1, dia));
    return d.getUTCMonth() === mes - 1 ? montarData(a, mes, dia) : null;
  };
  const d = tentar(ano);
  if (d && d <= referencia) return d;
  return tentar(ano - 1);
}
