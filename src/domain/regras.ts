import type { Categoria, Natureza, Pessoa, RegistroGenerico } from './types';
import { normalizar } from './valores';

/**
 * Regras de-para (SPEC 5.8): traduzem um texto ("IFD*IFOOD", "farmácia")
 * em nome amigável, categoria, natureza e pessoa.
 */
export interface Sugestao {
  descricao: string | null;
  categoria: string | null;
  subcategoria: string | null;
  natureza: Natureza | null;
  quem: Pessoa | null;
  regraId: string | null;
  /** De onde veio a sugestão, para a tela explicar ("Pela regra", "Pelo nome da categoria"). */
  fonte: 'regra' | 'categoria' | null;
}

export const SEM_SUGESTAO: Sugestao = {
  descricao: null, categoria: null, subcategoria: null, natureza: null, quem: null, regraId: null, fonte: null,
};

export function regraCasa(padrao: string, texto: string): boolean {
  const p = padrao.trim();
  if (!p) return false;
  const re = p.match(/^\/(.+)\/([a-z]*)$/i);
  if (re) {
    try {
      return new RegExp(re[1], re[2].includes('i') ? re[2] : re[2] + 'i').test(texto);
    } catch {
      return false;
    }
  }
  return normalizar(texto).includes(normalizar(p));
}

/** Categorias que servem para um tipo de lançamento (gasto, entrada, transferência). */
export function categoriasDoTipo(categorias: Categoria[], tipo?: string | null): Categoria[] {
  if (!tipo || tipo === 'ajuste') return categorias;
  return categorias.filter((c) => (c.tipo ?? 'despesa') === tipo);
}

export function aplicarRegras(
  texto: string,
  regras: RegistroGenerico[],
  categorias: Categoria[],
  contaId?: string | null,
  tipo?: string | null,
): Sugestao {
  if (!texto.trim()) return SEM_SUGESTAO;
  const candidatas = regras
    .filter((r) => r.ativa !== false && !r.excluido && r.padrao)
    .filter((r) => !r.conta_id || r.conta_id === contaId)
    .filter((r) => regraCasa(String(r.padrao), texto))
    .sort(
      (a, b) =>
        Number(b.prioridade ?? 0) - Number(a.prioridade ?? 0) ||
        Number(Boolean(b.conta_id)) - Number(Boolean(a.conta_id)) ||
        String(b.padrao).length - String(a.padrao).length ||
        Number(b.vezes_usada ?? 0) - Number(a.vezes_usada ?? 0),
    );
  const r = candidatas[0];
  if (r) {
    return {
      descricao: (r.descricao as string) || null,
      categoria: (r.categoria as string) || null,
      subcategoria: (r.subcategoria as string) || null,
      natureza: (r.natureza as Natureza) || naturezaDaCategoria(categorias, r.categoria as string, r.subcategoria as string),
      quem: (r.quem as Pessoa) || null,
      regraId: String(r.id),
      fonte: 'regra',
    };
  }
  return porNomeDaCategoria(texto, categoriasDoTipo(categorias, tipo));
}

/**
 * Sem regra: se uma palavra do texto for o nome de uma subcategoria (ou
 * categoria), sugere essa. Ex.: "farmácia" → Saúde › Farmácia.
 */
function porNomeDaCategoria(texto: string, categorias: Categoria[]): Sugestao {
  const t = ` ${normalizar(texto)} `;
  const ativas = categorias.filter((c) => c.ativa !== false);
  const achar = (nome: string | null) => nome && t.includes(` ${normalizar(nome)} `);
  const sub = ativas.find((c) => c.subcategoria && achar(c.subcategoria));
  const cat = sub ?? ativas.find((c) => !c.subcategoria && achar(c.categoria));
  if (!cat) return SEM_SUGESTAO;
  return {
    ...SEM_SUGESTAO,
    categoria: cat.categoria,
    subcategoria: cat.subcategoria || null,
    natureza: naturezaDaCategoria(categorias, cat.categoria, cat.subcategoria),
    fonte: 'categoria',
  };
}

function naturezaDaCategoria(categorias: Categoria[], categoria?: string | null, sub?: string | null): Natureza | null {
  if (!categoria) return null;
  const c = normalizar(categoria);
  const s = normalizar(sub ?? '');
  return (
    categorias.find((x) => normalizar(x.categoria) === c && normalizar(x.subcategoria ?? '') === s)?.natureza_padrao ??
    categorias.find((x) => normalizar(x.categoria) === c && !x.subcategoria)?.natureza_padrao ??
    null
  );
}

/** Padrão sugerido para uma regra nova a partir do texto (sem números e prefixos de adquirente). */
export function padraoSugerido(texto: string): string {
  return normalizar(texto)
    .replace(/^(pag|ifd|mp|ec|pg|pp)\s*\*\s*/i, '')
    .replace(/[0-9]+/g, '')
    .replace(/[^\p{L}\s*]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
