import { describe, expect, it } from 'vitest';
import { gerarDadosDemo } from './demoData';
import { resumoSemana } from '../domain/semana';

describe('dados de demonstração', () => {
  it('geram uma semana coerente em qualquer data', () => {
    for (const hoje of ['2026-11-01', '2026-11-19', '2026-12-31', '2027-02-28']) {
      const d = gerarDadosDemo(hoje);
      const r = resumoSemana(d.lancamentos, hoje, d.semanada, d.cortes);
      expect(r.usado).toBeGreaterThanOrEqual(0);
      expect(r.usado).toBeLessThanOrEqual(d.semanada * 2);
    }
  });

  it('referenciam só contas que existem', () => {
    const d = gerarDadosDemo('2026-11-19');
    const ids = new Set(d.contas.map((c) => c.id));
    for (const l of d.lancamentos) expect(ids.has(l.conta_id)).toBe(true);
  });
});
