import { criarBase, type IdsBase } from '../bootstrap/bootstrap';
import { googleConfigurado } from '../config';
import type { Base } from '../domain/base';
import { hojeSP } from '../domain/dates';
import { lerParametro } from '../domain/parametros';
import { planilhaDemo } from '../demo/planilhaDemo';
import { SessaoGoogle } from '../google/auth';
import { criarClienteGoogle } from '../google/http';
import { escolherNoDrive, type TipoEscolha } from '../google/picker';
import { ArmazemMemoria, criarArmazem, type Armazem } from '../repo/armazem';
import { RepositorioComFila } from '../repo/fila';
import { ErroSemConexao, ErroSessao } from '../repo/fonte';
import { MemoriaTabelas } from '../repo/memoria';
import { RepositorioPlanilha } from '../repo/repositorio';
import { SheetsTabelas } from '../repo/sheets';
import { GoogleDriveStorage } from '../storage/drive';

/**
 * Estado do app: modo (demonstração ou Google), dados carregados, fila de
 * envio e o assistente de primeira execução (SPEC 4.4).
 */
export type Modo = 'demo' | 'google';

export interface Estado {
  modo: Modo;
  hoje: string;
  base: Base | null;
  carregando: boolean;
  /** Mensagem neutra para o usuário quando algo falhou. */
  aviso: string | null;
  /** Token expirou e o Safari pediu um toque: mostrar "Entrar de novo". */
  precisaEntrarDeNovo: boolean;
  pendentes: number;
  ids: Partial<IdsBase> | null;
  /** Os dados na tela vieram do cache do aparelho (ainda atualizando). */
  doCache: boolean;
}

const CHAVE_IDS = 'fc.ids';

export class App {
  estado: Estado;
  private ouvintes = new Set<() => void>();
  private sessao = new SessaoGoogle();
  private armazem: Armazem = criarArmazem();
  private repo: RepositorioComFila | null = null;
  private google = criarClienteGoogle(() => this.sessao.obterToken());

  constructor() {
    const demoForcado = new URLSearchParams(location.search).get('demo') === '1';
    const modo: Modo =
      !demoForcado && googleConfigurado() && (this.sessao.logado || this.sessao.jaEntrou) ? 'google' : 'demo';
    this.estado = {
      modo,
      hoje: hojeSP(),
      base: null,
      carregando: true,
      aviso: null,
      precisaEntrarDeNovo: false,
      pendentes: 0,
      ids: lerIds(),
      doCache: false,
    };
    window.addEventListener('online', () => void this.reenviar());
  }

  get podeUsarGoogle() {
    return googleConfigurado();
  }

  assinar(f: () => void) {
    this.ouvintes.add(f);
    return () => this.ouvintes.delete(f);
  }

  private set(p: Partial<Estado>) {
    this.estado = { ...this.estado, ...p };
    for (const f of this.ouvintes) f();
  }

  /** Abre o app: mostra o cache na hora (SPEC 10.1, 2 s) e atualiza em seguida. */
  async iniciar() {
    if (this.estado.modo === 'demo') {
      const fonte = new MemoriaTabelas(planilhaDemo(this.estado.hoje));
      this.usarRepositorio(new RepositorioPlanilha(fonte));
    } else if (this.estado.ids?.planilha) {
      this.usarRepositorio(new RepositorioPlanilha(new SheetsTabelas(this.estado.ids.planilha, this.google)));
      const cache = await this.armazem.ler<Base>(`base:${this.estado.ids.planilha}`).catch(() => undefined);
      if (cache) this.set({ base: cache, doCache: true });
    } else {
      this.set({ carregando: false });
      return;
    }
    await this.carregar();
  }

  private usarRepositorio(repo: RepositorioPlanilha) {
    const armazem = this.estado.modo === 'demo' ? new ArmazemMemoria() : this.armazem;
    this.repo = new RepositorioComFila(repo, armazem);
    this.repo.aoMudarPendentes((n) => this.set({ pendentes: n }));
  }

  async carregar() {
    if (!this.repo) return;
    this.set({ carregando: true, aviso: null });
    try {
      const base = await this.repo.carregar(this.estado.hoje);
      this.set({ base, carregando: false, doCache: false, precisaEntrarDeNovo: false });
      if (this.estado.modo === 'google' && this.estado.ids?.planilha) {
        await this.armazem.gravar(`base:${this.estado.ids.planilha}`, base).catch(() => {});
      }
    } catch (e) {
      this.tratarErro(e);
    }
  }

  async reenviar() {
    if (!this.repo?.pendentes) return;
    try {
      await this.repo.reenviar();
    } catch (e) {
      this.tratarErro(e);
    }
  }

  private tratarErro(e: unknown) {
    if (e instanceof ErroSessao) {
      this.set({ carregando: false, precisaEntrarDeNovo: true });
    } else if (e instanceof ErroSemConexao) {
      this.set({ carregando: false, aviso: 'Sem internet. Mostrando os últimos dados salvos no aparelho.' });
    } else {
      this.set({ carregando: false, aviso: e instanceof Error ? e.message : 'Algo deu errado.' });
    }
  }

  /** Botão "Entrar com Google" / "Entrar de novo". */
  async entrar() {
    try {
      await this.sessao.entrar();
      const virouGoogle = this.estado.modo !== 'google';
      this.set({ modo: 'google', precisaEntrarDeNovo: false, aviso: null, base: virouGoogle ? null : this.estado.base });
      if (virouGoogle) this.repo = null;
      if (!this.repo) await this.iniciar();
      else {
        await this.reenviar();
        await this.carregar();
      }
    } catch (e) {
      this.set({ aviso: e instanceof Error ? `Não foi possível entrar: ${e.message}` : 'Não foi possível entrar.' });
    }
  }

  sair() {
    this.sessao.sair();
    try {
      localStorage.removeItem(CHAVE_IDS);
    } catch {
      // nada
    }
    this.repo = null;
    this.set({ modo: 'demo', ids: null, base: null, precisaEntrarDeNovo: false, pendentes: 0 });
    void this.iniciar();
  }

  private async escolher(tipo: TipoEscolha, titulo: string) {
    const token = await this.sessao.obterToken();
    return escolherNoDrive(tipo, token, titulo);
  }

  /** Assistente, passo 1: escolher a pasta de Finanças e criar a planilha base. */
  async criarPlanilhaNaPasta() {
    await this.acao(async () => {
      const pasta = await this.escolher('pasta', 'Escolha a pasta da sua área de Finanças');
      if (!pasta) return;
      const ids = await criarBase({
        storage: new GoogleDriveStorage(this.google),
        fontePara: (id) => new SheetsTabelas(id, this.google),
        pastaFinancasId: pasta.id,
      });
      this.guardarIds(ids);
      this.repo = null;
      await this.iniciar();
    });
  }

  /** "Já tenho a planilha base". */
  async usarPlanilhaExistente() {
    await this.acao(async () => {
      const planilha = await this.escolher('planilha', 'Escolha a planilha "Finanças do Casal — Base"');
      if (!planilha) return;
      this.guardarIds({ planilha: planilha.id });
      this.repo = null;
      await this.iniciar();
      // Recupera os outros ids gravados em Parametros.
      const p = this.estado.base?.parametros ?? [];
      const ids: Partial<IdsBase> = { planilha: planilha.id };
      for (const k of ['pasta_financas', 'pasta_faturas', 'pasta_comprovantes', 'pasta_entrada', 'indice'] as const) {
        const v = lerParametro(p, `ids.${k}`, this.estado.hoje);
        if (v) ids[k] = v;
      }
      this.guardarIds(ids);
    });
  }

  /** Passos 2 e 3 (podem ser feitos depois, em Ajustes). */
  async escolherPastaEntrada() {
    await this.escolherEGravar('pasta', 'pasta_entrada', 'Escolha a pasta de Entrada do seu sistema PARA');
  }

  async escolherIndice() {
    await this.escolherEGravar('planilha', 'indice', 'Escolha a planilha-índice do segundo cérebro');
  }

  private async escolherEGravar(tipo: TipoEscolha, chave: keyof IdsBase, titulo: string) {
    await this.acao(async () => {
      const item = await this.escolher(tipo, titulo);
      if (!item || !this.repo) return;
      // Parâmetro novo, vigente a partir de hoje (SPEC 5.9: nunca editar o antigo).
      await this.repo.inserir('Parametros', [
        { chave: `ids.${chave}`, escopo: '', valor: item.id, vigente_desde: this.estado.hoje },
      ]);
      this.guardarIds({ ...this.estado.ids, [chave]: item.id });
      await this.carregar();
    });
  }

  private async acao(f: () => Promise<void>) {
    this.set({ aviso: null });
    try {
      await f();
    } catch (e) {
      this.tratarErro(e);
    }
  }

  private guardarIds(ids: Partial<IdsBase>) {
    try {
      localStorage.setItem(CHAVE_IDS, JSON.stringify(ids));
    } catch {
      // sem localStorage: os ids continuam em Parametros
    }
    this.set({ ids });
  }
}

function lerIds(): Partial<IdsBase> | null {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_IDS) ?? 'null');
  } catch {
    return null;
  }
}

