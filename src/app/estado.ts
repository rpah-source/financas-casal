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
import type { ItemIndice } from '../domain/indice';
import { criarLancamento, duplicarLancamento, type NovoLancamento } from '../domain/lancamento';
import type { Lancamento } from '../domain/types';
import type { Registro } from '../domain/linhas';
import { novoId } from '../domain/ids';
import { lerIndice } from '../google/indice';
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
  /** Projetos e áreas (do índice do segundo cérebro ou da aba ProjetosAreas). */
  projetosAreas: ItemIndice[];
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
      projetosAreas: [],
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
      void this.prepararProjetosAreas();
      if (this.estado.modo === 'google' && this.estado.ids?.planilha) {
        await this.armazem.gravar(`base:${this.estado.ids.planilha}`, base).catch(() => {});
      }
    } catch (e) {
      this.tratarErro(e);
    }
  }

  // ---------- Projetos e áreas (SPEC 4.5 a) ----------

  private chaveIndice() {
    return `fc.indice:${this.estado.ids?.indice ?? ''}`;
  }

  private async prepararProjetosAreas() {
    const base = this.estado.base;
    if (!base) return;
    if (this.estado.modo === 'google' && this.estado.ids?.indice) {
      try {
        const cache = JSON.parse(localStorage.getItem(this.chaveIndice()) ?? 'null') as ItemIndice[] | null;
        if (cache) {
          this.set({ projetosAreas: cache });
          return;
        }
      } catch {
        // sem cache
      }
      await this.atualizarListas();
      return;
    }
    // Sem índice: usa a aba local ProjetosAreas (5.10).
    const locais: ItemIndice[] = base.projetosAreas
      .filter((r) => r.ativo !== false && r.nome)
      .map((r) => ({
        nome: String(r.nome),
        tipo: r.tipo === 'projeto' ? 'projeto' : 'area',
        id: (r.id_indice as string) || null,
        pastaId: null,
      }));
    this.set({ projetosAreas: locais });
  }

  /** Botão "Atualizar listas": relê o índice. */
  async atualizarListas() {
    const base = this.estado.base;
    const indice = this.estado.ids?.indice;
    if (!base || !indice || this.estado.modo !== 'google') return this.prepararProjetosAreas();
    await this.acao(async () => {
      const itens = await lerIndice(this.google, indice, base.parametros, this.estado.hoje);
      try {
        localStorage.setItem(this.chaveIndice(), JSON.stringify(itens));
      } catch {
        // sem cache
      }
      this.set({ projetosAreas: itens });
    });
  }

  // ---------- Lançamentos ----------

  private mudarLancamentos(f: (l: Lancamento[]) => Lancamento[]) {
    const base = this.estado.base;
    if (base) this.set({ base: { ...base, lancamentos: f(base.lancamentos) } });
  }

  /** Salva um lançamento novo (SPEC 10.2). Opcionalmente cria a regra de-para sugerida. */
  async lancar(n: NovoLancamento, extra: { regraId?: string | null; novaRegra?: Registro | null } = {}): Promise<Lancamento> {
    const base = this.estado.base;
    if (!base || !this.repo) throw new Error('Os dados ainda não carregaram');
    const l = criarLancamento(n, { contas: base.contas, categorias: base.categorias, hoje: this.estado.hoje });
    this.mudarLancamentos((ls) => [...ls, l]);
    await this.escrever(() => this.repo!.inserir('Lancamentos', [l as unknown as Registro]));
    if (extra.novaRegra) {
      const agora = new Date().toISOString();
      const regra = { id: novoId('reg'), prioridade: 0, vezes_usada: 1, ativa: true, excluido: false, criado_em: agora, atualizado_em: agora, ...extra.novaRegra };
      this.set({ base: { ...this.estado.base!, regras: [...this.estado.base!.regras, regra] } });
      await this.escrever(() => this.repo!.inserir('Regras', [regra]));
    } else if (extra.regraId) {
      const r = this.estado.base!.regras.find((x) => x.id === extra.regraId);
      if (r) {
        const nova = { ...r, vezes_usada: Number(r.vezes_usada ?? 0) + 1, atualizado_em: new Date().toISOString() };
        this.set({ base: { ...this.estado.base!, regras: this.estado.base!.regras.map((x) => (x.id === r.id ? nova : x)) } });
        void this.escrever(() => this.repo!.atualizar('Regras', nova)).catch(() => {});
      }
    }
    return l;
  }

  async editar(l: Lancamento) {
    const novo = { ...l, atualizado_em: new Date().toISOString() };
    this.mudarLancamentos((ls) => ls.map((x) => (x.id === l.id ? novo : x)));
    await this.escrever(() => this.repo!.atualizar('Lancamentos', novo as unknown as Registro));
  }

  /** Exclusão lógica (SPEC 5): nunca apaga a linha. */
  excluir(l: Lancamento) {
    return this.editar({ ...l, excluido: true });
  }

  desfazerExclusao(l: Lancamento) {
    return this.editar({ ...l, excluido: false });
  }

  async duplicar(l: Lancamento): Promise<Lancamento> {
    const base = this.estado.base!;
    const d = duplicarLancamento(l, { contas: base.contas, hoje: this.estado.hoje });
    this.mudarLancamentos((ls) => [...ls, d]);
    await this.escrever(() => this.repo!.inserir('Lancamentos', [d as unknown as Registro]));
    return d;
  }

  /** Escrita com tratamento de erro: falhas de conexão já ficam na fila. */
  private async escrever(f: () => Promise<void>) {
    try {
      await f();
    } catch (e) {
      this.tratarErro(e);
      throw e;
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
    this.set({ modo: 'demo', ids: null, base: null, precisaEntrarDeNovo: false, pendentes: 0, projetosAreas: [] });
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
    await this.atualizarListas();
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

