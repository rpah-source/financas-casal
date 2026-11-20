import { describe, expect, it } from 'vitest';
import {
  aplicarPagamento, cicloDaCompra, criarParcelamento, faturaParaPagamento, obterFatura, sincronizarFaturas, totalFatura, type Fatura,
} from './faturas';
import { criarLancamento } from './lancamento';
import type { Conta, Parametro } from './types';

const HOJE = '2026-11-20';
const contas = [
  { id: 'cta_azul', nome: 'Conta Azul', tipo: 'corrente', apelidos: [], ativa: true, saldo_inicial: 0, data_saldo_inicial: null },
  { id: 'cta_verde', nome: 'Cartão Verde', tipo: 'cartao', conta_pagamento_id: 'cta_azul', apelidos: [], ativa: true, saldo_inicial: 0, data_saldo_inicial: null },
] as unknown as Conta[];
const p = (chave: string, valor: string, desde = '2000-01-01'): Parametro => ({ chave, escopo: 'cta_verde', valor, vigente_desde: desde });
const params: Parametro[] = [p('cartao.fechamento_dia', '29'), p('cartao.vencimento_dia', '7')];
const ctx = { contas, categorias: [], hoje: HOJE, agoraISO: '2026-11-20T12:00:00Z' };
const compra = (data: string, valor = 100, o: object = {}) =>
  criarLancamento({ tipo: 'despesa', valor, descricao: 'Compra', contaId: 'cta_verde', data, quem: 'casal', ...o }, ctx);

describe('em qual fatura cai a compra (SPEC 6.3)', () => {
  it('teste 1: um dia antes do fechamento → fatura do mês; no dia do fechamento → a seguinte', () => {
    expect(cicloDaCompra('cta_verde', '2026-11-28', params)).toEqual({
      competencia: '2026-12', data_fechamento: '2026-11-29', data_vencimento: '2026-12-07',
    });
    expect(cicloDaCompra('cta_verde', '2026-11-29', params)).toEqual({
      competencia: '2027-01', data_fechamento: '2026-12-29', data_vencimento: '2027-01-07',
    });
  });

  it('teste 8: fechamento alterado com vigência a partir de 01/12 não muda as faturas de novembro', () => {
    const novos = [...params, p('cartao.fechamento_dia', '15', '2026-12-01')];
    expect(cicloDaCompra('cta_verde', '2026-11-20', novos)?.data_fechamento).toBe('2026-11-29');
    expect(cicloDaCompra('cta_verde', '2026-12-10', novos)?.data_fechamento).toBe('2026-12-15');
    expect(cicloDaCompra('cta_verde', '2026-12-20', novos)?.data_fechamento).toBe('2027-01-15');
  });

  it('fechamento no dia 30 em fevereiro vira o último dia', () => {
    const f = [p('cartao.fechamento_dia', '30'), p('cartao.vencimento_dia', '5')];
    expect(cicloDaCompra('cta_verde', '2027-02-10', f)?.data_fechamento).toBe('2027-02-28');
  });

  it('sem fechamento/vencimento cadastrados, não inventa fatura', () => {
    expect(cicloDaCompra('cta_verde', '2026-11-20', [])).toBeNull();
  });
});

describe('parcelamento (teste 2)', () => {
  it('3× R$ 100,00 cria 3 agendados em 3 faturas consecutivas', () => {
    const r = criarParcelamento({ base: compra('2026-11-20', 300), parcelas: 3, parametros: params, faturas: [], hoje: HOJE });
    expect(r.lancamentos.map((l) => [l.valor, l.status, l.data_competencia, l.data_caixa, l.parcela_num])).toEqual([
      [100, 'agendado', '2026-11-20', '2026-12-07', 1],
      [100, 'agendado', '2026-11-20', '2027-01-07', 2],
      [100, 'agendado', '2026-11-20', '2027-02-07', 3],
    ]);
    expect(new Set(r.lancamentos.map((l) => l.fatura_id)).size).toBe(3);
    expect(r.faturasNovas.map((f) => f.competencia)).toEqual(['2026-12', '2027-01', '2027-02']);
    expect(r.parcelamento).toMatchObject({ parcelas: 3, valor_total: 300, primeira_fatura: '2026-12' });
  });

  it('3× R$ 100,01 ajusta os centavos na última parcela', () => {
    const r = criarParcelamento({ base: compra('2026-11-20', 300.03), parcelas: 3, parametros: params, faturas: [], hoje: HOJE });
    expect(r.lancamentos.map((l) => l.valor)).toEqual([100.01, 100.01, 100.01]);
    const r2 = criarParcelamento({ base: compra('2026-11-20', 100), parcelas: 3, parametros: params, faturas: [], hoje: HOJE });
    expect(r2.lancamentos.map((l) => l.valor)).toEqual([33.33, 33.33, 33.34]);
  });
});

describe('pagamento de fatura (teste 3)', () => {
  function cenario() {
    const ls = [compra('2026-11-10', 300), compra('2026-11-15', 200, { quem: 'pessoa2' })];
    const s = sincronizarFaturas({ contas, faturas: [], lancamentos: ls, parametros: params, hoje: HOJE });
    const lancs = ls.map((l) => s.lancamentosAlterados.find((x) => x.id === l.id) ?? l);
    return { fatura: s.faturasNovas[0], lancs };
  }
  const pagar = (valor: number, fatura: Fatura) =>
    ({ ...criarLancamento({ tipo: 'transferencia', valor, descricao: 'Pagamento', contaId: 'cta_azul', contaDestinoId: 'cta_verde', data: '2026-12-07', quem: 'casal' }, ctx), fatura_id: fatura.id });

  it('pagar o total muda todas as despesas para realizado, com caixa na data do pagamento', () => {
    const { fatura, lancs } = cenario();
    expect(totalFatura(fatura, lancs)).toEqual({ total: 500, porPessoa: { pessoa1: 0, pessoa2: 200, casal: 300 } });
    const r = aplicarPagamento({ fatura, pagamento: pagar(500, fatura), lancamentos: lancs });
    expect(r.fatura.status).toBe('paga');
    expect(r.lancamentosAlterados.map((l) => [l.status, l.data_caixa])).toEqual([
      ['realizado', '2026-12-07'],
      ['realizado', '2026-12-07'],
    ]);
  });

  it('pagar metade deixa paga_parcial e as despesas agendadas', () => {
    const { fatura, lancs } = cenario();
    const r = aplicarPagamento({ fatura, pagamento: pagar(250, fatura), lancamentos: lancs });
    expect(r.fatura.status).toBe('paga_parcial');
    expect(r.lancamentosAlterados).toEqual([]);
  });

  it('casa o pagamento com a fatura de total igual (±1%)', () => {
    const { fatura, lancs } = cenario();
    const outra = obterFatura([fatura], 'cta_verde', cicloDaCompra('cta_verde', '2026-12-05', params)!, HOJE).fatura;
    expect(faturaParaPagamento('cta_verde', 497, '2026-12-07', [fatura, outra], lancs)).toMatchObject({ fatura: { id: fatura.id }, forte: true });
  });
});

describe('sincronizar faturas ao abrir', () => {
  it('liga compras sem fatura, põe caixa = vencimento e fecha faturas vencidas', () => {
    const ls = [compra('2026-11-10'), compra('2026-11-29')];
    const s = sincronizarFaturas({ contas, faturas: [], lancamentos: ls, parametros: params, hoje: '2026-11-30' });
    expect(s.faturasNovas.map((f) => [f.competencia, f.status])).toEqual([
      ['2026-12', 'fechada'],
      ['2027-01', 'aberta'],
    ]);
    expect(s.lancamentosAlterados.map((l) => l.data_caixa)).toEqual(['2026-12-07', '2027-01-07']);
    // Rodar de novo não muda nada.
    const lancs = s.lancamentosAlterados;
    expect(sincronizarFaturas({ contas, faturas: s.faturasNovas, lancamentos: lancs, parametros: params, hoje: '2026-11-30' }))
      .toEqual({ faturasNovas: [], faturasAlteradas: [], lancamentosAlterados: [] });
  });
});

describe('recalcular fatura (pagar, desfazer pagamento)', async () => {
  const { recalcularFatura } = await import('./faturas');
  it('paga → realizado; excluir o pagamento → volta a agendado', () => {
    const ls = [compra('2026-11-10', 300)];
    const s = sincronizarFaturas({ contas, faturas: [], lancamentos: ls, parametros: params, hoje: HOJE });
    const fatura = s.faturasNovas[0];
    const lancs = s.lancamentosAlterados;
    const pg = { ...criarLancamento({ tipo: 'transferencia', valor: 300, descricao: 'Pg', contaId: 'cta_azul', contaDestinoId: 'cta_verde', data: HOJE, quem: 'casal' }, ctx), fatura_id: fatura.id };
    const r1 = recalcularFatura(fatura, [...lancs, pg], HOJE);
    expect(r1.fatura.status).toBe('paga');
    expect(r1.lancamentosAlterados[0]).toMatchObject({ status: 'realizado', data_caixa: HOJE });
    const r2 = recalcularFatura(r1.fatura, [...r1.lancamentosAlterados, { ...pg, excluido: true }], HOJE);
    expect(r2.fatura.status).toBe('aberta');
    expect(r2.lancamentosAlterados[0]).toMatchObject({ status: 'agendado', data_caixa: '2026-12-07' });
  });
});

describe('fatura da importação', async () => {
  const { cicloDaImportacao } = await import('./faturas');
  it('pelo vencimento informado (texto da fatura)', () => {
    expect(cicloDaImportacao('cta_verde', { vencimento: '2026-11-07', datas: [] }, params)).toEqual({
      competencia: '2026-11', data_fechamento: '2026-10-29', data_vencimento: '2026-11-07',
    });
  });
  it('pelo fim do período do OFX (fechamento mais próximo)', () => {
    expect(cicloDaImportacao('cta_verde', { fim: '2026-10-30', datas: [] }, params)?.competencia).toBe('2026-11');
  });
});
