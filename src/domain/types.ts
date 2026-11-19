/**
 * Tipos do modelo de dados (SPEC 5). Os nomes dos campos são exatamente os
 * cabeçalhos das colunas da planilha.
 */

export type Pessoa = 'pessoa1' | 'pessoa2' | 'casal';
export type TipoConta = 'corrente' | 'cartao' | 'prepago' | 'dinheiro';
export type TipoLancamento = 'despesa' | 'receita' | 'transferencia' | 'ajuste';
export type StatusLancamento = 'previsto' | 'agendado' | 'realizado' | 'cancelado';
export type Natureza = 'fixa' | 'variavel' | 'sazonal' | 'divida' | 'sonho' | 'nenhuma';
export type Origem = 'manual' | 'texto' | 'importacao' | 'recorrencia' | 'caixa_entrada' | 'parcelamento';

/** Data ISO `AAAA-MM-DD`. */
export type DataISO = string;

interface Meta {
  excluido?: boolean;
  criado_em?: string | null;
  atualizado_em?: string | null;
}

export interface Conta extends Meta {
  id: string;
  nome: string;
  /** Na planilha é texto separado por vírgulas; aqui já vem em lista. */
  apelidos: string[];
  tipo: TipoConta;
  titular?: string | null;
  finais_cartao?: string | null;
  conta_pagamento_id?: string | null;
  saldo_inicial: number;
  data_saldo_inicial: DataISO | null;
  cor: string | null;
  ativa: boolean;
  ordem: number | null;
}

export interface Lancamento extends Meta {
  id: string;
  tipo: TipoLancamento;
  status: StatusLancamento;
  descricao: string | null;
  descricao_original?: string | null;
  valor: number;
  data_competencia: DataISO;
  data_caixa: DataISO;
  conta_id: string;
  conta_destino_id?: string | null;
  categoria: string | null;
  subcategoria?: string | null;
  natureza: Natureza;
  quem: Pessoa;
  fatura_id?: string | null;
  parcelamento_id?: string | null;
  parcela_num?: number | null;
  parcela_total?: number | null;
  recorrencia_id?: string | null;
  divida_id?: string | null;
  projeto_area?: string | null;
  projeto_id?: string | null;
  tags?: string | null;
  docs?: string | null;
  origem?: Origem | null;
  importacao_id?: string | null;
  chave_dedupe?: string | null;
  conciliado?: boolean;
  excluir_da_analise?: boolean;
  sinal?: '+' | '-' | null;
  observacao?: string | null;
}

export interface Categoria {
  categoria: string;
  subcategoria: string | null;
  natureza_padrao: Natureza | null;
  area_padrao: string | null;
  orcamento_mensal: number | null;
  ativa: boolean;
  ordem: number | null;
}

export interface Parametro {
  chave: string;
  escopo: string | null;
  valor: string | null;
  vigente_desde: DataISO;
}

/** Abas ainda sem regras próprias neste marco: campos conforme a SPEC 5. */
export type RegistroGenerico = Record<string, string | number | boolean | null>;
