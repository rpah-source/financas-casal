import { diffDias } from '../dates';
import type { Fatura } from '../faturas';
import { novoId } from '../ids';
import { aplicarRegras, regraCasa } from '../regras';
import { normalizarDescricao, similaridade } from '../similaridade';
import { statusInicial } from '../status';
import type { Categoria, Conta, DataISO, Lancamento, Pessoa, RegistroGenerico, TipoLancamento } from '../types';
import { normalizar } from '../valores';
import type { LinhaImportada } from './tipos';

/**
 * Conciliação (SPEC 8.3 e 8.4): casa as linhas importadas com o que já
 * existe, sem duplicar.
 * - casamento forte → atualiza o lançamento existente e marca conciliado;
 * - sugestão → vai para a CaixaEntrada apontando o candidato ("Parece ser…");
 * - novo → vai para a CaixaEntrada já categorizado pelas Regras.
 * Nada entra em Lançamentos sem confirmação, a não ser os casamentos fortes.
 */

export interface ContextoConciliacao {
  contaId: string;
  contas: Conta[];
  lancamentos: Lancamento[];
  regras: RegistroGenerico[];
  recorrencias: RegistroGenerico[];
  categorias: Categoria[];
  caixaEntrada: RegistroGenerico[];
  janelaDias: number;
  hoje: DataISO;
  importacaoId: string;
  /** Fatura importada (cartão): fonte da verdade para as compras. */
  fatura?: Fatura | null;
  pessoas?: { pessoa1: string; pessoa2: string };
  agoraISO?: string;
}

export interface ResultadoConciliacao {
  casados: Lancamento[];
  caixa: RegistroGenerico[];
  sugeridos: number;
  novos: number;
  ignorados: number;
  naoEncontrados: Lancamento[];
}

const RE_PAGAMENTO_FATURA =
  /pagamento\s+(de\s+)?fatura|pag\.?\s*fatura|pagto\.?\s*(de\s+)?cart|pgto\.?\s*fatura|deb(ito)?\.?\s+autom(atico)?\.?\s+de\s+fatura|pagamento\s+recebido|pagamento\s+cart[aã]o/i;
const RE_TRANSFERENCIA = /\b(transf\w*|ted|doc|pix)\b/i;

/** Pagamento de fatura reconhecido pelo texto (SPEC 7). */
export const ehPagamentoFatura = (texto: string) => RE_PAGAMENTO_FATURA.test(texto);

/**
 * Tipo sugerido para a linha (SPEC 7): pagamento de fatura e Pix/TED entre
 * contas próprias viram transferência, nunca despesa.
 */
export function tipoSugerido(l: LinhaImportada, conta: Conta, contas: Conta[], pessoas?: { pessoa1: string; pessoa2: string }): TipoLancamento {
  if (ehPagamentoFatura(l.descricao)) return 'transferencia';
  if (conta.tipo !== 'cartao' && RE_TRANSFERENCIA.test(l.descricao)) {
    const t = ` ${normalizar(l.descricao)} `;
    const outras = contas.filter((c) => c.id !== conta.id && c.ativa !== false);
    const nomes = [
      ...outras.flatMap((c) => [c.nome, ...c.apelidos]),
      ...contas.map((c) => c.titular ?? ''),
      pessoas?.pessoa1 ?? '',
      pessoas?.pessoa2 ?? '',
    ]
      .map((n) => normalizar(n))
      .filter((n) => n.length >= 3);
    if (nomes.some((n) => t.includes(` ${n} `) || t.includes(` ${n.split(' ')[0]} `))) return 'transferencia';
  }
  if (conta.tipo === 'cartao') return l.sentido === 'saida' ? 'despesa' : 'receita';
  return l.sentido === 'saida' ? 'despesa' : 'receita';
}

/** Pessoa pelo final do cartão (`finais_cartao`: "1234:pessoa1,5678:pessoa2"). */
export function pessoaPeloFinal(conta: Conta, final?: string): Pessoa | null {
  if (!final || !conta.finais_cartao) return null;
  for (const par of String(conta.finais_cartao).split(',')) {
    const [f, p] = par.split(':').map((x) => x.trim());
    if (f === final && (p === 'pessoa1' || p === 'pessoa2' || p === 'casal')) return p;
  }
  return null;
}

/** Chave de deduplicação (SPEC 8.3). Com FITID: conta|FITID|valor com sinal. */
export function chavesDedupe(contaId: string, linhas: LinhaImportada[]): string[] {
  const vistos = new Map<string, number>();
  return linhas.map((l) => {
    const centavos = (l.sentido === 'saida' ? -1 : 1) * Math.round(l.valor * 100);
    if (l.fitid) return `${contaId}|${l.fitid}|${centavos}`;
    const base = `${contaId}|${l.data}|${centavos}|${normalizarDescricao(l.descricao)}`;
    const n = vistos.get(base) ?? 0;
    vistos.set(base, n + 1);
    return `${base}|${n}`;
  });
}

/** Destino de uma transferência que sai desta conta (pagamento de fatura ou conta própria). */
export function destinoTransferencia(
  l: Pick<LinhaImportada, 'descricao' | 'valor'>,
  contaId: string,
  contas: Conta[],
): string | null {
  const outras = contas.filter((c) => c.id !== contaId && c.ativa !== false);
  if (ehPagamentoFatura(l.descricao)) {
    const t = normalizar(l.descricao);
    const cartoes = outras.filter((c) => c.tipo === 'cartao');
    const porNome = cartoes.find((c) => [c.nome, ...c.apelidos].some((n) => t.includes(normalizar(n))));
    if (porNome) return porNome.id;
    const pagosPorEsta = cartoes.filter((c) => c.conta_pagamento_id === contaId);
    if (pagosPorEsta.length === 1) return pagosPorEsta[0].id;
    return pagosPorEsta[0]?.id ?? cartoes[0]?.id ?? null;
  }
  const t = ` ${normalizar(l.descricao)} `;
  const porNome = outras.find((c) => [c.nome, ...c.apelidos].some((n) => n && t.includes(` ${normalizar(n)} `)));
  return porNome?.id ?? null;
}

export function conciliar(linhas: LinhaImportada[], ctx: ContextoConciliacao): ResultadoConciliacao {
  const agora = ctx.agoraISO ?? new Date().toISOString();
  const conta = ctx.contas.find((c) => c.id === ctx.contaId);
  if (!conta) throw new Error('Conta da importação não encontrada');
  const cartao = conta.tipo === 'cartao';
  const chaves = chavesDedupe(conta.id, linhas);
  const existentes = new Set(
    [...ctx.lancamentos.map((l) => l.chave_dedupe), ...ctx.caixaEntrada.map((c) => c.chave_dedupe)].filter(Boolean) as string[],
  );
  const usados = new Set<string>();
  const resultado: ResultadoConciliacao = { casados: [], caixa: [], sugeridos: 0, novos: 0, ignorados: 0, naoEncontrados: [] };
  const disponiveis = ctx.lancamentos.filter((l) => !l.excluido && !l.conciliado && l.status !== 'cancelado');

  linhas.forEach((l, i) => {
    const chave = chaves[i];
    if (existentes.has(chave)) {
      resultado.ignorados++;
      return;
    }
    existentes.add(chave);
    const tipo = tipoSugerido(l, conta, ctx.contas, ctx.pessoas);
    const regraL = aplicarRegras(l.descricao, ctx.regras, ctx.categorias, conta.id).regraId;
    const quem = pessoaPeloFinal(conta, l.finalCartao);

    // Candidatos compatíveis (mesmo tipo de movimento).
    const compativel = (c: Lancamento) => {
      if (usados.has(c.id)) return false;
      if (tipo === 'transferencia') {
        if (c.tipo !== 'transferencia') return false;
        return cartao ? c.conta_destino_id === conta.id : c.conta_id === conta.id || c.conta_destino_id === conta.id;
      }
      return c.tipo === tipo;
    };
    const mesmaConta = (c: Lancamento) => (tipo === 'transferencia' ? true : c.conta_id === conta.id);
    const valorIgual = (c: Lancamento) => Math.abs(c.valor - l.valor) < 0.005;
    const dias = (c: Lancamento) => Math.abs(diffDias(c.data_competencia, l.data));
    const descParecida = (c: Lancamento) =>
      Math.max(similaridade(l.descricao, c.descricao ?? ''), similaridade(l.descricao, c.descricao_original ?? '')) >= 0.6 ||
      (Boolean(regraL) && regraL === aplicarRegras(c.descricao_original || c.descricao || '', ctx.regras, ctx.categorias, c.conta_id).regraId);
    const tolerancia = (c: Lancamento) => {
      const rec = ctx.recorrencias.find((r) => r.id === c.recorrencia_id);
      return Number(rec?.tolerancia_valor_pct ?? 15) / 100;
    };
    const dentroTol = (c: Lancamento) => Math.abs(c.valor - l.valor) <= c.valor * tolerancia(c) + 0.005;

    const candidatos = disponiveis.filter(compativel);
    const porProximidade = (a: Lancamento, b: Lancamento) => dias(a) - dias(b) || Math.abs(a.valor - l.valor) - Math.abs(b.valor - l.valor);

    // 1) Casamento forte.
    const forte = candidatos
      .filter(mesmaConta)
      .filter((c) => {
        if (l.parcela && c.parcela_num === l.parcela.num && c.parcela_total === l.parcela.total && valorIgual(c)) {
          return similaridade(l.descricao, c.descricao ?? '') >= 0.5 || descParecida(c);
        }
        if (tipo === 'transferencia') return valorIgual(c) && dias(c) <= ctx.janelaDias;
        if (valorIgual(c) && dias(c) <= 2 && descParecida(c)) return true;
        if (c.status === 'previsto' && c.recorrencia_id) {
          const rec = ctx.recorrencias.find((r) => r.id === c.recorrencia_id);
          return Boolean(rec?.padrao_banco) && regraCasa(String(rec!.padrao_banco), l.descricao) && dentroTol(c) && dias(c) <= ctx.janelaDias;
        }
        return false;
      })
      .sort(porProximidade)[0];
    if (forte) {
      usados.add(forte.id);
      resultado.casados.push(atualizarComImportado(forte, l, { chave, conta, ctx, quem, agora }));
      return;
    }

    // 2) Sugestão (inclusive em outras contas: o usuário pode ter escolhido o cartão errado).
    const sugestao = candidatos
      .filter(
        (c) =>
          (mesmaConta(c) && valorIgual(c) && dias(c) <= ctx.janelaDias) ||
          (!mesmaConta(c) && valorIgual(c) && dias(c) <= 2 && descParecida(c)) ||
          (c.status === 'previsto' && dentroTol(c) && dias(c) <= ctx.janelaDias),
      )
      .sort(porProximidade)[0];
    if (sugestao) usados.add(sugestao.id);

    const sug = tipo === 'transferencia' ? null : aplicarRegras(l.descricao, ctx.regras, ctx.categorias, conta.id);
    resultado.caixa.push({
      id: novoId('cxe'),
      recebido_em: agora,
      fonte: 'importacao',
      texto: l.descricao,
      valor: l.valor,
      data: l.data,
      conta: '',
      categoria: sug?.categoria ?? (tipo === 'receita' && cartao ? 'Estorno' : ''),
      subcategoria: sug?.subcategoria ?? '',
      quem: quem ?? sug?.quem ?? '',
      doc: '',
      status: 'novo',
      lancamento_id: sugestao?.id ?? '',
      tipo_sugerido: tipo,
      descricao_original: l.descricao,
      chave_dedupe: chave,
      importacao_id: ctx.importacaoId,
      conta_id: conta.id,
      excluido: false,
      criado_em: agora,
      atualizado_em: agora,
    });
    if (sugestao) resultado.sugeridos++;
    else resultado.novos++;
  });

  // 5) Lançados no app, mas não estão na fatura/extrato.
  const datas = linhas.map((l) => l.data).sort();
  resultado.naoEncontrados = ctx.lancamentos.filter((c) => {
    if (c.excluido || c.conciliado || usados.has(c.id) || c.tipo === 'transferencia') return false;
    if (!['manual', 'texto', undefined, null].includes(c.origem as never)) return false;
    if (c.status === 'previsto' || c.status === 'cancelado') return false;
    if (cartao && ctx.fatura) return c.fatura_id === ctx.fatura.id;
    return c.conta_id === conta.id && datas.length > 0 && c.data_competencia >= datas[0] && c.data_competencia <= datas.at(-1)!;
  });
  return resultado;
}

/** Casamento forte: o lançamento existente recebe os dados reais do banco. */
export function atualizarComImportado(
  c: Lancamento,
  l: LinhaImportada,
  p: { chave: string; conta: Conta; ctx: Pick<ContextoConciliacao, 'contas' | 'hoje' | 'importacaoId' | 'fatura'>; quem: Pessoa | null; agora: string },
): Lancamento {
  const cartao = p.conta.tipo === 'cartao';
  const fatura = cartao && c.tipo !== 'transferencia' ? p.ctx.fatura : null;
  const parcela = Boolean(c.parcelamento_id);
  const data = parcela ? c.data_competencia : l.data;
  const tipoConta = p.ctx.contas.find((x) => x.id === c.conta_id)?.tipo;
  const dataCaixa = fatura ? fatura.data_vencimento : c.tipo === 'transferencia' ? l.data : cartao ? c.data_caixa : l.data;
  const status = fatura
    ? fatura.status === 'paga'
      ? 'realizado'
      : 'agendado'
    : statusInicial({ tipo: c.tipo, tipoConta, data: dataCaixa, hoje: p.ctx.hoje });
  return {
    ...c,
    valor: l.valor,
    data_competencia: data,
    data_caixa: dataCaixa,
    fatura_id: fatura ? fatura.id : c.fatura_id,
    descricao_original: l.descricao,
    chave_dedupe: p.chave,
    importacao_id: p.ctx.importacaoId,
    conciliado: true,
    status,
    quem: p.quem ?? c.quem,
    atualizado_em: p.agora,
  };
}
