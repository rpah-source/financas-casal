import { useMemo, useRef, useState } from 'preact/hooks';
import { nomeMesLongo, partesData } from '../domain/dates';
import { agruparPorDia, filtrarLancamentos, totalFiltro, type FiltroExtrato } from '../domain/filtros';
import { formatarBRL } from '../domain/money';
import { lerPessoas } from '../domain/parametros';
import type { Lancamento } from '../domain/types';
import { DetalheLancamento } from './DetalheLancamento';
import { NOME_NATUREZA, NOME_ORIGEM, NOME_STATUS, nomePessoa, PontoStatus, useToast } from './comum';
import { useApp } from './useApp';

const CHAVE_FILTROS = 'fc.filtros';
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function lerFiltros(mesAtual: string): FiltroExtrato {
  try {
    const f = JSON.parse(localStorage.getItem(CHAVE_FILTROS) ?? 'null');
    if (f && typeof f.mes === 'string') return f;
  } catch {
    // sem filtros salvos
  }
  return { mes: mesAtual };
}

/** Extrato com filtros (SPEC 10.3). */
export function TelaExtrato({ importar }: { importar: () => void }) {
  const [estado, app] = useApp();
  const { base, hoje } = estado;
  const toast = useToast();
  const [filtro, setFiltroBruto] = useState<FiltroExtrato>(() => lerFiltros(hoje.slice(0, 7)));
  const [buscando, setBuscando] = useState(Boolean(filtro.busca));
  const [aberto, setAberto] = useState<Lancamento | null>(null);

  const setFiltro = (f: FiltroExtrato) => {
    setFiltroBruto(f);
    try {
      localStorage.setItem(CHAVE_FILTROS, JSON.stringify(f));
    } catch {
      // sem persistência
    }
  };
  const mudar = (p: Partial<FiltroExtrato>) => setFiltro({ ...filtro, ...p });

  const lista = useMemo(() => (base ? filtrarLancamentos(base.lancamentos, filtro) : []), [base, filtro]);
  if (!base) return <p class="discreto">Carregando…</p>;

  const pessoas = lerPessoas(base.parametros, hoje);
  const contaPorId = new Map(base.contas.map((c) => [c.id, c]));
  const nomeTipo: Record<string, string> = { despesa: 'Gastos', receita: 'Entradas', transferencia: 'Transferências' };
  const categoriasAgrupadas: Array<[string, string, string]> = [];
  for (const c of base.categorias.filter((c) => c.ativa !== false)) {
    if (!categoriasAgrupadas.some(([v]) => v === c.categoria)) categoriasAgrupadas.push([c.categoria, c.categoria, nomeTipo[c.tipo ?? 'despesa']]);
  }
  const { total, itens } = totalFiltro(lista);
  const { ano, mes } = partesData(`${filtro.mes}-01`);

  const ativos: string[] = [];
  if (filtro.quem) ativos.push(nomePessoa(filtro.quem, pessoas));
  if (filtro.contaId) ativos.push(contaPorId.get(filtro.contaId)?.nome ?? 'conta');
  if (filtro.categoria) ativos.push(filtro.categoria);
  if (filtro.natureza) ativos.push(NOME_NATUREZA[filtro.natureza]);
  if (filtro.status) ativos.push(NOME_STATUS[filtro.status]);
  if (filtro.origem) ativos.push(NOME_ORIGEM[filtro.origem]);
  if (filtro.naoConciliados) ativos.push('não conciliados');
  if (filtro.semCategoria) ativos.push('sem categoria');
  if (filtro.busca) ativos.push(`"${filtro.busca}"`);

  const andarMes = (delta: number) => {
    const d = new Date(Date.UTC(ano, mes - 1 + delta, 1));
    mudar({ mes: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` });
  };

  async function excluir(l: Lancamento) {
    await app.excluir(l).catch(() => {});
    toast({ texto: 'Excluído', acao: { rotulo: 'Desfazer', f: () => void app.desfazerExclusao(l) } });
  }
  async function duplicar(l: Lancamento) {
    const d = await app.duplicar(l).catch(() => null);
    if (d) toast({ texto: 'Duplicado para hoje', acao: { rotulo: 'Desfazer', f: () => void app.excluir(d) } });
  }

  return (
    <section>
      <div class="topo-tela">
        <h1 class="titulo-tela">Extrato</h1>
        <button type="button" class="botao-link" onClick={importar}>Importar</button>
        <button type="button" class="botao-icone" aria-label="Buscar" aria-pressed={buscando} onClick={() => setBuscando(!buscando)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
        </button>
      </div>

      {buscando && (
        <input
          class="campo-busca"
          type="search"
          aria-label="Buscar no extrato"
          placeholder="Buscar descrição, categoria, observação…"
          value={filtro.busca ?? ''}
          onInput={(e) => mudar({ busca: (e.target as HTMLInputElement).value })}
        />
      )}

      <div class="seletor-mes">
        <button type="button" class="botao-icone" aria-label="Mês anterior" onClick={() => andarMes(-1)}>‹</button>
        <span>{nomeMesLongo(mes)} {ano}</span>
        <button type="button" class="botao-icone" aria-label="Próximo mês" onClick={() => andarMes(1)}>›</button>
      </div>

      <div class="chips filtros" role="group" aria-label="Filtros">
        <FiltroSelect rotulo="Pessoa" valor={filtro.quem ?? ''} aoMudar={(v) => mudar({ quem: v as FiltroExtrato['quem'] })}
          opcoes={[['pessoa1', pessoas.pessoa1], ['pessoa2', pessoas.pessoa2], ['casal', 'Casal']]} />
        <FiltroSelect rotulo="Conta" valor={filtro.contaId ?? ''} aoMudar={(v) => mudar({ contaId: v })}
          opcoes={base.contas.map((c) => [c.id, c.nome])} />
        <FiltroSelect rotulo="Categoria" valor={filtro.categoria ?? ''} aoMudar={(v) => mudar({ categoria: v })}
          opcoes={categoriasAgrupadas} />
        <FiltroSelect rotulo="Natureza" valor={filtro.natureza ?? ''} aoMudar={(v) => mudar({ natureza: v as FiltroExtrato['natureza'] })}
          opcoes={Object.entries(NOME_NATUREZA)} />
        <FiltroSelect rotulo="Status" valor={filtro.status ?? ''} aoMudar={(v) => mudar({ status: v as FiltroExtrato['status'] })}
          opcoes={Object.entries(NOME_STATUS)} />
        <FiltroSelect rotulo="Origem" valor={filtro.origem ?? ''} aoMudar={(v) => mudar({ origem: v as FiltroExtrato['origem'] })}
          opcoes={Object.entries(NOME_ORIGEM)} />
        <button type="button" class={`chip${filtro.naoConciliados ? ' chip-ativo' : ''}`} aria-pressed={Boolean(filtro.naoConciliados)}
          onClick={() => mudar({ naoConciliados: !filtro.naoConciliados })}>Não conciliados</button>
        <button type="button" class={`chip${filtro.semCategoria ? ' chip-ativo' : ''}`} aria-pressed={Boolean(filtro.semCategoria)}
          onClick={() => mudar({ semCategoria: !filtro.semCategoria })}>Sem categoria</button>
        {ativos.length > 0 && (
          <button type="button" class="chip chip-leve" onClick={() => setFiltro({ mes: filtro.mes })}>Limpar</button>
        )}
      </div>

      <p class="resumo-filtro">
        {ativos.length ? `Filtro: ${ativos.join(', ')} · ` : ''}
        <strong>{formatarBRL(total)}</strong> em {itens} {itens === 1 ? 'item' : 'itens'}
      </p>

      {lista.length === 0 ? (
        <div class="cartao"><p class="discreto">Nada por aqui neste mês com esses filtros.</p></div>
      ) : (
        agruparPorDia(lista).map((g) => {
          const { dia, mes: m } = partesData(g.data);
          const semana = DIAS[new Date(`${g.data}T12:00:00Z`).getUTCDay()];
          return (
            <div key={g.data} class="grupo-dia">
              <h2 class="titulo-dia">{semana}, {dia} {nomeMesLongo(m).slice(0, 3)}</h2>
              <ul class="lista-lancamentos">
                {g.itens.map((l) => (
                  <LinhaLancamento
                    key={l.id}
                    l={l}
                    conta={contaPorId.get(l.conta_id)?.nome ?? ''}
                    destino={l.conta_destino_id ? contaPorId.get(l.conta_destino_id)?.nome : undefined}
                    cor={contaPorId.get(l.conta_id)?.cor ?? null}
                    abrir={() => setAberto(l)}
                    excluir={() => excluir(l)}
                    duplicar={() => duplicar(l)}
                  />
                ))}
              </ul>
            </div>
          );
        })
      )}

      <p class="legenda-status">
        <span><PontoStatus status="realizado" /> realizado</span>
        <span><PontoStatus status="agendado" /> agendado</span>
        <span><PontoStatus status="previsto" /> previsto</span>
        <span class="discreto">Deslize ← para excluir, → para duplicar</span>
      </p>

      {aberto && <DetalheLancamento l={aberto} fechar={() => setAberto(null)} />}
    </section>
  );
}

function FiltroSelect(p: { rotulo: string; valor: string; opcoes: Array<[string, string] | [string, string, string]>; aoMudar: (v: string) => void }) {
  const grupos = [...new Set(p.opcoes.map((o) => o[2] ?? ''))];
  const ativo = Boolean(p.valor);
  const texto = ativo ? p.opcoes.find(([v]) => v === p.valor)?.[1] ?? p.rotulo : p.rotulo;
  return (
    <label class={`chip chip-select${ativo ? ' chip-ativo' : ''}`}>
      <span>{texto} ▾</span>
      <select aria-label={p.rotulo} value={p.valor} onChange={(e) => p.aoMudar((e.target as HTMLSelectElement).value)}>
        <option value="">{p.rotulo}: todos</option>
        {grupos.map((g) =>
          g ? (
            <optgroup key={g} label={g}>
              {p.opcoes.filter((o) => o[2] === g).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </optgroup>
          ) : (
            p.opcoes.filter((o) => !o[2]).map(([v, t]) => <option key={v} value={v}>{t}</option>)
          ),
        )}
      </select>
    </label>
  );
}

function LinhaLancamento(p: {
  l: Lancamento;
  conta: string;
  destino?: string;
  cor: string | null;
  abrir: () => void;
  excluir: () => void;
  duplicar: () => void;
}) {
  const { l } = p;
  const [dx, setDx] = useState(0);
  const inicio = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null);
  const LIMITE = 90;

  const sinal = l.tipo === 'despesa' ? '−' : l.tipo === 'receita' ? '+' : '';
  const detalhe =
    l.tipo === 'transferencia'
      ? `${p.conta} → ${p.destino ?? ''}`
      : [l.subcategoria || l.categoria || 'Sem categoria', p.conta, l.parcela_total ? `${l.parcela_num}/${l.parcela_total}` : ''].filter(Boolean).join(' · ');
  const inicial = (l.categoria || (l.tipo === 'transferencia' ? '⇄' : '?')).slice(0, 1).toUpperCase();

  return (
    <li class="item-swipe">
      <div class="fundo-swipe" aria-hidden="true">
        <span class="acao-duplicar">Duplicar</span>
        <span class="acao-excluir">Excluir</span>
      </div>
      <button
        type="button"
        class={`linha-lancamento${l.status === 'cancelado' ? ' cancelado' : ''}`}
        style={{ transform: `translateX(${dx}px)`, transition: inicio.current ? 'none' : 'transform 0.2s' }}
        onClick={() => dx === 0 && p.abrir()}
        onTouchStart={(e) => {
          const t = e.touches[0];
          inicio.current = { x: t.clientX, y: t.clientY, horizontal: null };
        }}
        onTouchMove={(e) => {
          const i = inicio.current;
          if (!i) return;
          const t = e.touches[0];
          const ddx = t.clientX - i.x;
          const ddy = t.clientY - i.y;
          if (i.horizontal === null && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) i.horizontal = Math.abs(ddx) > Math.abs(ddy);
          if (i.horizontal) setDx(Math.max(-140, Math.min(140, ddx)));
        }}
        onTouchEnd={() => {
          const final = dx;
          inicio.current = null;
          setDx(0);
          if (final <= -LIMITE) p.excluir();
          else if (final >= LIMITE) p.duplicar();
        }}
        aria-label={`${l.descricao || detalhe}, ${sinal}${formatarBRL(l.valor)}, ${NOME_STATUS[l.status]}. Tocar para ver detalhes`}
      >
        <span class="icone-categoria" style={p.cor ? { background: p.cor } : undefined} aria-hidden="true">{inicial}</span>
        <span class="textos-linha">
          <span class="descricao-linha">{l.descricao || l.subcategoria || l.categoria || 'Sem descrição'}</span>
          <span class="detalhe-linha">{detalhe}</span>
        </span>
        <span class={`valor-linha${l.tipo === 'receita' ? ' entrada' : ''}`}>{sinal}{formatarBRL(l.valor)}</span>
        <PontoStatus status={l.status} />
      </button>
    </li>
  );
}
