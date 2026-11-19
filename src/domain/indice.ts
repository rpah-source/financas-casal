import { normalizar } from './valores';

/**
 * Leitura da planilha-índice do segundo cérebro (SPEC 4.5 a).
 * Recebe as células como a Sheets API devolve (`spreadsheets.get` com
 * `formattedValue`, `hyperlink` e `userEnteredValue`).
 */
export interface CelulaGrade {
  formattedValue?: string;
  hyperlink?: string;
  userEnteredValue?: { stringValue?: string; formulaValue?: string; numberValue?: number };
}
export type Grade = Array<{ values?: CelulaGrade[] }>;

export interface ItemIndice {
  nome: string;
  tipo: 'projeto' | 'area';
  /** ID do projeto no índice (ex.: P-0007). Só projetos. */
  id: string | null;
  /** ID da pasta no Drive, extraído do link da coluna Pasta. */
  pastaId: string | null;
}

export interface ColunasIndice {
  nome: string;
  id?: string;
  status: string;
  pasta: string;
}

export function lerGradeIndice(grade: Grade, tipo: 'projeto' | 'area', cols: ColunasIndice): ItemIndice[] {
  const [cab, ...linhas] = grade;
  const titulos = (cab?.values ?? []).map((c) => normalizar(texto(c)));
  const pos = (nome?: string) => (nome ? titulos.indexOf(normalizar(nome)) : -1);
  const iNome = pos(cols.nome);
  if (iNome < 0) return [];
  const iId = pos(cols.id);
  const iStatus = pos(cols.status);
  const iPasta = pos(cols.pasta);

  const itens: ItemIndice[] = [];
  for (const l of linhas) {
    const v = l.values ?? [];
    const nome = texto(v[iNome]).trim();
    if (!nome) continue;
    if (iStatus >= 0 && !statusAtivo(texto(v[iStatus]), tipo)) continue;
    itens.push({
      nome,
      tipo,
      id: tipo === 'projeto' && iId >= 0 ? texto(v[iId]).trim() || null : null,
      pastaId: iPasta >= 0 ? idPasta(v[iPasta]) : null,
    });
  }
  return itens;
}

/**
 * Projetos: ativo ou incubado. Áreas: ativa. Status vazio conta como ativo
 * (o usuário pode não ter preenchido).
 */
export function statusAtivo(status: string, tipo: 'projeto' | 'area'): boolean {
  const s = normalizar(status);
  if (!s) return true;
  if (s.startsWith('ativ')) return true;
  return tipo === 'projeto' && s.startsWith('incub');
}

function texto(c?: CelulaGrade): string {
  return c?.formattedValue ?? c?.userEnteredValue?.stringValue ?? '';
}

/** Pega o ID da pasta do link (HYPERLINK, link inserido ou URL em texto). */
export function idPasta(c?: CelulaGrade): string | null {
  const fontes = [c?.hyperlink, c?.userEnteredValue?.formulaValue, c?.userEnteredValue?.stringValue, c?.formattedValue];
  for (const f of fontes) {
    if (!f) continue;
    const m = f.match(/\/folders\/([\w-]{10,})/) ?? f.match(/[?&]id=([\w-]{10,})/);
    if (m) return m[1];
  }
  return null;
}
