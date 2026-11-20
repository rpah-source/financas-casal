import { describe, expect, it } from 'vitest';
import { casarComPrevisto, previstosVencidos, procurarPrevisto } from './casamento';
import { fotografiaDoMes } from './fotografia';
import { diaDaSemana, domingoDePascoa, ehDiaUtil } from './holidays-br';
import { criarLancamento } from './lancamento';
import { datasDaRecorrencia, diaDoMes, gerarParcelasDivida, gerarPrevistos } from './recorrencias';
import { proximoCredito, reservado, saldoConta } from './saldos';
import { similaridade } from './similaridade';
import type { Conta, Lancamento, Parametro } from './types';

const HOJE = '2026-11-19';
const contas = [
  { id: 'cta_azul', nome: 'Conta Azul', tipo: 'corrente', saldo_inicial: 1000, data_saldo_inicial: '2026-11-01', apelidos: [], ativa: true },
  { id: 'cta_verde', nome: 'Cartão Verde', tipo: 'cartao', saldo_inicial: 0, data_saldo_inicial: null, apelidos: [], ativa: true },
  { id: 'cta_vale', nome: 'Vale', tipo: 'prepago', saldo_inicial: 300, data_saldo_inicial: '2026-11-01', apelidos: [], ativa: true },
] as unknown as Conta[];
const ctx = { contas, categorias: [], hoje: HOJE, agoraISO: '2026-11-19T12:00:00Z' };
const lan = (o: Partial<Parameters<typeof criarLancamento>[0]> & { status?: Lancamento['status'] }) =>
  criarLancamento({ tipo: 'despesa', valor: 10, descricao: 'x', contaId: 'cta_azul', data: HOJE, quem: 'casal', ...o }, ctx);

const faxina = {
  id: 'rec_faxina', descricao: 'Faxina', tipo: 'despesa', valor: 180, conta_id: 'cta_azul', categoria: 'Serviços',
  subcategoria: 'Faxina', natureza: 'fixa', quem: 'casal', frequencia: 'semanal', dia_semana: 5, inicio: '2026-01-01',
  tolerancia_valor_pct: 15, ativa: true,
};

describe('dias úteis e feriados', () => {
  it('Páscoa 2026–2028', () => {
    expect([2026, 2027, 2028].map(domingoDePascoa)).toEqual(['2026-04-05', '2027-03-28', '2028-04-16']);
  });

  it('teste 11: penúltimo dia útil de nov/2026 é 27/11 (último é 30/11)', () => {
    expect(diaDoMes('ultimo_util', 2026, 11)).toBe('2026-11-30');
    expect(diaDoMes('penultimo_util', 2026, 11)).toBe('2026-11-27');
  });

  it('primeiro dia útil pula feriado e fim de semana', () => {
    expect(diaDoMes('primeiro_util', 2026, 12)).toBe('2026-12-01');
    expect(diaDoMes('primeiro_util', 2027, 1)).toBe('2027-01-04'); // 1º é feriado, 2 e 3 fim de semana
    expect(ehDiaUtil('2026-11-20')).toBe(false); // Consciência Negra
  });

  it('dia 31 em mês curto vira o último dia', () => {
    expect(diaDoMes('31', 2026, 2)).toBe('2026-02-28');
  });
});

describe('recorrências → previstos', () => {
  it('teste 4 (parte 1): faxina semanal gera previstos às sextas, do mês atual + 2', () => {
    const novos = gerarPrevistos({ recorrencias: [faxina], lancamentos: [], contas, hoje: HOJE });
    expect(novos.length).toBeGreaterThanOrEqual(12);
    expect(novos.every((l) => diaDaSemana(l.data_competencia) === 5)).toBe(true);
    expect(novos.every((l) => l.status === 'previsto' && l.recorrencia_id === 'rec_faxina' && l.origem === 'recorrencia')).toBe(true);
    expect(novos[0].data_competencia).toBe('2026-11-06');
    expect(novos.at(-1)!.data_competencia <= '2027-01-31').toBe(true);
  });

  it('é idempotente (não duplica ao abrir de novo, nem depois de cancelado ou realizado)', () => {
    const primeira = gerarPrevistos({ recorrencias: [faxina], lancamentos: [], contas, hoje: HOJE });
    primeira[0].status = 'cancelado';
    primeira[1].status = 'realizado';
    primeira[1].data_competencia = '2026-11-12'; // mudou de dia, mesma semana
    expect(gerarPrevistos({ recorrencias: [faxina], lancamentos: primeira, contas, hoje: HOJE })).toEqual([]);
  });

  it('semana com duas quintas (1–8) gera as duas; previsto movido de dia não duplica', () => {
    const quinta = { ...faxina, dia_semana: 4, inicio: '2026-12-01' };
    const novos = gerarPrevistos({ recorrencias: [quinta], lancamentos: [], contas, hoje: '2026-12-02' });
    expect(novos.filter((l) => l.data_competencia.startsWith('2027-01')).map((l) => l.data_competencia).slice(0, 2)).toEqual(['2027-01-07', '2027-01-14']);
    expect(novos.some((l) => l.data_competencia === '2026-12-03')).toBe(true);
    const movido = novos.map((l) => (l.data_competencia === '2026-12-03' ? { ...l, data_competencia: '2026-12-05', status: 'realizado' as const } : l));
    expect(gerarPrevistos({ recorrencias: [quinta], lancamentos: movido, contas, hoje: '2026-12-02' })).toEqual([]);
  });

  it('mensal respeita início e fim', () => {
    const rec = { ...faxina, frequencia: 'mensal', dia_mes: 'ultimo_util', inicio: '2026-12-01', fim: '2027-01-31' };
    expect(datasDaRecorrencia(rec, '2026-11-01', '2027-03-31')).toEqual(['2026-12-31', '2027-01-29']);
  });

  it('parcelas de dívida: agendadas, até acabar; descontada em folha não gera nada', () => {
    const dividas = [
      { id: 'div_1', credor: 'Banco Fictício', valor_parcela: 500, dia_vencimento: 10, parcelas_restantes: 2, conta_pagamento_id: 'cta_azul', descontada_em_folha: false },
      { id: 'div_2', credor: 'Consignado Fictício', valor_parcela: 900, dia_vencimento: 5, parcelas_restantes: 20, conta_pagamento_id: 'cta_azul', descontada_em_folha: true },
    ];
    const p = gerarParcelasDivida({ dividas, lancamentos: [], hoje: HOJE });
    expect(p.map((l) => [l.data_competencia, l.status, l.natureza])).toEqual([
      ['2026-11-10', 'agendado', 'divida'],
      ['2026-12-10', 'agendado', 'divida'],
    ]);
    expect(gerarParcelasDivida({ dividas, lancamentos: p, hoje: HOJE })).toEqual([]);
  });
});

describe('casamento com previsto ao lançar (teste 14)', () => {
  it('"faxina 180" numa sexta com faxina prevista: no Sim, sobra um único lançamento realizado', () => {
    const previstos = gerarPrevistos({ recorrencias: [faxina], lancamentos: [], contas, hoje: '2026-11-20' });
    const novo = lan({ descricao: 'faxina', valor: 180, data: '2026-11-20' });
    const achado = procurarPrevisto({ novo, lancamentos: previstos, recorrencias: [faxina], regras: [], janelaDias: 5 });
    expect(achado?.data_competencia).toBe('2026-11-20');
    const casado = casarComPrevisto(achado!, novo, { contas, hoje: '2026-11-20' });
    const depois = previstos.map((l) => (l.id === casado.id ? casado : l));
    const daSexta = depois.filter((l) => l.data_competencia === '2026-11-20');
    expect(daSexta).toHaveLength(1);
    expect(daSexta[0]).toMatchObject({ id: achado!.id, status: 'realizado', recorrencia_id: 'rec_faxina', valor: 180 });
  });

  it('não casa se o valor foge da tolerância ou a descrição é outra', () => {
    const previstos = gerarPrevistos({ recorrencias: [faxina], lancamentos: [], contas, hoje: HOJE });
    expect(procurarPrevisto({ novo: lan({ descricao: 'faxina', valor: 400, data: '2026-11-20' }), lancamentos: previstos, recorrencias: [faxina], regras: [], janelaDias: 5 })).toBeNull();
    expect(procurarPrevisto({ novo: lan({ descricao: 'mercado', valor: 180, data: '2026-11-20' }), lancamentos: previstos, recorrencias: [faxina], regras: [], janelaDias: 5 })).toBeNull();
  });

  it('previsto vencido aparece como "Isso aconteceu?"', () => {
    const previstos = gerarPrevistos({ recorrencias: [faxina], lancamentos: [], contas, hoje: HOJE });
    expect(previstosVencidos(previstos, HOJE, 5).map((l) => l.data_competencia)).toEqual(['2026-11-06', '2026-11-13']);
  });

  it('similaridade ignora prefixos de adquirente e números', () => {
    expect(similaridade('IFD*IFOOD 123', 'ifood')).toBe(1);
    expect(similaridade('Spotify', 'SPOTIFY BR')).toBeGreaterThanOrEqual(0.6);
    expect(similaridade('Faxina', 'Mercado')).toBeLessThan(0.6);
  });
});

describe('saldos (9.4)', () => {
  it('soma só realizados até hoje, desde a data do saldo inicial', () => {
    const ls = [
      lan({ valor: 100, data: '2026-11-10' }), // realizado
      lan({ valor: 50, data: '2026-10-30' }), // antes do saldo inicial
      lan({ valor: 70, data: '2026-11-25' }), // futuro (agendado)
      lan({ tipo: 'receita', valor: 200, data: '2026-11-15' }),
      lan({ tipo: 'transferencia', valor: 30, data: '2026-11-16', contaDestinoId: 'cta_vale' }),
    ];
    expect(saldoConta(contas[0], ls, HOJE)).toBe(1000 - 100 + 200 - 30);
    expect(saldoConta(contas[2], ls, HOJE)).toBe(330);
    expect(reservado(contas[0], ls, HOJE, '2026-11-30').total).toBe(70);
  });

  it('próximo crédito do vale pela recorrência', () => {
    const credito = { id: 'rec_vale', tipo: 'receita', conta_id: 'cta_vale', frequencia: 'mensal', dia_mes: 'ultimo_util', valor: 1200, ativa: true };
    expect(proximoCredito(contas[2], [credito], HOJE)?.data).toBe('2026-11-30');
  });
});

describe('fotografia (9.2)', () => {
  const params = (semanada: number): Parametro[] => [
    { chave: 'semanada.valor', escopo: null, valor: String(semanada), vigente_desde: '2000-01-01' },
    { chave: 'margem.pct', escopo: null, valor: '10', vigente_desde: '2000-01-01' },
  ];

  it('teste 15: variáveis na projeção usam semanada × semanas quando o real é menor', () => {
    const ls = [lan({ valor: 300, natureza: 'variavel' })];
    const f = fotografiaDoMes({ mes: '2026-11', lancamentos: ls, recorrencias: [], parametros: params(500) });
    expect(f.variavel.projecao).toBe(2000); // 4 semanas × 500
    const f2 = fotografiaDoMes({ mes: '2026-11', lancamentos: [lan({ valor: 2500, natureza: 'variavel' })], recorrencias: [], parametros: params(500) });
    expect(f2.variavel.projecao).toBe(2500);
  });

  it('teste 7: empréstimo recebido não entra em Entradas', () => {
    const emprestimo = { ...lan({ tipo: 'receita', valor: 5000 }), excluir_da_analise: true };
    const salario = lan({ tipo: 'receita', valor: 3000 });
    const f = fotografiaDoMes({ mes: '2026-11', lancamentos: [emprestimo, salario], recorrencias: [], parametros: params(0) });
    expect(f.entradas.total).toBe(3000);
  });

  it('teste 16: parcela descontada em folha não entra duas vezes', () => {
    const dividas = [{ id: 'div_c', credor: 'Consignado', valor_parcela: 900, dia_vencimento: 5, parcelas_restantes: 20, conta_pagamento_id: 'cta_azul', descontada_em_folha: true }];
    const geradas = gerarParcelasDivida({ dividas, lancamentos: [], hoje: HOJE });
    const f = fotografiaDoMes({ mes: '2026-11', lancamentos: geradas, recorrencias: [], parametros: params(0) });
    expect(geradas).toEqual([]);
    expect(f.divida.total).toBe(0);
  });

  it('resultado = entradas − naturezas − margem; transferências ficam fora', () => {
    const ls = [
      lan({ tipo: 'receita', valor: 5000 }),
      lan({ valor: 1000, natureza: 'fixa' }),
      lan({ valor: 400, natureza: 'variavel' }),
      lan({ tipo: 'transferencia', valor: 999, contaDestinoId: 'cta_vale' }),
    ];
    const f = fotografiaDoMes({ mes: '2026-11', lancamentos: ls, recorrencias: [], parametros: params(0) });
    expect(f.margem).toBe(140);
    expect(f.resultado).toBe(5000 - 1000 - 400 - 140);
    expect(f.completude.faltam).toContain('sazonais');
  });
});

describe('ciclo do cartão (versão da tela Semana)', () => {
  it('fecha dia 29 e vence dia 7 do mês seguinte', async () => {
    const { proximoCiclo } = await import('./cartao');
    const params: Parametro[] = [
      { chave: 'cartao.fechamento_dia', escopo: 'cta_verde', valor: '29', vigente_desde: '2000-01-01' },
      { chave: 'cartao.vencimento_dia', escopo: 'cta_verde', valor: '7', vigente_desde: '2000-01-01' },
    ];
    expect(proximoCiclo('cta_verde', params, '2026-11-19')).toEqual({ fechamento: '2026-11-29', vencimento: '2026-12-07' });
    expect(proximoCiclo('cta_verde', params, '2026-11-30')).toEqual({ fechamento: '2026-12-29', vencimento: '2027-01-07' });
    expect(proximoCiclo('cta_verde', params, '2027-02-10')?.fechamento).toBe('2027-02-28');
  });
});
