import { useState } from 'preact/hooks';
import { validarDivida, type NovaDivida, type TipoDivida } from '../domain/dividas';
import { formatarBRL } from '../domain/money';
import type { Lancamento } from '../domain/types';
import { lerNumero } from '../domain/valores';
import { Folha, useToast } from './comum';
import { useApp } from './useApp';

/**
 * Cadastro de dívida (SPEC 5.6), aberto a partir de um empréstimo recebido:
 * a entrada fica ligada à dívida e as parcelas futuras viram agendadas.
 */
export function FormDivida({ emprestimo, fechar }: { emprestimo?: Lancamento | null; fechar: () => void }) {
  const [{ base }, app] = useApp();
  const toast = useToast();
  const contas = base!.contas.filter((c) => c.ativa !== false && c.tipo !== 'cartao');
  const [credor, setCredor] = useState('');
  const [tipo, setTipo] = useState<TipoDivida>('emprestimo_pessoal');
  const [parcela, setParcela] = useState('');
  const [parcelas, setParcelas] = useState('');
  const [dia, setDia] = useState('');
  const [conta, setConta] = useState(emprestimo?.conta_id && contas.some((c) => c.id === emprestimo.conta_id) ? emprestimo.conta_id : contas[0]?.id ?? '');
  const [folha, setFolha] = useState(false);
  const [juros, setJuros] = useState('');
  const [quitar, setQuitar] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const n: NovaDivida = {
    credor,
    tipo,
    valorParcela: lerNumero(parcela) ?? 0,
    parcelas: Number(parcelas) || 0,
    diaVencimento: Number(dia) || 0,
    contaPagamentoId: folha ? null : conta || null,
    descontadaEmFolha: folha,
    jurosMesPct: lerNumero(juros),
    valorParaQuitar: lerNumero(quitar),
    observacao: obs,
  };
  const total = n.valorParcela * n.parcelas;

  async function salvar() {
    const e = validarDivida(n);
    if (e) return setErro(e);
    setSalvando(true);
    try {
      await app.criarDivida(n, emprestimo);
      toast({ texto: folha ? 'Dívida cadastrada (descontada em folha)' : `Dívida cadastrada: ${n.parcelas} parcelas agendadas` });
      fechar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui salvar.');
    } finally {
      setSalvando(false);
    }
  }

  const campo = (id: string, rotulo: string, el: preact.JSX.Element, ajuda?: string) => (
    <div class="campo">
      <label for={id}>{rotulo}</label>
      {el}
      {ajuda && <p class="discreto">{ajuda}</p>}
    </div>
  );

  return (
    <Folha titulo="Dívida deste empréstimo" fechar={fechar}>
      {emprestimo && (
        <p class="discreto">Empréstimo recebido: {formatarBRL(emprestimo.valor)} em {emprestimo.data_competencia.split('-').reverse().join('/')}. Ele entra no saldo, mas não conta como renda.</p>
      )}
      {campo('dv-credor', 'Quem emprestou (credor)', <input id="dv-credor" type="text" value={credor} onInput={(e) => setCredor((e.target as HTMLInputElement).value)} />)}
      {campo('dv-tipo', 'Tipo', (
        <select id="dv-tipo" value={tipo} onChange={(e) => setTipo((e.target as HTMLSelectElement).value as TipoDivida)}>
          <option value="emprestimo_pessoal">Empréstimo pessoal</option>
          <option value="consignado">Consignado</option>
          <option value="familiar">Familiar</option>
          <option value="outro">Outro</option>
        </select>
      ))}
      <div class="linha-botoes">
        {campo('dv-parcela', 'Valor da parcela (R$)', <input id="dv-parcela" type="text" inputMode="decimal" value={parcela} onInput={(e) => setParcela((e.target as HTMLInputElement).value)} />)}
        {campo('dv-n', 'Parcelas que faltam', <input id="dv-n" type="text" inputMode="numeric" value={parcelas} onInput={(e) => setParcelas((e.target as HTMLInputElement).value)} />)}
      </div>
      {campo('dv-dia', 'Dia do vencimento', <input id="dv-dia" type="text" inputMode="numeric" value={dia} onInput={(e) => setDia((e.target as HTMLInputElement).value)} />)}
      <label class="caixa">
        <input type="checkbox" checked={folha} onChange={(e) => setFolha((e.target as HTMLInputElement).checked)} />
        Descontada no salário (consignado): não sai da conta
      </label>
      {!folha && campo('dv-conta', 'Sai da conta', (
        <select id="dv-conta" value={conta} onChange={(e) => setConta((e.target as HTMLSelectElement).value)}>
          {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      ))}
      <details class="mais-detalhes">
        <summary>Juros e quitação (se souber)</summary>
        {campo('dv-juros', 'Juros ao mês (%)', <input id="dv-juros" type="text" inputMode="decimal" value={juros} onInput={(e) => setJuros((e.target as HTMLInputElement).value)} />)}
        {campo('dv-quitar', 'Valor para quitar hoje (R$)', <input id="dv-quitar" type="text" inputMode="decimal" value={quitar} onInput={(e) => setQuitar((e.target as HTMLInputElement).value)} />, 'Sem esse valor, o app usa parcela × parcelas que faltam.')}
        {campo('dv-obs', 'Observação', <input id="dv-obs" type="text" value={obs} onInput={(e) => setObs((e.target as HTMLInputElement).value)} />)}
      </details>
      {total > 0 && <p class="discreto">Total a pagar: {formatarBRL(total)} ({n.parcelas}× {formatarBRL(n.valorParcela)}).</p>}
      {erro && <p class="erro-campo" role="alert">{erro}</p>}
      <button type="button" class="botao-primario" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar dívida'}</button>
      <p class="discreto">Para guardar o contrato, abra o empréstimo no Extrato e toque em "Anexar documento".</p>
    </Folha>
  );
}

/** Bloco no detalhe de um empréstimo recebido: mostra a dívida ligada ou oferece cadastrar. */
export function BlocoEmprestimo({ l }: { l: Lancamento }) {
  const [{ base }, app] = useApp();
  const [abrindo, setAbrindo] = useState(false);
  const divida = l.divida_id ? base!.dividas.find((d) => d.id === l.divida_id) : undefined;
  const livres = base!.dividas.filter((d) => !d.excluido && !base!.lancamentos.some((x) => x.divida_id === d.id && x.tipo === 'receita'));
  if (divida) {
    return (
      <div class="cartao">
        <p><strong>Dívida ligada:</strong> {String(divida.credor)}</p>
        <p class="discreto">
          {divida.descontada_em_folha ? 'Descontada no salário · ' : ''}
          {Number(divida.parcelas_restantes)} parcelas de {formatarBRL(Number(divida.valor_parcela))} · vence dia {Number(divida.dia_vencimento)}
        </p>
      </div>
    );
  }
  return (
    <div class="cartao">
      <p><strong>Este empréstimo gera parcelas a pagar?</strong></p>
      <button type="button" class="botao-secundario" onClick={() => setAbrindo(true)}>Cadastrar a dívida</button>
      {livres.length > 0 && (
        <div class="campo">
          <label for="lig-div">Ou ligar a uma dívida já cadastrada</label>
          <select id="lig-div" value="" onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v) void app.ligarADivida(l, v); }}>
            <option value="">Escolha</option>
            {livres.map((d) => <option key={String(d.id)} value={String(d.id)}>{String(d.credor)}</option>)}
          </select>
        </div>
      )}
      {abrindo && <FormDivida emprestimo={l} fechar={() => setAbrindo(false)} />}
    </div>
  );
}
