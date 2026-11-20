import { criarBase, type IdsBase } from '../bootstrap/bootstrap';
import { googleConfigurado } from '../config';
import type { Base } from '../domain/base';
import { diffDias, hojeSP } from '../domain/dates';
import { lerParametro, lerParametroNumero, lerPessoas } from '../domain/parametros';
import { planilhaDemo } from '../demo/planilhaDemo';
import { SessaoGoogle } from '../google/auth';
import { criarClienteGoogle } from '../google/http';
import { escolherNoDrive, type TipoEscolha } from '../google/picker';
import { ArmazemMemoria, criarArmazem, type Armazem } from '../repo/armazem';
import { RepositorioComFila } from '../repo/fila';
import { ErroSemConexao, ErroSessao } from '../repo/fonte';
import type { ItemIndice } from '../domain/indice';
import { criarLancamento, duplicarLancamento, type NovoLancamento } from '../domain/lancamento';
import { gerarParcelasDivida, gerarPrevistos } from '../domain/recorrencias';
import { casarComPrevisto, procurarPrevisto } from '../domain/casamento';
import { statusInicial } from '../domain/status';
import {
  cicloDaCompra, cicloDaImportacao, criarParcelamento, faturaParaPagamento, obterFatura, recalcularFatura, sincronizarFaturas, type Fatura,
} from '../domain/faturas';
import type { Lancamento } from '../domain/types';
import type { Registro } from '../domain/linhas';
import { novoId } from '../domain/ids';
import { lerIndice } from '../google/indice';
import type { ArquivoLido } from '../domain/importacao/tipos';
import { lerOFX } from '../domain/importacao/ofx';
import { acharTabela, detectarPerfil, lerCSV, separarCSV, type PerfilCSV } from '../domain/importacao/csv';
import { lerTexto } from '../domain/importacao/texto';
import { atualizarComImportado, conciliar } from '../domain/importacao/conciliacao';
import { lancamentoDaCaixa, previaCaixa, type PreviaCaixa } from '../domain/importacao/caixa';
import { regraCasa } from '../domain/regras';
import { nomeArquivoImportado } from '../domain/arquivos';
import type { Conta, RegistroGenerico } from '../domain/types';
import { MemoriaTabelas } from '../repo/memoria';
import { RepositorioPlanilha } from '../repo/repositorio';
import { SheetsTabelas } from '../repo/sheets';
import { GoogleDriveStorage, MemoryStorage, type DriveStorage } from '../storage/drive';

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
  /** Resumo da última importação desta sessão (para a tela Revisar). */
  ultimaImportacao: ResumoImportacao | null;
}

export interface ResumoImportacao {
  importacaoId: string;
  contaId: string;
  faturaId: string | null;
  linhas: number;
  casados: number;
  sugeridos: number;
  novos: number;
  ignorados: number;
  ignoradasNoArquivo: number;
  naoEncontrados: string[];
  doc: string | null;
  total?: number;
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
      ultimaImportacao: null,
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
      await this.gerarPrevistos();
      await this.sincronizarCartoes();
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

  // ---------- Previstos (SPEC 5.3 e 5.6) ----------

  /** Gera previstos das recorrências e parcelas de dívida (mês atual + 2), sem duplicar. */
  async gerarPrevistos() {
    const base = this.estado.base;
    if (!base || !this.repo) return;
    const cortes = lerParametro(base.parametros, 'semana.cortes', this.estado.hoje) || undefined;
    const novos = [
      ...gerarPrevistos({ recorrencias: base.recorrencias, lancamentos: base.lancamentos, contas: base.contas, hoje: this.estado.hoje, cortes }),
      ...gerarParcelasDivida({ dividas: base.dividas, lancamentos: base.lancamentos, hoje: this.estado.hoje }),
    ];
    if (!novos.length) return;
    this.mudarLancamentos((ls) => [...ls, ...novos]);
    await this.escrever(() => this.repo!.inserir('Lancamentos', novos as unknown as Registro[])).catch(() => {});
  }

  // ---------- Lançamentos ----------

  /** Monta o lançamento e procura um previsto parecido (SPEC 8.1). Não grava nada. */
  prepararLancamento(n: NovoLancamento, regraId?: string | null): { lancamento: Lancamento; previsto: Lancamento | null } {
    const base = this.estado.base;
    if (!base) throw new Error('Os dados ainda não carregaram');
    const lancamento = criarLancamento(n, { contas: base.contas, categorias: base.categorias, hoje: this.estado.hoje });
    const janelaDias = lerParametroNumero(base.parametros, 'conciliacao.janela_dias', this.estado.hoje, 5);
    const previsto = procurarPrevisto({
      novo: lancamento, lancamentos: base.lancamentos, recorrencias: base.recorrencias, regras: base.regras, regraId, janelaDias,
    });
    return { lancamento, previsto };
  }

  /** "É a Faxina prevista de sexta?" → Sim: atualiza o previsto no lugar (SPEC 6.2). */
  async casarComPrevisto(previsto: Lancamento, novo: Lancamento): Promise<Lancamento> {
    const base = this.estado.base!;
    const casado = casarComPrevisto(previsto, novo, { contas: base.contas, hoje: this.estado.hoje });
    await this.editar(casado);
    return casado;
  }

  /** "Isso aconteceu?" (SPEC 6.2): sim, não ou adiar. */
  async resolverVencido(l: Lancamento, resposta: 'sim' | 'nao' | 'adiar') {
    const base = this.estado.base!;
    if (resposta === 'sim') {
      const tipoConta = base.contas.find((c) => c.id === l.conta_id)?.tipo;
      await this.editar({ ...l, status: statusInicial({ tipo: l.tipo, tipoConta, data: l.data_caixa, hoje: this.estado.hoje }) });
    } else if (resposta === 'nao') {
      await this.editar({ ...l, status: 'cancelado' });
    } else {
      await this.editar({ ...l, data_competencia: this.estado.hoje, data_caixa: this.estado.hoje });
    }
  }

  private mudarLancamentos(f: (l: Lancamento[]) => Lancamento[]) {
    const base = this.estado.base;
    if (base) this.set({ base: { ...base, lancamentos: f(base.lancamentos) } });
  }

  /** Salva um lançamento novo (SPEC 10.2). Opcionalmente cria a regra de-para sugerida. */
  async lancar(
    n: NovoLancamento | Lancamento,
    extra: {
      regraId?: string | null;
      novaRegra?: Registro | null;
      casarCom?: Lancamento | null;
      /** Compra parcelada no cartão (SPEC 6.3). */
      parcelas?: number | null;
      /** Pagamento de fatura: qual fatura quitar (senão o app escolhe, SPEC 7). */
      faturaId?: string | null;
    } = {},
  ): Promise<Lancamento> {
    const base = this.estado.base;
    if (!base || !this.repo) throw new Error('Os dados ainda não carregaram');
    let l = 'id' in n ? n : criarLancamento(n, { contas: base.contas, categorias: base.categorias, hoje: this.estado.hoje });
    const conta = base.contas.find((c) => c.id === l.conta_id);
    const destino = base.contas.find((c) => c.id === l.conta_destino_id);
    if (extra.casarCom) {
      l = await this.casarComPrevisto(extra.casarCom, l);
    } else if (conta?.tipo === 'cartao' && l.tipo !== 'transferencia') {
      if (l.tipo === 'receita' && (!l.categoria || l.categoria === 'Sem categoria')) l = { ...l, categoria: 'Estorno', natureza: 'nenhuma' };
      if (l.tipo === 'despesa' && (extra.parcelas ?? 1) >= 2) {
        const r = criarParcelamento({ base: l, parcelas: extra.parcelas!, parametros: base.parametros, faturas: base.faturas, hoje: this.estado.hoje });
        this.set({
          base: {
            ...this.estado.base!,
            faturas: [...this.estado.base!.faturas, ...r.faturasNovas],
            parcelamentos: [...this.estado.base!.parcelamentos, r.parcelamento],
            lancamentos: [...this.estado.base!.lancamentos, ...r.lancamentos],
          },
        });
        await this.escrever(async () => {
          if (r.faturasNovas.length) await this.repo!.inserir('Faturas', r.faturasNovas as unknown as Registro[]);
          await this.repo!.inserir('Parcelamentos', [r.parcelamento]);
          await this.repo!.inserir('Lancamentos', r.lancamentos as unknown as Registro[]);
        });
        l = r.lancamentos[0];
      } else {
        const faturaDada = extra.faturaId ? this.estado.base!.faturas.find((f) => f.id === extra.faturaId) : undefined;
        l = faturaDada ? { ...l, fatura_id: faturaDada.id, data_caixa: faturaDada.data_vencimento } : await this.ligarAFatura(l);
        this.mudarLancamentos((ls) => [...ls, l]);
        await this.escrever(() => this.repo!.inserir('Lancamentos', [l as unknown as Registro]));
      }
    } else if (l.tipo === 'transferencia' && destino?.tipo === 'cartao') {
      // Pagamento de fatura (SPEC 7): liga à fatura e, se já realizado, quita.
      const faturas = base.faturas;
      const fatura = extra.faturaId
        ? faturas.find((f) => f.id === extra.faturaId)
        : faturaParaPagamento(destino.id, l.valor, l.data_caixa, faturas, base.lancamentos)?.fatura;
      if (fatura) l = { ...l, fatura_id: fatura.id, descricao: l.descricao || `Pagamento da fatura ${destino.nome}` };
      this.mudarLancamentos((ls) => [...ls, l]);
      await this.escrever(() => this.repo!.inserir('Lancamentos', [l as unknown as Registro]));
      if (fatura) await this.recalcularFatura(fatura.id);
    } else {
      this.mudarLancamentos((ls) => [...ls, l]);
      await this.escrever(() => this.repo!.inserir('Lancamentos', [l as unknown as Registro]));
    }
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
    const base = this.estado.base!;
    const antes = base.lancamentos.find((x) => x.id === l.id);
    let novo: Lancamento = { ...l, atualizado_em: new Date().toISOString() };
    const conta = base.contas.find((c) => c.id === novo.conta_id);
    // Compra no cartão que mudou de data ou de conta: vai para a fatura certa (SPEC 6.3).
    if (
      conta?.tipo === 'cartao' && novo.tipo !== 'transferencia' && !novo.parcelamento_id && !(novo.conciliado && novo.fatura_id) &&
      (!antes || antes.data_competencia !== novo.data_competencia || antes.conta_id !== novo.conta_id || !novo.fatura_id)
    ) {
      novo = await this.ligarAFatura({ ...novo, fatura_id: null });
    } else if (conta && conta.tipo !== 'cartao' && antes && base.contas.find((c) => c.id === antes.conta_id)?.tipo === 'cartao' && novo.tipo !== 'transferencia') {
      novo = { ...novo, fatura_id: null, data_caixa: novo.data_competencia };
    }
    this.mudarLancamentos((ls) => ls.map((x) => (x.id === l.id ? novo : x)));
    await this.escrever(() => this.repo!.atualizar('Lancamentos', novo as unknown as Registro));
    // Pagamento de fatura editado/excluído: refaz a situação da fatura.
    const faturasAfetadas = new Set([antes?.fatura_id, novo.fatura_id].filter((x): x is string => Boolean(x)));
    if (novo.tipo === 'transferencia' || antes?.tipo === 'transferencia') {
      for (const id of faturasAfetadas) await this.recalcularFatura(id);
    }
  }

  /** Liga uma compra/estorno de cartão à fatura certa (criando a fatura se preciso). */
  private async ligarAFatura(l: Lancamento): Promise<Lancamento> {
    const base = this.estado.base!;
    const ciclo = cicloDaCompra(l.conta_id, l.data_competencia, base.parametros);
    if (!ciclo) return l; // sem fechamento/vencimento cadastrados: fica como está
    const { fatura, nova } = obterFatura(base.faturas, l.conta_id, ciclo, this.estado.hoje);
    if (nova) {
      this.set({ base: { ...this.estado.base!, faturas: [...this.estado.base!.faturas, fatura] } });
      await this.escrever(() => this.repo!.inserir('Faturas', [fatura as unknown as Registro]));
    }
    return { ...l, fatura_id: fatura.id, data_caixa: fatura.data_vencimento };
  }

  /** Refaz status da fatura e das compras dela a partir dos pagamentos (SPEC 6.2). */
  private async recalcularFatura(faturaId: string) {
    const base = this.estado.base!;
    const fatura = base.faturas.find((f) => f.id === faturaId);
    if (!fatura) return;
    const r = recalcularFatura(fatura, base.lancamentos, this.estado.hoje);
    const porId = new Map(r.lancamentosAlterados.map((x) => [x.id, x]));
    this.set({
      base: {
        ...base,
        faturas: base.faturas.map((f) => (f.id === faturaId ? r.fatura : f)),
        lancamentos: base.lancamentos.map((x) => porId.get(x.id) ?? x),
      },
    });
    await this.escrever(async () => {
      if (r.fatura !== fatura) await this.repo!.atualizar('Faturas', r.fatura as unknown as Registro);
      await this.repo!.atualizarVarios('Lancamentos', r.lancamentosAlterados as unknown as Registro[]);
    });
  }

  /** Registra o pagamento de uma fatura (transferência da conta para o cartão). */
  async pagarFatura(fatura: Fatura, valor: number, contaId: string, data: string): Promise<Lancamento> {
    const base = this.estado.base!;
    const cartao = base.contas.find((c) => c.id === fatura.cartao_id);
    const l = criarLancamento(
      {
        tipo: 'transferencia', valor, descricao: `Pagamento da fatura ${cartao?.nome ?? ''}`.trim(), contaId,
        contaDestinoId: fatura.cartao_id, data, quem: 'casal',
      },
      { contas: base.contas, categorias: base.categorias, hoje: this.estado.hoje },
    );
    return this.lancar(l, { faturaId: fatura.id });
  }

  /** Ajuste de saldo (SPEC 7): corrige a diferença entre o app e o banco. */
  async ajustarSaldo(contaId: string, saldoNoBanco: number, saldoNoApp: number): Promise<Lancamento | null> {
    const dif = Math.round((saldoNoBanco - saldoNoApp) * 100) / 100;
    if (Math.abs(dif) < 0.01) return null;
    const base = this.estado.base!;
    const l = criarLancamento(
      { tipo: 'ajuste', valor: Math.abs(dif), descricao: 'Ajuste de saldo', contaId, data: this.estado.hoje, quem: 'casal' },
      { contas: base.contas, categorias: base.categorias, hoje: this.estado.hoje },
    );
    return this.lancar({ ...l, sinal: dif > 0 ? ('+' as const) : ('-' as const), excluir_da_analise: true, natureza: 'nenhuma' });
  }

  /** Ao abrir: liga compras de cartão às faturas e fecha as que já fecharam. */
  async sincronizarCartoes() {
    const base = this.estado.base;
    if (!base || !this.repo) return;
    const s = sincronizarFaturas({ contas: base.contas, faturas: base.faturas, lancamentos: base.lancamentos, parametros: base.parametros, hoje: this.estado.hoje });
    if (!s.faturasNovas.length && !s.faturasAlteradas.length && !s.lancamentosAlterados.length) return;
    const fat = new Map(s.faturasAlteradas.map((f) => [f.id, f]));
    const lan = new Map(s.lancamentosAlterados.map((l) => [l.id, l]));
    this.set({
      base: {
        ...base,
        faturas: [...base.faturas.map((f) => fat.get(f.id) ?? f), ...s.faturasNovas],
        lancamentos: base.lancamentos.map((l) => lan.get(l.id) ?? l),
      },
    });
    await this.escrever(async () => {
      if (s.faturasNovas.length) await this.repo!.inserir('Faturas', s.faturasNovas as unknown as Registro[]);
      if (s.faturasAlteradas.length) await this.repo!.atualizarVarios('Faturas', s.faturasAlteradas as unknown as Registro[]);
      if (s.lancamentosAlterados.length) await this.repo!.atualizarVarios('Lancamentos', s.lancamentosAlterados as unknown as Registro[]);
    }).catch(() => {});
  }

  /**
   * Exclusão lógica (SPEC 5): nunca apaga a linha. Previsto de recorrência
   * vira "cancelado" (pulado), senão a recorrência o criaria de novo.
   * Parcela de compra parcelada: exclui a compra inteira (todas as parcelas).
   */
  async excluir(l: Lancamento) {
    if (l.recorrencia_id && l.status === 'previsto') return this.editar({ ...l, status: 'cancelado' });
    if (l.parcelamento_id) return this.marcarParcelamento(l.parcelamento_id, true);
    return this.editar({ ...l, excluido: true });
  }

  /** Desfaz a exclusão (ou o cancelamento) devolvendo a versão anterior. */
  async desfazerExclusao(l: Lancamento) {
    if (l.parcelamento_id) return this.marcarParcelamento(l.parcelamento_id, false);
    return this.editar({ ...l, excluido: false });
  }

  private async marcarParcelamento(parcelamentoId: string, excluido: boolean) {
    const base = this.estado.base!;
    const agora = new Date().toISOString();
    const parcelas = base.lancamentos.filter((x) => x.parcelamento_id === parcelamentoId).map((x) => ({ ...x, excluido, atualizado_em: agora }));
    const par = base.parcelamentos.find((x) => x.id === parcelamentoId);
    const ids = new Set(parcelas.map((x) => x.id));
    this.set({
      base: {
        ...base,
        lancamentos: base.lancamentos.map((x) => (ids.has(x.id) ? parcelas.find((p) => p.id === x.id)! : x)),
        parcelamentos: base.parcelamentos.map((x) => (x.id === parcelamentoId ? { ...x, excluido, atualizado_em: agora } : x)),
      },
    });
    await this.escrever(async () => {
      await this.repo!.atualizarVarios('Lancamentos', parcelas as unknown as Registro[]);
      if (par) await this.repo!.atualizar('Parcelamentos', { ...par, excluido, atualizado_em: agora });
    });
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

  // ---------- Importação (SPEC 8.2 a 8.5) ----------

  private storage(): DriveStorage {
    if (this.estado.modo === 'google') return new GoogleDriveStorage(this.google);
    return (this.storageDemo ??= new MemoryStorage());
  }
  private storageDemo: MemoryStorage | null = null;

  /** Lê o conteúdo de um arquivo ou texto colado. */
  lerConteudo(p: { nome: string; texto: string; tipoConta: 'cartao' | 'corrente'; perfil?: PerfilCSV | null }):
    | { tipo: 'lido'; lido: ArquivoLido; perfil?: PerfilCSV }
    | { tipo: 'csv-sem-perfil'; linhas: string[][] } {
    const nome = p.nome.toLowerCase();
    if (nome.endsWith('.ofx') || /<OFX>/i.test(p.texto)) return { tipo: 'lido', lido: lerOFX(p.texto) };
    if (nome.endsWith('.csv')) {
      const todas = separarCSV(p.texto);
      const achada = p.perfil ? { linhas: todas.slice(Math.max(0, todas.findIndex((l) => detectarPerfil(l, [p.perfil!])))), perfil: p.perfil } : acharTabela(todas, this.perfisCSV());
      if (!achada.perfil) return { tipo: 'csv-sem-perfil', linhas: todas };
      return { tipo: 'lido', lido: lerCSV(achada.linhas, achada.perfil), perfil: achada.perfil };
    }
    return { tipo: 'lido', lido: lerTexto(p.texto, { tipoConta: p.tipoConta, hoje: this.estado.hoje }) };
  }

  perfisCSV(): PerfilCSV[] {
    const base = this.estado.base;
    if (!base) return [];
    return base.parametros
      .filter((x) => x.chave === 'csv.perfil' && x.valor)
      .map((x) => {
        try {
          return JSON.parse(x.valor!) as PerfilCSV;
        } catch {
          return null;
        }
      })
      .filter((x): x is PerfilCSV => Boolean(x));
  }

  async salvarPerfilCSV(perfil: PerfilCSV) {
    const linha = { chave: 'csv.perfil', escopo: perfil.nome, valor: JSON.stringify(perfil), vigente_desde: this.estado.hoje };
    this.set({ base: { ...this.estado.base!, parametros: [...this.estado.base!.parametros, linha] } });
    await this.escrever(() => this.repo!.inserir('Parametros', [linha]));
  }

  /** Conta lembrada para um identificador de conta do banco (OFX ACCTID). */
  contaLembrada(contaExterna?: string): string | null {
    if (!contaExterna || !this.estado.base) return null;
    return lerParametro(this.estado.base.parametros, 'importacao.conta_externa', this.estado.hoje, contaExterna);
  }

  /**
   * Guarda o arquivo original no Drive (DECISIONS D68): direto na pasta de
   * faturas e comprovantes (sem subpasta por ano — o segundo cérebro usa
   * 3 níveis fixos) e com o nome "AAAA-MM – Fatura|Extrato – <Conta>".
   */
  private async guardarOriginal(p: { conteudo: Blob; ext: string; mimeType: string; conta: Conta; competencia?: string; periodo?: string }) {
    const pasta = this.estado.ids?.pasta_faturas ?? (this.estado.modo === 'demo' ? 'pasta_demo_faturas' : null);
    if (!pasta) return null;
    const nome = nomeArquivoImportado({ conta: p.conta, competencia: p.competencia, periodo: p.periodo, hoje: this.estado.hoje, ext: p.ext });
    return this.storage().enviarArquivo({ nome, mimeType: p.mimeType, conteudo: p.conteudo, paiId: pasta });
  }

  /**
   * Importa um extrato ou fatura (SPEC 8.2): salva o original, registra em
   * Importacoes, concilia (8.4) e grava casamentos e a fila de revisão.
   */
  async importar(p: {
    lido: ArquivoLido | null; // null = PDF (só salva e liga)
    contaId: string;
    vencimento?: string | null;
    original: { nome: string; ext: string; mimeType: string; conteudo: Blob };
    lembrarContaExterna?: string;
  }): Promise<ResumoImportacao> {
    const base = this.estado.base;
    if (!base || !this.repo) throw new Error('Os dados ainda não carregaram');
    const conta = base.contas.find((c) => c.id === p.contaId);
    if (!conta) throw new Error('Escolha a conta ou o cartão');
    const agora = new Date().toISOString();
    const linhas = p.lido?.linhas ?? [];

    // Fatura importada (cartão).
    let fatura: Fatura | null = null;
    let faturaNova = false;
    if (conta.tipo === 'cartao') {
      const ciclo = cicloDaImportacao(conta.id, { vencimento: p.vencimento || p.lido?.vencimento, fim: p.lido?.fim, datas: linhas.map((l) => l.data) }, base.parametros);
      if (ciclo) {
        const r = obterFatura(base.faturas, conta.id, ciclo, this.estado.hoje, agora);
        fatura = r.fatura;
        faturaNova = r.nova;
      }
    }

    // 1) Original no Drive (não bloqueia a importação se falhar).
    let doc: string | null = null;
    try {
      const enviado = await this.guardarOriginal({
        conteudo: p.original.conteudo, ext: p.original.ext, mimeType: p.original.mimeType, conta,
        competencia: fatura?.competencia, periodo: (p.lido?.fim ?? [...linhas.map((l) => l.data)].sort().at(-1))?.slice(0, 7),
      });
      doc = enviado?.url ?? null;
    } catch {
      doc = null;
    }

    // 2) Conciliação.
    const importacaoId = novoId('imp');
    const r = conciliar(linhas, {
      contaId: conta.id, contas: base.contas, lancamentos: base.lancamentos, regras: base.regras, recorrencias: base.recorrencias,
      categorias: base.categorias, caixaEntrada: base.caixaEntrada, hoje: this.estado.hoje, importacaoId, fatura,
      janelaDias: lerParametroNumero(base.parametros, 'conciliacao.janela_dias', this.estado.hoje, 5),
      pessoas: lerPessoas(base.parametros, this.estado.hoje), agoraISO: agora,
    });
    const tipoArquivo = !p.lido ? 'pdf' : p.lido.formato;
    const importacao = {
      id: importacaoId, data: this.estado.hoje, conta_id: conta.id, tipo_arquivo: tipoArquivo, nome_arquivo: p.original.nome, doc: doc ?? '',
      linhas_lidas: linhas.length, casados: r.casados.length, sugeridos: r.sugeridos, novos: r.novos, ignorados: r.ignorados,
      fatura_id: fatura?.id ?? '', excluido: false, criado_em: agora, atualizado_em: agora,
    };
    if (fatura) {
      fatura = { ...fatura, valor_importado: p.lido?.total ?? fatura.valor_importado ?? null, doc: doc ?? fatura.doc ?? null, atualizado_em: agora };
    }

    // 3) Estado local e planilha.
    const casadosPorId = new Map(r.casados.map((l) => [l.id, l]));
    this.set({
      base: {
        ...base,
        faturas: fatura ? (faturaNova ? [...base.faturas, fatura] : base.faturas.map((f) => (f.id === fatura!.id ? fatura! : f))) : base.faturas,
        lancamentos: base.lancamentos.map((l) => casadosPorId.get(l.id) ?? l),
        caixaEntrada: [...base.caixaEntrada, ...r.caixa],
        importacoes: [...base.importacoes, importacao],
        parametros: p.lembrarContaExterna
          ? [...base.parametros, { chave: 'importacao.conta_externa', escopo: p.lembrarContaExterna, valor: conta.id, vigente_desde: this.estado.hoje }]
          : base.parametros,
      },
    });
    await this.escrever(async () => {
      if (fatura) {
        if (faturaNova) await this.repo!.inserir('Faturas', [fatura as unknown as Registro]);
        else await this.repo!.atualizar('Faturas', fatura as unknown as Registro);
      }
      await this.repo!.inserir('Importacoes', [importacao]);
      if (r.casados.length) await this.repo!.atualizarVarios('Lancamentos', r.casados as unknown as Registro[]);
      if (r.caixa.length) await this.repo!.inserir('CaixaEntrada', r.caixa as Registro[]);
      if (p.lembrarContaExterna) {
        await this.repo!.inserir('Parametros', [{ chave: 'importacao.conta_externa', escopo: p.lembrarContaExterna, valor: conta.id, vigente_desde: this.estado.hoje }]);
      }
    });
    for (const id of new Set(r.casados.filter((l) => l.tipo === 'transferencia' && l.fatura_id).map((l) => l.fatura_id!))) {
      await this.recalcularFatura(id);
    }
    const resumo: ResumoImportacao = {
      importacaoId, contaId: conta.id, faturaId: fatura?.id ?? null, linhas: linhas.length, casados: r.casados.length,
      sugeridos: r.sugeridos, novos: r.novos, ignorados: r.ignorados, ignoradasNoArquivo: p.lido?.ignoradas ?? 0,
      naoEncontrados: r.naoEncontrados.map((l) => l.id), doc, total: p.lido?.total,
    };
    this.set({ ultimaImportacao: resumo });
    return resumo;
  }

  private async atualizarCaixa(itens: RegistroGenerico[]) {
    if (!itens.length) return;
    const agora = new Date().toISOString();
    const novos: RegistroGenerico[] = itens.map((i) => ({ ...i, atualizado_em: agora }));
    const porId = new Map(novos.map((i) => [i.id, i]));
    this.set({ base: { ...this.estado.base!, caixaEntrada: this.estado.base!.caixaEntrada.map((c) => porId.get(c.id) ?? c) } });
    await this.escrever(() => this.repo!.atualizarVarios('CaixaEntrada', novos as Registro[]));
  }

  private contextoCaixa() {
    const base = this.estado.base!;
    return { contas: base.contas, categorias: base.categorias, regras: base.regras, pessoas: lerPessoas(base.parametros, this.estado.hoje), hoje: this.estado.hoje };
  }

  previaCaixa(item: RegistroGenerico) {
    return previaCaixa(item, this.contextoCaixa());
  }

  /** Aceita um item da caixa de entrada: vira lançamento e o item fica "aceito". */
  async aceitarCaixa(item: RegistroGenerico, ajustes: Partial<PreviaCaixa> = {}): Promise<Lancamento> {
    const base = this.estado.base!;
    const l = lancamentoDaCaixa(item, this.contextoCaixa(), ajustes);
    const imp = base.importacoes.find((i) => i.id === item.importacao_id);
    const faturaId = l.tipo !== 'transferencia' ? ((imp?.fatura_id as string) || null) : null;
    const salvo = await this.lancar(l, { faturaId, regraId: previaCaixa(item, this.contextoCaixa()).regraId });
    await this.atualizarCaixa([{ ...item, status: 'aceito', lancamento_id: salvo.id }]);
    return salvo;
  }

  /** "Aceitar todos" (SPEC 8.4, item 3): grava de uma vez. */
  async aceitarVarios(itens: RegistroGenerico[]): Promise<number> {
    const base = this.estado.base!;
    const ctx = this.contextoCaixa();
    const lote: Lancamento[] = [];
    const aceitos: RegistroGenerico[] = [];
    const transferencias: RegistroGenerico[] = [];
    let faturas = [...base.faturas];
    const faturasNovas: Fatura[] = [];
    for (const item of itens) {
      if (String(item.tipo_sugerido).startsWith('transferencia')) {
        transferencias.push(item);
        continue;
      }
      let l: Lancamento;
      try {
        l = lancamentoDaCaixa(item, ctx);
      } catch {
        continue; // sem conta ou valor: fica para o usuário completar
      }
      const conta = base.contas.find((c) => c.id === l.conta_id);
      if (conta?.tipo === 'cartao') {
        const imp = base.importacoes.find((i) => i.id === item.importacao_id);
        let f = faturas.find((x) => x.id === imp?.fatura_id);
        if (!f) {
          const ciclo = cicloDaCompra(conta.id, l.data_competencia, base.parametros);
          if (ciclo) {
            const r = obterFatura(faturas, conta.id, ciclo, this.estado.hoje);
            f = r.fatura;
            if (r.nova) {
              faturas = [...faturas, f];
              faturasNovas.push(f);
            }
          }
        }
        if (f) l = { ...l, fatura_id: f.id, data_caixa: f.data_vencimento, status: f.status === 'paga' ? 'realizado' : 'agendado' };
      }
      lote.push(l);
      aceitos.push({ ...item, status: 'aceito', lancamento_id: l.id });
    }
    this.set({ base: { ...this.estado.base!, faturas, lancamentos: [...this.estado.base!.lancamentos, ...lote] } });
    await this.escrever(async () => {
      if (faturasNovas.length) await this.repo!.inserir('Faturas', faturasNovas as unknown as Registro[]);
      if (lote.length) await this.repo!.inserir('Lancamentos', lote as unknown as Registro[]);
    });
    await this.atualizarCaixa(aceitos);
    for (const t of transferencias) await this.aceitarCaixa(t).catch(() => {});
    return lote.length + transferencias.length;
  }

  /** "É esse" (SPEC 8.4, item 2): atualiza o candidato com os dados do banco. */
  async confirmarSugestao(item: RegistroGenerico) {
    const base = this.estado.base!;
    const c = base.lancamentos.find((l) => l.id === item.lancamento_id);
    const conta = base.contas.find((x) => x.id === item.conta_id);
    if (!c || !conta) return this.rejeitarSugestao(item);
    const imp = base.importacoes.find((i) => i.id === item.importacao_id);
    const fatura = base.faturas.find((f) => f.id === imp?.fatura_id) ?? null;
    const q = String(item.quem ?? '');
    const novo = atualizarComImportado(
      c,
      { data: String(item.data), descricao: String(item.descricao_original || item.texto || ''), valor: Number(item.valor), sentido: 'saida' },
      {
        chave: String(item.chave_dedupe ?? ''), conta, quem: q === 'pessoa1' || q === 'pessoa2' || q === 'casal' ? q : null, agora: new Date().toISOString(),
        ctx: { contas: base.contas, hoje: this.estado.hoje, importacaoId: String(item.importacao_id ?? ''), fatura },
      },
    );
    await this.editar(novo);
    await this.atualizarCaixa([{ ...item, status: 'aceito', lancamento_id: c.id }]);
  }

  /**
   * Item da caixa de entrada (ex.: comprovante lido pelo segundo cérebro) que
   * talvez já esteja lançado: mesmo valor, mesma conta e data ±janela.
   */
  lancamentoParecido(item: RegistroGenerico, contaId: string | null): Lancamento | null {
    const base = this.estado.base!;
    const p = previaCaixa(item, this.contextoCaixa());
    const conta = contaId ?? p.contaId;
    if (!p.valor) return null;
    const janela = lerParametroNumero(base.parametros, 'conciliacao.janela_dias', this.estado.hoje, 5);
    return (
      base.lancamentos.find(
        (l) =>
          !l.excluido && l.status !== 'cancelado' && (!conta || l.conta_id === conta) &&
          Math.abs(l.valor - p.valor!) < 0.005 && Math.abs(diffDias(l.data_competencia, p.data)) <= janela,
      ) ?? null
    );
  }

  /** "É esse": liga o item (e o comprovante dele) a um lançamento existente. */
  async vincularCaixa(item: RegistroGenerico, l: Lancamento) {
    const doc = String(item.doc ?? '').trim();
    if (doc && !(l.docs ?? '').includes(doc)) await this.editar({ ...l, docs: [l.docs, doc].filter(Boolean).join(' ') });
    await this.atualizarCaixa([{ ...item, status: 'aceito', lancamento_id: l.id }]);
  }

  /** "Não, é outro": o item passa para a lista de novos. */
  rejeitarSugestao(item: RegistroGenerico) {
    return this.atualizarCaixa([{ ...item, lancamento_id: '' }]);
  }

  descartarCaixa(item: RegistroGenerico) {
    return this.atualizarCaixa([{ ...item, status: 'descartado' }]);
  }

  /** Muda a categoria de um item antes de aceitar. */
  categorizarCaixa(item: RegistroGenerico, categoria: string, subcategoria: string | null) {
    return this.atualizarCaixa([{ ...item, categoria, subcategoria: subcategoria ?? '' }]);
  }

  /** "Criar regra para 'PADRAO'?" (SPEC 8.4, item 4). */
  async criarRegra(r: { padrao: string; descricao?: string; categoria: string; subcategoria?: string | null; contaId?: string | null }) {
    const agora = new Date().toISOString();
    const regra = {
      id: novoId('reg'), padrao: r.padrao, conta_id: r.contaId ?? '', descricao: r.descricao ?? '', categoria: r.categoria,
      subcategoria: r.subcategoria ?? '', natureza: '', quem: '', recorrencia_id: '', prioridade: 0, vezes_usada: 0, ativa: true,
      excluido: false, criado_em: agora, atualizado_em: agora,
    };
    this.set({ base: { ...this.estado.base!, regras: [...this.estado.base!.regras, regra] } });
    await this.escrever(() => this.repo!.inserir('Regras', [regra]));
    // Aplica a regra nova aos itens pendentes que ela pega.
    const pendentes = this.estado.base!.caixaEntrada.filter(
      (c) => c.status === 'novo' && !c.lancamento_id && regraCasa(r.padrao, String(c.texto ?? '')) && !String(c.tipo_sugerido).startsWith('transferencia'),
    );
    await this.atualizarCaixa(pendentes.map((c) => ({ ...c, categoria: r.categoria, subcategoria: r.subcategoria ?? '' })));
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

  async escolherPastaFaturas() {
    await this.escolherEGravar('pasta', 'pasta_faturas', 'Escolha a pasta para faturas, extratos e comprovantes');
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

