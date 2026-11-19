import { describe, expect, it } from 'vitest';
import { ddmm, diasNoMes, diffDias, hojeSP, somarDias } from './dates';

describe('datas', () => {
  it('calcula "hoje" no fuso de São Paulo', () => {
    // 02:30 UTC de 20/11 ainda é 19/11 em São Paulo (UTC−3).
    expect(hojeSP(new Date('2026-11-20T02:30:00Z'))).toBe('2026-11-19');
    expect(hojeSP(new Date('2026-11-20T03:30:00Z'))).toBe('2026-11-20');
  });

  it('soma dias atravessando meses e anos', () => {
    expect(somarDias('2026-11-30', 1)).toBe('2026-12-01');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('conta dias do mês e diferenças', () => {
    expect(diasNoMes(2028, 2)).toBe(29);
    expect(diasNoMes(2026, 11)).toBe(30);
    expect(diffDias('2026-11-19', '2026-11-22')).toBe(3);
  });

  it('formata dd/mm', () => {
    expect(ddmm('2026-11-27')).toBe('27/11');
  });
});
