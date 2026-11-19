import { diasNoMes, montarData, partesData } from './dates';
import { lerParametroNumero } from './parametros';
import type { DataISO, Lancamento, Parametro, Pessoa } from './types';

/**
 * Ciclo do cartão (SPEC 6.3), versão simples para a tela Semana.
 * As faturas completas (fatura certa de cada compra, pagamento) chegam no M4.
 */
export interface Ciclo {
  fechamento: DataISO;
  vencimento: DataISO;
}

const diaNoMes = (ano: number, mes: number, dia: number) => montarData(ano, mes, Math.min(dia, diasNoMes(ano, mes)));
const proximoMes = (ano: number, mes: number) => (mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 });

/** Próximo fechamento (≥ hoje) e o vencimento logo depois dele. */
export function proximoCiclo(cartaoId: string, parametros: Parametro[], hoje: DataISO): Ciclo | null {
  const fech = lerParametroNumero(parametros, 'cartao.fechamento_dia', hoje, 0, cartaoId);
  const venc = lerParametroNumero(parametros, 'cartao.vencimento_dia', hoje, 0, cartaoId);
  if (!fech) return null;
  let { ano, mes } = partesData(hoje);
  let fechamento = diaNoMes(ano, mes, fech);
  if (fechamento < hoje) {
    ({ ano, mes } = proximoMes(ano, mes));
    fechamento = diaNoMes(ano, mes, fech);
  }
  let vencimento = '';
  if (venc) {
    const m = venc > fech ? { ano, mes } : proximoMes(ano, mes);
    vencimento = diaNoMes(m.ano, m.mes, venc);
  }
  return { fechamento, vencimento };
}

/** Total em aberto no cartão (compras agendadas − estornos), dividido por pessoa (SPEC 9.4). */
export function abertoNoCartao(cartaoId: string, lancamentos: Lancamento[]): { total: number; porPessoa: Record<Pessoa, number> } {
  const por: Record<Pessoa, number> = { pessoa1: 0, pessoa2: 0, casal: 0 };
  for (const l of lancamentos) {
    if (l.excluido || l.conta_id !== cartaoId || l.status !== 'agendado') continue;
    const v = Math.round(l.valor * 100);
    if (l.tipo === 'despesa') por[l.quem] += v;
    else if (l.tipo === 'receita') por[l.quem] -= v;
  }
  const total = por.pessoa1 + por.pessoa2 + por.casal;
  return { total: total / 100, porPessoa: { pessoa1: por.pessoa1 / 100, pessoa2: por.pessoa2 / 100, casal: por.casal / 100 } };
}
