import { diasNoMes, montarData, partesData } from './dates';
import { lerParametroNumero } from './parametros';
import type { DataISO, Parametro } from './types';

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
