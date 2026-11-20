import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { categoriasPadrao } from '../categoriasPadrao';
import { sincronizarFaturas } from '../faturas';
import { semanaDe, gastoDaSemana } from '../semana';
import { fotografiaDoMes } from '../fotografia';
import { criarLancamento } from '../lancamento';
import { gerarPrevistos } from '../recorrencias';
import type { Categoria, Conta, Lancamento, Parametro, RegistroGenerico } from '../types';
import { lancamentoDaCaixa, previaCaixa } from './caixa';
import { conciliar } from './conciliacao';
import { lerOFX } from './ofx';
import type { LinhaImportada } from './tipos';

const HOJE = '2026-11-20';
const contas = [
  { id: 'cta_azul', nome: 'Conta Azul', tipo: 'corrente', apelidos: ['azul'], ativa: true, saldo_inicial: 0, data_saldo_inicial: null },
  { id: 'cta_verde', nome: 'Cartão Verde', tipo: 'cartao', conta_pagamento_id: 'cta_azul', apelidos: ['verde'], ativa: true, saldo_inicial: 0, data_saldo_inicial: null, finais_cartao: '1111:pessoa1,3333:pessoa2' },
] as unknown as Conta[];
const categorias = categoriasPadrao() as unknown as Categoria[];
const pessoas = { pessoa1: 'Alex', pessoa2: 'Sam' };
const base = (o: Partial<Parameters<typeof conciliar>[1]> = {}) => ({
  contaId: 'cta_azul', contas, lancamentos: [] as Lancamento[], regras: [] as RegistroGenerico[], recorrencias: [] as RegistroGenerico[],
  categorias, caixaEntrada: [] as RegistroGenerico[], janelaDias: 5, hoje: HOJE, importacaoId: 'imp_1', pessoas, ...o,
});
const linha = (o: Partial<LinhaImportada>): LinhaImportada => ({ data: HOJE, descricao: 'X', valor: 10, sentido: 'saida', ...o });

describe('teste 4 (parte 2): importar a faxina casa com o previsto da semana, sem duplicar', () => {
  it('previsto de recorrência com padrao_banco', () => {
    const faxina = { id: 'rec_f', descricao: 'Faxina', tipo: 'despesa', valor: 180, conta_id: 'cta_azul', natureza: 'fixa', frequencia: 'semanal', dia_semana: 5, inicio: '2026-01-01', padrao_banco: 'PIX ENVIADO MARIA', tolerancia_valor_pct: 15, ativa: true };
    const previstos = gerarPrevistos({ recorrencias: [faxina], lancamentos: [], contas, hoje: HOJE });
    const r = conciliar([linha({ data: '2026-11-19', descricao: 'PIX ENVIADO MARIA EXEMPLO', valor: 180 })], base({ lancamentos: previstos, recorrencias: [faxina] }));
    expect(r.casados).toHaveLength(1);
    expect(r.casados[0]).toMatchObject({ id: previstos.find((l) => l.data_competencia === '2026-11-20')!.id, status: 'realizado', conciliado: true, data_competencia: '2026-11-19', recorrencia_id: 'rec_f' });
    expect(r.caixa).toEqual([]);
  });
});

describe('teste 5: importar o mesmo OFX duas vezes não cria nada na segunda', () => {
  it('chave por FITID + valor (FITID repetido entre compra e estorno não perde linha)', () => {
    const ofx = lerOFX(readFileSync(new URL('../../../samples/nubank-fatura.ofx', import.meta.url), 'utf8'));
    const ctx = base({ contaId: 'cta_verde' });
    const r1 = conciliar(ofx.linhas, ctx);
    expect(r1.novos + r1.sugeridos).toBe(12);
    expect(new Set(r1.caixa.map((c) => c.chave_dedupe)).size).toBe(12);
    const r2 = conciliar(ofx.linhas, { ...ctx, caixaEntrada: r1.caixa });
    expect(r2).toMatchObject({ casados: [], caixa: [], ignorados: 12 });
  });
});

describe('teste 6: "PAGAMENTO DE FATURA" importado vira transferência', () => {
  it('não aparece em categorias nem na semanada', () => {
    const r = conciliar([linha({ descricao: 'PAGAMENTO DE FATURA CARTAO VERDE', valor: 500, data: '2026-11-18' })], base());
    const item = r.caixa[0];
    expect(item.tipo_sugerido).toBe('transferencia');
    const l = lancamentoDaCaixa(item, { contas, categorias, regras: [], pessoas, hoje: HOJE });
    expect(l).toMatchObject({ tipo: 'transferencia', conta_id: 'cta_azul', conta_destino_id: 'cta_verde', categoria: null, natureza: 'nenhuma' });
    expect(gastoDaSemana([l], semanaDe(HOJE))).toBe(0);
    const f = fotografiaDoMes({ mes: '2026-11', lancamentos: [l], recorrencias: [], parametros: [] as Parametro[] });
    expect(f.entradas.total + f.variavel.total + f.fixa.total).toBe(0);
  });

  it('"Pagamento recebido" na fatura do cartão casa com o pagamento lançado no app', () => {
    const pg = criarLancamento({ tipo: 'transferencia', valor: 1500, descricao: 'Pagamento', contaId: 'cta_azul', contaDestinoId: 'cta_verde', data: '2026-10-05', quem: 'casal' }, { contas, categorias, hoje: HOJE });
    const r = conciliar([linha({ descricao: 'Pagamento recebido', valor: 1500, sentido: 'entrada', data: '2026-10-06' })], base({ contaId: 'cta_verde', lancamentos: [pg] }));
    expect(r.casados[0]).toMatchObject({ id: pg.id, conciliado: true });
  });
});

describe('casamentos e sugestões', () => {
  const ctxL = { contas, categorias, hoje: HOJE };
  it('forte: mesmo valor, data ±2 dias e descrição parecida', () => {
    const manual = criarLancamento({ tipo: 'despesa', valor: 65.4, descricao: 'Lanchonete Exemplo', contaId: 'cta_verde', data: '2026-11-14', quem: 'casal' }, ctxL);
    const r = conciliar([linha({ descricao: 'Ifd*Lanchonete Exemplo', valor: 65.4, data: '2026-11-15' })], base({ contaId: 'cta_verde', lancamentos: [manual] }));
    expect(r.casados[0]).toMatchObject({ id: manual.id, conciliado: true, descricao_original: 'Ifd*Lanchonete Exemplo' });
  });

  it('sugestão: mesmo valor e data na janela, descrição diferente', () => {
    const manual = criarLancamento({ tipo: 'despesa', valor: 42, descricao: 'presente', contaId: 'cta_azul', data: '2026-11-16', quem: 'casal' }, ctxL);
    const r = conciliar([linha({ descricao: 'LOJA QUALQUER', valor: 42, data: '2026-11-18' })], base({ lancamentos: [manual] }));
    expect(r.sugeridos).toBe(1);
    expect(r.caixa[0]).toMatchObject({ lancamento_id: manual.id, status: 'novo' });
  });

  it('novo: categorizado pelas Regras; final do cartão → pessoa', () => {
    const regras = [{ id: 'reg_1', padrao: 'ifood', descricao: 'iFood', categoria: 'Alimentação', subcategoria: 'Delivery', ativa: true }];
    const r = conciliar([linha({ descricao: 'IFD*IFOOD CLUB', valor: 7.95, finalCartao: '3333' })], base({ contaId: 'cta_verde', regras }));
    expect(r.caixa[0]).toMatchObject({ categoria: 'Alimentação', subcategoria: 'Delivery', quem: 'pessoa2', tipo_sugerido: 'despesa' });
    const l = lancamentoDaCaixa(r.caixa[0], { contas, categorias, regras, pessoas, hoje: HOJE });
    expect(l).toMatchObject({ descricao: 'iFood', origem: 'importacao', conciliado: true, quem: 'pessoa2', status: 'agendado' });
  });

  it('lançados no app que não estão na fatura', () => {
    const ls = [criarLancamento({ tipo: 'despesa', valor: 99, descricao: 'esquecido', contaId: 'cta_verde', data: '2026-11-10', quem: 'casal' }, ctxL)];
    const params: Parametro[] = [
      { chave: 'cartao.fechamento_dia', escopo: 'cta_verde', valor: '28', vigente_desde: '2000-01-01' },
      { chave: 'cartao.vencimento_dia', escopo: 'cta_verde', valor: '6', vigente_desde: '2000-01-01' },
    ];
    const s = sincronizarFaturas({ contas, faturas: [], lancamentos: ls, parametros: params, hoje: HOJE });
    const r = conciliar([linha({ descricao: 'OUTRA', valor: 5 })], base({ contaId: 'cta_verde', lancamentos: s.lancamentosAlterados, fatura: s.faturasNovas[0] }));
    expect(r.naoEncontrados.map((l) => l.descricao)).toEqual(['esquecido']);
  });
});

describe('teste 13: linha escrita sem id na CaixaEntrada', () => {
  it('aparece na revisão e, aceita, vira lançamento com id', () => {
    const item = { texto: '45 farmácia azul', fonte: 'claude', status: 'novo' };
    const p = previaCaixa(item, { contas, categorias, regras: [], pessoas, hoje: HOJE });
    expect(p).toMatchObject({ valor: 45, contaId: 'cta_azul', categoria: 'Saúde', subcategoria: 'Farmácia' });
    const l = lancamentoDaCaixa(item, { contas, categorias, regras: [], pessoas, hoje: HOJE });
    expect(l).toMatchObject({ valor: 45, origem: 'caixa_entrada', status: 'realizado' });
    expect(l.id).toMatch(/^lan_/);
  });
});
