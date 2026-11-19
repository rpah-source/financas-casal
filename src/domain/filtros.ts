import type { DataISO, Lancamento, Natureza, Origem, Pessoa, StatusLancamento } from './types';
import { normalizar } from './valores';

/** Filtros do Extrato (SPEC 10.3). Vazio = não filtra. */
export interface FiltroExtrato {
  mes: string; // AAAA-MM
  busca?: string;
  quem?: Pessoa | '';
  contaId?: string;
  categoria?: string;
  natureza?: Natureza | '';
  status?: StatusLancamento | '';
  origem?: Origem | '';
  naoConciliados?: boolean;
  semCategoria?: boolean;
}

export function filtrarLancamentos(lancs: Lancamento[], f: FiltroExtrato): Lancamento[] {
  const busca = normalizar(f.busca ?? '');
  return lancs
    .filter((l) => !l.excluido)
    .filter((l) => l.data_competencia.startsWith(f.mes))
    .filter((l) => !f.quem || l.quem === f.quem)
    .filter((l) => !f.contaId || l.conta_id === f.contaId || l.conta_destino_id === f.contaId)
    .filter((l) => !f.categoria || l.categoria === f.categoria)
    .filter((l) => !f.natureza || l.natureza === f.natureza)
    .filter((l) => !f.status || l.status === f.status)
    .filter((l) => !f.origem || (l.origem ?? 'manual') === f.origem)
    .filter((l) => !f.naoConciliados || !l.conciliado)
    .filter((l) => !f.semCategoria || (l.tipo !== 'transferencia' && (!l.categoria || l.categoria === 'Sem categoria')))
    .filter(
      (l) =>
        !busca ||
        normalizar([l.descricao, l.descricao_original, l.categoria, l.subcategoria, l.observacao, l.tags].filter(Boolean).join(' ')).includes(busca),
    )
    .sort((a, b) => b.data_competencia.localeCompare(a.data_competencia) || String(b.criado_em ?? '').localeCompare(String(a.criado_em ?? '')));
}

/** Efeito no saldo para o total do filtro: despesa −, receita +, transferência e ajuste à parte. */
export function totalFiltro(lancs: Lancamento[]): { total: number; itens: number } {
  let centavos = 0;
  for (const l of lancs) {
    if (l.status === 'cancelado') continue;
    const v = Math.round(l.valor * 100);
    if (l.tipo === 'despesa') centavos -= v;
    else if (l.tipo === 'receita') centavos += v;
    else if (l.tipo === 'ajuste') centavos += l.sinal === '-' ? -v : v;
  }
  return { total: centavos / 100, itens: lancs.length };
}

export function agruparPorDia(lancs: Lancamento[]): Array<{ data: DataISO; itens: Lancamento[] }> {
  const grupos: Array<{ data: DataISO; itens: Lancamento[] }> = [];
  for (const l of lancs) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.data === l.data_competencia) ultimo.itens.push(l);
    else grupos.push({ data: l.data_competencia, itens: [l] });
  }
  return grupos;
}
