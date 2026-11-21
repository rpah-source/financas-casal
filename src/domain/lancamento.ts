import { naturezaPadrao } from './base';
import { CATEGORIA_EMPRESTIMO, CATEGORIA_TRANSFERENCIA, SUB_ENTRE_CONTAS, SUB_PAGAMENTO_FATURA } from './categoriasPadrao';
import { novoId } from './ids';
import { statusInicial } from './status';
import type { Categoria, Conta, DataISO, Lancamento, Natureza, Origem, Pessoa, StatusLancamento, TipoLancamento } from './types';

/**
 * Monta um lançamento novo a partir do que foi digitado (SPEC 5.2 e 6.1).
 */
export interface NovoLancamento {
  tipo: TipoLancamento;
  valor: number;
  descricao: string;
  contaId: string;
  contaDestinoId?: string | null;
  data: DataISO;
  quem: Pessoa;
  categoria?: string | null;
  subcategoria?: string | null;
  natureza?: Natureza | null;
  status?: StatusLancamento | null;
  projetoArea?: string | null;
  projetoId?: string | null;
  tags?: string | null;
  observacao?: string | null;
  origem?: Origem;
}

export function criarLancamento(
  n: NovoLancamento,
  ctx: { contas: Conta[]; categorias: Categoria[]; hoje: DataISO; agoraISO?: string },
): Lancamento {
  if (!(n.valor > 0)) throw new Error('O valor precisa ser maior que zero');
  if (!n.contaId) throw new Error('Escolha a conta');
  if (n.tipo === 'transferencia' && (!n.contaDestinoId || n.contaDestinoId === n.contaId)) {
    throw new Error('Escolha a conta de destino');
  }
  const agora = ctx.agoraISO ?? new Date().toISOString();
  const tipoConta = ctx.contas.find((c) => c.id === n.contaId)?.tipo;
  const transferencia = n.tipo === 'transferencia';
  // Transferência gerencial ganha a categoria "Transferências" quando ela existe na planilha.
  const destinoCartao = ctx.contas.find((c) => c.id === n.contaDestinoId)?.tipo === 'cartao';
  const subTransf = destinoCartao ? SUB_PAGAMENTO_FATURA : SUB_ENTRE_CONTAS;
  const catTransf = transferencia
    ? ctx.categorias.find((c) => c.categoria === CATEGORIA_TRANSFERENCIA && c.subcategoria === subTransf) ??
      ctx.categorias.find((c) => c.categoria === CATEGORIA_TRANSFERENCIA && !c.subcategoria)
    : undefined;
  return {
    id: novoId('lan'),
    tipo: n.tipo,
    status: n.status ?? statusInicial({ tipo: n.tipo, tipoConta, data: n.data, hoje: ctx.hoje, origem: n.origem }),
    descricao: n.descricao.trim() || null,
    descricao_original: null,
    valor: Math.round(n.valor * 100) / 100,
    data_competencia: n.data,
    data_caixa: n.data,
    conta_id: n.contaId,
    conta_destino_id: transferencia ? n.contaDestinoId! : null,
    categoria: transferencia ? catTransf?.categoria ?? null : n.categoria || null,
    subcategoria: transferencia ? catTransf?.subcategoria ?? null : n.subcategoria || null,
    natureza: transferencia
      ? 'nenhuma'
      : n.natureza || naturezaPadrao(ctx.categorias, n.categoria ?? null, n.subcategoria ?? null, n.tipo),
    quem: n.quem,
    projeto_area: n.projetoArea || null,
    projeto_id: n.projetoId || null,
    tags: n.tags || null,
    observacao: n.observacao || null,
    origem: n.origem ?? 'manual',
    conciliado: false,
    // Empréstimo recebido entra no saldo, mas não é renda (SPEC 7).
    excluir_da_analise: n.tipo === 'receita' && n.categoria === CATEGORIA_EMPRESTIMO,
    excluido: false,
    criado_em: agora,
    atualizado_em: agora,
  };
}

/** Cópia com id novo e data de hoje (deslizar à direita no Extrato, SPEC 10.3). */
export function duplicarLancamento(l: Lancamento, ctx: { contas: Conta[]; hoje: DataISO; agoraISO?: string }): Lancamento {
  const agora = ctx.agoraISO ?? new Date().toISOString();
  const tipoConta = ctx.contas.find((c) => c.id === l.conta_id)?.tipo;
  return {
    ...l,
    id: novoId('lan'),
    data_competencia: ctx.hoje,
    data_caixa: ctx.hoje,
    status: statusInicial({ tipo: l.tipo, tipoConta, data: ctx.hoje, hoje: ctx.hoje }),
    origem: 'manual',
    descricao_original: null,
    chave_dedupe: null,
    importacao_id: null,
    fatura_id: null,
    parcelamento_id: null,
    parcela_num: null,
    parcela_total: null,
    recorrencia_id: null,
    conciliado: false,
    excluido: false,
    criado_em: agora,
    atualizado_em: agora,
  };
}
