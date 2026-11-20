import { useState } from 'preact/hooks';
import { ddmm, diffDias, nomeMesLongo, partesData } from '../domain/dates';
import { itensDaFatura, pagamentosDaFatura, totalFatura, type Fatura } from '../domain/faturas';
import { formatarBRL } from '../domain/money';
import { lerPessoas } from '../domain/parametros';
import type { Conta } from '../domain/types';
import { lerNumero } from '../domain/valores';
import { Folha, PontoStatus, useToast } from './comum';
import { useApp } from './useApp';

const brl0 = (v: number) => formatarBRL(v, { semCentavos: true });

export function nomeFatura(f: Fatura): string {
  const { mes, ano } = partesData(`${f.competencia}-01`);
  return `${nomeMesLongo(mes)}/${String(ano).slice(2)}`;
}

/** Situação da fatura em uma linha ("fecha em 9 dias · vence 07/12"). */
export function situacaoFatura(f: Fatura, hoje: string): string {
  const venc = `vence ${ddmm(f.data_vencimento)}`;
  if (f.status === 'paga') return 'paga';
  if (f.status === 'paga_parcial') return `paga parcialmente · ${venc}`;
  if (f.status === 'aberta') {
    const dias = diffDias(hoje, f.data_fechamento);
    return `${dias <= 0 ? 'fecha hoje' : `fecha em ${dias} ${dias === 1 ? 'dia' : 'dias'}`} · ${venc}`;
  }
  const atraso = diffDias(f.data_vencimento, hoje);
  return atraso > 0 ? `venceu em ${ddmm(f.data_vencimento)}` : `fechada · ${venc}`;
}

/** Bloco de uma fatura na Semana: total, situação e barra por pessoa. */
export function ResumoFatura({ fatura, cartao, abrir }: { fatura: Fatura; cartao: Conta; abrir: () => void }) {
  const [{ base, hoje }] = useApp();
  const pessoas = lerPessoas(base!.parametros, hoje);
  const t = totalFatura(fatura, base!.lancamentos);
  const pago = pagamentosDaFatura(fatura, base!.lancamentos);
  const fatias = (['pessoa1', 'pessoa2', 'casal'] as const).filter((q) => t.porPessoa[q] > 0);
  return (
    <button type="button" class="fatura" onClick={abrir} aria-label={`Fatura ${cartao.nome} de ${nomeFatura(fatura)}: ${formatarBRL(t.total)}, ${situacaoFatura(fatura, hoje)}. Tocar para ver`}>
      <span class="fatura-topo">
        <span class="saldo-nome">{cartao.nome} · {nomeFatura(fatura)}</span>
        <span class="saldo-valor">{formatarBRL(t.total - pago)}</span>
      </span>
      <span class="discreto">{situacaoFatura(fatura, hoje)}{pago > 0 ? ` · já pago ${formatarBRL(pago)}` : ''}</span>
      {fatura.status === 'paga_parcial' && (
        <span class="alerta-ambar">Fatura paga parcialmente: o saldo vira rotativo, a dívida mais cara que existe.</span>
      )}
      {t.total > 0 && (
        <>
          <span class="barra barra-dividida" aria-hidden="true">
            {fatias.map((q) => <span key={q} class={`fatia fatia-${q}`} style={{ width: `${(t.porPessoa[q] / t.total) * 100}%` }} />)}
          </span>
          <span class="legenda-fatura">
            {fatias.map((q) => (
              <span key={q}><span class={`bolinha fatia-${q}`} />{q === 'casal' ? 'Casal' : pessoas[q]} {brl0(t.porPessoa[q])}</span>
            ))}
          </span>
        </>
      )}
    </button>
  );
}

/** Detalhe da fatura: compras, pagamentos e "Registrar pagamento". */
export function FolhaFatura({ fatura, fechar }: { fatura: Fatura; fechar: () => void }) {
  const [{ base, hoje }, app] = useApp();
  const toast = useToast();
  const f = base!.faturas.find((x) => x.id === fatura.id) ?? fatura;
  const cartao = base!.contas.find((c) => c.id === f.cartao_id)!;
  const itens = itensDaFatura(f, base!.lancamentos).sort((a, b) => a.data_competencia.localeCompare(b.data_competencia));
  const pagamentos = base!.lancamentos.filter((l) => l.fatura_id === f.id && l.tipo === 'transferencia' && !l.excluido);
  const t = totalFatura(f, base!.lancamentos);
  const pago = pagamentosDaFatura(f, base!.lancamentos);
  const devido = Math.max(0, Math.round((t.total - pago) * 100) / 100);
  const correntes = base!.contas.filter((c) => c.ativa !== false && (c.tipo === 'corrente' || c.tipo === 'dinheiro'));
  const [pagando, setPagando] = useState(false);
  const [valor, setValor] = useState(String(devido).replace('.', ','));
  const [conta, setConta] = useState(cartao.conta_pagamento_id ?? correntes[0]?.id ?? '');
  const [data, setData] = useState(hoje);
  const [erro, setErro] = useState('');

  async function pagar() {
    const v = lerNumero(valor);
    if (!v || v <= 0) return setErro('Valor inválido.');
    if (!conta) return setErro('Escolha a conta de onde saiu o pagamento.');
    try {
      const l = await app.pagarFatura(f, v, conta, data);
      const parcial = v + 0.005 < devido * 0.99;
      toast({
        texto: parcial ? 'Pagamento parcial registrado' : 'Fatura paga',
        acao: { rotulo: 'Desfazer', f: () => void app.excluir(l) },
      });
      fechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui registrar.');
    }
  }

  return (
    <Folha titulo={`${cartao.nome} · ${nomeFatura(f)}`} fechar={fechar}>
      <p class="discreto">
        {situacaoFatura(f, hoje).replace(/^./, (x) => x.toUpperCase())} · fechamento em {ddmm(f.data_fechamento)}
      </p>
      <ul class="lista-conta">
        {itens.map((l) => (
          <li key={l.id}>
            <span>
              <PontoStatus status={l.status} /> {ddmm(l.data_competencia)} · {l.descricao || l.categoria}
              {l.parcela_total ? ` (${l.parcela_num}/${l.parcela_total})` : ''}
            </span>
            <span>{l.tipo === 'receita' ? '−' : ''}{formatarBRL(l.valor)}</span>
          </li>
        ))}
        <li class="total"><span>Total</span><span>{formatarBRL(t.total)}</span></li>
        {pagamentos.map((l) => (
          <li key={l.id}><span>Pagamento em {ddmm(l.data_caixa)}</span><span>−{formatarBRL(l.valor)}</span></li>
        ))}
        {pago > 0 && <li class="total"><span>Falta pagar</span><span>{formatarBRL(devido)}</span></li>}
      </ul>
      {f.status === 'paga_parcial' && (
        <p class="alerta-ambar">Fatura paga parcialmente: o saldo vira rotativo, a dívida mais cara que existe.</p>
      )}

      {f.status !== 'paga' && !pagando && (
        <button type="button" class="botao-primario" onClick={() => setPagando(true)}>Registrar pagamento</button>
      )}
      {pagando && (
        <div class="cartao">
          <div class="campo">
            <label for="pg-valor">Valor pago (R$)</label>
            <input id="pg-valor" type="text" inputMode="decimal" value={valor} onInput={(e) => setValor((e.target as HTMLInputElement).value)} />
          </div>
          <div class="campo">
            <label for="pg-conta">Saiu da conta</label>
            <select id="pg-conta" value={conta} onChange={(e) => setConta((e.target as HTMLSelectElement).value)}>
              {correntes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div class="campo">
            <label for="pg-data">Data do pagamento</label>
            <input id="pg-data" type="date" value={data} onChange={(e) => (e.target as HTMLInputElement).value && setData((e.target as HTMLInputElement).value)} />
          </div>
          <p class="discreto">Pagando o total, todas as compras desta fatura passam para "realizado". Pagamento é transferência: não conta como gasto.</p>
          {erro && <p class="erro-campo" role="alert">{erro}</p>}
          <button type="button" class="botao-primario" onClick={pagar}>Confirmar pagamento</button>
        </div>
      )}
    </Folha>
  );
}
