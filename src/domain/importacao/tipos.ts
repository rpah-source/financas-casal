import type { DataISO } from '../types';

/** Uma linha lida de um extrato ou fatura, já normalizada (SPEC 8.2). */
export interface LinhaImportada {
  data: DataISO;
  /** Texto cru do banco. */
  descricao: string;
  /** Sempre positivo; o sentido diz se saiu ou entrou. */
  valor: number;
  sentido: 'saida' | 'entrada';
  /** Identificador do banco (OFX FITID, CSV "Identificador"). */
  fitid?: string;
  parcela?: { num: number; total: number };
  /** Últimos 4 dígitos do cartão que fez a compra (faturas). */
  finalCartao?: string;
}

export interface ArquivoLido {
  formato: 'ofx' | 'csv' | 'texto';
  /** O que o próprio arquivo diz ser. */
  tipoConta?: 'cartao' | 'corrente';
  /** Banco, quando o arquivo informa (OFX ORG). */
  banco?: string;
  /** Identificador da conta no banco (OFX ACCTID) para lembrar a conta escolhida. */
  contaExterna?: string;
  inicio?: DataISO;
  fim?: DataISO;
  /** Vencimento da fatura, quando o arquivo informa. */
  vencimento?: DataISO;
  /** Total da fatura informado pelo banco. */
  total?: number;
  linhas: LinhaImportada[];
  /** Linhas com valor que não deu para ler (ex.: sem data). */
  ignoradas: number;
}

export function extrairParcela(texto: string): { descricao: string; parcela?: { num: number; total: number } } {
  const m = texto.match(/^(.*?)\s*-\s*Parcela\s+(\d{1,2})\s*\/\s*(\d{1,2})\s*$/i);
  if (m) return { descricao: m[1].trim(), parcela: { num: Number(m[2]), total: Number(m[3]) } };
  return { descricao: texto.trim() };
}
