import { describe, expect, it } from 'vitest';
import { interpretarTexto } from './parser';
import { aplicarRegras, padraoSugerido } from './regras';
import { categoriasPadrao } from './categoriasPadrao';
import type { Categoria } from './types';

const ctx = {
  hoje: '2026-11-19',
  pessoas: { pessoa1: 'Alex', pessoa2: 'Sam' },
  contas: [
    { id: 'cta_azul', nome: 'Conta Azul', apelidos: ['azul', 'pix'], ativa: true },
    { id: 'cta_verde', nome: 'Cartão Verde', apelidos: ['verde'], ativa: true },
    { id: 'cta_vale', nome: 'Vale', apelidos: ['vale'], ativa: true },
  ],
};

describe('texto livre (SPEC 8.1, teste de aceitação 10)', () => {
  it.each([
    ['45 farmácia azul', { valor: 45, descricao: 'farmácia', contaId: 'cta_azul', data: '2026-11-19' }],
    ['ifood 68,90', { valor: 68.9, descricao: 'ifood', contaId: null }],
    ['uber 23,4 ontem', { valor: 23.4, descricao: 'uber', data: '2026-11-18' }],
    ['mercado 312 vale', { valor: 312, descricao: 'mercado', contaId: 'cta_vale' }],
    ['geladeira 3x 2400 verde', { valor: 2400, descricao: 'geladeira', parcelas: 3, contaId: 'cta_verde' }],
    ['30 padaria Pessoa2', { valor: 30, descricao: 'padaria', quem: 'pessoa2' }],
  ])('%s', (texto, esperado) => {
    expect(interpretarTexto(texto, ctx)).toMatchObject(esperado);
  });

  it('aceita nome da pessoa, R$ e data dd/mm', () => {
    expect(interpretarTexto('R$ 12,50 café sam 15/11', ctx)).toMatchObject({
      valor: 12.5, descricao: 'café', quem: 'pessoa2', data: '2026-11-15',
    });
    expect(interpretarTexto('aluguel 1.850 conta azul', ctx)).toMatchObject({ valor: 1850, contaId: 'cta_azul', descricao: 'aluguel' });
  });

  it('dd/mm muito no futuro é do ano passado', () => {
    expect(interpretarTexto('presente 50 24/12', { ...ctx, hoje: '2026-01-05' }).data).toBe('2025-12-24');
  });

  it('sem número não inventa valor', () => {
    expect(interpretarTexto('farmácia', ctx).valor).toBeNull();
  });
});

describe('regras de-para', () => {
  const categorias = categoriasPadrao() as unknown as Categoria[];
  const regras = [
    { id: 'reg_1', padrao: 'ifood', descricao: 'iFood', categoria: 'Alimentação', subcategoria: 'Delivery', prioridade: 0, ativa: true },
    { id: 'reg_2', padrao: '/^uber/', descricao: 'Uber', categoria: 'Transporte', subcategoria: 'Aplicativo', prioridade: 0, ativa: true },
    { id: 'reg_3', padrao: 'ifood', descricao: 'iFood Mercado', categoria: 'Alimentação', subcategoria: 'Supermercado', prioridade: 5, ativa: true },
  ];

  it('a maior prioridade vence; natureza vem da categoria', () => {
    const s = aplicarRegras('IFD*IFOOD', regras, categorias);
    expect(s).toMatchObject({ regraId: 'reg_3', subcategoria: 'Supermercado', natureza: 'variavel', fonte: 'regra' });
  });

  it('aceita /regex/', () => {
    expect(aplicarRegras('Uber trip', regras, categorias).regraId).toBe('reg_2');
    expect(aplicarRegras('meu uber', regras, categorias).regraId).toBeNull();
  });

  it('sem regra, sugere pelo nome da subcategoria', () => {
    expect(aplicarRegras('farmácia da esquina', [], categorias)).toMatchObject({
      categoria: 'Saúde', subcategoria: 'Farmácia', fonte: 'categoria',
    });
  });

  it('padrão sugerido limpa prefixos e números', () => {
    expect(padraoSugerido('IFD*IFOOD 123')).toBe('ifood');
  });
});
