import { diasNoMes, diffDias, montarData, partesData } from './dates';
import { novoId } from './ids';
import { lerParametroNumero } from './parametros';
import type { Conta, DataISO, Lancamento, Parametro, Pessoa, RegistroGenerico } from './types';

/**
 * Cartões de crédito (SPEC 5.4, 6.2, 6.3 e 7): em qual fatura cai cada
 * compra, parcelamentos e pagamento de fatura.
 */
export type StatusFatura = 'aberta' | 'fechada' | 'paga' | 'paga_parcial';

export interface Fatura {
  id: string;
  cartao_id: string;
  competencia: string; // AAAA-MM do vencimento
  data_fechamento: DataISO;
  data_vencimento: DataISO;
  status: StatusFatura;
  valor_importado?: number | null;
  doc?: string | null;
  excluido?: boolean;
  criado_em?: string | null;
  atualizado_em?: string | null;
}

const diaNoMes = (ano: number, mes: number, dia: number) => montarData(ano, mes, Math.min(dia, diasNoMes(ano, mes)));
const somarMes = (ano: number, mes: number, n: number) => {
  const t = ano * 12 + (mes - 1) + n;
  return { ano: Math.floor(t / 12), mes: (t % 12) + 1 };
};

export interface CicloFatura {
  competencia: string;
  data_fechamento: DataISO;
  data_vencimento: DataISO;
}

/**
 * Fatura de uma compra (SPEC 6.3). Fechamento e vencimento vêm dos
 * Parâmetros vigentes NA DATA DA COMPRA. Antes do dia de fechamento do mês M
 * → fatura que fecha em M; no dia ou depois → a que fecha em M+1.
 * `deslocamento` = 1, 2… para as parcelas seguintes.
 */
export function cicloDaCompra(cartaoId: string, dataCompra: DataISO, parametros: Parametro[], deslocamento = 0): CicloFatura | null {
  const fech = lerParametroNumero(parametros, 'cartao.fechamento_dia', dataCompra, 0, cartaoId);
  const venc = lerParametroNumero(parametros, 'cartao.vencimento_dia', dataCompra, 0, cartaoId);
  if (!fech || !venc) return null;
  const { ano, mes } = partesData(dataCompra);
  const fechaEsteMes = diaNoMes(ano, mes, fech);
  const base = dataCompra < fechaEsteMes ? { ano, mes } : somarMes(ano, mes, 1);
  const f = somarMes(base.ano, base.mes, deslocamento);
  const data_fechamento = diaNoMes(f.ano, f.mes, fech);
  const v = venc > fech ? f : somarMes(f.ano, f.mes, 1);
  const data_vencimento = diaNoMes(v.ano, v.mes, venc);
  return { competencia: data_vencimento.slice(0, 7), data_fechamento, data_vencimento };
}

/** Acha a fatura do cartão naquela competência ou cria uma nova (sob demanda). */
export function obterFatura(
  faturas: Fatura[],
  cartaoId: string,
  ciclo: CicloFatura,
  hoje: DataISO,
  agoraISO = new Date().toISOString(),
): { fatura: Fatura; nova: boolean } {
  const existente = faturas.find((f) => !f.excluido && f.cartao_id === cartaoId && f.competencia === ciclo.competencia);
  if (existente) return { fatura: existente, nova: false };
  return {
    fatura: {
      id: novoId('fat'),
      cartao_id: cartaoId,
      competencia: ciclo.competencia,
      data_fechamento: ciclo.data_fechamento,
      data_vencimento: ciclo.data_vencimento,
      status: hoje >= ciclo.data_fechamento ? 'fechada' : 'aberta',
      valor_importado: null,
      doc: null,
      excluido: false,
      criado_em: agoraISO,
      atualizado_em: agoraISO,
    },
    nova: true,
  };
}

/** Itens da fatura (sem excluídos e cancelados). */
export function itensDaFatura(fatura: Fatura, lancamentos: Lancamento[]): Lancamento[] {
  return lancamentos.filter((l) => l.fatura_id === fatura.id && !l.excluido && l.status !== 'cancelado' && l.tipo !== 'transferencia');
}

/** Total da fatura = compras − estornos, dividido por pessoa (SPEC 9.4). */
export function totalFatura(fatura: Fatura, lancamentos: Lancamento[]): { total: number; porPessoa: Record<Pessoa, number> } {
  const por: Record<Pessoa, number> = { pessoa1: 0, pessoa2: 0, casal: 0 };
  for (const l of itensDaFatura(fatura, lancamentos)) {
    const v = Math.round(l.valor * 100);
    por[l.quem] += l.tipo === 'receita' ? -v : v;
  }
  return {
    total: (por.pessoa1 + por.pessoa2 + por.casal) / 100,
    porPessoa: { pessoa1: por.pessoa1 / 100, pessoa2: por.pessoa2 / 100, casal: por.casal / 100 },
  };
}

/** Pagamentos (transferências para o cartão) ligados à fatura. */
export function pagamentosDaFatura(fatura: Fatura, lancamentos: Lancamento[]): number {
  return (
    lancamentos
      .filter((l) => l.fatura_id === fatura.id && l.tipo === 'transferencia' && !l.excluido && l.status !== 'cancelado')
      .reduce((s, l) => s + Math.round(l.valor * 100), 0) / 100
  );
}

export interface Sincronizacao {
  faturasNovas: Fatura[];
  faturasAlteradas: Fatura[];
  lancamentosAlterados: Lancamento[];
}

/**
 * Arruma o que é de cartão ao abrir o app:
 * - liga cada compra/estorno/previsto de cartão sem fatura à fatura certa
 *   (com `data_caixa` = vencimento);
 * - fecha automaticamente as faturas cujo fechamento já chegou.
 */
export function sincronizarFaturas(p: {
  contas: Conta[];
  faturas: Fatura[];
  lancamentos: Lancamento[];
  parametros: Parametro[];
  hoje: DataISO;
  agoraISO?: string;
}): Sincronizacao {
  const agora = p.agoraISO ?? new Date().toISOString();
  const cartoes = new Set(p.contas.filter((c) => c.tipo === 'cartao').map((c) => c.id));
  const faturas = [...p.faturas];
  const faturasNovas: Fatura[] = [];
  const alteradas = new Map<string, Fatura>();
  const lancamentosAlterados: Lancamento[] = [];

  for (const l of p.lancamentos) {
    if (l.excluido || l.tipo === 'transferencia' || !cartoes.has(l.conta_id)) continue;
    if (l.fatura_id && faturas.some((f) => f.id === l.fatura_id)) continue;
    const ciclo = cicloDaCompra(l.conta_id, l.data_competencia, p.parametros);
    if (!ciclo) continue; // sem fechamento/vencimento cadastrados
    const { fatura, nova } = obterFatura(faturas, l.conta_id, ciclo, p.hoje, agora);
    if (nova) {
      faturas.push(fatura);
      faturasNovas.push(fatura);
    }
    lancamentosAlterados.push({ ...l, fatura_id: fatura.id, data_caixa: fatura.data_vencimento, atualizado_em: agora });
  }

  for (const f of faturas) {
    if (f.status === 'aberta' && p.hoje >= f.data_fechamento) {
      const nova = { ...f, status: 'fechada' as const, atualizado_em: agora };
      if (faturasNovas.includes(f)) faturasNovas[faturasNovas.indexOf(f)] = nova;
      else alteradas.set(f.id, nova);
    }
  }
  return { faturasNovas, faturasAlteradas: [...alteradas.values()], lancamentosAlterados };
}

/**
 * Parcelamento de N vezes (SPEC 6.3): 1 linha em Parcelamentos e N
 * lançamentos de valor_total/N (a última absorve os centavos), da fatura da
 * compra em diante, com competência = data da compra e caixa = vencimento.
 */
export function criarParcelamento(p: {
  base: Lancamento; // lançamento já montado (valor = total)
  parcelas: number;
  parametros: Parametro[];
  faturas: Fatura[];
  hoje: DataISO;
  agoraISO?: string;
}): { parcelamento: RegistroGenerico; lancamentos: Lancamento[]; faturasNovas: Fatura[] } {
  const n = Math.round(p.parcelas);
  if (!(n >= 2 && n <= 48)) throw new Error('Parcelas: de 2 a 48');
  const agora = p.agoraISO ?? new Date().toISOString();
  const totalC = Math.round(p.base.valor * 100);
  const parcelaC = Math.floor(totalC / n);
  const parcelamentoId = novoId('par');
  const faturas = [...p.faturas];
  const faturasNovas: Fatura[] = [];
  const lancamentos: Lancamento[] = [];
  let primeira = '';
  for (let i = 0; i < n; i++) {
    const ciclo = cicloDaCompra(p.base.conta_id, p.base.data_competencia, p.parametros, i);
    if (!ciclo) throw new Error('Cadastre o dia de fechamento e de vencimento deste cartão antes de parcelar.');
    const { fatura, nova } = obterFatura(faturas, p.base.conta_id, ciclo, p.hoje, agora);
    if (nova) {
      faturas.push(fatura);
      faturasNovas.push(fatura);
    }
    if (i === 0) primeira = fatura.competencia;
    const valorC = i === n - 1 ? totalC - parcelaC * (n - 1) : parcelaC;
    lancamentos.push({
      ...p.base,
      id: i === 0 ? p.base.id : novoId('lan'),
      valor: valorC / 100,
      status: 'agendado',
      data_caixa: fatura.data_vencimento,
      fatura_id: fatura.id,
      parcelamento_id: parcelamentoId,
      parcela_num: i + 1,
      parcela_total: n,
      origem: i === 0 ? p.base.origem : 'parcelamento',
      criado_em: agora,
      atualizado_em: agora,
    });
  }
  const parcelamento: RegistroGenerico = {
    id: parcelamentoId,
    descricao: p.base.descricao,
    valor_total: totalC / 100,
    parcelas: n,
    valor_parcela: parcelaC / 100,
    data_compra: p.base.data_competencia,
    cartao_id: p.base.conta_id,
    primeira_fatura: primeira,
    categoria: p.base.categoria,
    subcategoria: p.base.subcategoria ?? null,
    quem: p.base.quem,
    excluido: false,
    criado_em: agora,
    atualizado_em: agora,
  };
  return { parcelamento, lancamentos, faturasNovas };
}

/**
 * Qual fatura um pagamento quita (SPEC 7): a fechada ou aberta de vencimento
 * mais próximo com total dentro de ±1% (forte), ou a única em aberto (sugestão).
 */
export function faturaParaPagamento(
  cartaoId: string,
  valor: number,
  dataPagamento: DataISO,
  faturas: Fatura[],
  lancamentos: Lancamento[],
): { fatura: Fatura; forte: boolean } | null {
  const emAberto = faturas
    .filter((f) => !f.excluido && f.cartao_id === cartaoId && (f.status === 'aberta' || f.status === 'fechada' || f.status === 'paga_parcial'))
    .sort((a, b) => Math.abs(diffDias(dataPagamento, a.data_vencimento)) - Math.abs(diffDias(dataPagamento, b.data_vencimento)));
  const forte = emAberto.find((f) => {
    const devido = totalFatura(f, lancamentos).total - pagamentosDaFatura(f, lancamentos);
    return devido > 0 && Math.abs(valor - devido) <= devido * 0.01;
  });
  if (forte) return { fatura: forte, forte: true };
  if (emAberto.length === 1) return { fatura: emAberto[0], forte: false };
  // Sem empate claro: a fechada (ou aberta) que vence primeiro.
  const porVencimento = [...emAberto].sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
  return porVencimento[0] ? { fatura: porVencimento[0], forte: false } : null;
}

/**
 * Aplica um pagamento (SPEC 6.2): cobrindo o total (com 1% de folga), a
 * fatura vira `paga` e todas as despesas dela viram realizadas na data do
 * pagamento; menos que isso, `paga_parcial` e as despesas continuam agendadas.
 */
export function aplicarPagamento(p: {
  fatura: Fatura;
  pagamento: Lancamento; // transferência já com fatura_id
  lancamentos: Lancamento[];
  agoraISO?: string;
}): { fatura: Fatura; lancamentosAlterados: Lancamento[] } {
  const agora = p.agoraISO ?? new Date().toISOString();
  const todos = p.lancamentos.some((l) => l.id === p.pagamento.id) ? p.lancamentos : [...p.lancamentos, p.pagamento];
  const devido = totalFatura(p.fatura, todos).total;
  const pago = pagamentosDaFatura(p.fatura, todos);
  if (pago + 0.005 >= devido * 0.99) {
    const alterados = itensDaFatura(p.fatura, todos)
      .filter((l) => l.status === 'agendado' || l.status === 'previsto')
      .map((l) => ({ ...l, status: 'realizado' as const, data_caixa: p.pagamento.data_caixa, atualizado_em: agora }));
    return { fatura: { ...p.fatura, status: 'paga', atualizado_em: agora }, lancamentosAlterados: alterados };
  }
  return { fatura: { ...p.fatura, status: 'paga_parcial', atualizado_em: agora }, lancamentosAlterados: [] };
}

/** Faturas ainda não pagas de um cartão, da que vence primeiro para a última. */
export function faturasEmAberto(cartaoId: string, faturas: Fatura[]): Fatura[] {
  return faturas
    .filter((f) => !f.excluido && f.cartao_id === cartaoId && f.status !== 'paga')
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento));
}

/**
 * Recalcula a situação de uma fatura a partir dos pagamentos realizados
 * (usado ao pagar, editar ou excluir um pagamento):
 * - pagos ≥ 99% do total → `paga`, compras viram realizadas na data do último pagamento;
 * - pagos > 0 → `paga_parcial`, compras voltam/continuam agendadas;
 * - nada pago → `aberta` ou `fechada` pela data.
 */
export function recalcularFatura(
  fatura: Fatura,
  lancamentos: Lancamento[],
  hoje: DataISO,
  agoraISO = new Date().toISOString(),
): { fatura: Fatura; lancamentosAlterados: Lancamento[] } {
  const pagamentos = lancamentos.filter(
    (l) => l.fatura_id === fatura.id && l.tipo === 'transferencia' && !l.excluido && l.status === 'realizado',
  );
  const pago = pagamentos.reduce((s, l) => s + Math.round(l.valor * 100), 0);
  const devido = Math.round(totalFatura(fatura, lancamentos).total * 100);
  const itens = itensDaFatura(fatura, lancamentos);
  let status: StatusFatura;
  const alterados: Lancamento[] = [];
  if (pago > 0 && pago >= devido * 0.99) {
    status = 'paga';
    const dataPg = pagamentos.map((l) => l.data_caixa).sort().at(-1)!;
    for (const l of itens) {
      if (l.status !== 'realizado' || l.data_caixa !== dataPg) {
        alterados.push({ ...l, status: 'realizado', data_caixa: dataPg, atualizado_em: agoraISO });
      }
    }
  } else {
    status = pago > 0 ? 'paga_parcial' : hoje >= fatura.data_fechamento ? 'fechada' : 'aberta';
    for (const l of itens) {
      if (l.status === 'realizado' || l.data_caixa !== fatura.data_vencimento) {
        alterados.push({ ...l, status: l.status === 'previsto' ? 'previsto' : 'agendado', data_caixa: fatura.data_vencimento, atualizado_em: agoraISO });
      }
    }
  }
  const novaFatura = status === fatura.status ? fatura : { ...fatura, status, atualizado_em: agoraISO };
  return { fatura: novaFatura, lancamentosAlterados: alterados };
}

/**
 * Fatura de uma importação de cartão (SPEC 8.2, item 3): pelo vencimento
 * informado ou, sem ele, pelo fim do período do arquivo (fechamento mais próximo).
 */
export function cicloDaImportacao(
  cartaoId: string,
  p: { vencimento?: DataISO; fim?: DataISO; datas: DataISO[] },
  parametros: Parametro[],
): CicloFatura | null {
  if (p.vencimento) {
    const fech = lerParametroNumero(parametros, 'cartao.fechamento_dia', p.vencimento, 0, cartaoId);
    const venc = Number(p.vencimento.slice(8, 10));
    const { ano, mes } = partesData(p.vencimento);
    let data_fechamento: DataISO;
    if (fech) {
      const m = venc > fech ? { ano, mes } : somarMes(ano, mes, -1);
      data_fechamento = diaNoMes(m.ano, m.mes, fech);
    } else {
      const d = new Date(Date.UTC(ano, mes - 1, venc - 7));
      data_fechamento = montarData(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    return { competencia: p.vencimento.slice(0, 7), data_fechamento, data_vencimento: p.vencimento };
  }
  const ref = p.fim ?? [...p.datas].sort().at(-1);
  if (!ref) return null;
  const opcoes = [-1, 0].map((d) => cicloDaCompra(cartaoId, ref, parametros, d)).filter((c): c is CicloFatura => Boolean(c));
  return opcoes.sort((a, b) => Math.abs(diffDias(ref, a.data_fechamento)) - Math.abs(diffDias(ref, b.data_fechamento)))[0] ?? null;
}
