import { criarLancamento } from '../lancamento';
import { CATEGORIA_EMPRESTIMO } from '../categoriasPadrao';
import { interpretarTexto } from '../parser';
import { aplicarRegras } from '../regras';
import type { Categoria, Conta, DataISO, Lancamento, Pessoa, RegistroGenerico, TipoLancamento } from '../types';
import { lerData, lerNumero, normalizar } from '../valores';
import { destinoTransferencia } from './conciliacao';
import { extrairParcela } from './tipos';

/**
 * Item da CaixaEntrada → lançamento (SPEC 5.11 e 8.4). Serve para as linhas
 * importadas (fonte = importacao) e para o que fontes externas escreveram
 * (ex.: o assistente pela API do Sheets) — o app nunca confia cegamente:
 * passa pelo parser 8.1 e pelas Regras e só grava quando o usuário aceita.
 */
export interface ContextoCaixa {
  contas: Conta[];
  categorias: Categoria[];
  regras: RegistroGenerico[];
  pessoas: { pessoa1: string; pessoa2: string };
  hoje: DataISO;
  agoraISO?: string;
}

export interface PreviaCaixa {
  tipo: TipoLancamento;
  valor: number | null;
  data: DataISO;
  contaId: string | null;
  contaDestinoId: string | null;
  descricao: string;
  categoria: string | null;
  subcategoria: string | null;
  quem: Pessoa;
  regraId: string | null;
  /** Empréstimo recebido: entra no saldo, mas não é renda (SPEC 7). */
  emprestimo: boolean;
}

function acharConta(texto: string, contas: Conta[]): Conta | undefined {
  const t = normalizar(texto);
  if (!t) return undefined;
  return (
    contas.find((c) => c.id === texto) ??
    contas.find((c) => normalizar(c.nome) === t) ??
    contas.find((c) => c.apelidos.some((a) => normalizar(a) === t))
  );
}

/** O que o app entendeu do item (para mostrar na revisão antes de aceitar). */
export function previaCaixa(item: RegistroGenerico, ctx: ContextoCaixa): PreviaCaixa {
  const ativas = ctx.contas.filter((c) => c.ativa !== false);
  const importado = item.fonte === 'importacao';
  const texto = String(item.texto ?? '');
  const parse = importado ? null : interpretarTexto(texto, { contas: ativas, pessoas: ctx.pessoas, hoje: ctx.hoje });
  const contaItem = acharConta(String(item.conta_id || item.conta || ''), ctx.contas);
  const conta = contaItem ?? ativas.find((c) => c.id === parse?.contaId);
  const descBase = importado ? extrairParcela(texto).descricao : parse?.descricao || texto;
  const sugerido = String(item.tipo_sugerido || '');
  const emprestimo = sugerido === 'emprestimo';
  const entrada = sugerido === 'transferencia_entrada';
  let tipo = (entrada ? 'transferencia' : emprestimo ? 'receita' : sugerido || 'despesa') as TipoLancamento;
  if (!['despesa', 'receita', 'transferencia', 'ajuste'].includes(tipo)) tipo = 'despesa';
  let contaId = conta?.id ?? null;
  let contaDestinoId: string | null = null;
  if (entrada && conta) {
    // Dinheiro que chegou de outra conta própria (ou do cartão, no "Pix no cartão").
    contaDestinoId = conta.id;
    contaId = destinoTransferencia({ descricao: texto, valor: Number(item.valor) }, conta.id, ctx.contas);
  } else if (tipo === 'transferencia' && conta) {
    if (conta.tipo === 'cartao') {
      // Pagamento visto na fatura: sai da conta que paga o cartão.
      contaId = conta.conta_pagamento_id ?? null;
      contaDestinoId = conta.id;
    } else {
      contaDestinoId = destinoTransferencia({ descricao: texto, valor: Number(item.valor) }, conta.id, ctx.contas);
    }
  }
  const sug = aplicarRegras(descBase, ctx.regras, ctx.categorias, conta?.id, tipo);
  const quemItem = String(item.quem ?? '').trim();
  const quem: Pessoa =
    quemItem === 'pessoa1' || quemItem === 'pessoa2' || quemItem === 'casal'
      ? quemItem
      : normalizar(quemItem) === normalizar(ctx.pessoas.pessoa1)
        ? 'pessoa1'
        : normalizar(quemItem) === normalizar(ctx.pessoas.pessoa2)
          ? 'pessoa2'
          : parse?.quem ?? sug.quem ?? 'casal';
  return {
    tipo,
    valor: lerNumero(item.valor as string) ?? parse?.valor ?? null,
    data: lerData(item.data as string) ?? parse?.data ?? ctx.hoje,
    contaId,
    contaDestinoId,
    descricao: (sug.fonte === 'regra' && sug.descricao) || descBase,
    // Transferência: a categoria "Transferências" é posta ao criar o lançamento.
    categoria:
      tipo === 'transferencia'
        ? null
        : (item.categoria as string) ||
          (emprestimo && ctx.categorias.some((c) => c.categoria === CATEGORIA_EMPRESTIMO) ? CATEGORIA_EMPRESTIMO : null) ||
          sug.categoria ||
          (tipo === 'despesa' ? 'Sem categoria' : null),
    subcategoria: tipo === 'transferencia' ? null : (item.subcategoria as string) || sug.subcategoria || null,
    quem,
    regraId: sug.regraId,
    emprestimo: emprestimo || ((item.categoria as string) === CATEGORIA_EMPRESTIMO && tipo === 'receita'),
  };
}

export function lancamentoDaCaixa(item: RegistroGenerico, ctx: ContextoCaixa, ajustes: Partial<PreviaCaixa> = {}): Lancamento {
  const p = { ...previaCaixa(item, ctx), ...ajustes };
  if (!p.valor || p.valor <= 0) throw new Error('Falta o valor');
  if (!p.contaId) throw new Error(p.tipo === 'transferencia' ? 'Escolha de qual conta veio a transferência' : 'Escolha a conta');
  if (p.tipo === 'transferencia' && !p.contaDestinoId) throw new Error('Escolha para qual conta foi a transferência');
  const importado = item.fonte === 'importacao';
  const l = criarLancamento(
    {
      tipo: p.tipo,
      valor: p.valor,
      descricao: p.descricao,
      contaId: p.contaId,
      contaDestinoId: p.contaDestinoId,
      data: p.data,
      quem: p.quem,
      categoria: p.categoria,
      subcategoria: p.subcategoria,
      origem: importado ? 'importacao' : 'caixa_entrada',
    },
    { contas: ctx.contas, categorias: ctx.categorias, hoje: ctx.hoje, agoraISO: ctx.agoraISO },
  );
  const parcela = extrairParcela(String(item.texto ?? '')).parcela ?? parcelaEntreParenteses(String(item.texto ?? ''));
  return {
    ...l,
    descricao_original: importado ? String(item.descricao_original || item.texto || '') : l.descricao_original,
    chave_dedupe: (item.chave_dedupe as string) || null,
    importacao_id: (item.importacao_id as string) || null,
    conciliado: importado,
    parcela_num: parcela?.num ?? null,
    parcela_total: parcela?.total ?? null,
    docs: (item.doc as string) || null,
    excluir_da_analise: p.emprestimo || l.excluir_da_analise,
  };
}

function parcelaEntreParenteses(t: string) {
  const m = t.match(/\((\d{2})\/(\d{2})\)\s*$/);
  return m ? { num: Number(m[1]), total: Number(m[2]) } : undefined;
}
