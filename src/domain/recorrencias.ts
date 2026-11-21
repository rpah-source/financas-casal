import { diasNoMes, diffDias, montarData, partesData, somarDias } from './dates';
import { diaDaSemana, ehDiaUtil } from './holidays-br';
import type { Conta, DataISO, Lancamento, Natureza, Pessoa, RegistroGenerico, TipoLancamento } from './types';
import { novoId } from './ids';

/**
 * Recorrências → lançamentos previstos (SPEC 5.3) e parcelas de dívida
 * agendadas (SPEC 5.6).
 */

/** Dia do mês de uma recorrência mensal. Aceita número, `ultimo`, `primeiro_util`, `penultimo_util`, `ultimo_util`. */
export function diaDoMes(regra: string, ano: number, mes: number): DataISO | null {
  const ultimoDia = diasNoMes(ano, mes);
  const r = String(regra ?? '').trim().toLowerCase();
  if (/^\d{1,2}$/.test(r)) {
    const n = Number(r);
    if (n < 1) return null;
    return montarData(ano, mes, Math.min(n, ultimoDia)); // 31 em mês curto = último dia
  }
  if (r === 'ultimo') return montarData(ano, mes, ultimoDia);
  const uteis: DataISO[] = [];
  for (let d = 1; d <= ultimoDia; d++) {
    const iso = montarData(ano, mes, d);
    if (ehDiaUtil(iso)) uteis.push(iso);
  }
  if (r === 'primeiro_util') return uteis[0] ?? null;
  if (r === 'ultimo_util') return uteis[uteis.length - 1] ?? null;
  if (r === 'penultimo_util') return uteis[uteis.length - 2] ?? null;
  return null;
}

/** Datas de uma recorrência entre `de` e `ate` (inclusive), respeitando início e fim. */
export function datasDaRecorrencia(rec: RegistroGenerico, de: DataISO, ate: DataISO): DataISO[] {
  const inicio = (rec.inicio as string) || '1900-01-01';
  const fim = (rec.fim as string) || '9999-12-31';
  const a = de > inicio ? de : inicio;
  const b = ate < fim ? ate : fim;
  if (a > b) return [];
  const datas: DataISO[] = [];
  if (rec.frequencia === 'semanal') {
    const alvo = Number(rec.dia_semana);
    if (!(alvo >= 1 && alvo <= 7)) return [];
    let d = a;
    while (diaDaSemana(d) !== alvo) d = somarDias(d, 1);
    for (; d <= b; d = somarDias(d, 7)) datas.push(d);
    return datas;
  }
  let { ano, mes } = partesData(a);
  for (;;) {
    const d = diaDoMes(String(rec.dia_mes ?? ''), ano, mes);
    if (d && d >= a && d <= b) datas.push(d);
    mes++;
    if (mes > 12) {
      mes = 1;
      ano++;
    }
    if (montarData(ano, mes, 1) > b) break;
  }
  return datas;
}

/** Janela de geração: mês atual + 2 seguintes (SPEC 5.3). */
export function janelaGeracao(hoje: DataISO): [DataISO, DataISO] {
  const { ano, mes } = partesData(hoje);
  const m = mes + 2;
  const anoFim = ano + Math.floor((m - 1) / 12);
  const mesFim = ((m - 1) % 12) + 1;
  return [montarData(ano, mes, 1), montarData(anoFim, mesFim, diasNoMes(anoFim, mesFim))];
}

/**
 * Mesma "vaga" da recorrência: semanal = a até 3 dias da data prevista (a
 * faxina pode mudar de dia ou o Pix sair dias depois; os cortes do mês não
 * servem, porque a semana 1–8 pode ter duas quintas); mensal = mesmo mês.
 */
function mesmaVaga(rec: RegistroGenerico, a: DataISO, b: DataISO): boolean {
  if (rec.frequencia === 'semanal') return Math.abs(diffDias(a, b)) <= 3;
  return a.slice(0, 7) === b.slice(0, 7);
}

export function gerarPrevistos(p: {
  recorrencias: RegistroGenerico[];
  lancamentos: Lancamento[];
  contas: Conta[];
  hoje: DataISO;
  cortes?: string;
  agoraISO?: string;
}): Lancamento[] {
  const [de, ate] = janelaGeracao(p.hoje);
  const agora = p.agoraISO ?? new Date().toISOString();
  const novos: Lancamento[] = [];
  for (const rec of p.recorrencias) {
    if (rec.ativa === false || rec.excluido) continue;
    // Idempotência: conta tudo que não foi excluído (em qualquer status, inclusive cancelado).
    const existentes = [...p.lancamentos, ...novos].filter((l) => l.recorrencia_id === rec.id && !l.excluido);
    for (const data of datasDaRecorrencia(rec, de, ate)) {
      if (existentes.some((l) => mesmaVaga(rec, l.data_competencia, data))) continue;
      const tipo = (rec.tipo as TipoLancamento) || 'despesa';
      const l: Lancamento = {
        id: novoId('lan'),
        tipo,
        status: 'previsto',
        descricao: (rec.descricao as string) || null,
        valor: Number(rec.valor),
        data_competencia: data,
        data_caixa: data,
        conta_id: String(rec.conta_id),
        conta_destino_id: tipo === 'transferencia' ? ((rec.conta_destino_id as string) || null) : null,
        categoria: (rec.categoria as string) || null,
        subcategoria: (rec.subcategoria as string) || null,
        natureza: ((rec.natureza as Natureza) || (tipo === 'despesa' ? 'variavel' : 'nenhuma')),
        quem: ((rec.quem as Pessoa) || 'casal'),
        recorrencia_id: String(rec.id),
        origem: 'recorrencia',
        conciliado: false,
        excluir_da_analise: false,
        excluido: false,
        criado_em: agora,
        atualizado_em: agora,
      };
      novos.push(l);
      existentes.push(l);
    }
  }
  return novos;
}

/**
 * Parcelas de dívida (SPEC 5.6): agendadas, uma por mês, na mesma janela,
 * até acabarem as `parcelas_restantes`. Descontadas em folha não geram saída de caixa.
 */
export function gerarParcelasDivida(p: {
  dividas: RegistroGenerico[];
  lancamentos: Lancamento[];
  hoje: DataISO;
  agoraISO?: string;
}): Lancamento[] {
  const [de, ate] = janelaGeracao(p.hoje);
  const agora = p.agoraISO ?? new Date().toISOString();
  const novos: Lancamento[] = [];
  for (const d of p.dividas) {
    if (d.excluido || d.descontada_em_folha === true) continue;
    const valor = Number(d.valor_parcela);
    const dia = Number(d.dia_vencimento);
    const restantes = Number(d.parcelas_restantes);
    if (!(valor > 0) || !(dia >= 1) || !(restantes > 0) || !d.conta_pagamento_id) continue;
    const daDivida = p.lancamentos.filter((l) => l.divida_id === d.id && !l.excluido);
    // "Parcelas que faltam" contam a partir do cadastro: não cria parcela com vencimento antes dele.
    const desde = String(d.criado_em ?? '').slice(0, 10);
    // Parcelas futuras ainda não pagas já contam no limite de restantes.
    let disponiveis = restantes - daDivida.filter((l) => l.status !== 'realizado' && l.status !== 'cancelado' && l.data_competencia >= de).length;
    let { ano, mes } = partesData(de);
    while (disponiveis > 0) {
      const data = montarData(ano, mes, Math.min(dia, diasNoMes(ano, mes)));
      if (data > ate) break;
      if (data >= (desde || de) && !daDivida.some((l) => l.data_competencia.slice(0, 7) === data.slice(0, 7))) {
        novos.push({
          id: novoId('lan'),
          tipo: 'despesa',
          status: 'agendado',
          descricao: `Parcela ${d.credor ?? 'dívida'}`,
          valor,
          data_competencia: data,
          data_caixa: data,
          conta_id: String(d.conta_pagamento_id),
          categoria: 'Dívidas',
          subcategoria: 'Parcela de empréstimo',
          natureza: 'divida',
          quem: 'casal',
          divida_id: String(d.id),
          origem: 'recorrencia',
          conciliado: false,
          excluir_da_analise: false,
          excluido: false,
          criado_em: agora,
          atualizado_em: agora,
        });
        disponiveis--;
      }
      mes++;
      if (mes > 12) {
        mes = 1;
        ano++;
      }
    }
  }
  return novos;
}

/** Próxima data (≥ hoje) de uma recorrência — ex.: "até o crédito de 30/11". */
export function proximaData(rec: RegistroGenerico, hoje: DataISO): DataISO | null {
  const datas = datasDaRecorrencia(rec, hoje, somarDias(hoje, 400));
  return datas[0] ?? null;
}

