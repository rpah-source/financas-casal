import { diffDias } from './dates';
import { similaridade } from './similaridade';
import { statusInicial } from './status';
import type { Conta, DataISO, Lancamento, RegistroGenerico } from './types';

/**
 * Casamento ao salvar um lançamento manual (SPEC 8.1 e 6.2): procura um
 * previsto parecido, em qualquer conta, para não ficar previsto + real duplicados.
 */
export function procurarPrevisto(p: {
  novo: Lancamento;
  lancamentos: Lancamento[];
  recorrencias: RegistroGenerico[];
  regras: RegistroGenerico[];
  regraId?: string | null;
  janelaDias: number;
}): Lancamento | null {
  const { novo } = p;
  const recDaRegra = p.regraId ? (p.regras.find((r) => r.id === p.regraId)?.recorrencia_id as string | undefined) : undefined;
  const candidatos = p.lancamentos.filter((l) => {
    if (l.status !== 'previsto' || l.excluido || l.id === novo.id || l.tipo !== novo.tipo) return false;
    const rec = p.recorrencias.find((r) => r.id === l.recorrencia_id);
    const tol = Number(rec?.tolerancia_valor_pct ?? 15) / 100;
    if (Math.abs(novo.valor - l.valor) > l.valor * tol + 0.005) return false;
    if (Math.abs(diffDias(l.data_competencia, novo.data_competencia)) > p.janelaDias) return false;
    const porRegra = Boolean(recDaRegra && l.recorrencia_id === recDaRegra);
    const porDescricao = similaridade(novo.descricao ?? '', l.descricao ?? '') >= 0.6;
    return porRegra || porDescricao;
  });
  candidatos.sort(
    (a, b) =>
      Math.abs(diffDias(a.data_competencia, novo.data_competencia)) - Math.abs(diffDias(b.data_competencia, novo.data_competencia)) ||
      Math.abs(a.valor - novo.valor) - Math.abs(b.valor - novo.valor),
  );
  return candidatos[0] ?? null;
}

/** O previsto é atualizado no lugar: mesmo id e recorrência, com os dados reais. */
export function casarComPrevisto(previsto: Lancamento, novo: Lancamento, ctx: { contas: Conta[]; hoje: DataISO; agoraISO?: string }): Lancamento {
  const tipoConta = ctx.contas.find((c) => c.id === novo.conta_id)?.tipo;
  return {
    ...previsto,
    valor: novo.valor,
    data_competencia: novo.data_competencia,
    data_caixa: novo.data_caixa,
    conta_id: novo.conta_id,
    conta_destino_id: novo.conta_destino_id ?? previsto.conta_destino_id ?? null,
    quem: novo.quem,
    categoria: novo.categoria || previsto.categoria,
    subcategoria: novo.subcategoria || previsto.subcategoria,
    projeto_area: novo.projeto_area || previsto.projeto_area,
    projeto_id: novo.projeto_id || previsto.projeto_id,
    observacao: [previsto.observacao, novo.observacao].filter(Boolean).join(' · ') || null,
    status: statusInicial({ tipo: novo.tipo, tipoConta, data: novo.data_caixa, hoje: ctx.hoje }),
    atualizado_em: ctx.agoraISO ?? new Date().toISOString(),
  };
}

/** Previsto vencido (SPEC 6.2): data + janela < hoje e nada casou → "Isso aconteceu?". */
export function previstosVencidos(lancamentos: Lancamento[], hoje: DataISO, janelaDias: number): Lancamento[] {
  return lancamentos
    .filter((l) => l.status === 'previsto' && !l.excluido && diffDias(l.data_competencia, hoje) > janelaDias)
    .sort((a, b) => a.data_competencia.localeCompare(b.data_competencia));
}
