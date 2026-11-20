import { lerData, lerNumero, normalizar } from '../valores';
import type { ArquivoLido, LinhaImportada } from './tipos';
import { extrairParcela } from './tipos';

/**
 * CSV com perfil de colunas por banco (SPEC 8.2). Perfis genéricos
 * reconhecidos pelo cabeçalho; se nenhum servir, a tela pede o mapeamento
 * e salva o perfil.
 */
export interface PerfilCSV {
  nome: string;
  /** Nomes (ou índices, começando em 0) das colunas. */
  data: string | number;
  descricao: string | number;
  valor: string | number;
  identificador?: string | number;
  /** `negativo_saida`: −10 = saiu (extrato). `positivo_saida`: 10 = compra (fatura). */
  sinal: 'negativo_saida' | 'positivo_saida';
  tipoConta?: 'cartao' | 'corrente';
}

export const PERFIS_GENERICOS: PerfilCSV[] = [
  // Fatura do Nubank exportada em CSV: date,title,amount (compra positiva).
  { nome: 'Nubank fatura', data: 'date', descricao: 'title', valor: 'amount', sinal: 'positivo_saida', tipoConta: 'cartao' },
  // Extrato da conta do Nubank: Data,Valor,Identificador,Descrição.
  { nome: 'Nubank conta', data: 'data', descricao: 'descricao', valor: 'valor', identificador: 'identificador', sinal: 'negativo_saida', tipoConta: 'corrente' },
  { nome: 'Genérico', data: 'data', descricao: 'descricao', valor: 'valor', sinal: 'negativo_saida' },
  { nome: 'Genérico (lançamento/histórico)', data: 'data', descricao: 'historico', valor: 'valor', sinal: 'negativo_saida' },
];

export function separarCSV(texto: string): string[][] {
  const linhas = texto.replace(/^﻿/, '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!linhas.length) return [];
  const cab = linhas[0];
  const delim = [';', ',', '\t'].sort((a, b) => contar(cab, b) - contar(cab, a))[0];
  return linhas.map((l) => dividir(l, delim));
}

function contar(s: string, c: string) {
  let n = 0;
  let aspas = false;
  for (const ch of s) {
    if (ch === '"') aspas = !aspas;
    else if (ch === c && !aspas) n++;
  }
  return n;
}

function dividir(linha: string, delim: string): string[] {
  const r: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else aspas = !aspas;
    } else if (ch === delim && !aspas) {
      r.push(atual.trim());
      atual = '';
    } else atual += ch;
  }
  r.push(atual.trim());
  return r;
}

const chave = (s: string) => normalizar(s).replace(/[^a-z0-9]/g, '');

function indice(cabecalho: string[], col: string | number | undefined): number {
  if (col === undefined) return -1;
  if (typeof col === 'number') return col;
  return cabecalho.map(chave).indexOf(chave(col));
}

/** Acha um perfil que serve para o cabeçalho (perfis salvos primeiro). */
export function detectarPerfil(cabecalho: string[], salvos: PerfilCSV[] = []): PerfilCSV | null {
  for (const p of [...salvos, ...PERFIS_GENERICOS]) {
    if ([p.data, p.descricao, p.valor].every((c) => indice(cabecalho, c) >= 0 && indice(cabecalho, c) < cabecalho.length)) return p;
  }
  return null;
}

export function lerCSV(linhas: string[][], perfil: PerfilCSV): ArquivoLido {
  const [cab, ...corpo] = linhas;
  const iData = indice(cab, perfil.data);
  const iDesc = indice(cab, perfil.descricao);
  const iValor = indice(cab, perfil.valor);
  const iId = indice(cab, perfil.identificador);
  const lidas: LinhaImportada[] = [];
  let ignoradas = 0;
  for (const l of corpo) {
    const data = lerData(l[iData]);
    const v = lerNumero(l[iValor]);
    if (!data || v === null || v === 0) {
      ignoradas++;
      continue;
    }
    const saida = perfil.sinal === 'negativo_saida' ? v < 0 : v > 0;
    const descricao = l[iDesc] ?? '';
    lidas.push({
      data,
      descricao,
      valor: Math.abs(v),
      sentido: saida ? 'saida' : 'entrada',
      fitid: iId >= 0 ? l[iId] || undefined : undefined,
      parcela: extrairParcela(descricao).parcela,
    });
  }
  const datas = lidas.map((l) => l.data).sort();
  return { formato: 'csv', tipoConta: perfil.tipoConta, inicio: datas[0], fim: datas.at(-1), linhas: lidas, ignoradas };
}
