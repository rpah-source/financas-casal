import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useRef } from 'preact/hooks';
import type { Categoria, Pessoa, StatusLancamento } from '../domain/types';

// ---------- Toast ("Lançado · Desfazer", SPEC 10.2) ----------

export interface Toast {
  texto: string;
  acao?: { rotulo: string; f: () => void };
}
export const ContextoToast = createContext<(t: Toast) => void>(() => {});
export const useToast = () => useContext(ContextoToast);

export function AvisoToast({ toast, fechar }: { toast: Toast | null; fechar: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(fechar, 5000);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div class="toast" role="status" aria-live="polite">
      <span>{toast.texto}</span>
      {toast.acao && (
        <button
          type="button"
          class="botao-link"
          onClick={() => {
            toast.acao!.f();
            fechar();
          }}
        >
          {toast.acao.rotulo}
        </button>
      )}
    </div>
  );
}

// ---------- Folha (painel que sobe de baixo) ----------

let folhasAbertas = 0;

export function Folha({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && fechar();
    document.addEventListener('keydown', esc);
    folhasAbertas++;
    document.body.classList.add('sem-rolagem');
    return () => {
      document.removeEventListener('keydown', esc);
      if (--folhasAbertas === 0) document.body.classList.remove('sem-rolagem');
    };
  }, []);
  return (
    <div class="folha-fundo" onClick={(e) => e.target === e.currentTarget && fechar()}>
      <div class="folha" role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} ref={ref}>
        <div class="folha-topo">
          <h2>{titulo}</h2>
          <button type="button" class="botao-icone" aria-label="Fechar" onClick={fechar}>✕</button>
        </div>
        <div class="folha-corpo">{children}</div>
      </div>
    </div>
  );
}

// ---------- Chips de escolha única ----------

export function Chips<T extends string>(p: {
  rotulo: string;
  opcoes: Array<{ valor: T; texto: string; cor?: string | null }>;
  valor: T | null;
  aoEscolher: (v: T) => void;
}) {
  return (
    <fieldset class="grupo-chips">
      <legend>{p.rotulo}</legend>
      <div class="chips">
        {p.opcoes.map((o) => (
          <button
            key={o.valor}
            type="button"
            class={`chip${p.valor === o.valor ? ' chip-ativo' : ''}`}
            aria-pressed={p.valor === o.valor}
            onClick={() => p.aoEscolher(o.valor)}
          >
            {o.cor && <span class="chip-cor" style={{ background: o.cor }} />}
            {o.texto}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// ---------- Escolha de categoria ----------

export function EscolherCategoria(p: {
  categorias: Categoria[];
  fechar: () => void;
  aoEscolher: (categoria: string, subcategoria: string | null) => void;
}) {
  const grupos = new Map<string, Categoria[]>();
  for (const c of p.categorias.filter((c) => c.ativa !== false).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))) {
    grupos.set(c.categoria, [...(grupos.get(c.categoria) ?? []), c]);
  }
  return (
    <Folha titulo="Categoria" fechar={p.fechar}>
      {[...grupos].map(([cat, itens]) => (
        <div key={cat} class="grupo-categoria">
          <button type="button" class="categoria-principal" onClick={() => p.aoEscolher(cat, null)}>{cat}</button>
          <div class="chips">
            {itens
              .filter((i) => i.subcategoria)
              .map((i) => (
                <button key={i.subcategoria} type="button" class="chip" onClick={() => p.aoEscolher(cat, i.subcategoria)}>
                  {i.subcategoria}
                </button>
              ))}
          </div>
        </div>
      ))}
    </Folha>
  );
}

// ---------- Textos ----------

export const NOME_NATUREZA: Record<string, string> = {
  fixa: 'Fixa', variavel: 'Variável', sazonal: 'Sazonal', divida: 'Dívida', sonho: 'Sonho/projeto', nenhuma: 'Nenhuma',
};

export const NOME_STATUS: Record<StatusLancamento, string> = {
  previsto: 'Previsto', agendado: 'Agendado', realizado: 'Realizado', cancelado: 'Cancelado',
};

export const NOME_ORIGEM: Record<string, string> = {
  manual: 'No app', texto: 'Texto livre', importacao: 'Importação', recorrencia: 'Recorrência',
  caixa_entrada: 'Caixa de entrada', parcelamento: 'Parcelamento',
};

export function nomePessoa(q: Pessoa, pessoas: { pessoa1: string; pessoa2: string }) {
  return q === 'casal' ? 'Casal' : pessoas[q];
}

export function PontoStatus({ status }: { status: StatusLancamento }) {
  return <span class={`ponto ponto-${status}`} role="img" aria-label={NOME_STATUS[status]} title={NOME_STATUS[status]} />;
}
