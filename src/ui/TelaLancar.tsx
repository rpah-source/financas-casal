import { useMemo, useState } from 'preact/hooks';
import type { Base } from '../domain/base';
import { ddmm } from '../domain/dates';
import type { NovoLancamento } from '../domain/lancamento';
import { formatarBRL } from '../domain/money';
import { lerPessoas } from '../domain/parametros';
import { interpretarTexto } from '../domain/parser';
import { aplicarRegras, padraoSugerido, SEM_SUGESTAO, type Sugestao } from '../domain/regras';
import { statusInicial } from '../domain/status';
import type { Lancamento, Natureza, Pessoa, StatusLancamento, TipoLancamento } from '../domain/types';
import { normalizar } from '../domain/valores';
import { Chips, EscolherCategoria, NOME_NATUREZA, NOME_STATUS, useToast } from './comum';
import { cicloDaCompra, faturaParaPagamento, pagamentosDaFatura, totalFatura } from '../domain/faturas';
import { nomeFatura } from './Fatura';
import { FormDivida } from './Divida';
import { CATEGORIA_EMPRESTIMO } from '../domain/categoriasPadrao';
import { useApp } from './useApp';
import { diffDias } from '../domain/dates';

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function nomeDia(d: string, hoje: string): string {
  const dif = diffDias(hoje, d);
  if (dif === 0) return 'hoje';
  if (dif === -1) return 'ontem';
  if (dif === 1) return 'amanhã';
  return `${DIAS_SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]}, ${ddmm(d)}`;
}

type Aba = 'despesa' | 'receita' | 'transferencia';

/**
 * Lançamento rápido (SPEC 10.2): valor no teclado próprio, "Onde?",
 * conta, pessoa, data. Um gasto repetido entra em até 4 toques.
 */
export function TelaLancar({ aoTerminar }: { aoTerminar: () => void }) {
  const [estado, app] = useApp();
  const { base, hoje } = estado;
  if (!base) return <p class="discreto">Carregando…</p>;
  if (!base.contas.some((c) => c.ativa !== false)) {
    return (
      <section>
        <h1 class="titulo-tela">Lançar</h1>
        <div class="cartao">
          <p>Ainda não há contas cadastradas.</p>
          <p class="discreto">Cadastre pelo menos uma conta na aba Contas da planilha (ou peça ao assistente na carga inicial).</p>
        </div>
      </section>
    );
  }
  return <Formulario base={base} hoje={hoje} projetosAreas={estado.projetosAreas} app={app} aoTerminar={aoTerminar} />;
}

function Formulario(p: {
  base: Base;
  hoje: string;
  projetosAreas: ReturnType<typeof useApp>[0]['projetosAreas'];
  app: ReturnType<typeof useApp>[1];
  aoTerminar: () => void;
}) {
  const { base, hoje, app } = p;
  const toast = useToast();
  const pessoas = lerPessoas(base.parametros, hoje);
  const contas = useMemo(
    () => base.contas.filter((c) => c.ativa !== false && !c.excluido).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99)),
    [base.contas],
  );
  const manuais = useMemo(
    () =>
      base.lancamentos
        .filter((l) => !l.excluido && (l.origem ?? 'manual') === 'manual')
        .sort((a, b) => String(b.criado_em ?? '').localeCompare(String(a.criado_em ?? ''))),
    [base.lancamentos],
  );

  const [aba, setAba] = useState<Aba>('despesa');
  const [centavos, setCentavos] = useState(0);
  const [tecladoAberto, setTecladoAberto] = useState(true);
  const [onde, setOnde] = useState('');
  const [manual, setManual] = useState<Partial<Sugestao> | null>(null); // categoria escolhida à mão
  const [lembrar, setLembrar] = useState(true);
  const [contaId, setContaId] = useState<string | null>(null); // null = automático
  const [destinoId, setDestinoId] = useState<string | null>(null);
  const [quem, setQuem] = useState<Pessoa>(manuais[0]?.quem ?? 'casal');
  const [data, setData] = useState(hoje);
  const [mudandoData, setMudandoData] = useState(false);
  const [escolhendoCat, setEscolhendoCat] = useState(false);
  const [projeto, setProjeto] = useState('');
  const [tags, setTags] = useState('');
  const [obs, setObs] = useState('');
  const [statusManual, setStatusManual] = useState<StatusLancamento | ''>('');
  const [frase, setFrase] = useState('');
  const [parcelas, setParcelas] = useState(1);
  const [emprestimo, setEmprestimo] = useState(false);
  const [dividaDe, setDividaDe] = useState<Lancamento | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [pergunta, setPergunta] = useState<{ lancamento: Lancamento; previsto: Lancamento; extra: Parameters<typeof app.lancar>[1] } | null>(null);

  const tipo: TipoLancamento = aba;
  const sugestao: Sugestao = useMemo(
    () => (aba === 'transferencia' ? SEM_SUGESTAO : aplicarRegras(onde, base.regras, base.categorias, contaId, aba)),
    [onde, base.regras, base.categorias, contaId, aba],
  );
  const categoria = manual?.categoria ?? sugestao.categoria;
  const subcategoria = manual ? manual.subcategoria ?? null : sugestao.subcategoria;
  const natureza: Natureza | null = manual?.natureza ?? sugestao.natureza;

  // Conta automática: a última usada nessa categoria; senão a última usada; senão a primeira.
  const contaAuto = useMemo(() => {
    const porCategoria = categoria ? manuais.find((l) => l.categoria === categoria && l.tipo === tipo) : undefined;
    const ultima = porCategoria ?? manuais.find((l) => l.tipo === tipo) ?? manuais[0];
    return contas.find((c) => c.id === ultima?.conta_id)?.id ?? contas[0]?.id ?? null;
  }, [categoria, manuais, contas, tipo]);
  const conta = contaId ?? contaAuto;
  const tipoConta = contas.find((c) => c.id === conta)?.tipo;
  const status = statusManual || statusInicial({ tipo, tipoConta, data, hoje });

  // Sugestões de "Onde?" a partir do que já foi lançado.
  const recentes = useMemo(() => {
    const vistos = new Set<string>();
    const t = normalizar(onde);
    const r: Lancamento[] = [];
    for (const l of manuais) {
      const d = l.descricao ?? '';
      const k = normalizar(d);
      if (!d || vistos.has(k) || l.tipo !== tipo) continue;
      if (t && (!k.includes(t) || k === t)) continue;
      vistos.add(k);
      r.push(l);
      if (r.length >= 5) break;
    }
    return r;
  }, [manuais, onde, tipo]);

  function tecla(t: string) {
    setErro('');
    if (t === '⌫') setCentavos((c) => Math.floor(c / 10));
    else setCentavos((c) => Math.min(c * 10 ** t.length + Number(t), 99_999_999_99));
  }

  function usarFrase() {
    const r = interpretarTexto(frase, { contas, pessoas, hoje });
    if (r.valor) setCentavos(Math.round(r.valor * 100));
    if (r.descricao) setOnde(r.descricao);
    if (r.contaId) setContaId(r.contaId);
    if (r.quem) setQuem(r.quem);
    if (r.parcelas && r.parcelas >= 2) setParcelas(r.parcelas);
    setData(r.data);
    setManual(null);
    setFrase('');
    setTecladoAberto(false);
  }

  function escolherRecente(l: Lancamento) {
    setOnde(l.descricao ?? '');
    if (l.categoria && !aplicarRegras(l.descricao ?? '', base.regras, base.categorias, null, l.tipo).categoria) {
      setManual({ categoria: l.categoria, subcategoria: l.subcategoria ?? null, natureza: l.natureza });
    } else setManual(null);
    if (!centavos) setCentavos(Math.round(l.valor * 100));
  }

  async function salvar() {
    const valor = centavos / 100;
    if (!valor) {
      setErro('Digite o valor.');
      setTecladoAberto(true);
      return;
    }
    if (tipo === 'transferencia' && (!destinoId || destinoId === conta)) {
      setErro('Escolha para qual conta vai a transferência.');
      return;
    }
    const proj = p.projetosAreas.find((x) => x.nome === projeto);
    const usarDescricaoRegra = sugestao.fonte === 'regra' && !manual && sugestao.descricao;
    const n: NovoLancamento = {
      tipo,
      valor,
      descricao: usarDescricaoRegra ? sugestao.descricao! : onde.trim(),
      contaId: conta!,
      contaDestinoId: destinoId,
      data,
      quem,
      categoria:
        tipo === 'receita' && emprestimo && base.categorias.some((c) => c.categoria === CATEGORIA_EMPRESTIMO)
          ? CATEGORIA_EMPRESTIMO
          : categoria ?? (tipo === 'despesa' ? 'Sem categoria' : null),
      subcategoria,
      natureza,
      status: statusManual || null,
      projetoArea: proj?.nome ?? null,
      projetoId: proj?.tipo === 'projeto' ? proj.id : null,
      tags,
      observacao: obs,
    };
    const criarRegra = manual?.categoria && lembrar && onde.trim() && padraoSugerido(onde);
    const parcelado = tipoConta === 'cartao' && tipo === 'despesa' && parcelas >= 2;
    const extra = {
      parcelas: parcelado ? parcelas : null,
      regraId: !manual ? sugestao.regraId : null,
      novaRegra: criarRegra
        ? { padrao: padraoSugerido(onde), descricao: onde.trim(), categoria: manual!.categoria!, subcategoria: manual!.subcategoria ?? '', natureza: '' }
        : null,
    };
    try {
      const preparado = app.prepararLancamento(n, extra.regraId);
      const lancamento = tipo === 'receita' && emprestimo ? { ...preparado.lancamento, excluir_da_analise: true } : preparado.lancamento;
      const previsto = parcelado ? null : preparado.previsto;
      if (previsto) {
        setPergunta({ lancamento, previsto, extra });
        return;
      }
      await gravar(lancamento, extra);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui salvar.');
    }
  }

  async function gravar(lancamento: Lancamento, extra: Parameters<typeof app.lancar>[1]) {
    setSalvando(true);
    try {
      const antes = extra?.casarCom ?? null;
      const l = await app.lancar(lancamento, extra);
      toast({
        texto: antes ? 'Lançado no lugar do previsto' : extra?.parcelas ? `Lançado em ${extra.parcelas} parcelas` : 'Lançado',
        acao: { rotulo: 'Desfazer', f: () => void (antes ? app.editar(antes) : app.excluir(l)) },
      });
      // Empréstimo recebido: pergunta as parcelas antes de sair (DECISIONS D81).
      if (l.tipo === 'receita' && (emprestimo || l.categoria === CATEGORIA_EMPRESTIMO)) setDividaDe(l);
      else p.aoTerminar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui salvar.');
    } finally {
      setSalvando(false);
      setPergunta(null);
    }
  }

  const destinoCartao = tipo === 'transferencia' ? contas.find((c) => c.id === destinoId && c.tipo === 'cartao') : undefined;
  const faturaAlvo = destinoCartao
    ? faturaParaPagamento(destinoCartao.id, centavos / 100 || 0.01, data, base.faturas, base.lancamentos)?.fatura
    : undefined;
  const devidoAlvo = faturaAlvo ? totalFatura(faturaAlvo, base.lancamentos).total - pagamentosDaFatura(faturaAlvo, base.lancamentos) : 0;
  const cicloCompra = tipoConta === 'cartao' && conta ? cicloDaCompra(conta, data, base.parametros) : null;

  const fraseStatus =
    tipo === 'transferencia'
      ? destinoCartao
        ? 'Pagamento de fatura é transferência: não conta como gasto. Pagando o total, as compras da fatura passam para realizado.'
        : 'Transferência não é gasto nem renda: fica fora da semanada e das categorias.'
      : tipoConta === 'cartao'
        ? tipo === 'receita'
          ? 'Entrada no cartão é estorno: abate o total da fatura.'
          : `${parcelas >= 2 ? `Em ${parcelas}× de ${formatarBRL(Math.floor(centavos / parcelas) / 100)}, uma parcela em cada fatura. ` : ''}No cartão, entra como agendado até a fatura ser paga.${cicloCompra ? ` ${parcelas >= 2 ? 'A 1ª parcela cai' : 'Cai'} na fatura que vence ${ddmm(cicloCompra.data_vencimento)}.` : ''}`
        : status === 'agendado'
          ? 'Data no futuro: entra como agendado.'
          : 'Entra como realizado (o dinheiro já saiu ou entrou).';

  return (
    <section class="tela-lancar">
      <div class="segmentos" role="tablist" aria-label="Tipo de lançamento">
        {(
          [
            ['despesa', 'Gasto'],
            ['receita', 'Entrada'],
            ['transferencia', 'Transferência'],
          ] as Array<[Aba, string]>
        ).map(([v, t]) => (
          <button key={v} type="button" role="tab" aria-selected={aba === v} class={aba === v ? 'ativo' : ''} onClick={() => setAba(v)}>
            {t}
          </button>
        ))}
      </div>

      <button type="button" class="valor-grande" aria-label={`Valor: ${formatarBRL(centavos / 100)}. Tocar para editar`} onClick={() => setTecladoAberto(true)}>
        {formatarBRL(centavos / 100)}
      </button>

      {tecladoAberto && (
        <div class="teclado" aria-label="Teclado numérico">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'].map((t) => (
            <button key={t} type="button" class="tecla" aria-label={t === '⌫' ? 'Apagar' : t} onClick={() => tecla(t)}>
              {t}
            </button>
          ))}
        </div>
      )}

      {tipo !== 'transferencia' && (
        <div class="campo">
          <label for="onde">Onde?</label>
          <input
            id="onde"
            type="text"
            autocomplete="off"
            enterKeyHint="done"
            placeholder={tipo === 'despesa' ? 'ex.: farmácia, ifood, mercado' : 'ex.: salário, reembolso'}
            value={onde}
            onFocus={() => setTecladoAberto(false)}
            onInput={(e) => {
              setOnde((e.target as HTMLInputElement).value);
              setManual(null);
            }}
          />
          {recentes.length > 0 && (
            <div class="chips sugestoes">
              {recentes.map((l) => (
                <button key={l.id} type="button" class="chip chip-leve" onClick={() => escolherRecente(l)}>
                  {l.descricao}
                </button>
              ))}
            </div>
          )}
          <p class="linha-regra">
            {categoria ? (
              <>
                {manual ? 'Escolhida: ' : sugestao.fonte === 'regra' ? 'Pela regra: ' : 'Sugestão: '}
                <strong>
                  {categoria}
                  {subcategoria ? ` › ${subcategoria}` : ''}
                </strong>
                {natureza ? ` · ${NOME_NATUREZA[natureza]}` : ''}
              </>
            ) : (
              <span class="discreto">Sem categoria</span>
            )}
            <button type="button" class="botao-link" onClick={() => setEscolhendoCat(true)}>
              {categoria ? 'trocar' : 'escolher'}
            </button>
          </p>
          {manual?.categoria && onde.trim() && (
            <label class="caixa">
              <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar((e.target as HTMLInputElement).checked)} />
              Lembrar para "{padraoSugerido(onde)}" (cria uma regra)
            </label>
          )}
        </div>
      )}

      <Chips
        rotulo={tipo === 'receita' ? 'Entrou em' : tipo === 'transferencia' ? 'Sai de' : 'Pagou com'}
        opcoes={contas.map((c) => ({ valor: c.id, texto: c.nome, cor: c.cor }))}
        valor={conta}
        aoEscolher={setContaId}
      />
      {tipo === 'transferencia' && (
        <Chips
          rotulo="Vai para"
          opcoes={contas.filter((c) => c.id !== conta).map((c) => ({ valor: c.id, texto: c.nome, cor: c.cor }))}
          valor={destinoId}
          aoEscolher={setDestinoId}
        />
      )}
      {faturaAlvo && (
        <div class="cartao info-fatura">
          <p>
            Paga a fatura de <strong>{nomeFatura(faturaAlvo)}</strong> (vence {ddmm(faturaAlvo.data_vencimento)}): falta{' '}
            <strong>{formatarBRL(devidoAlvo)}</strong>.
          </p>
          {Math.round(devidoAlvo * 100) !== centavos && devidoAlvo > 0 && (
            <button type="button" class="botao-link" onClick={() => setCentavos(Math.round(devidoAlvo * 100))}>Usar o valor da fatura</button>
          )}
        </div>
      )}
      <Chips
        rotulo="Quem"
        opcoes={[
          { valor: 'pessoa1' as Pessoa, texto: pessoas.pessoa1 },
          { valor: 'pessoa2' as Pessoa, texto: pessoas.pessoa2 },
          { valor: 'casal' as Pessoa, texto: 'Casal' },
        ]}
        valor={quem}
        aoEscolher={setQuem}
      />

      <div class="linha-data">
        <span>
          Data: <strong>{data === hoje ? 'Hoje' : ddmm(data)}</strong>
        </span>
        {mudandoData ? (
          <input
            type="date"
            aria-label="Data"
            value={data}
            onChange={(e) => {
              const v = (e.target as HTMLInputElement).value;
              if (v) setData(v);
            }}
          />
        ) : (
          <button type="button" class="botao-link" onClick={() => setMudandoData(true)}>mudar</button>
        )}
      </div>

      <p class="discreto frase-status">{fraseStatus}</p>

      <details class="mais-detalhes">
        <summary>Mais detalhes</summary>
        {tipoConta === 'cartao' && tipo === 'despesa' && (
          <div class="campo">
            <label for="parcelas">Parcelas</label>
            <select id="parcelas" value={parcelas} onChange={(e) => setParcelas(Number((e.target as HTMLSelectElement).value))}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}× de ${formatarBRL(Math.floor(centavos / n) / 100)}`}</option>
              ))}
            </select>
          </div>
        )}
        {tipo === 'receita' && (
          <label class="caixa">
            <input type="checkbox" checked={emprestimo} onChange={(e) => setEmprestimo((e.target as HTMLInputElement).checked)} />
            É empréstimo recebido (entra no saldo, mas não conta como renda)
          </label>
        )}
        <div class="campo">
          <label for="projeto">Projeto ou área</label>
          <select id="projeto" value={projeto} onChange={(e) => setProjeto((e.target as HTMLSelectElement).value)}>
            <option value="">Nenhum</option>
            {p.projetosAreas.some((x) => x.tipo === 'projeto') && (
              <optgroup label="Projetos">
                {p.projetosAreas.filter((x) => x.tipo === 'projeto').map((x) => (
                  <option key={x.nome} value={x.nome}>{x.nome}</option>
                ))}
              </optgroup>
            )}
            {p.projetosAreas.some((x) => x.tipo === 'area') && (
              <optgroup label="Áreas">
                {p.projetosAreas.filter((x) => x.tipo === 'area').map((x) => (
                  <option key={x.nome} value={x.nome}>{x.nome}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <div class="campo">
          <label for="tags">Tags</label>
          <input id="tags" type="text" placeholder="separadas por vírgula" value={tags} onInput={(e) => setTags((e.target as HTMLInputElement).value)} />
        </div>
        <div class="campo">
          <label for="obs">Observação</label>
          <input id="obs" type="text" value={obs} onInput={(e) => setObs((e.target as HTMLInputElement).value)} />
        </div>
        <div class="campo">
          <label for="status">Status</label>
          <select id="status" value={statusManual || status} onChange={(e) => setStatusManual((e.target as HTMLSelectElement).value as StatusLancamento)}>
            {(['previsto', 'agendado', 'realizado'] as StatusLancamento[]).map((s) => (
              <option key={s} value={s}>{NOME_STATUS[s]}</option>
            ))}
          </select>
        </div>
        <p class="discreto">Anexar comprovante chega no marco M7.</p>
      </details>

      <div class="campo frase-inteira">
        <label for="frase">Escrever tudo de uma vez</label>
        <div class="linha-frase">
          <input
            id="frase"
            type="text"
            placeholder="ex.: 45 farmácia azul ontem"
            value={frase}
            onFocus={() => setTecladoAberto(false)}
            onInput={(e) => setFrase((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && frase.trim() && usarFrase()}
          />
          <button type="button" class="botao-secundario botao-curto" disabled={!frase.trim()} onClick={usarFrase}>Usar</button>
        </div>
      </div>

      {erro && <p class="erro-campo" role="alert">{erro}</p>}

      {pergunta && (
        <div class="cartao pergunta" role="alertdialog" aria-label="Lançamento previsto parecido">
          <p>
            É <strong>{pergunta.previsto.descricao || 'o lançamento previsto'}</strong> (previsão de{' '}
            {nomeDia(pergunta.previsto.data_competencia, hoje)}, {formatarBRL(pergunta.previsto.valor)})?
          </p>
          <div class="linha-botoes">
            <button type="button" class="botao-primario" disabled={salvando}
              onClick={() => gravar(pergunta.lancamento, { ...pergunta.extra, casarCom: pergunta.previsto })}>Sim</button>
            <button type="button" class="botao-secundario" disabled={salvando}
              onClick={() => gravar(pergunta.lancamento, pergunta.extra)}>Não, é outro</button>
          </div>
        </div>
      )}

      <div class="barra-salvar">
        <button type="button" class="botao-primario" disabled={salvando || Boolean(pergunta)} onClick={salvar}>
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>

      {dividaDe && <FormDivida emprestimo={dividaDe} fechar={() => { setDividaDe(null); p.aoTerminar(); }} />}

      {escolhendoCat && (
        <EscolherCategoria
          categorias={base.categorias}
          tipo={tipo}
          fechar={() => setEscolhendoCat(false)}
          aoEscolher={(cat, sub) => {
            const c = base.categorias.find((x) => x.categoria === cat && (x.subcategoria ?? null) === sub);
            const geral = base.categorias.find((x) => x.categoria === cat && !x.subcategoria);
            setManual({ categoria: cat, subcategoria: sub, natureza: c?.natureza_padrao || geral?.natureza_padrao || null });
            setEscolhendoCat(false);
          }}
        />
      )}
    </section>
  );
}
