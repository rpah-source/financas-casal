import { pagamentosDaFatura, totalFatura, type Fatura } from './faturas';
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

/**
 * "Já reservado": agendados e previstos que saem da conta de hoje até `ate`,
 * mais o que falta pagar das faturas dos cartões pagos por esta conta que
 * vencem nesse período (SPEC 9.4).
 */
export interface ItemReservado {
  id: string;
  descricao: string;
  data: DataISO;
  valor: number;
}

export function reservado(
  conta: Conta,
  lancamentos: Lancamento[],
  hoje: DataISO,
  ate: DataISO,
  cartoes?: { contas: Conta[]; faturas: Fatura[] },
): { total: number; itens: ItemReservado[] } {
  const itens: ItemReservado[] = lancamentos
    .filter(
      (l) =>
        !l.excluido &&
        (l.status === 'agendado' || l.status === 'previsto') &&
        l.data_caixa >= hoje &&
        l.data_caixa <= ate &&
        efeito(l, conta.id) < 0,
    )
    .map((l) => ({ id: l.id, descricao: l.descricao || l.categoria || 'Sem descrição', data: l.data_caixa, valor: -efeito(l, conta.id) / 100 }));
  if (cartoes) {
    for (const cartao of cartoes.contas.filter((c) => c.tipo === 'cartao' && c.conta_pagamento_id === conta.id)) {
      for (const f of cartoes.faturas) {
        if (f.excluido || f.cartao_id !== cartao.id || f.status === 'paga') continue;
        if (f.data_vencimento < hoje || f.data_vencimento > ate) continue;
        const devido = totalFatura(f, lancamentos).total - pagamentosDaFatura(f, lancamentos);
        if (devido > 0) itens.push({ id: f.id, descricao: `Fatura ${cartao.nome}`, data: f.data_vencimento, valor: Math.round(devido * 100) / 100 });
      }
    }
  }
  itens.sort((a, b) => a.data.localeCompare(b.data));
  return { total: Math.round(itens.reduce((s, i) => s + i.valor * 100, 0)) / 100, itens };
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
