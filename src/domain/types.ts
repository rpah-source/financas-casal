/**
 * Tipos do modelo de dados (SPEC seção 5). Neste marco (M0) só o
 * necessário para a tela Semana em modo demonstração; os demais campos
 * entram nos próximos marcos.
 */

export type Pessoa = 'pessoa1' | 'pessoa2' | 'casal';
export type TipoConta = 'corrente' | 'cartao' | 'prepago' | 'dinheiro';
export type TipoLancamento = 'despesa' | 'receita' | 'transferencia' | 'ajuste';
export type StatusLancamento = 'previsto' | 'agendado' | 'realizado' | 'cancelado';
export type Natureza = 'fixa' | 'variavel' | 'sazonal' | 'divida' | 'sonho' | 'nenhuma';

/** Data ISO `AAAA-MM-DD`. */
export type DataISO = string;

export interface Conta {
  id: string;
  nome: string;
  apelidos: string[];
  tipo: TipoConta;
  saldo_inicial: number;
  data_saldo_inicial: DataISO;
  cor: string;
  ativa: boolean;
  ordem: number;
}

export interface Lancamento {
  id: string;
  tipo: TipoLancamento;
  status: StatusLancamento;
  descricao: string;
  valor: number;
  data_competencia: DataISO;
  data_caixa: DataISO;
  conta_id: string;
  conta_destino_id?: string;
  categoria: string;
  subcategoria?: string;
  natureza: Natureza;
  quem: Pessoa;
  excluir_da_analise?: boolean;
  excluido?: boolean;
}
