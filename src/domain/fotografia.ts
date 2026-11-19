import { diasNoMes, montarData, partesData } from './dates';
import { lerParametro, lerParametroNumero } from './parametros';
import { datasDaRecorrencia } from './recorrencias';
import { CORTES_PADRAO, semanasDoMes } from './semana';
import type { Lancamento, Natureza, Parametro, RegistroGenerico } from './types';

/**
 * Fotografia do mês, visão por competência (SPEC 9.2). Aqui só as contas;
 * a tela vem no M6. A tela Semana usa o resultado projetado (SPEC 9.5).
 */
export interface Bloco {
  realizado: number;
  falta: number; // agendado + previsto
  total: number;
}

export interface Fotografia {
  mes: string;
  entradas: Bloco;
  fixa: Bloco;
  variavel: Bloco & { projecao: number; pelaSemanada: number };
  sazonal: Bloco & { noMes: number; provisao: number };
  divida: Bloco;
  sonho: Bloco;
  margemPct: number;
  margem: number;
  resultado: number;
  completude: { pct: number; faltam: string[] };
}

const vazio = (): Bloco => ({ realizado: 0, falta: 0, total: 0 });
const cent = (v: number) => Math.round(v * 100);

function somar(b: Bloco, l: Lancamento) {
  const v = cent(l.valor);
  if (l.status === 'realizado') b.realizado += v;
  else b.falta += v;
  b.total += v;
}
const emReais = (b: Bloco): Bloco => ({ realizado: b.realizado / 100, falta: b.falta / 100, total: b.total / 100 });

export function entraNaAnalise(l: Lancamento): boolean {
  return !l.excluido && !l.excluir_da_analise && l.status !== 'cancelado' && (l.tipo === 'despesa' || l.tipo === 'receita');
}

export function fotografiaDoMes(p: {
  mes: string; // AAAA-MM
  lancamentos: Lancamento[];
  recorrencias: RegistroGenerico[];
  parametros: Parametro[];
}): Fotografia {
  const { ano, mes } = partesData(`${p.mes}-01`);
  const inicio = montarData(ano, mes, 1);
  const fim = montarData(ano, mes, diasNoMes(ano, mes));
  const doMes = p.lancamentos.filter((l) => entraNaAnalise(l) && l.data_competencia >= inicio && l.data_competencia <= fim);

  const blocos: Record<'entradas' | Exclude<Natureza, 'nenhuma'>, Bloco> = {
    entradas: vazio(), fixa: vazio(), variavel: vazio(), sazonal: vazio(), divida: vazio(), sonho: vazio(),
  };
  let variavelReal = 0; // realizado + agendado (sem previstos)
  for (const l of doMes) {
    if (l.tipo === 'receita') somar(blocos.entradas, l);
    else if (l.natureza !== 'nenhuma') {
      somar(blocos[l.natureza], l);
      if (l.natureza === 'variavel' && l.status !== 'previsto') variavelReal += cent(l.valor);
    }
  }

  // Variáveis na projeção: o maior entre o real e a semanada × semanas.
  const cortes = lerParametro(p.parametros, 'semana.cortes', fim) || CORTES_PADRAO;
  const semanada = lerParametroNumero(p.parametros, 'semanada.valor', fim, 0);
  const pelaSemanada = cent(semanada) * semanasDoMes(ano, mes, cortes).length;
  const projecaoVar = Math.max(variavelReal, pelaSemanada);

  // Sazonais: provisão de 1/12 do que é sazonal nos próximos 12 meses.
  const fim12 = ultimoDiaAntes(ano + 1, mes);
  const sazonaisLanc = p.lancamentos.filter(
    (l) => entraNaAnalise(l) && l.tipo === 'despesa' && l.natureza === 'sazonal' && l.data_competencia >= inicio && l.data_competencia <= fim12,
  );
  let anual = sazonaisLanc.reduce((s, l) => s + cent(l.valor), 0);
  for (const rec of p.recorrencias) {
    if (rec.ativa === false || rec.excluido || rec.natureza !== 'sazonal' || rec.tipo === 'receita') continue;
    for (const d of datasDaRecorrencia(rec, inicio, fim12)) {
      const jaVirouLancamento = sazonaisLanc.some((l) => l.recorrencia_id === rec.id && l.data_competencia.slice(0, 7) === d.slice(0, 7));
      if (!jaVirouLancamento) anual += cent(Number(rec.valor));
    }
  }
  const provisao = Math.round(anual / 12);
  const noMes = blocos.sazonal.total;

  const margemPct = lerParametroNumero(p.parametros, 'margem.pct', fim, 15);
  const gastos = blocos.fixa.total + projecaoVar + noMes + provisao + blocos.divida.total + blocos.sonho.total;
  const margem = Math.round((gastos * margemPct) / 100);
  const resultado = blocos.entradas.total - gastos - margem;

  // Completude (SPEC 9.2): bloco preenchido se tem lançamento ou recorrência no mês (ou valor manual).
  const recNoMes = (f: (r: RegistroGenerico) => boolean) =>
    p.recorrencias.some((r) => r.ativa !== false && !r.excluido && f(r) && datasDaRecorrencia(r, inicio, fim).length > 0);
  const checks: Array<[string, boolean]> = [
    ['entradas', blocos.entradas.total > 0 || recNoMes((r) => r.tipo === 'receita')],
    ['fixas', blocos.fixa.total > 0 || recNoMes((r) => r.natureza === 'fixa')],
    ['variáveis', blocos.variavel.total > 0 || semanada > 0],
    ['sazonais', anual > 0],
    ['dívidas', blocos.divida.total > 0 || recNoMes((r) => r.natureza === 'divida')],
    ['sonhos/projetos', blocos.sonho.total > 0 || recNoMes((r) => r.natureza === 'sonho')],
  ];
  const feitos = checks.filter(([, ok]) => ok).length;

  return {
    mes: p.mes,
    entradas: emReais(blocos.entradas),
    fixa: emReais(blocos.fixa),
    variavel: { ...emReais(blocos.variavel), projecao: projecaoVar / 100, pelaSemanada: pelaSemanada / 100 },
    sazonal: { ...emReais(blocos.sazonal), noMes: noMes / 100, provisao: provisao / 100 },
    divida: emReais(blocos.divida),
    sonho: emReais(blocos.sonho),
    margemPct,
    margem: margem / 100,
    resultado: resultado / 100,
    completude: { pct: Math.round((feitos / checks.length) * 100), faltam: checks.filter(([, ok]) => !ok).map(([n]) => n) },
  };
}

function ultimoDiaAntes(ano: number, mes: number): string {
  // Último dia do mês anterior a (ano, mes): janela de 12 meses a partir do mês da fotografia.
  const m = mes === 1 ? 12 : mes - 1;
  const a = mes === 1 ? ano - 1 : ano;
  return montarData(a, m, diasNoMes(a, m));
}
