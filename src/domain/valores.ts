import { diasNoMes, montarData, somarDias } from './dates';

/**
 * Leitura tolerante de células da planilha (SPEC 5, "Linhas escritas por
 * fora do app"). As células chegam da API como texto, número ou booleano.
 */
export type Celula = string | number | boolean | null | undefined;

export const vazio = (v: Celula) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Minúsculas, sem acentos, espaços normalizados. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function lerTexto(v: Celula): string {
  if (vazio(v)) return '';
  return String(v).trim();
}

/**
 * Número decimal. Aceita `68.9`, `68,9`, `1.234,56`, `R$ 1.234,56`.
 * Regra: se houver vírgula, ela é o separador decimal e os pontos são de milhar.
 */
export function lerNumero(v: Celula): number | null {
  if (vazio(v)) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return null;
  let s = String(v).replace(/R\$/gi, '').replace(/\s/g, '');
  let negativo = false;
  if (/^[-−]/.test(s)) {
    negativo = true;
    s = s.slice(1);
  }
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return negativo ? -n : n;
}

/** Booleano: TRUE/FALSE, sim/não, 1/0, verdadeiro/falso. Vazio → `padrao`. */
export function lerBool(v: Celula, padrao = false): boolean | null {
  if (vazio(v)) return padrao;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
  const s = normalizar(String(v));
  if (['true', 'sim', 's', '1', 'verdadeiro', 'x'].includes(s)) return true;
  if (['false', 'nao', 'n', '0', 'falso'].includes(s)) return false;
  return null;
}

/**
 * Data. Aceita `AAAA-MM-DD`, `dd/mm/aaaa` e o número de série do Sheets
 * (dias desde 30/12/1899), caso a célula esteja formatada como data.
 */
export function lerData(v: Celula): string | null {
  if (vazio(v)) return null;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null; // fora de ~1954–2119
    return somarDias('1899-12-30', Math.floor(v));
  }
  if (typeof v === 'boolean') return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (m) return validarData(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return validarData(+m[3], +m[2], +m[1]);
  return null;
}

function validarData(ano: number, mes: number, dia: number): string | null {
  if (ano < 1900 || ano > 2200 || mes < 1 || mes > 12 || dia < 1) return null;
  if (dia > diasNoMes(ano, mes)) return null;
  return montarData(ano, mes, dia);
}

/** Enum: compara sem maiúsculas/acentos e devolve o valor canônico. */
export function lerEnum<T extends string>(v: Celula, valores: readonly T[]): T | null {
  if (vazio(v)) return null;
  const s = normalizar(String(v)).replace(/[\s-]+/g, '_');
  return valores.find((x) => normalizar(x) === s) ?? null;
}
