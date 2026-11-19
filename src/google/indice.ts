import { lerGradeIndice, type Grade, type ItemIndice } from '../domain/indice';
import { lerParametro } from '../domain/parametros';
import type { Parametro } from '../domain/types';
import { normalizar } from '../domain/valores';
import type { ClienteGoogle } from './http';

/**
 * Lê projetos e áreas da planilha-índice (SPEC 4.5 a). Nomes das abas e
 * colunas vêm de Parametros (`indice.*`), com os padrões da SPEC.
 */
export async function lerIndice(google: ClienteGoogle, indiceId: string, parametros: Parametro[], hoje: string): Promise<ItemIndice[]> {
  const p = (chave: string, padrao: string) => lerParametro(parametros, `indice.${chave}`, hoje) || padrao;
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(indiceId)}`;

  const meta = await google.json<{ sheets: Array<{ properties: { title: string } }> }>(`${base}?fields=sheets.properties.title`);
  const titulos = meta.sheets.map((s) => s.properties.title);
  const acharAba = (nome: string) => titulos.find((t) => normalizar(t) === normalizar(nome));
  const abaProjetos = acharAba(p('aba_projetos', 'Projetos'));
  const abaAreas = acharAba(p('aba_areas', 'Áreas'));
  const abas = [abaProjetos, abaAreas].filter((a): a is string => Boolean(a));
  if (!abas.length) throw new Error('Não achei as abas de projetos e áreas no índice. Confira os nomes em Parametros (indice.aba_projetos / indice.aba_areas).');

  const q = new URLSearchParams({
    includeGridData: 'true',
    fields: 'sheets(properties(title),data(rowData(values(formattedValue,hyperlink,userEnteredValue))))',
  });
  for (const a of abas) q.append('ranges', `'${a.replace(/'/g, "''")}'`);
  const r = await google.json<{ sheets: Array<{ properties: { title: string }; data?: Array<{ rowData?: Grade }> }> }>(`${base}?${q}`);
  const grade = (titulo?: string): Grade => r.sheets.find((s) => s.properties.title === titulo)?.data?.[0]?.rowData ?? [];

  const pasta = p('col_pasta', 'Pasta');
  return [
    ...lerGradeIndice(grade(abaProjetos), 'projeto', {
      nome: p('col_projeto_nome', 'Nome'),
      id: p('col_projeto_id', 'ID'),
      status: p('col_projeto_status', 'Status'),
      pasta,
    }),
    ...lerGradeIndice(grade(abaAreas), 'area', {
      nome: p('col_area_nome', 'Nome'),
      status: p('col_area_status', 'Status'),
      pasta,
    }),
  ];
}
