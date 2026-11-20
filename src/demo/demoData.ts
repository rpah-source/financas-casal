import { somarDias } from '../domain/dates';
import type { Conta, Lancamento } from '../domain/types';

/**
 * Dados 100% FICTÍCIOS para o modo demonstração (SPEC 4.2).
 * Nunca coloque aqui nomes, valores ou bancos reais.
 * As datas são relativas a "hoje" para a demonstração parecer viva.
 */

export interface DadosDemo {
  pessoas: { pessoa1: string; pessoa2: string };
  semanada: number;
  cortes: string;
  contas: Conta[];
  lancamentos: Lancamento[];
}

export function gerarDadosDemo(hoje: string): DadosDemo {
  const contas: Conta[] = [
    { id: 'cta_demo_azul', nome: 'Conta Azul', apelidos: ['azul', 'pix'], tipo: 'corrente', saldo_inicial: 2500, data_saldo_inicial: somarDias(hoje, -60), cor: '#3B6EA8', ativa: true, ordem: 1 },
    { id: 'cta_demo_verde', nome: 'Cartão Verde', apelidos: ['verde'], tipo: 'cartao', conta_pagamento_id: 'cta_demo_azul', finais_cartao: '1111:pessoa1,3333:pessoa2', saldo_inicial: 0, data_saldo_inicial: somarDias(hoje, -60), cor: '#2E6B5A', ativa: true, ordem: 2 },
    { id: 'cta_demo_vale', nome: 'Vale', apelidos: ['vale'], tipo: 'prepago', saldo_inicial: 600, data_saldo_inicial: somarDias(hoje, -60), cor: '#9A5B00', ativa: true, ordem: 3 },
  ];

  let n = 0;
  const lan = (
    diasAtras: number,
    descricao: string,
    valor: number,
    conta_id: string,
    categoria: string,
    extra: Partial<Lancamento> = {},
  ): Lancamento => {
    const data = somarDias(hoje, -diasAtras);
    const cartao = conta_id === 'cta_demo_verde';
    return {
      id: `lan_demo_${++n}`,
      tipo: 'despesa',
      status: cartao ? 'agendado' : 'realizado',
      descricao,
      valor,
      data_competencia: data,
      data_caixa: data,
      conta_id,
      categoria,
      natureza: 'variavel',
      quem: 'casal',
      ...extra,
    };
  };

  const lancamentos: Lancamento[] = [
    lan(0, 'Padaria', 18.5, 'cta_demo_azul', 'Alimentação', { subcategoria: 'Padaria', quem: 'pessoa2' }),
    lan(1, 'Delivery', 68.9, 'cta_demo_verde', 'Alimentação', { subcategoria: 'Delivery' }),
    lan(1, 'Supermercado', 212.4, 'cta_demo_vale', 'Alimentação', { subcategoria: 'Supermercado' }),
    lan(2, 'Aplicativo de transporte', 23.4, 'cta_demo_verde', 'Transporte', { subcategoria: 'Aplicativo', quem: 'pessoa1' }),
    lan(3, 'Farmácia', 45, 'cta_demo_azul', 'Saúde', { subcategoria: 'Farmácia' }),
    lan(4, 'Feira', 52, 'cta_demo_vale', 'Alimentação', { subcategoria: 'Feira' }),
    // Não entram na semanada: fixa, transferência e um previsto.
    lan(1, 'Transferência para o Vale', 100, 'cta_demo_azul', '', { tipo: 'transferencia', natureza: 'nenhuma', conta_destino_id: 'cta_demo_vale' }),
  ];

  return {
    pessoas: { pessoa1: 'Alex', pessoa2: 'Sam' },
    semanada: 700,
    cortes: '1-8,9-15,16-22,23-fim',
    contas,
    lancamentos,
  };
}
