import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { categoriasPadrao } from '../categoriasPadrao';
import type { Categoria, Conta } from '../types';
import { lancamentoDaCaixa, previaCaixa } from './caixa';
import { conciliar, tipoSugerido } from './conciliacao';
import { acharTabela, lerCSV, separarCSV } from './csv';
import { lerOFX } from './ofx';

const amostra = (n: string) => readFileSync(new URL(`../../../samples/${n}`, import.meta.url), 'utf8');
const HOJE = '2026-11-20';
const contas = [
  { id: 'cta_cc1', nome: 'Conta Laranja', apelidos: ['santander'], tipo: 'corrente', titular: 'Alex', ativa: true, saldo_inicial: 0, data_saldo_inicial: null },
  { id: 'cta_cc2', nome: 'Conta Roxa', apelidos: ['nuconta'], tipo: 'corrente', titular: 'Alex', ativa: true, saldo_inicial: 0, data_saldo_inicial: null },
  { id: 'cta_k1', nome: 'Cartão Roxo', apelidos: ['nubank'], tipo: 'cartao', conta_pagamento_id: 'cta_cc2', ativa: true, saldo_inicial: 0, data_saldo_inicial: null },
  { id: 'cta_k2', nome: 'Cartão Laranja', apelidos: ['crédito santander'], tipo: 'cartao', conta_pagamento_id: 'cta_cc1', finais_cartao: '1111:pessoa1,2222:pessoa1,3333:pessoa2', ativa: true, saldo_inicial: 0, data_saldo_inicial: null },
] as unknown as Conta[];
const categorias = categoriasPadrao() as unknown as Categoria[];
const pessoas = { pessoa1: 'Alex', pessoa2: 'Sam' };
const ctxCaixa = { contas, categorias, regras: [], pessoas, hoje: HOJE };

describe('CSV do extrato (samples/santander-extrato.csv)', () => {
  const todas = separarCSV(amostra('santander-extrato.csv'));
  const { linhas, perfil } = acharTabela(todas);
  const r = lerCSV(linhas, perfil!);
  it('pula o preâmbulo e junta a descrição com quebra de linha', () => {
    expect(perfil?.nome).toBe('Genérico');
    expect(r.linhas).toHaveLength(12);
    expect(r.linhas[0]).toMatchObject({ data: '2026-11-18', descricao: 'Pix enviado Sam exemplo da silva', valor: 450, sentido: 'saida' });
  });

  it('reconhece pagamento de fatura, Pix no cartão, empréstimo e Pix para conta própria', () => {
    const tipo = (d: string) => tipoSugerido(r.linhas.find((l) => l.descricao.startsWith(d))!, contas[0], contas, pessoas);
    expect(tipo('Debito aut. fat.cartao')).toBe('transferencia');
    expect(tipo('Credito liberado para pix')).toBe('transferencia_entrada');
    expect(tipo('Contratacao credito consignado')).toBe('emprestimo');
    expect(tipo('Pix enviado Nu pagamentos')).toBe('transferencia');
    expect(tipo('Pix enviado Alex exemplo')).toBe('transferencia');
    expect(tipo('Pix recebido Alex')).toBe('transferencia_entrada');
    expect(tipo('Pix enviado Sam')).toBe('despesa'); // Pix para outra pessoa é gasto
    expect(tipo('Credito de salario')).toBe('receita');
  });

  it('aceitar: Pix no cartão vem do cartão pelo final; fatura vai para o cartão; empréstimo não é renda', () => {
    const res = conciliar(r.linhas, { contaId: 'cta_cc1', contas, lancamentos: [], regras: [], recorrencias: [], categorias, caixaEntrada: [], janelaDias: 5, hoje: HOJE, importacaoId: 'imp_x', pessoas });
    const item = (d: string) => res.caixa.find((c) => String(c.texto).startsWith(d))!;
    expect(lancamentoDaCaixa(item('Credito liberado'), ctxCaixa)).toMatchObject({ tipo: 'transferencia', conta_id: 'cta_k2', conta_destino_id: 'cta_cc1' });
    expect(lancamentoDaCaixa(item('Debito aut. fat'), ctxCaixa)).toMatchObject({ tipo: 'transferencia', conta_id: 'cta_cc1', conta_destino_id: 'cta_k2' });
    expect(lancamentoDaCaixa(item('Pix enviado Nu pagamentos'), ctxCaixa)).toMatchObject({ tipo: 'transferencia', conta_destino_id: 'cta_k1' });
    expect(lancamentoDaCaixa(item('Contratacao'), ctxCaixa)).toMatchObject({ tipo: 'receita', excluir_da_analise: true });
    // Pix para si mesmo sem dizer o banco: o app pede a conta de destino.
    expect(previaCaixa(item('Pix enviado Alex'), ctxCaixa).contaDestinoId).toBeNull();
  });
});

describe('OFX da conta (samples/nubank-conta.ofx)', () => {
  const r = lerOFX(amostra('nubank-conta.ofx'));
  it('é conta corrente e o texto sai sem CPF, agência e conta', () => {
    expect(r.tipoConta).toBe('corrente');
    expect(r.linhas[0].descricao).toBe('Transferência recebida pelo Pix - ALEX EXEMPLO - BCO SANTANDER (BRASIL) S.A.');
    expect(r.linhas.every((l) => !/•|Agência|Conta:/.test(l.descricao))).toBe(true);
  });
  it('Pix recebido de conta própria vira transferência vinda daquela conta', () => {
    const res = conciliar(r.linhas, { contaId: 'cta_cc2', contas, lancamentos: [], regras: [], recorrencias: [], categorias, caixaEntrada: [], janelaDias: 5, hoje: HOJE, importacaoId: 'imp_y', pessoas });
    const l = lancamentoDaCaixa(res.caixa[0], ctxCaixa);
    expect(l).toMatchObject({ tipo: 'transferencia', conta_id: 'cta_cc1', conta_destino_id: 'cta_cc2', valor: 500 });
  });
});

describe('CaixaEntrada escrita pelo segundo cérebro', () => {
  it('status "pendente" é lido como "novo"', async () => {
    const { lerAba } = await import('../linhas');
    const { aba } = await import('../schema');
    const r = lerAba(aba('CaixaEntrada'), [['texto', 'status'], ['45 farmácia', 'pendente']]);
    expect(r.linhas[0].registro.status).toBe('novo');
    expect(r.problemas).toEqual([]);
  });
});
