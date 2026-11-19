import { config } from '../config';
import { ErroSessao } from '../repo/fonte';
import { carregarScript } from './carregarScript';

/**
 * Login com Google Identity Services, "token client" (SPEC 4.1 e 4.3).
 * - Escopo único: drive.file.
 * - O token dura ~1 h. Guardamos no aparelho só até expirar, para o app
 *   abrir já com os dados. Renovação silenciosa com `prompt: ''`; se o
 *   Safari bloquear (precisa de um toque), a tela mostra "Entrar de novo".
 */

interface TokenGuardado {
  token: string;
  expiraEm: number;
}

const CHAVE = 'fc.token';
const MARGEM_MS = 2 * 60 * 1000;

declare global {
  interface Window {
    google?: any;
  }
}

type Ouvinte = (logado: boolean) => void;

export class SessaoGoogle {
  private cliente: any = null;
  private atual: TokenGuardado | null = lerGuardado();
  private pendente: { ok: (t: string) => void; falha: (e: unknown) => void } | null = null;
  private ouvintes = new Set<Ouvinte>();

  get logado() {
    return this.tokenValido() !== null;
  }

  /** Já entrou alguma vez neste aparelho (mesmo que o token tenha expirado). */
  get jaEntrou() {
    try {
      return localStorage.getItem('fc.jaEntrou') === '1';
    } catch {
      return false;
    }
  }

  aoMudar(f: Ouvinte) {
    this.ouvintes.add(f);
    return () => this.ouvintes.delete(f);
  }

  private tokenValido(): string | null {
    return this.atual && this.atual.expiraEm - MARGEM_MS > Date.now() ? this.atual.token : null;
  }

  private async iniciar() {
    if (this.cliente) return;
    await carregarScript('https://accounts.google.com/gsi/client');
    this.cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: config.googleClientId,
      scope: config.oauthScope,
      callback: (resp: any) => {
        const p = this.pendente;
        this.pendente = null;
        if (resp.error || !resp.access_token) {
          p?.falha(new ErroSessao(resp.error_description || resp.error || 'Login não concluído'));
          return;
        }
        this.atual = { token: resp.access_token, expiraEm: Date.now() + Number(resp.expires_in ?? 3600) * 1000 };
        guardar(this.atual);
        try {
          localStorage.setItem('fc.jaEntrou', '1');
        } catch {
          // sem localStorage: segue sem lembrar
        }
        this.avisar();
        p?.ok(resp.access_token);
      },
      error_callback: (err: any) => {
        const p = this.pendente;
        this.pendente = null;
        p?.falha(new ErroSessao(err?.type === 'popup_closed' ? 'Janela de login fechada' : 'Login bloqueado'));
      },
    });
  }

  /** Abre o login do Google. Chame a partir de um toque do usuário (exigência do Safari). */
  async entrar(): Promise<string> {
    await this.iniciar();
    return this.pedirToken(this.jaEntrou ? '' : 'consent');
  }

  /** Token válido, renovando em silêncio se possível. Lança ErroSessao se precisar de um toque. */
  async obterToken(): Promise<string> {
    const t = this.tokenValido();
    if (t) return t;
    if (!this.jaEntrou) throw new ErroSessao('Não entrou ainda');
    await this.iniciar();
    return Promise.race([
      this.pedirToken(''),
      new Promise<string>((_, falha) => setTimeout(() => falha(new ErroSessao()), 8000)),
    ]);
  }

  private pedirToken(prompt: '' | 'consent'): Promise<string> {
    return new Promise((ok, falha) => {
      this.pendente = { ok, falha };
      this.cliente.requestAccessToken({ prompt });
    });
  }

  sair() {
    const t = this.atual?.token;
    this.atual = null;
    try {
      localStorage.removeItem(CHAVE);
      localStorage.removeItem('fc.jaEntrou');
    } catch {
      // nada a fazer
    }
    if (t && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(t, () => {});
    this.avisar();
  }

  private avisar() {
    for (const f of this.ouvintes) f(this.logado);
  }
}

function lerGuardado(): TokenGuardado | null {
  try {
    const t = JSON.parse(localStorage.getItem(CHAVE) ?? 'null');
    return t && typeof t.token === 'string' && t.expiraEm > Date.now() ? t : null;
  } catch {
    return null;
  }
}

function guardar(t: TokenGuardado) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(t));
  } catch {
    // sem localStorage: token fica só na memória
  }
}
