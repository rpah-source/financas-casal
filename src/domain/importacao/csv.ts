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

/**
 * Separa o CSV em linhas e células. Aceita aspas com quebra de linha dentro
 * (o Santander põe "Pix enviado\nNome" numa célula só) e delimitador `;`, `,` ou tab.
 * A quebra de linha dentro da célula vira espaço.
 */
export function separarCSV(texto: string): string[][] {
  const t = texto.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const amostra = t.split('\n').slice(0, 30);
  const delim = [';', ',', '\t'].sort((a, b) => Math.max(...amostra.map((l) => contar(l, b))) - Math.max(...amostra.map((l) => contar(l, a))))[0];
  const linhas: string[][] = [];
  let celula = '';
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === '"') {
      if (aspas && t[i + 1] === '"') {
        celula += '"';
        i++;
      } else aspas = !aspas;
    } else if (ch === delim && !aspas) {
      linha.push(celula.trim());
      celula = '';
    } else if (ch === '\n') {
      if (aspas) celula += ' ';
      else {
        linha.push(celula.trim());
        if (linha.some((c) => c)) linhas.push(linha);
        linha = [];
        celula = '';
      }
    } else celula += ch;
  }
  linha.push(celula.trim());
  if (linha.some((c) => c)) linhas.push(linha);
  return linhas.map((l) => l.map((c) => c.replace(/\s+/g, ' ')));
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

/**
 * Pula o "preâmbulo" (nome, agência, período…) que alguns bancos põem antes
 * da tabela: a tabela começa na primeira linha que tem um perfil.
 */
export function acharTabela(linhas: string[][], salvos: PerfilCSV[] = []): { linhas: string[][]; perfil: PerfilCSV | null } {
  for (let i = 0; i < Math.min(linhas.length, 40); i++) {
    const perfil = detectarPerfil(linhas[i], salvos);
    if (perfil) return { linhas: linhas.slice(i), perfil };
  }
  return { linhas, perfil: null };
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
    const exigidas = [p.data, p.descricao, p.valor, ...(p.identificador !== undefined ? [p.identificador] : [])];
    if (exigidas.every((c) => indice(cabecalho, c) >= 0 && indice(cabecalho, c) < cabecalho.length)) return p;
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
