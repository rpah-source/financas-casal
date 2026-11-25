import type { Aba, NomeAba } from '../domain/schema';
import type { Celula } from '../domain/valores';
import type { ClienteGoogle } from '../google/http';
import type { CelulaParaGravar, FonteTabelas } from './fonte';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

interface PropriedadesAba {
  sheetId: number;
  title: string;
}

/** Planilha Google Sheets como `FonteTabelas` (Sheets API v4). */
export class SheetsTabelas implements FonteTabelas {
  private abasExistentes: PropriedadesAba[] | null = null;

  constructor(private planilhaId: string, private google: ClienteGoogle) {}

  private url(caminho = '', params: Record<string, string | string[]> = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) for (const x of [v].flat()) q.append(k, x);
    const qs = q.toString();
    return `${API}/${encodeURIComponent(this.planilhaId)}${caminho}${qs ? `?${qs}` : ''}`;
  }

  private async propriedades(forcar = false): Promise<PropriedadesAba[]> {
    if (!this.abasExistentes || forcar) {
      const r = await this.google.json<{ sheets: Array<{ properties: PropriedadesAba }> }>(
        this.url('', { fields: 'sheets.properties(sheetId,title)' }),
      );
      this.abasExistentes = r.sheets.map((s) => s.properties);
    }
    return this.abasExistentes;
  }

  async lerAbas(abas: NomeAba[]) {
    const existentes = new Set((await this.propriedades(true)).map((p) => p.title));
    const pedir = abas.filter((a) => existentes.has(a));
    const r: Partial<Record<NomeAba, Celula[][]>> = {};
    if (!pedir.length) return r;
    const resp = await this.google.json<{ valueRanges: Array<{ values?: Celula[][] }> }>(
      this.url('/values:batchGet', {
        ranges: pedir.map(intervaloAba),
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING',
        majorDimension: 'ROWS',
      }),
    );
    pedir.forEach((a, i) => (r[a] = resp.valueRanges[i]?.values ?? []));
    return r;
  }

  async lerColuna(aba: NomeAba, indice: number) {
    const letra = letraColuna(indice);
    const resp = await this.google.json<{ values?: Celula[][] }>(
      this.url(`/values/${encodeURIComponent(`${intervaloAba(aba)}!${letra}:${letra}`)}`, {
        valueRenderOption: 'UNFORMATTED_VALUE',
        majorDimension: 'COLUMNS',
      }),
    );
    return resp.values?.[0] ?? [];
  }

  async anexar(aba: NomeAba, linhas: Celula[][]) {
    await this.google.json(
      this.url(`/values/${encodeURIComponent(`${intervaloAba(aba)}!A1`)}:append`, {
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
      }),
      { corpo: { values: linhas.map(semNulos) } },
    );
  }

  async gravarCelulas(aba: NomeAba, celulas: CelulaParaGravar[]) {
    if (!celulas.length) return;
    await this.google.json(this.url('/values:batchUpdate'), {
      corpo: {
        valueInputOption: 'RAW',
        data: agruparCelulas(celulas).map((g) => ({
          range: `${intervaloAba(aba)}!${letraColuna(g.coluna)}${g.linha}`,
          values: [semNulos(g.valores)],
        })),
      },
    });
  }

  async versao() {
    const r = await this.google.json<{ modifiedTime?: string }>(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(this.planilhaId)}?fields=modifiedTime&supportsAllDrives=true`,
    );
    return r.modifiedTime ?? null;
  }

  async garantirEstrutura(abas: Aba[], cabecalhosAtuais: Partial<Record<NomeAba, string[]>>) {
    let props = await this.propriedades(true);
    const titulos = new Set(props.map((p) => p.title));
    const novas = abas.filter((a) => !titulos.has(a.nome));
    if (novas.length) {
      await this.google.json(this.url(':batchUpdate'), {
        corpo: {
          requests: novas.map((a) => ({
            addSheet: { properties: { title: a.nome, gridProperties: { frozenRowCount: 1 } } },
          })),
        },
      });
      props = await this.propriedades(true);
    }

    const pedidos: unknown[] = [];
    const cabecalhos: Array<{ range: string; values: string[][] }> = [];
    for (const spec of abas) {
      const sheetId = props.find((p) => p.title === spec.nome)!.sheetId;
      const atual = (cabecalhosAtuais[spec.nome] ?? []).map((c) => c.trim());
      const final = [...atual];
      for (const col of spec.colunas) if (!final.map((c) => c.toLowerCase()).includes(col.nome)) final.push(col.nome);
      cabecalhos.push({ range: `${intervaloAba(spec.nome)}!A1`, values: [final] });

      pedidos.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: 'userEnteredFormat.textFormat.bold',
        },
      });
      // Listas suspensas (SPEC 4.4). "strict: false": o app aceita variações e corrige ao ler.
      for (const col of spec.colunas) {
        const i = final.map((c) => c.toLowerCase()).indexOf(col.nome);
        const intervalo = { sheetId, startRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 };
        if (col.tipo === 'enum' && col.valores) {
          pedidos.push({
            setDataValidation: {
              range: intervalo,
              rule: {
                condition: { type: 'ONE_OF_LIST', values: col.valores.map((v) => ({ userEnteredValue: v })) },
                strict: false,
                showCustomUi: true,
              },
            },
          });
        } else if (col.tipo === 'bool') {
          // Lista TRUE/FALSE, e não caixinha de marcar: a caixinha faz o Google preencher
          // FALSE em todas as linhas vazias, e aí as linhas novas iriam para o fim da aba.
          pedidos.push({
            setDataValidation: {
              range: intervalo,
              rule: {
                condition: { type: 'ONE_OF_LIST', values: [{ userEnteredValue: 'TRUE' }, { userEnteredValue: 'FALSE' }] },
                strict: false,
                showCustomUi: true,
              },
            },
          });
        }
      }
    }
    await this.google.json(this.url('/values:batchUpdate'), {
      corpo: { valueInputOption: 'RAW', data: cabecalhos },
    });
    if (pedidos.length) await this.google.json(this.url(':batchUpdate'), { corpo: { requests: pedidos } });
  }

  /** Apaga a aba vazia que o Google cria junto com a planilha ("Página1"). */
  async removerAbasPadrao(nossas: string[]) {
    const props = await this.propriedades(true);
    const sobrando = props.filter((p) => !nossas.includes(p.title));
    if (!sobrando.length || sobrando.length === props.length) return;
    await this.google.json(this.url(':batchUpdate'), {
      corpo: { requests: sobrando.map((p) => ({ deleteSheet: { sheetId: p.sheetId } })) },
    });
    this.abasExistentes = null;
  }
}

const intervaloAba = (aba: string) => `'${aba.replace(/'/g, "''")}'`;
const semNulos = (linha: Celula[]) => linha.map((c) => (c === null || c === undefined ? '' : c));

/** Junta células vizinhas da mesma linha num só intervalo (menos itens no pedido ao Google). */
export function agruparCelulas(celulas: CelulaParaGravar[]): Array<{ linha: number; coluna: number; valores: Celula[] }> {
  const ordenadas = [...celulas].sort((a, b) => a.linha - b.linha || a.coluna - b.coluna);
  const grupos: Array<{ linha: number; coluna: number; valores: Celula[] }> = [];
  for (const c of ordenadas) {
    const g = grupos[grupos.length - 1];
    if (g && g.linha === c.linha && g.coluna + g.valores.length === c.coluna) g.valores.push(c.valor);
    else grupos.push({ linha: c.linha, coluna: c.coluna, valores: [c.valor] });
  }
  return grupos;
}

/** 0 → A, 25 → Z, 26 → AA. */
export function letraColuna(indice: number): string {
  let s = '';
  let n = indice + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
