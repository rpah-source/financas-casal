/**
 * Estrutura das abas da planilha (SPEC 5). Fonte única para: cabeçalhos
 * criados no bootstrap, validações (listas suspensas) e leitura das linhas.
 * As colunas são localizadas pelo NOME do cabeçalho, nunca pela posição.
 */

export const ENUMS = {
  tipoConta: ['corrente', 'cartao', 'prepago', 'dinheiro'],
  tipoLancamento: ['despesa', 'receita', 'transferencia', 'ajuste'],
  status: ['previsto', 'agendado', 'realizado', 'cancelado'],
  natureza: ['fixa', 'variavel', 'sazonal', 'divida', 'sonho', 'nenhuma'],
  quem: ['pessoa1', 'pessoa2', 'casal'],
  origem: ['manual', 'texto', 'importacao', 'recorrencia', 'caixa_entrada', 'parcelamento'],
  sinal: ['+', '-'],
  frequencia: ['semanal', 'mensal'],
  statusFatura: ['aberta', 'fechada', 'paga', 'paga_parcial'],
  tipoDivida: ['emprestimo_pessoal', 'consignado', 'familiar', 'cartao', 'outro'],
  tipoProjetoArea: ['projeto', 'area'],
  statusCaixa: ['novo', 'aceito', 'descartado'],
  tipoArquivo: ['csv', 'ofx', 'texto', 'pdf'],
} as const;

export type NomeAba =
  | 'Contas' | 'Lancamentos' | 'Recorrencias' | 'Faturas' | 'Parcelamentos' | 'Dividas'
  | 'Categorias' | 'Regras' | 'Parametros' | 'ProjetosAreas' | 'CaixaEntrada' | 'Importacoes';

export type TipoColuna = 'texto' | 'numero' | 'bool' | 'data' | 'timestamp' | 'enum' | 'ref';

export interface Coluna {
  nome: string;
  tipo: TipoColuna;
  valores?: readonly string[];
  /** Para `ref`: a aba referenciada (aceita id ou nome exato do registro). */
  ref?: NomeAba;
  obrigatorio?: boolean;
  /** Valor aplicado quando a célula vem vazia. */
  padrao?: string | number | boolean;
  /** Sinônimos aceitos em enums (ex.: "pendente" → "novo"). */
  sinonimos?: Record<string, string>;
}

export interface Aba {
  nome: NomeAba;
  /** Prefixo do id (`lan`, `cta`…). Sem prefixo = aba sem coluna `id`. */
  prefixo?: string;
  colunas: Coluna[];
}

const t = (nome: string, extra: Partial<Coluna> = {}): Coluna => ({ nome, tipo: 'texto', ...extra });
const n = (nome: string, extra: Partial<Coluna> = {}): Coluna => ({ nome, tipo: 'numero', ...extra });
const b = (nome: string, padrao = false): Coluna => ({ nome, tipo: 'bool', padrao });
const d = (nome: string, extra: Partial<Coluna> = {}): Coluna => ({ nome, tipo: 'data', ...extra });
const e = (nome: string, valores: readonly string[], extra: Partial<Coluna> = {}): Coluna => ({ nome, tipo: 'enum', valores, ...extra });
const r = (nome: string, ref: NomeAba, extra: Partial<Coluna> = {}): Coluna => ({ nome, tipo: 'ref', ref, ...extra });

/** Colunas comuns às abas de entidades (SPEC 5: exclusão lógica e timestamps). */
const meta = (): Coluna[] => [
  b('excluido'),
  { nome: 'criado_em', tipo: 'timestamp' },
  { nome: 'atualizado_em', tipo: 'timestamp' },
];

export const ABAS: Aba[] = [
  {
    nome: 'Contas',
    prefixo: 'cta',
    colunas: [
      t('id'), t('nome', { obrigatorio: true }), t('apelidos'), e('tipo', ENUMS.tipoConta, { obrigatorio: true }),
      t('titular'), t('finais_cartao'), r('conta_pagamento_id', 'Contas'), n('saldo_inicial', { padrao: 0 }),
      d('data_saldo_inicial'), t('cor'), b('ativa', true), n('ordem'), ...meta(),
    ],
  },
  {
    nome: 'Lancamentos',
    prefixo: 'lan',
    colunas: [
      t('id'), e('tipo', ENUMS.tipoLancamento, { padrao: 'despesa' }), e('status', ENUMS.status),
      t('descricao'), t('descricao_original'), n('valor', { obrigatorio: true }),
      d('data_competencia'), d('data_caixa'), r('conta_id', 'Contas', { obrigatorio: true }),
      r('conta_destino_id', 'Contas'), t('categoria'), t('subcategoria'), e('natureza', ENUMS.natureza),
      e('quem', ENUMS.quem, { padrao: 'casal' }), r('fatura_id', 'Faturas'), r('parcelamento_id', 'Parcelamentos'),
      n('parcela_num'), n('parcela_total'), r('recorrencia_id', 'Recorrencias'), r('divida_id', 'Dividas'),
      t('projeto_area'), t('projeto_id'), t('tags'), t('docs'), e('origem', ENUMS.origem, { padrao: 'manual' }),
      r('importacao_id', 'Importacoes'), t('chave_dedupe'), b('conciliado'), b('excluir_da_analise'),
      e('sinal', ENUMS.sinal), t('observacao'), ...meta(),
    ],
  },
  {
    nome: 'Recorrencias',
    prefixo: 'rec',
    colunas: [
      t('id'), t('descricao', { obrigatorio: true }), e('tipo', ENUMS.tipoLancamento, { padrao: 'despesa' }),
      n('valor', { obrigatorio: true }), r('conta_id', 'Contas', { obrigatorio: true }), r('conta_destino_id', 'Contas'),
      t('categoria'), t('subcategoria'), e('natureza', ENUMS.natureza), e('quem', ENUMS.quem, { padrao: 'casal' }),
      e('frequencia', ENUMS.frequencia, { obrigatorio: true }), n('dia_semana'), t('dia_mes'),
      d('inicio'), d('fim'), t('padrao_banco'), n('tolerancia_valor_pct', { padrao: 15 }), b('ativa', true), ...meta(),
    ],
  },
  {
    nome: 'Faturas',
    prefixo: 'fat',
    colunas: [
      t('id'), r('cartao_id', 'Contas', { obrigatorio: true }), t('competencia', { obrigatorio: true }),
      d('data_fechamento'), d('data_vencimento'), e('status', ENUMS.statusFatura, { padrao: 'aberta' }),
      n('valor_importado'), t('doc'), ...meta(),
    ],
  },
  {
    nome: 'Parcelamentos',
    prefixo: 'par',
    colunas: [
      t('id'), t('descricao'), n('valor_total', { obrigatorio: true }), n('parcelas', { obrigatorio: true }),
      n('valor_parcela'), d('data_compra'), r('cartao_id', 'Contas'), t('primeira_fatura'),
      t('categoria'), t('subcategoria'), e('quem', ENUMS.quem, { padrao: 'casal' }), ...meta(),
    ],
  },
  {
    nome: 'Dividas',
    prefixo: 'div',
    colunas: [
      t('id'), t('credor', { obrigatorio: true }), e('tipo', ENUMS.tipoDivida, { padrao: 'outro' }), b('controlada', true),
      n('juros_mes_pct'), n('valor_para_quitar'), n('total_parcelado'), n('parcelas_restantes'),
      n('valor_parcela'), n('dia_vencimento'), r('conta_pagamento_id', 'Contas'), b('descontada_em_folha'),
      t('observacao'), ...meta(),
    ],
  },
  {
    nome: 'Categorias',
    colunas: [
      t('categoria', { obrigatorio: true }), t('subcategoria'), e('natureza_padrao', ENUMS.natureza),
      t('area_padrao'), n('orcamento_mensal'), b('ativa', true), n('ordem'),
    ],
  },
  {
    nome: 'Regras',
    prefixo: 'reg',
    colunas: [
      t('id'), t('padrao', { obrigatorio: true }), r('conta_id', 'Contas'), t('descricao'), t('categoria'),
      t('subcategoria'), e('natureza', ENUMS.natureza), e('quem', ENUMS.quem), r('recorrencia_id', 'Recorrencias'),
      n('prioridade', { padrao: 0 }), n('vezes_usada', { padrao: 0 }), b('ativa', true), ...meta(),
    ],
  },
  {
    nome: 'Parametros',
    colunas: [t('chave', { obrigatorio: true }), t('escopo'), t('valor'), d('vigente_desde', { padrao: '2000-01-01' })],
  },
  {
    nome: 'ProjetosAreas',
    colunas: [t('nome', { obrigatorio: true }), e('tipo', ENUMS.tipoProjetoArea, { padrao: 'area' }), t('id_indice'), b('ativo', true)],
  },
  {
    nome: 'CaixaEntrada',
    prefixo: 'cxe',
    colunas: [
      t('id'), { nome: 'recebido_em', tipo: 'timestamp' }, t('fonte'), t('texto', { obrigatorio: true }),
      n('valor'), d('data'), t('conta'), t('categoria'), t('subcategoria'), t('quem'), t('doc'),
      e('status', ENUMS.statusCaixa, { padrao: 'novo', sinonimos: { pendente: 'novo', nova: 'novo', aceita: 'aceito', descartada: 'descartado' } }), t('lancamento_id'), t('tipo_sugerido'),
      t('descricao_original'), t('chave_dedupe'), t('importacao_id'), t('conta_id'), ...meta(),
    ],
  },
  {
    nome: 'Importacoes',
    prefixo: 'imp',
    colunas: [
      t('id'), d('data'), r('conta_id', 'Contas'), e('tipo_arquivo', ENUMS.tipoArquivo), t('nome_arquivo'),
      t('doc'), n('linhas_lidas'), n('casados'), n('sugeridos'), n('novos'), n('ignorados'),
      r('fatura_id', 'Faturas'), ...meta(),
    ],
  },
];

export const NOMES_ABAS = ABAS.map((a) => a.nome);

export function aba(nome: NomeAba): Aba {
  return ABAS.find((a) => a.nome === nome)!;
}

export const cabecalhos = (nome: NomeAba) => aba(nome).colunas.map((c) => c.nome);
