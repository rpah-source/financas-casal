import type { DataISO, StatusLancamento, TipoConta, TipoLancamento } from './types';

/**
 * Status inicial de um lançamento (SPEC 6.1).
 */
export function statusInicial(p: {
  tipo: TipoLancamento;
  tipoConta: TipoConta | undefined;
  data: DataISO;
  hoje: DataISO;
  origem?: string | null;
}): StatusLancamento {
  if (p.origem === 'recorrencia') return 'previsto';
  if (p.tipoConta === 'cartao' && p.tipo !== 'transferencia') return 'agendado';
  return p.data <= p.hoje ? 'realizado' : 'agendado';
}
