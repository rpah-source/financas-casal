import { proximaData } from './recorrencias';
import type { Conta, DataISO, Lancamento, RegistroGenerico } from './types';
import { normalizar } from './valores';

/**
 * Saldos (SPEC 9.4). Conta corrente ou pré-paga: saldo inicial + o que já
 * foi realizado desde a data do saldo inicial até hoje.
 */
function efeito(l: Lancamento, contaId: string): number {
  const v = Math.round(l.valor * 100);
  if (l.tipo === 'transferencia') {
    if (l.conta_id === contaId) return -v;
    if (l.conta_destino_id === contaId) return v;
    return 0;
  }
  if (l.conta_id !== contaId) return 0;
  if (l.tipo === 'despesa') return -v;
  if (l.tipo === 'receita') return v;
  return l.sinal === '-' ? -v : v; // ajuste
}

export function saldoConta(conta: Conta, lancamentos: Lancamento[], hoje: DataISO): number {
  const desde = conta.data_saldo_inicial ?? '0000-01-01';
  let c = Math.round((conta.saldo_inicial ?? 0) * 100);
  for (const l of lancamentos) {
    if (l.excluido || l.status !== 'realizado') continue;
    if (l.data_caixa > hoje || l.data_caixa < desde) continue;
    c += efeito(l, conta.id);
  }
  return c / 100;
}

/** "Já reservado": agendados e previstos que saem da conta de hoje até `ate`. */
export function reservado(conta: Conta, lancamentos: Lancamento[], hoje: DataISO, ate: DataISO): { total: number; itens: Lancamento[] } {
  const itens = lancamentos.filter(
    (l) =>
      !l.excluido &&
      (l.status === 'agendado' || l.status === 'previsto') &&
      l.data_caixa >= hoje &&
      l.data_caixa <= ate &&
      efeito(l, conta.id) < 0,
  );
  return { total: itens.reduce((s, l) => s - efeito(l, conta.id), 0) / 100, itens };
}

/**
 * Próximo crédito de uma conta: para conta corrente, o salário (recorrência
 * de receita com categoria "Salário"); senão, qualquer receita recorrente.
 */
export function proximoCredito(conta: Conta, recorrencias: RegistroGenerico[], hoje: DataISO): { data: DataISO; rec: RegistroGenerico } | null {
  const daConta = recorrencias.filter((r) => r.ativa !== false && !r.excluido && r.tipo === 'receita' && r.conta_id === conta.id);
  const salario = daConta.filter((r) => normalizar(String(r.categoria ?? '')) === 'salario');
  for (const lista of [salario, daConta]) {
    const proximos = lista
      .map((rec) => ({ rec, data: proximaData(rec, hoje) }))
      .filter((x): x is { rec: RegistroGenerico; data: DataISO } => Boolean(x.data))
      .sort((a, b) => a.data.localeCompare(b.data));
    if (proximos[0]) return proximos[0];
  }
  return null;
}
