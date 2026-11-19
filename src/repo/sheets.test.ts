import { describe, expect, it } from 'vitest';
import { criarClienteGoogle } from '../google/http';
import { aba } from '../domain/schema';
import { ErroSemConexao, ErroSessao } from './fonte';
import { letraColuna, SheetsTabelas } from './sheets';

interface Chamada {
  url: string;
  metodo: string;
  corpo: any;
}

/** Simula a API do Google: responde por trecho de URL. */
function googleFalso(respostas: Array<[RegExp, unknown]>) {
  const chamadas: Chamada[] = [];
  const f = (async (url: string, init: RequestInit) => {
    chamadas.push({ url: decodeURIComponent(url), metodo: init.method!, corpo: init.body ? JSON.parse(String(init.body)) : undefined });
    const r = respostas.find(([re]) => re.test(decodeURIComponent(url)));
    return new Response(JSON.stringify(r ? r[1] : {}), { status: 200 });
  }) as typeof fetch;
  return { cliente: criarClienteGoogle(async () => 'tok', f, async () => {}), chamadas };
}

describe('SheetsTabelas', () => {
  it('lê só as abas existentes numa chamada batchGet, sem formatação de números', async () => {
    const g = googleFalso([
      [/fields=sheets/, { sheets: [{ properties: { sheetId: 1, title: 'Contas' } }] }],
      [/values:batchGet/, { valueRanges: [{ values: [['id'], ['cta_1']] }] }],
    ]);
    const r = await new SheetsTabelas('PL', g.cliente).lerAbas(['Contas', 'Lancamentos']);
    expect(r).toEqual({ Contas: [['id'], ['cta_1']] });
    const get = g.chamadas[1].url;
    expect(get).toContain("ranges='Contas'");
    expect(get).not.toContain('Lancamentos');
    expect(get).toContain('valueRenderOption=UNFORMATTED_VALUE');
  });

  it('acrescenta linhas com RAW (sem o Google reinterpretar datas e números)', async () => {
    const g = googleFalso([]);
    await new SheetsTabelas('PL', g.cliente).anexar('Lancamentos', [['lan_1', 68.9, null]]);
    expect(g.chamadas[0].url).toContain("'Lancamentos'!A1:append?valueInputOption=RAW");
    expect(g.chamadas[0].corpo).toEqual({ values: [['lan_1', 68.9, '']] });
  });

  it('cria abas, cabeçalhos e listas suspensas', async () => {
    const g = googleFalso([[/fields=sheets/, { sheets: [{ properties: { sheetId: 7, title: 'Contas' } }] }]]);
    await new SheetsTabelas('PL', g.cliente).garantirEstrutura([aba('Contas')], { Contas: ['nome', 'minha_coluna'] });
    const valores = g.chamadas.find((c) => c.url.includes('/values:batchUpdate'))!.corpo;
    const cab = valores.data[0].values[0];
    expect(cab.slice(0, 3)).toEqual(['nome', 'minha_coluna', 'id']); // mantém o que existe e acrescenta
    const reqs = g.chamadas.find((c) => c.url.endsWith(':batchUpdate') && c.corpo.requests)!.corpo.requests;
    const lista = reqs.find((r: any) => r.setDataValidation?.rule.condition.type === 'ONE_OF_LIST');
    expect(lista.setDataValidation.rule.condition.values.map((v: any) => v.userEnteredValue)).toEqual([
      'corrente', 'cartao', 'prepago', 'dinheiro',
    ]);
  });

  it('converte as colunas em letras', () => {
    expect([0, 25, 26, 27, 51, 52].map(letraColuna)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });
});

describe('cliente Google', () => {
  it('401 vira "sessão expirada"; falha de rede vira "sem conexão"', async () => {
    const c401 = criarClienteGoogle(async () => 't', (async () => new Response('{}', { status: 401 })) as typeof fetch);
    await expect(c401.json('x')).rejects.toBeInstanceOf(ErroSessao);
    const off = criarClienteGoogle(async () => 't', (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch);
    await expect(off.json('x')).rejects.toBeInstanceOf(ErroSemConexao);
  });

  it('tenta de novo quando o Google está instável (503)', async () => {
    let n = 0;
    const c = criarClienteGoogle(
      async () => 't',
      (async () => (++n < 3 ? new Response('{}', { status: 503 }) : new Response('{"ok":1}'))) as typeof fetch,
      async () => {},
    );
    expect(await c.json('x')).toEqual({ ok: 1 });
    expect(n).toBe(3);
  });
});
