import { describe, expect, it } from 'vitest';
import { gastoDaSemana, resumoSemana, semanaDe, semanasDoMes } from './semana';
import type { Lancamento } from './types';

const base: Lancamento = {
  id: 'lan_x',
  tipo: 'despesa',
  status: 'realizado',
  descricao: 'Teste',
  valor: 10,
  data_competencia: '2026-11-17',
  data_caixa: '2026-11-17',
  conta_id: 'cta_a',
  categoria: 'Alimentação',
  natureza: 'variavel',
  quem: 'casal',
};
const l = (o: Partial<Lancamento>): Lancamento => ({ ...base, ...o });

describe('semanas do mês (9.1)', () => {
  it('usa os cortes padrão 1-8, 9-15, 16-22, 23-fim', () => {
    const s = semanasDoMes(2026, 11);
    expect(s.map((x) => [x.inicio, x.fim])).toEqual([
      ['2026-11-01', '2026-11-08'],
      ['2026-11-09', '2026-11-15'],
      ['2026-11-16', '2026-11-22'],
      ['2026-11-23', '2026-11-30'],
    ]);
  });

  it('"fim" respeita meses curtos', () => {
    expect(semanasDoMes(2027, 2).at(-1)!.fim).toBe('2027-02-28');
  });

  it('cortes inválidos voltam ao padrão sem travar', () => {
    expect(semanasDoMes(2026, 11, 'bobagem')).toHaveLength(4);
    expect(semanasDoMes(2026, 11, '1-8,10-fim')).toHaveLength(4);
  });

  it('acha a semana de uma data', () => {
    expect(semanaDe('2026-11-19')).toMatchObject({ numero: 3, inicio: '2026-11-16', fim: '2026-11-22' });
  });
});

describe('semanada (teste de aceitação 9)', () => {
  it('considera só variável e ignora previsto, transferência e cancelado', () => {
    const lancs = [
      l({ valor: 100 }),
      l({ valor: 50, status: 'agendado' }),
      l({ valor: 999, status: 'previsto' }),
      l({ valor: 999, status: 'cancelado' }),
      l({ valor: 999, tipo: 'transferencia' }),
      l({ valor: 999, natureza: 'fixa' }),
      l({ valor: 999, excluido: true }),
      l({ valor: 999, excluir_da_analise: true }),
      l({ valor: 999, data_competencia: '2026-11-15' }),
    ];
    expect(gastoDaSemana(lancs, semanaDe('2026-11-19'))).toBe(150);
  });

  it('calcula quanto ainda dá para gastar e por dia', () => {
    const r = resumoSemana([l({ valor: 300 })], '2026-11-19', 700);
    expect(r.aindaPodemos).toBe(400);
    expect(r.diasRestantes).toBe(4); // 19, 20, 21, 22
    expect(r.porDia).toBe(100);
  });

  it('não mostra "por dia" quando passou da semanada', () => {
    const r = resumoSemana([l({ valor: 820 })], '2026-11-19', 700);
    expect(r.aindaPodemos).toBe(-120);
    expect(r.porDia).toBeNull();
  });
});
