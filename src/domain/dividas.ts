import { novoId } from './ids';
import type { Lancamento, RegistroGenerico } from './types';

/**
 * Dívidas (SPEC 5.6). Um empréstimo recebido (entrada) liga a uma dívida,
 * que gera as parcelas futuras como agendadas (DECISIONS D81).
 */
export type TipoDivida = 'emprestimo_pessoal' | 'consignado' | 'familiar' | 'cartao' | 'outro';

export interface NovaDivida {
  credor: string;
  tipo: TipoDivida;
  valorParcela: number;
  parcelas: number;
  diaVencimento: number;
  contaPagamentoId: string | null;
  descontadaEmFolha: boolean;
  jurosMesPct?: number | null;
  valorParaQuitar?: number | null;
  observacao?: string | null;
}

export function validarDivida(n: NovaDivida): string | null {
  if (!n.credor.trim()) return 'Diga quem emprestou (credor).';
  if (!(n.valorParcela > 0)) return 'Valor da parcela inválido.';
  if (!(n.parcelas >= 1 && n.parcelas <= 600)) return 'Número de parcelas inválido.';
  if (!(n.diaVencimento >= 1 && n.diaVencimento <= 31)) return 'Dia de vencimento: de 1 a 31.';
  if (!n.descontadaEmFolha && !n.contaPagamentoId) return 'Escolha de qual conta saem as parcelas.';
  return null;
}

export function criarDivida(n: NovaDivida, agoraISO = new Date().toISOString()): RegistroGenerico {
  const erro = validarDivida(n);
  if (erro) throw new Error(erro);
  const total = Math.round(n.valorParcela * n.parcelas * 100) / 100;
  return {
    id: novoId('div'),
    credor: n.credor.trim(),
    tipo: n.tipo,
    controlada: true,
    juros_mes_pct: n.jurosMesPct ?? null,
    valor_para_quitar: n.valorParaQuitar ?? total,
    total_parcelado: total,
    parcelas_restantes: n.parcelas,
    valor_parcela: n.valorParcela,
    dia_vencimento: n.diaVencimento,
    conta_pagamento_id: n.contaPagamentoId ?? '',
    descontada_em_folha: n.descontadaEmFolha,
    observacao: n.observacao ?? '',
    excluido: false,
    criado_em: agoraISO,
    atualizado_em: agoraISO,
  };
}

/**
 * Parcela de dívida que acabou de ser paga (virou realizada): a dívida perde
 * uma parcela restante (SPEC 5.6). Devolve as dívidas a atualizar.
 */
export function baixarParcelasPagas(
  antes: Lancamento[],
  depois: Lancamento[],
  dividas: RegistroGenerico[],
  agoraISO = new Date().toISOString(),
): RegistroGenerico[] {
  const porId = new Map(antes.map((l) => [l.id, l]));
  const contagem = new Map<string, number>();
  for (const l of depois) {
    if (!l.divida_id || l.tipo !== 'despesa' || l.excluido || l.status !== 'realizado') continue;
    const a = porId.get(l.id);
    if (a && a.status === 'realizado') continue;
    contagem.set(l.divida_id, (contagem.get(l.divida_id) ?? 0) + 1);
  }
  return dividas
    .filter((d) => contagem.has(String(d.id)))
    .map((d) => ({
      ...d,
      parcelas_restantes: Math.max(0, Number(d.parcelas_restantes ?? 0) - contagem.get(String(d.id))!),
      atualizado_em: agoraISO,
    }));
}
