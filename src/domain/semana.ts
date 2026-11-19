import { diasNoMes, diffDias, montarData, partesData } from './dates';
import type { DataISO, Lancamento } from './types';

export const CORTES_PADRAO = '1-8,9-15,16-22,23-fim';

export interface Semana {
  numero: number;
  inicio: DataISO;
  fim: DataISO;
}

/**
 * Lê `semana.cortes` (ex.: `1-8,9-15,16-22,23-fim`) e devolve as semanas
 * do mês (SPEC 9.1). Cortes inválidos caem no padrão, sem travar o app.
 */
export function semanasDoMes(ano: number, mes: number, cortes: string = CORTES_PADRAO): Semana[] {
  const ultimo = diasNoMes(ano, mes);
  const faixas = interpretarCortes(cortes, ultimo) ?? interpretarCortes(CORTES_PADRAO, ultimo)!;
  return faixas.map(([ini, fim], i) => ({
    numero: i + 1,
    inicio: montarData(ano, mes, ini),
    fim: montarData(ano, mes, fim),
  }));
}

function interpretarCortes(cortes: string, ultimo: number): Array<[number, number]> | null {
  const faixas: Array<[number, number]> = [];
  for (const parte of cortes.split(',')) {
    const m = parte.trim().match(/^(\d{1,2})\s*-\s*(\d{1,2}|fim)$/i);
    if (!m) return null;
    const ini = Number(m[1]);
    const fim = m[2].toLowerCase() === 'fim' ? ultimo : Math.min(Number(m[2]), ultimo);
    if (ini < 1 || ini > fim) return null;
    faixas.push([ini, fim]);
  }
  // As faixas precisam cobrir o mês inteiro, sem buracos nem sobreposição.
  let esperado = 1;
  for (const [ini, fim] of faixas) {
    if (ini !== esperado) return null;
    esperado = fim + 1;
  }
  return esperado === ultimo + 1 ? faixas : null;
}

export function semanaDe(data: DataISO, cortes: string = CORTES_PADRAO): Semana {
  const { ano, mes } = partesData(data);
  const semanas = semanasDoMes(ano, mes, cortes);
  return semanas.find((s) => s.inicio <= data && data <= s.fim)!;
}

/**
 * Gasto da semana (SPEC 9.1): despesas variáveis, agendadas ou realizadas,
 * com competência na semana, não excluídas e fora de `excluir_da_analise`.
 */
export function gastoDaSemana(lancamentos: Lancamento[], semana: Semana): number {
  const centavos = lancamentos
    .filter(
      (l) =>
        l.tipo === 'despesa' &&
        l.natureza === 'variavel' &&
        (l.status === 'agendado' || l.status === 'realizado') &&
        !l.excluido &&
        !l.excluir_da_analise &&
        l.data_competencia >= semana.inicio &&
        l.data_competencia <= semana.fim,
    )
    .reduce((soma, l) => soma + Math.round(l.valor * 100), 0);
  return centavos / 100;
}

export interface ResumoSemana {
  semana: Semana;
  semanada: number;
  usado: number;
  aindaPodemos: number;
  diasRestantes: number;
  /** `null` quando não faz sentido mostrar (≤ 0). */
  porDia: number | null;
}

export function resumoSemana(
  lancamentos: Lancamento[],
  hoje: DataISO,
  semanada: number,
  cortes: string = CORTES_PADRAO,
): ResumoSemana {
  const semana = semanaDe(hoje, cortes);
  const usado = gastoDaSemana(lancamentos, semana);
  const aindaPodemos = Math.round((semanada - usado) * 100) / 100;
  const diasRestantes = diffDias(hoje, semana.fim) + 1;
  const porDia = aindaPodemos > 0 ? Math.floor((aindaPodemos / diasRestantes) * 100) / 100 : null;
  return { semana, semanada, usado, aindaPodemos, diasRestantes, porDia };
}
