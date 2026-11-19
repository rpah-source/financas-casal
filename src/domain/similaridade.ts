import { normalizar } from './valores';

/**
 * Similaridade de descrição (SPEC 8.4): coeficiente de Dice sobre bigramas
 * de caracteres, depois de normalizar (minúsculas, sem acentos, sem números,
 * sem prefixos de adquirente como PAG*, IFD*, MP*, EC*).
 */
export function normalizarDescricao(s: string): string {
  return normalizar(s)
    .replace(/\b(pag|ifd|mp|ec|pg|pp|ppro|dl)\s*\*\s*/g, '')
    .replace(/[0-9]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigramas(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = s.replace(/\s/g, '');
  for (let i = 0; i < t.length - 1; i++) {
    const b = t.slice(i, i + 2);
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return m;
}

export function similaridade(a: string, b: string): number {
  const x = normalizarDescricao(a);
  const y = normalizarDescricao(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ba = bigramas(x);
  const bb = bigramas(y);
  let total = 0;
  let comum = 0;
  for (const [, n] of ba) total += n;
  for (const [g, n] of bb) {
    total += n;
    comum += Math.min(n, ba.get(g) ?? 0);
  }
  return total ? (2 * comum) / total : 0;
}
