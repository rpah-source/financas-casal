import { ErroSemConexao, ErroSessao } from '../repo/fonte';

/**
 * Chamadas às APIs do Google direto do navegador (SPEC 4.1), com o token
 * de acesso. Converte falhas em erros que a fila offline entende.
 */
export type ObterToken = () => Promise<string>;
export type Fetch = typeof fetch;

export interface ClienteGoogle {
  json<T>(url: string, opcoes?: { metodo?: string; corpo?: unknown }): Promise<T>;
  /** POST com corpo binário (upload de arquivo). */
  enviar<T>(url: string, corpo: Blob, contentType: string): Promise<T>;
}

export function criarClienteGoogle(obterToken: ObterToken, f: Fetch = (...a) => fetch(...a), esperar = dormir): ClienteGoogle {
  async function chamar<T>(url: string, init: (token: string) => RequestInit): Promise<T> {
    const token = await obterToken();
    for (let tentativa = 0; ; tentativa++) {
      let resp: Response;
      try {
        resp = await f(url, init(token));
      } catch {
        throw new ErroSemConexao();
      }
      if (resp.ok) return (resp.status === 204 ? undefined : await resp.json()) as T;
      if (resp.status === 401) throw new ErroSessao();
      if ((resp.status === 429 || resp.status >= 500) && tentativa < 3) {
        await esperar(500 * 2 ** tentativa);
        continue;
      }
      let detalhe = '';
      try {
        detalhe = (await resp.json())?.error?.message ?? '';
      } catch {
        // corpo sem JSON
      }
      throw new ErroGoogle(resp.status, detalhe);
    }
  }
  return {
    enviar<T>(url: string, corpo: Blob, contentType: string) {
      return chamar<T>(url, (token) => ({ method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body: corpo }));
    },
    async json<T>(url: string, opcoes: { metodo?: string; corpo?: unknown } = {}): Promise<T> {
      const token = await obterToken();
      for (let tentativa = 0; ; tentativa++) {
        let resp: Response;
        try {
          resp = await f(url, {
            method: opcoes.metodo ?? (opcoes.corpo === undefined ? 'GET' : 'POST'),
            headers: {
              Authorization: `Bearer ${token}`,
              ...(opcoes.corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
            },
            body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
          });
        } catch {
          throw new ErroSemConexao();
        }
        if (resp.ok) return (resp.status === 204 ? undefined : await resp.json()) as T;
        if (resp.status === 401) throw new ErroSessao();
        // Limite de uso ou instabilidade do Google: espera e tenta de novo (até 3x).
        if ((resp.status === 429 || resp.status >= 500) && tentativa < 3) {
          await esperar(500 * 2 ** tentativa);
          continue;
        }
        let detalhe = '';
        try {
          detalhe = (await resp.json())?.error?.message ?? '';
        } catch {
          // corpo sem JSON
        }
        throw new ErroGoogle(resp.status, detalhe);
      }
    },
  };
}

export class ErroGoogle extends Error {
  constructor(public status: number, detalhe: string) {
    super(`Google respondeu ${status}${detalhe ? `: ${detalhe}` : ''}`);
  }
}

const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
