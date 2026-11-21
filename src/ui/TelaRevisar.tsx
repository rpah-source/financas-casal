import { useState } from 'preact/hooks';
import { previstosVencidos } from '../domain/casamento';
import { ddmm } from '../domain/dates';
import { pagamentosDaFatura, totalFatura } from '../domain/faturas';
import { formatarBRL } from '../domain/money';
import { lerParametroNumero } from '../domain/parametros';
import { padraoSugerido } from '../domain/regras';
import type { Lancamento, RegistroGenerico } from '../domain/types';
import { EscolherCategoria, Folha, useToast } from './comum';
import { FormDivida } from './Divida';
import { lerPessoas } from '../domain/parametros';
import type { PreviaCaixa } from '../domain/importacao/caixa';
import { nomeFatura } from './Fatura';
import { useApp } from './useApp';

const CHAVE_MANTIDOS = 'fc.mantidos';
function lerMantidos(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE_MANTIDOS) ?? '[]'));
  } catch {
    return new Set();
  }
}

/**
 * Revisar (SPEC 10.4): o que veio de faturas/extratos, previstos vencidos e
 * itens da caixa de entrada. Nada entra no extrato sem confirmação.
 */
export function TelaRevisar({ voltar, importar }: { voltar: () => void; importar: () => void }) {
  const [estado, app] = useApp();
  const { base, hoje, ultimaImportacao } = estado;
  const toast = useToast();
  const [categorizando, setCategorizando] = useState<RegistroGenerico | null>(null);
  const [ofertaRegra, setOfertaRegra] = useState<{ padrao: string; categoria: string; subcategoria: string | null; contaId: string } | null>(null);
  const [mantidos, setMantidos] = useState(lerMantidos);
  const [ocupado, setOcupado] = useState(false);
  const [aberto, setAberto] = useState<RegistroGenerico | null>(null);
  const [dividaDe, setDividaDe] = useState<Lancamento | null>(null);
  if (!base) return <p class="discreto">Carregando…</p>;

  const janela = lerParametroNumero(base.parametros, 'conciliacao.janela_dias', hoje, 5);
  const vencidos = previstosVencidos(base.lancamentos, hoje, janela);
  const pendentes = base.caixaEntrada.filter((c) => (c.status ?? 'novo') === 'novo' && !c.excluido);
  const sugestoes = pendentes.filter((c) => c.fonte === 'importacao' && c.lancamento_id);
  const novos = pendentes.filter((c) => c.fonte === 'importacao' && !c.lancamento_id);
  const externos = pendentes.filter((c) => c.fonte !== 'importacao');
  const conta = (id: unknown) => base.contas.find((c) => c.id === id);
  const lanc = (id: unknown) => base.lancamentos.find((l) => l.id === id);

  // Lançados no app, mas não estão na fatura (da última importação de cartão).
  const ultimaImp = [...base.importacoes].reverse().find((i) => i.fatura_id);
  const faturaUlt = ultimaImp ? base.faturas.find((f) => f.id === ultimaImp.fatura_id) : undefined;
  const idsSessao = new Set(ultimaImportacao?.naoEncontrados ?? []);
  const naoEncontrados = base.lancamentos.filter((l) => {
    if (l.excluido || l.conciliado || mantidos.has(l.id) || l.tipo === 'transferencia') return false;
    if (idsSessao.has(l.id)) return true;
    return Boolean(faturaUlt) && l.fatura_id === faturaUlt!.id && ['manual', 'texto'].includes(l.origem ?? 'manual') && l.status !== 'previsto';
  });

  async function rodar(f: () => Promise<unknown>, msg?: string) {
    setOcupado(true);
    try {
      await f();
      if (msg) toast({ texto: msg });
    } catch (e) {
      toast({ texto: e instanceof Error ? e.message : 'Não deu certo.' });
    } finally {
      setOcupado(false);
    }
  }

  function manter(l: Lancamento) {
    const n = new Set(mantidos).add(l.id);
    setMantidos(n);
    try {
      localStorage.setItem(CHAVE_MANTIDOS, JSON.stringify([...n]));
    } catch {
      // sem persistência
    }
  }

  return (
    <section>
      <div class="topo-tela">
        <h1 class="titulo-tela">Revisar</h1>
        <button type="button" class="botao-link" onClick={voltar}>Voltar</button>
      </div>

      <button type="button" class="botao-secundario" onClick={importar}>Trazer outra fatura ou extrato</button>

      {ultimaImportacao && (
        <div class="cartao">
          <p class="contadores">
            <span><strong>{ultimaImportacao.casados}</strong> já batiam</span>
            <span><strong>{sugestoes.length}</strong> para confirmar</span>
            <span><strong>{novos.length}</strong> novos</span>
            {ultimaImportacao.ignorados > 0 && <span><strong>{ultimaImportacao.ignorados}</strong> já importados</span>}
          </p>
          {faturaUlt && ultimaImportacao.faturaId === faturaUlt.id && ultimaImportacao.total !== undefined && (
            <p class="discreto">
              Fatura de {nomeFatura(faturaUlt)}: no banco {formatarBRL(ultimaImportacao.total)} · no app{' '}
              {formatarBRL(totalFatura(faturaUlt, base.lancamentos).total - pagamentosDaFatura(faturaUlt, base.lancamentos))} (fica igual depois de aceitar os itens abaixo).
            </p>
          )}
          {ultimaImportacao.doc && <p class="discreto"><a href={ultimaImportacao.doc} target="_blank" rel="noopener">Ver o arquivo original no Drive</a></p>}
        </div>
      )}

      {vencidos.length === 0 && pendentes.length === 0 && naoEncontrados.length === 0 && (
        <div class="cartao"><p>Nada para revisar agora.</p></div>
      )}

      {sugestoes.length > 0 && (
        <>
          <h2 class="titulo-dia">Para confirmar</h2>
          {sugestoes.map((s) => {
            const c = lanc(s.lancamento_id);
            return (
              <div key={String(s.id)} class="cartao">
                <p><span class="discreto">No banco:</span> <strong>{String(s.texto)}</strong> · {formatarBRL(Number(s.valor))} · {ddmm(String(s.data))}</p>
                {c ? (
                  <p><span class="discreto">Parece ser:</span> <strong>{c.descricao || c.categoria}</strong> · {formatarBRL(c.valor)} · {ddmm(c.data_competencia)} · {conta(c.conta_id)?.nome}</p>
                ) : (
                  <p class="discreto">O lançamento sugerido não existe mais.</p>
                )}
                <div class="linha-botoes">
                  <button type="button" class="botao-primario" disabled={ocupado || !c} onClick={() => rodar(() => app.confirmarSugestao(s), 'Conciliado')}>É esse</button>
                  <button type="button" class="botao-secundario" disabled={ocupado} onClick={() => rodar(() => app.rejeitarSugestao(s))}>Não, é outro</button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {novos.length > 0 && (
        <>
          <div class="topo-tela">
            <h2 class="titulo-dia">Novos ({novos.length})</h2>
            <button type="button" class="botao-link" disabled={ocupado} onClick={() => rodar(async () => {
              const n = await app.aceitarVarios(novos);
              toast({ texto: `${n} lançamentos aceitos` });
            })}>Aceitar todos</button>
          </div>
          {ofertaRegra && (
            <div class="cartao pergunta">
              <p>Criar regra para "<strong>{ofertaRegra.padrao}</strong>" → {ofertaRegra.categoria}{ofertaRegra.subcategoria ? ` › ${ofertaRegra.subcategoria}` : ''}?</p>
              <div class="linha-botoes">
                <button type="button" class="botao-primario" onClick={() => rodar(async () => {
                  await app.criarRegra({ padrao: ofertaRegra.padrao, categoria: ofertaRegra.categoria, subcategoria: ofertaRegra.subcategoria });
                  setOfertaRegra(null);
                }, 'Regra criada')}>Criar regra</button>
                <button type="button" class="botao-secundario" onClick={() => setOfertaRegra(null)}>Agora não</button>
              </div>
            </div>
          )}
          <ul class="lista-lancamentos">
            {novos.map((item) => <ItemNovo key={String(item.id)} item={item} ocupado={ocupado}
              categorizar={() => setCategorizando(item)}
              abrir={() => setAberto(item)}
              aceitar={(aj) => rodar(async () => {
                const l = await app.aceitarCaixa(item, aj);
                if (app.previaCaixa(item).emprestimo) setDividaDe(l);
              }, 'Lançado')}
              descartar={() => rodar(() => app.descartarCaixa(item), 'Descartado')} />)}
          </ul>
        </>
      )}

      {naoEncontrados.length > 0 && (
        <>
          <h2 class="titulo-dia">Lançados no app, mas não estão na fatura</h2>
          {naoEncontrados.map((l) => (
            <div key={l.id} class="cartao">
              <p><strong>{l.descricao || l.categoria}</strong> · {formatarBRL(l.valor)} · {ddmm(l.data_competencia)} · {conta(l.conta_id)?.nome}</p>
              <div class="linha-botoes tres">
                <button type="button" class="botao-secundario" onClick={() => manter(l)}>Manter</button>
                <button type="button" class="botao-secundario" disabled={ocupado} onClick={() => rodar(async () => {
                  await app.excluir(l);
                  toast({ texto: 'Excluído', acao: { rotulo: 'Desfazer', f: () => void app.desfazerExclusao(l) } });
                })}>Excluir</button>
                <MoverFatura l={l} />
              </div>
            </div>
          ))}
        </>
      )}

      {vencidos.length > 0 && (
        <>
          <h2 class="titulo-dia">Isso aconteceu?</h2>
          {vencidos.map((l) => (
            <div key={l.id} class="cartao">
              <p><strong>{l.descricao || l.categoria}</strong> · {formatarBRL(l.valor)}</p>
              <p class="discreto">Previsto para {ddmm(l.data_competencia)} · {conta(l.conta_id)?.nome}</p>
              <div class="linha-botoes tres">
                <button type="button" class="botao-primario" onClick={() => rodar(() => app.resolverVencido(l, 'sim'), 'Lançado como realizado')}>Sim</button>
                <button type="button" class="botao-secundario" onClick={() => rodar(() => app.resolverVencido(l, 'nao'), 'Marcado como não aconteceu')}>Não</button>
                <button type="button" class="botao-secundario" onClick={() => rodar(() => app.resolverVencido(l, 'adiar'), 'Adiado')}>Adiar</button>
              </div>
            </div>
          ))}
        </>
      )}

      {externos.length > 0 && (
        <>
          <h2 class="titulo-dia">Caixa de entrada</h2>
          {externos.map((item) => <ItemExterno key={String(item.id)} item={item} ocupado={ocupado} rodar={rodar} />)}
        </>
      )}

      {aberto && (
        <FolhaItem
          item={aberto}
          fechar={() => setAberto(null)}
          aposAceitar={(l) => {
            setAberto(null);
            if (app.previaCaixa(aberto).emprestimo || l.categoria === 'Empréstimo') setDividaDe(l);
          }}
        />
      )}
      {dividaDe && <FormDivida emprestimo={dividaDe} fechar={() => setDividaDe(null)} />}

      {categorizando && (
        <EscolherCategoria
          categorias={base.categorias}
          tipo={app.previaCaixa(categorizando).tipo}
          fechar={() => setCategorizando(null)}
          aoEscolher={(cat, sub) => {
            const item = categorizando;
            setCategorizando(null);
            void rodar(async () => {
              await app.categorizarCaixa(item, cat, sub);
              const padrao = padraoSugerido(String(item.texto ?? ''));
              if (padrao) setOfertaRegra({ padrao, categoria: cat, subcategoria: sub, contaId: String(item.conta_id ?? '') });
            });
          }}
        />
      )}
    </section>
  );
}

function ItemNovo({ item, ocupado, categorizar, aceitar, descartar, abrir }: { item: RegistroGenerico; ocupado: boolean; categorizar: () => void; aceitar: (ajustes?: Partial<PreviaCaixa>) => void; descartar: () => void; abrir: () => void }) {
  const [{ base }, app] = useApp();
  const p = app.previaCaixa(item);
  const transf = p.tipo === 'transferencia';
  const faltaOrigem = transf && !p.contaId;
  const faltaDestino = transf && !p.contaDestinoId;
  const [outra, setOutra] = useState('');
  const sinal = p.tipo === 'receita' ? '+' : p.tipo === 'despesa' ? '−' : '';
  const nome = (id: string | null) => base!.contas.find((c) => c.id === id)?.nome ?? '?';
  const ajustes: Partial<PreviaCaixa> = faltaOrigem ? { contaId: outra } : faltaDestino ? { contaDestinoId: outra } : {};
  return (
    <li class="item-novo">
      <div class="textos-linha">
        <button type="button" class="botao-texto textos-linha" onClick={abrir} aria-label={`Abrir ${String(item.texto)}`}>
          <span class="descricao-linha">{p.descricao}</span>
          <span class="detalhe-linha">{ddmm(p.data)} · {String(item.texto)}</span>
        </button>
        {transf ? (
          faltaOrigem || faltaDestino ? (
            <label class="detalhe-linha">
              Transferência {faltaOrigem ? `para ${nome(p.contaDestinoId)}, vinda de:` : `de ${nome(p.contaId)} para:`}{' '}
              <select value={outra} onChange={(e) => setOutra((e.target as HTMLSelectElement).value)}>
                <option value="">escolha</option>
                {base!.contas.filter((c) => c.ativa !== false && c.id !== (p.contaId ?? p.contaDestinoId)).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          ) : (
            <span class="detalhe-linha">Transferência: {nome(p.contaId)} → {nome(p.contaDestinoId)}</span>
          )
        ) : (
          <button type="button" class={`chip chip-pequeno${!p.categoria || p.categoria === 'Sem categoria' ? ' chip-alerta' : ''}`} onClick={categorizar}>
            {p.categoria && p.categoria !== 'Sem categoria' ? `${p.categoria}${p.subcategoria ? ` › ${p.subcategoria}` : ''}` : 'Sem categoria · escolher'}
          </button>
        )}
        {p.emprestimo && <span class="detalhe-linha">Empréstimo recebido: entra no saldo, não conta como renda.</span>}
      </div>
      <div class="acoes-novo">
        <span class={`valor-linha${p.tipo === 'receita' ? ' entrada' : ''}`}>{sinal}{formatarBRL(p.valor ?? 0)}</span>
        <div>
          <button type="button" class="botao-icone" aria-label={`Aceitar ${p.descricao}`} disabled={ocupado || ((faltaOrigem || faltaDestino) && !outra)} onClick={() => aceitar(ajustes)}>✓</button>
          <button type="button" class="botao-icone" aria-label={`Descartar ${p.descricao}`} disabled={ocupado} onClick={descartar}>✕</button>
        </div>
      </div>
    </li>
  );
}

function ItemExterno({ item, ocupado, rodar }: { item: RegistroGenerico; ocupado: boolean; rodar: (f: () => Promise<unknown>, msg?: string) => Promise<void> }) {
  const [{ base }, app] = useApp();
  const p = app.previaCaixa(item);
  const [contaId, setContaId] = useState(p.contaId ?? '');
  const parecido = app.lancamentoParecido(item, contaId || null);
  return (
    <div class="cartao">
      <p><strong>{String(item.texto)}</strong> <span class="discreto">({String(item.fonte || 'externo')})</span></p>
      {parecido && (
        <div class="cartao pergunta">
          <p>Parece ser: <strong>{parecido.descricao || parecido.categoria}</strong> · {formatarBRL(parecido.valor)} · {ddmm(parecido.data_competencia)}, já lançado.</p>
          <div class="linha-botoes">
            <button type="button" class="botao-primario" disabled={ocupado} onClick={() => rodar(() => app.vincularCaixa(item, parecido), item.doc ? 'Comprovante ligado ao lançamento' : 'Marcado como já lançado')}>É esse</button>
            <span class="discreto">Se não for, use Aceitar abaixo.</span>
          </div>
        </div>
      )}
      <p class="discreto">
        Entendi: {p.valor ? formatarBRL(p.valor) : 'sem valor'} · {ddmm(p.data)} · {p.descricao}
        {p.categoria ? ` · ${p.categoria}${p.subcategoria ? ` › ${p.subcategoria}` : ''}` : ''}
      </p>
      {!p.contaId && (
        <div class="campo">
          <label for={`cx-${item.id}`}>Conta</label>
          <select id={`cx-${item.id}`} value={contaId} onChange={(e) => setContaId((e.target as HTMLSelectElement).value)}>
            <option value="">Escolha</option>
            {base!.contas.filter((c) => c.ativa !== false).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
      )}
      <div class="linha-botoes">
        <button type="button" class="botao-primario" disabled={ocupado || !p.valor || !contaId} onClick={() => rodar(() => app.aceitarCaixa(item, { contaId }), 'Lançado')}>Aceitar</button>
        <button type="button" class="botao-secundario" disabled={ocupado} onClick={() => rodar(() => app.descartarCaixa(item), 'Descartado')}>Descartar</button>
      </div>
    </div>
  );
}

function MoverFatura({ l }: { l: Lancamento }) {
  const [{ base }, app] = useApp();
  const outras = base!.faturas.filter((f) => f.cartao_id === l.conta_id && f.id !== l.fatura_id && f.status !== 'paga' && !f.excluido);
  if (!outras.length) return <button type="button" class="botao-secundario" disabled>Mover</button>;
  return (
    <label class="botao-secundario chip-select">
      Mover
      <select aria-label="Mover para outra fatura" value="" onChange={(e) => {
        const f = outras.find((x) => x.id === (e.target as HTMLSelectElement).value);
        if (f) void app.editar({ ...l, fatura_id: f.id, data_caixa: f.data_vencimento, conciliado: false });
      }}>
        <option value="">Escolha a fatura</option>
        {outras.map((f) => <option key={f.id} value={f.id}>{nomeFatura(f)}</option>)}
      </select>
    </label>
  );
}

/** Item da revisão aberto por inteiro: texto completo do banco e campos para ajustar antes de aceitar. */
function FolhaItem({ item, fechar, aposAceitar }: { item: RegistroGenerico; fechar: () => void; aposAceitar: (l: Lancamento) => void }) {
  const [{ base, hoje }, app] = useApp();
  const toast = useToast();
  const p = app.previaCaixa(item);
  const pessoas = lerPessoas(base!.parametros, hoje);
  const [descricao, setDescricao] = useState(p.descricao);
  const [cat, setCat] = useState<{ categoria: string | null; subcategoria: string | null }>({ categoria: p.categoria, subcategoria: p.subcategoria });
  const [quem, setQuem] = useState(p.quem);
  const [contaId, setContaId] = useState(p.contaId ?? '');
  const [destinoId, setDestinoId] = useState(p.contaDestinoId ?? '');
  const [escolhendo, setEscolhendo] = useState(false);
  const [regra, setRegra] = useState(false);
  const [erro, setErro] = useState('');
  const transf = p.tipo === 'transferencia';
  const contas = base!.contas.filter((c) => c.ativa !== false);
  const nomeTipo = transf ? 'Transferência' : p.emprestimo ? 'Empréstimo recebido' : p.tipo === 'receita' ? 'Entrada' : 'Gasto';

  async function aceitar() {
    try {
      if (regra && cat.categoria) {
        const padrao = padraoSugerido(String(item.texto ?? ''));
        if (padrao) await app.criarRegra({ padrao, descricao, categoria: cat.categoria, subcategoria: cat.subcategoria });
      }
      const l = await app.aceitarCaixa(item, {
        descricao, quem, categoria: cat.categoria, subcategoria: cat.subcategoria,
        ...(transf ? { contaId: contaId || null, contaDestinoId: destinoId || null } : contaId ? { contaId } : {}),
      });
      toast({ texto: 'Lançado' });
      aposAceitar(l);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui lançar.');
    }
  }

  return (
    <Folha titulo={nomeTipo} fechar={fechar}>
      <div class="cartao">
        <p class="discreto">Como veio do banco</p>
        <p><strong>{String(item.texto)}</strong></p>
        <p>{formatarBRL(p.valor ?? 0)} · {ddmm(p.data)}</p>
      </div>
      <div class="campo">
        <label for="fi-desc">Descrição no app</label>
        <input id="fi-desc" type="text" value={descricao} onInput={(e) => setDescricao((e.target as HTMLInputElement).value)} />
      </div>
      {transf ? (
        <div class="linha-botoes">
          <div class="campo">
            <label for="fi-de">Sai de</label>
            <select id="fi-de" value={contaId} onChange={(e) => setContaId((e.target as HTMLSelectElement).value)}>
              <option value="">Escolha</option>
              {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div class="campo">
            <label for="fi-para">Vai para</label>
            <select id="fi-para" value={destinoId} onChange={(e) => setDestinoId((e.target as HTMLSelectElement).value)}>
              <option value="">Escolha</option>
              {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        </div>
      ) : (
        <>
          <div class="campo">
            <span class="rotulo">Categoria</span>
            <button type="button" class="botao-campo" onClick={() => setEscolhendo(true)}>
              {cat.categoria ? `${cat.categoria}${cat.subcategoria ? ` › ${cat.subcategoria}` : ''}` : 'Escolher'}
            </button>
          </div>
          <label class="caixa">
            <input type="checkbox" checked={regra} onChange={(e) => setRegra((e.target as HTMLInputElement).checked)} />
            Lembrar para "{padraoSugerido(String(item.texto ?? ''))}" (cria uma regra)
          </label>
          <div class="campo">
            <label for="fi-conta">Conta</label>
            <select id="fi-conta" value={contaId} onChange={(e) => setContaId((e.target as HTMLSelectElement).value)}>
              {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
        </>
      )}
      <div class="campo">
        <label for="fi-quem">Quem</label>
        <select id="fi-quem" value={quem} onChange={(e) => setQuem((e.target as HTMLSelectElement).value as typeof quem)}>
          <option value="pessoa1">{pessoas.pessoa1}</option>
          <option value="pessoa2">{pessoas.pessoa2}</option>
          <option value="casal">Casal</option>
        </select>
      </div>
      {p.emprestimo && <p class="discreto">Empréstimo: entra no saldo, não conta como renda. Depois de lançar, o app pergunta as parcelas.</p>}
      {erro && <p class="erro-campo" role="alert">{erro}</p>}
      <button type="button" class="botao-primario" onClick={aceitar}>Lançar</button>
      <button type="button" class="botao-secundario" onClick={async () => { await app.descartarCaixa(item); toast({ texto: 'Descartado' }); fechar(); }}>Descartar</button>
      {escolhendo && (
        <EscolherCategoria categorias={base!.categorias} tipo={p.tipo} fechar={() => setEscolhendo(false)}
          aoEscolher={(c, sub) => { setCat({ categoria: c, subcategoria: sub }); setRegra(true); setEscolhendo(false); }} />
      )}
    </Folha>
  );
}
