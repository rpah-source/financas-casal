import { describe, expect, it } from 'vitest';
import { categoriasPadrao } from './categoriasPadrao';
import { baixarParcelasPagas, criarDivida, validarDivida } from './dividas';
import { fotografiaDoMes } from './fotografia';
import { criarLancamento } from './lancamento';
import { gerarParcelasDivida } from './recorrencias';
import type { Categoria, Conta } from './types';

const contas = [{ id: 'cta_azul', nome: 'Conta Azul', tipo: 'corrente', apelidos: [], ativa: true, saldo_inicial: 0, data_saldo_inicial: null }] as unknown as Conta[];
const categorias = categoriasPadrao() as unknown as Categoria[];
const HOJE = '2026-11-21';

describe('empréstimo → dívida → parcelas', () => {
  it('empréstimo recebido entra no saldo, mas não é renda', () => {
    const l = criarLancamento({ tipo: 'receita', valor: 5000, descricao: 'Empréstimo', contaId: 'cta_azul', data: HOJE, quem: 'casal', categoria: 'Empréstimo' }, { contas, categorias, hoje: HOJE });
    expect(l.excluir_da_analise).toBe(true);
    const f = fotografiaDoMes({ mes: '2026-11', lancamentos: [l], recorrencias: [], parametros: [] });
    expect(f.entradas.total).toBe(0);
  });

  it('a dívida gera as parcelas futuras agendadas; pagar uma baixa as restantes', () => {
    const d = criarDivida({ credor: 'Banco Exemplo', tipo: 'emprestimo_pessoal', valorParcela: 300, parcelas: 24, diaVencimento: 16, contaPagamentoId: 'cta_azul', descontadaEmFolha: false }, '2026-11-21T12:00:00Z');
    expect(d).toMatchObject({ total_parcelado: 7200, valor_para_quitar: 7200, parcelas_restantes: 24 });
    const parcelas = gerarParcelasDivida({ dividas: [d], lancamentos: [], hoje: HOJE });
    expect(parcelas.map((l) => [l.data_competencia, l.status, l.natureza])).toEqual([
      ['2026-12-16', 'agendado', 'divida'],
      ['2027-01-16', 'agendado', 'divida'],
    ]);
    const paga = { ...parcelas[0], status: 'realizado' as const };
    expect(baixarParcelasPagas(parcelas, [paga], [d])[0].parcelas_restantes).toBe(23);
    expect(baixarParcelasPagas([paga], [paga], [d])).toEqual([]); // já estava paga: não baixa de novo
  });

  it('consignado descontado em folha não precisa de conta e não gera saída', () => {
    expect(validarDivida({ credor: 'Consignado Exemplo', tipo: 'consignado', valorParcela: 500, parcelas: 48, diaVencimento: 5, contaPagamentoId: null, descontadaEmFolha: true })).toBeNull();
    const d = criarDivida({ credor: 'Consignado Exemplo', tipo: 'consignado', valorParcela: 500, parcelas: 48, diaVencimento: 5, contaPagamentoId: null, descontadaEmFolha: true });
    expect(gerarParcelasDivida({ dividas: [d], lancamentos: [], hoje: HOJE })).toEqual([]);
  });

  it('valida o que falta', () => {
    expect(validarDivida({ credor: '', tipo: 'outro', valorParcela: 1, parcelas: 1, diaVencimento: 1, contaPagamentoId: 'x', descontadaEmFolha: false })).toMatch(/credor/);
  });
});
