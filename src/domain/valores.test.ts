import { describe, expect, it } from 'vitest';
import { lerBool, lerData, lerEnum, lerNumero, normalizar } from './valores';
import { ulid } from './ids';

describe('leitura tolerante de células', () => {
  it('números com vírgula ou ponto', () => {
    expect(lerNumero(68.9)).toBe(68.9);
    expect(lerNumero('68,9')).toBe(68.9);
    expect(lerNumero('68.90')).toBe(68.9);
    expect(lerNumero('1.234,56')).toBe(1234.56);
    expect(lerNumero('R$ 1.234,56')).toBe(1234.56);
    expect(lerNumero('abc')).toBeNull();
    expect(lerNumero('')).toBeNull();
  });

  it('booleanos em vários formatos', () => {
    expect(lerBool('TRUE')).toBe(true);
    expect(lerBool('sim')).toBe(true);
    expect(lerBool('Não')).toBe(false);
    expect(lerBool(1)).toBe(true);
    expect(lerBool('0')).toBe(false);
    expect(lerBool('', true)).toBe(true);
    expect(lerBool('talvez')).toBeNull();
  });

  it('datas ISO, dd/mm/aaaa e número de série', () => {
    expect(lerData('2026-11-19')).toBe('2026-11-19');
    expect(lerData('19/11/2026')).toBe('2026-11-19');
    expect(lerData('5/1/2027')).toBe('2027-01-05');
    expect(lerData(46345)).toBe('2026-11-19');
    expect(lerData('31/02/2026')).toBeNull();
    expect(lerData('ontem')).toBeNull();
  });

  it('enums sem diferenciar maiúsculas e acentos', () => {
    expect(lerEnum('Variável', ['fixa', 'variavel'] as const)).toBe('variavel');
    expect(lerEnum('CARTAO', ['corrente', 'cartao'] as const)).toBe('cartao');
    expect(lerEnum('outro', ['fixa'] as const)).toBeNull();
  });

  it('normaliza texto', () => {
    expect(normalizar('  Farmácia   AZUL ')).toBe('farmacia azul');
  });

  it('gera ULID de 26 caracteres, ordenável pelo tempo', () => {
    const a = ulid(1_700_000_000_000);
    const b = ulid(1_700_000_000_001);
    expect(a).toHaveLength(26);
    expect(a.slice(0, 10) < b.slice(0, 10)).toBe(true);
  });
});
