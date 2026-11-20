import { useState } from 'preact/hooks';
import { previstosVencidos } from '../domain/casamento';
import { ddmm } from '../domain/dates';
import { pagamentosDaFatura, totalFatura } from '../domain/faturas';
import { formatarBRL } from '../domain/money';
import { lerParametroNumero } from '../domain/parametros';
import { padraoSugerido } from '../domain/regras';
import type { Lancamento, RegistroGenerico } from '../domain/types';
import { EscolherCategoria, useToast } from './comum';
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
              aceitar={() => rodar(() => app.aceitarCaixa(item), 'Lançado')}
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

      {categorizando && (
        <EscolherCategoria
          categorias={base.categorias}
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

function ItemNovo({ item, ocupado, categorizar, aceitar, descartar }: { item: RegistroGenerico; ocupado: boolean; categorizar: () => void; aceitar: () => void; descartar: () => void }) {
  const [, app] = useApp();
  const p = app.previaCaixa(item);
  const transf = p.tipo === 'transferencia';
  const sinal = p.tipo === 'receita' ? '+' : p.tipo === 'despesa' ? '−' : '';
  return (
    <li class="item-novo">
      <div class="textos-linha">
        <span class="descricao-linha">{p.descricao}</span>
        <span class="detalhe-linha">{ddmm(p.data)} · {String(item.texto)}</span>
        {transf ? (
          <span class="detalhe-linha">Transferência (pagamento de fatura ou entre contas)</span>
        ) : (
          <button type="button" class={`chip chip-pequeno${!p.categoria || p.categoria === 'Sem categoria' ? ' chip-alerta' : ''}`} onClick={categorizar}>
            {p.categoria && p.categoria !== 'Sem categoria' ? `${p.categoria}${p.subcategoria ? ` › ${p.subcategoria}` : ''}` : 'Sem categoria · escolher'}
          </button>
        )}
      </div>
      <div class="acoes-novo">
        <span class={`valor-linha${p.tipo === 'receita' ? ' entrada' : ''}`}>{sinal}{formatarBRL(p.valor ?? 0)}</span>
        <div>
          <button type="button" class="botao-icone" aria-label={`Aceitar ${p.descricao}`} disabled={ocupado} onClick={aceitar}>✓</button>
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
  return (
    <div class="cartao">
      <p><strong>{String(item.texto)}</strong> <span class="discreto">({String(item.fonte || 'externo')})</span></p>
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
