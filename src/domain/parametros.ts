import type { DataISO, Parametro } from './types';

/**
 * Lê um parâmetro numa data (SPEC 5.9): a linha com `vigente_desde <= data`
 * mais recente. Empate na mesma data: vale a linha mais abaixo na planilha.
 */
export function lerParametro(
  parametros: Parametro[],
  chave: string,
  data: DataISO,
  escopo = '',
): string | null {
  let melhor: Parametro | null = null;
  for (const p of parametros) {
    if (p.chave !== chave || (p.escopo ?? '') !== escopo || p.vigente_desde > data) continue;
    if (!melhor || p.vigente_desde >= melhor.vigente_desde) melhor = p;
  }
  return melhor?.valor ?? null;
}

export function lerParametroNumero(parametros: Parametro[], chave: string, data: DataISO, padrao: number, escopo = ''): number {
  const v = lerParametro(parametros, chave, data, escopo);
  if (v === null || v.trim() === '') return padrao;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : padrao;
}

/** Parâmetros criados no bootstrap (SPEC 5.9 e 4.5). */
export const PARAMETROS_PADRAO: Array<[string, string]> = [
  ['pessoa1.nome', 'Pessoa 1'],
  ['pessoa2.nome', 'Pessoa 2'],
  ['semanada.valor', '0'],
  ['semanada.modo', 'manual'],
  ['margem.pct', '15'],
  ['semana.cortes', '1-8,9-15,16-22,23-fim'],
  ['conciliacao.janela_dias', '5'],
  ['indice.aba_projetos', 'Projetos'],
  ['indice.col_projeto_nome', 'Nome'],
  ['indice.col_projeto_id', 'ID'],
  ['indice.col_projeto_status', 'Status'],
  ['indice.aba_areas', 'Áreas'],
  ['indice.col_area_nome', 'Nome'],
  ['indice.col_area_status', 'Status'],
  ['indice.col_pasta', 'Pasta'],
];

export const VIGENCIA_INICIAL = '2000-01-01';
