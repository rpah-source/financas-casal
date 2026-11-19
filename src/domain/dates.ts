import type { DataISO } from './types';

export const FUSO = 'America/Sao_Paulo';

const pad = (n: number) => String(n).padStart(2, '0');

/** "Hoje" no fuso de São Paulo, como `AAAA-MM-DD` (SPEC 5). */
export function hojeSP(agora: Date = new Date()): DataISO {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(agora);
  const get = (t: string) => partes.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function partesData(d: DataISO): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = d.split('-').map(Number);
  return { ano, mes, dia };
}

export function montarData(ano: number, mes: number, dia: number): DataISO {
  return `${ano}-${pad(mes)}-${pad(dia)}`;
}

export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export function somarDias(d: DataISO, n: number): DataISO {
  const { ano, mes, dia } = partesData(d);
  const dt = new Date(Date.UTC(ano, mes - 1, dia + n));
  return montarData(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Diferença em dias (b − a), contando só datas de calendário. */
export function diffDias(a: DataISO, b: DataISO): number {
  const pa = partesData(a);
  const pb = partesData(b);
  return Math.round(
    (Date.UTC(pb.ano, pb.mes - 1, pb.dia) - Date.UTC(pa.ano, pa.mes - 1, pa.dia)) / 86_400_000,
  );
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export const nomeMesCurto = (mes: number) => MESES_CURTOS[mes - 1];
export const nomeMesLongo = (mes: number) => MESES_LONGOS[mes - 1];

/** `2026-11-27` → `27/11`. */
export function ddmm(d: DataISO): string {
  const { mes, dia } = partesData(d);
  return `${pad(dia)}/${pad(mes)}`;
}
