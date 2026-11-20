import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectarPerfil, lerCSV, separarCSV } from './csv';
import { lerOFX } from './ofx';
import { inferirAno, lerTexto } from './texto';

const amostra = (n: string) => readFileSync(new URL(`../../../samples/${n}`, import.meta.url), 'utf8');

describe('OFX (samples/nubank-fatura.ofx)', () => {
  const r = lerOFX(amostra('nubank-fatura.ofx'));
  it('lê o cabeçalho da fatura de cartão', () => {
    expect(r).toMatchObject({ formato: 'ofx', tipoConta: 'cartao', banco: 'NU PAGAMENTOS S.A.', inicio: '2026-09-29', fim: '2026-10-30', total: 571.6 });
    expect(r.linhas).toHaveLength(12);
  });
  it('compra = saída, estorno/pagamento = entrada, parcela no texto', () => {
    expect(r.linhas[0]).toMatchObject({ data: '2026-10-29', valor: 120.5, sentido: 'saida', descricao: 'Restaurante Exemplo' });
    expect(r.linhas.find((l) => l.descricao === 'Pagamento recebido')).toMatchObject({ valor: 1500, sentido: 'entrada' });
    expect(r.linhas.find((l) => l.descricao.startsWith('Locadora'))?.parcela).toEqual({ num: 2, total: 10 });
  });
});

describe('texto colado do PDF (samples/santander-fatura.txt)', () => {
  const r = lerTexto(amostra('santander-fatura.txt'), { tipoConta: 'cartao', hoje: '2026-11-20' });
  it('acha vencimento e total', () => {
    expect(r.vencimento).toBe('2026-11-05');
    expect(r.total).toBe(1010.54);
  });
  it('lê todas as transações, inclusive as grudadas numa linha só', () => {
    const descr = r.linhas.map((l) => l.descricao);
    expect(descr).toContain('RESTAURANTE EXEMPLO');
    expect(descr).toContain('RESTAURANTE DOIS');
    expect(descr).toContain('DL *UBERRIDES');
    expect(r.linhas).toHaveLength(20);
  });
  it('seções: créditos = entrada; parcelas; final do cartão de cada pessoa; ano inferido', () => {
    const pg = r.linhas.find((l) => l.descricao.startsWith('DEB AUTOM'));
    expect(pg).toMatchObject({ valor: 900, sentido: 'entrada', finalCartao: '1111', data: '2026-10-05' });
    const brecho = r.linhas.find((l) => l.descricao.startsWith('BRECHO'));
    expect(brecho).toMatchObject({ parcela: { num: 9, total: 10 }, finalCartao: '3333', data: '2026-02-13', sentido: 'saida' });
    expect(r.linhas.find((l) => l.descricao.startsWith('HOTEL'))).toMatchObject({ finalCartao: '2222', data: '2025-12-09' });
    expect(r.linhas.find((l) => l.descricao === 'IFD*IFOOD CLUB')?.finalCartao).toBe('3333');
  });
  it('soma das linhas bate com o total da fatura menos o saldo anterior pago', () => {
    const c = (s: 'saida' | 'entrada') => r.linhas.filter((l) => l.sentido === s).reduce((t, l) => t + Math.round(l.valor * 100), 0);
    expect((c('saida') - c('entrada') + 900_00) / 100).toBe(1010.54); // despesas − créditos − pagamento + saldo anterior
  });
});

describe('texto de extrato simples', () => {
  it('aceita dd/mm, dd MMM e R$, com D/C ou sinal', () => {
    const r = lerTexto('12/11 PIX RECEBIDO FULANO R$ 150,00 C\n13 nov MERCADO EXEMPLO -45,90\nlinha sem valor 14/11 nada', { tipoConta: 'corrente', hoje: '2026-11-20' });
    expect(r.linhas.map((l) => [l.data, l.descricao, l.valor, l.sentido])).toEqual([
      ['2026-11-12', 'PIX RECEBIDO FULANO', 150, 'entrada'],
      ['2026-11-13', 'MERCADO EXEMPLO', 45.9, 'saida'],
    ]);
  });
  it('ano: dezembro lido em janeiro é do ano anterior', () => {
    expect(inferirAno(28, 12, '2027-01-05')).toBe('2026-12-28');
  });
});

describe('CSV', () => {
  it('reconhece o perfil Nubank conta pelo cabeçalho', () => {
    const linhas = separarCSV('Data,Valor,Identificador,Descrição\n01/11/2026,-45.90,abc-1,Compra no débito - Mercado Exemplo\n02/11/2026,1000.00,abc-2,Transferência recebida');
    const p = detectarPerfil(linhas[0]);
    expect(p?.nome).toBe('Nubank conta');
    const r = lerCSV(linhas, p!);
    expect(r.linhas).toEqual([
      { data: '2026-11-01', descricao: 'Compra no débito - Mercado Exemplo', valor: 45.9, sentido: 'saida', fitid: 'abc-1', parcela: undefined },
      { data: '2026-11-02', descricao: 'Transferência recebida', valor: 1000, sentido: 'entrada', fitid: 'abc-2', parcela: undefined },
    ]);
  });
  it('fatura Nubank CSV: valor positivo é compra; ponto-e-vírgula e aspas', () => {
    const linhas = separarCSV('date;title;amount\n2026-10-05;"Loja; Exemplo";89,90\n2026-10-06;Pagamento recebido;-500,00');
    const r = lerCSV(linhas, detectarPerfil(linhas[0])!);
    expect(r.linhas.map((l) => [l.descricao, l.valor, l.sentido])).toEqual([
      ['Loja; Exemplo', 89.9, 'saida'],
      ['Pagamento recebido', 500, 'entrada'],
    ]);
  });
  it('cabeçalho desconhecido não tem perfil (vai para o mapeamento)', () => {
    expect(detectarPerfil(['Quando', 'O quê', 'Quanto'])).toBeNull();
  });
});
