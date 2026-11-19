import { montarData, somarDias } from './dates';
import type { DataISO } from './types';

/**
 * Feriados nacionais (SPEC 9.4), calculados para qualquer ano (a SPEC pede
 * 2026–2028; o cálculo da Páscoa cobre esses e os seguintes).
 * Inclui Carnaval (seg e ter), Sexta-feira Santa e Corpus Christi, porque
 * os bancos não abrem nesses dias, mesmo sendo "ponto facultativo".
 */
export function feriadosNacionais(ano: number): Map<DataISO, string> {
  const pascoa = domingoDePascoa(ano);
  const f = new Map<DataISO, string>([
    [montarData(ano, 1, 1), 'Confraternização Universal'],
    [somarDias(pascoa, -48), 'Carnaval'],
    [somarDias(pascoa, -47), 'Carnaval'],
    [somarDias(pascoa, -2), 'Sexta-feira Santa'],
    [montarData(ano, 4, 21), 'Tiradentes'],
    [montarData(ano, 5, 1), 'Dia do Trabalho'],
    [somarDias(pascoa, 60), 'Corpus Christi'],
    [montarData(ano, 9, 7), 'Independência'],
    [montarData(ano, 10, 12), 'Nossa Senhora Aparecida'],
    [montarData(ano, 11, 2), 'Finados'],
    [montarData(ano, 11, 15), 'Proclamação da República'],
    [montarData(ano, 11, 20), 'Dia Nacional de Zumbi e da Consciência Negra'],
    [montarData(ano, 12, 25), 'Natal'],
  ]);
  return f;
}

/** Algoritmo de Meeus/Jones/Butcher (calendário gregoriano). */
export function domingoDePascoa(ano: number): DataISO {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return montarData(ano, mes, dia);
}

const cache = new Map<number, Map<DataISO, string>>();

export function ehFeriado(d: DataISO): boolean {
  const ano = Number(d.slice(0, 4));
  if (!cache.has(ano)) cache.set(ano, feriadosNacionais(ano));
  return cache.get(ano)!.has(d);
}

/** 1 = segunda … 7 = domingo. */
export function diaDaSemana(d: DataISO): number {
  const w = new Date(`${d}T12:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Dia útil = segunda a sexta, fora dos feriados nacionais. */
export function ehDiaUtil(d: DataISO): boolean {
  return diaDaSemana(d) <= 5 && !ehFeriado(d);
}
