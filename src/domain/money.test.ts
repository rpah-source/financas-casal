import { describe, expect, it } from 'vitest';
import { formatarBRL } from './money';

describe('formatarBRL', () => {
  it('usa ponto no milhar e vírgula nos centavos', () => {
    expect(formatarBRL(1234.56)).toBe('R$ 1.234,56');
    expect(formatarBRL(68.9)).toBe('R$ 68,90');
    expect(formatarBRL(0)).toBe('R$ 0,00');
    expect(formatarBRL(1000000)).toBe('R$ 1.000.000,00');
  });

  it('mostra negativo com sinal de menos tipográfico', () => {
    expect(formatarBRL(-500)).toBe('−R$ 500,00');
  });

  it('pode omitir centavos', () => {
    expect(formatarBRL(1234.4, { semCentavos: true })).toBe('R$ 1.234');
  });
});
