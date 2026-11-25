import { montarBase, type Base, type Regravacao } from '../domain/base';
import { lerAba, montarLinha, type AbaLida, type Registro } from '../domain/linhas';
import { aba as specAba, ABAS, NOMES_ABAS, type NomeAba } from '../domain/schema';
import type { Celula } from '../domain/valores';
import type { CelulaParaGravar, FonteTabelas } from './fonte';

/**
 * Repositório (SPEC 4.2): carrega a planilha inteira, devolve o modelo e
 * faz as escritas (append para novos, regravação localizada por id para edições).
 */
export interface Repositorio {
  carregar(hoje: string): Promise<Base>;
  inserir(aba: NomeAba, registros: Registro[]): Promise<void>;
  atualizar(aba: NomeAba, registro: Registro): Promise<void>;
  /**
   * Várias edições com uma leitura da coluna id e uma escrita. `antes` (por id) é
   * a linha como o app a conhecia quando decidiu a edição; só as células que mudaram
   * em relação a ela são gravadas. Sem `antes`, usa a última leitura da planilha.
   */
  atualizarVarios(aba: NomeAba, registros: Registro[], antes?: Record<string, LinhaConhecida>): Promise<void>;
  /** Como o app conhece hoje a linha `id` (para guardar junto de uma escrita na fila). */
  linhaConhecida?(aba: NomeAba, id: string): LinhaConhecida | undefined;
  /** Versão atual da planilha (muda a cada escrita, de qualquer fonte). */
  versao?(): Promise<string | null>;
}

/** Linha da planilha indexada pelo nome da coluna (não depende da ordem das colunas). */
export type LinhaConhecida = Record<string, Celula>;

/** Duas células com o mesmo conteúdo (ignora espaços nas pontas, TRUE/true, 68.9/"68.9"). */
export function mesmaCelula(a: Celula | undefined, b: Celula | undefined): boolean {
  const t = (c: Celula | undefined) => (c === null || c === undefined ? '' : String(c).trim().toLowerCase());
  return t(a) === t(b);
}

/**
 * Células a gravar: só as que mudaram em relação à linha conhecida. Assim, uma
 * correção feita por outra fonte (o usuário ou o segundo cérebro) noutra coluna
 * da mesma linha não é desfeita pelo app. Sem linha conhecida, grava as colunas
 * que o registro traz.
 */
export function celulasAlteradas(
  cabecalho: string[],
  registro: Registro,
  linha: number,
  conhecida: Celula[] | undefined,
): CelulaParaGravar[] {
  const nova = montarLinha(cabecalho, registro, conhecida);
  const r: CelulaParaGravar[] = [];
  cabecalho.forEach((nome, i) => {
    const chave = nome.trim().toLowerCase();
    if (!chave || !(chave in registro)) return;
    if (conhecida && mesmaCelula(conhecida[i], nova[i])) return;
    r.push({ linha, coluna: i, valor: nova[i] });
  });
  return r;
}

export class RepositorioPlanilha implements Repositorio {
  private cabecalhos: Partial<Record<NomeAba, string[]>> = {};
  /** Última versão crua de cada linha, por id (para preservar colunas extras do usuário). */
  private brutas = new Map<string, Celula[]>();

  constructor(private fonte: FonteTabelas, private agora: () => string = () => new Date().toISOString()) {}

  async carregar(hoje: string): Promise<Base> {
    let cru = await this.fonte.lerAbas(NOMES_ABAS);
    const faltam = ABAS.filter((a) => !cru[a.nome]?.[0]?.length || !this.temTodasColunas(a.nome, cru[a.nome]![0]));
    if (faltam.length) {
      const atuais: Partial<Record<NomeAba, string[]>> = {};
      for (const a of faltam) atuais[a.nome] = (cru[a.nome]?.[0] ?? []).map(String);
      await this.fonte.garantirEstrutura(faltam, atuais);
      cru = await this.fonte.lerAbas(NOMES_ABAS);
    }

    const agora = this.agora();
    const lidas: Partial<Record<NomeAba, AbaLida>> = {};
    for (const nome of NOMES_ABAS) {
      lidas[nome] = lerAba(specAba(nome), cru[nome] ?? [[]], agora);
      this.cabecalhos[nome] = lidas[nome]!.cabecalho;
    }
    const { base, regravar } = montarBase(lidas, hoje);

    this.brutas.clear();
    for (const nome of NOMES_ABAS) {
      for (const l of lidas[nome]!.linhas) if (l.registro.id) this.brutas.set(String(l.registro.id), l.bruta);
    }
    if (regravar.length) await this.regravar(regravar);
    return base;
  }

  async inserir(aba: NomeAba, registros: Registro[]): Promise<void> {
    const cab = await this.cabecalho(aba);
    const temId = Boolean(specAba(aba).prefixo);
    let novos = registros;
    if (temId) {
      // Idempotente: se a escrita já tinha chegado (ex.: resposta perdida), não duplica.
      const ids = new Set((await this.fonte.lerColuna(aba, cab.indexOf('id'))).map(String));
      novos = registros.filter((r) => !ids.has(String(r.id)));
    }
    if (!novos.length) return;
    await this.fonte.anexar(aba, novos.map((r) => montarLinha(cab, r)));
  }

  async atualizar(aba: NomeAba, registro: Registro): Promise<void> {
    return this.atualizarVarios(aba, [registro]);
  }

  async atualizarVarios(aba: NomeAba, registros: Registro[], antes?: Record<string, LinhaConhecida>): Promise<void> {
    if (!registros.length) return;
    const cab = await this.cabecalho(aba);
    // SPEC 5: relê a coluna id antes de editar, porque o usuário pode ter ordenado a planilha.
    const ids = await this.fonte.lerColuna(aba, cab.indexOf('id'));
    const celulas: CelulaParaGravar[] = [];
    const conhecidasDepois: Array<[string, Celula[]]> = [];
    for (const registro of registros) {
      const id = String(registro.id);
      const pos = ids.findIndex((v, i) => i > 0 && String(v) === id);
      if (pos < 0) throw new Error(`Não achei o registro ${registro.id} na aba ${aba}`);
      const conhecida = antes?.[id] ? deChaves(cab, antes[id]) : this.brutas.get(id);
      celulas.push(...celulasAlteradas(cab, registro, pos + 1, conhecida));
      conhecidasDepois.push([id, montarLinha(cab, registro, conhecida)]);
    }
    await this.fonte.gravarCelulas(aba, celulas);
    for (const [id, valores] of conhecidasDepois) this.brutas.set(id, valores);
  }

  linhaConhecida(aba: NomeAba, id: string): LinhaConhecida | undefined {
    const bruta = this.brutas.get(id);
    const cab = this.cabecalhos[aba];
    if (!bruta || !cab) return undefined;
    const r: LinhaConhecida = {};
    cab.forEach((nome, i) => {
      const chave = nome.trim().toLowerCase();
      if (chave) r[chave] = bruta[i] ?? '';
    });
    return r;
  }

  versao() {
    return this.fonte.versao();
  }

  private async regravar(itens: Regravacao[]) {
    const porAba = new Map<NomeAba, Regravacao[]>();
    for (const it of itens) porAba.set(it.aba, [...(porAba.get(it.aba) ?? []), it]);
    for (const [aba, lista] of porAba) {
      const cab = this.cabecalhos[aba]!;
      // Linhas que já tinham id: confirma a posição relendo a coluna id.
      const idxId = cab.indexOf('id');
      const ids = idxId >= 0 ? await this.fonte.lerColuna(aba, idxId) : [];
      const gravar = lista.flatMap((it) => {
        const idOriginal = idxId >= 0 ? String(it.bruta[idxId] ?? '') : '';
        let linha = it.linha;
        if (idOriginal) {
          const pos = ids.findIndex((v, i) => i > 0 && String(v) === idOriginal);
          if (pos >= 0) linha = pos + 1;
        }
        return celulasAlteradas(cab, it.registro, linha, it.bruta);
      });
      await this.fonte.gravarCelulas(aba, gravar);
    }
  }

  private temTodasColunas(aba: NomeAba, cabecalho: Celula[]) {
    const tem = new Set(cabecalho.map((c) => String(c ?? '').trim().toLowerCase()));
    return specAba(aba).colunas.every((c) => tem.has(c.nome));
  }

  private async cabecalho(aba: NomeAba): Promise<string[]> {
    if (!this.cabecalhos[aba]) {
      const cru = await this.fonte.lerAbas([aba]);
      this.cabecalhos[aba] = (cru[aba]?.[0] ?? []).map((c) => String(c ?? ''));
    }
    return this.cabecalhos[aba]!;
  }
}

/** Linha indexada por nome de coluna → posições do cabeçalho atual. */
function deChaves(cabecalho: string[], linha: LinhaConhecida): Celula[] {
  return cabecalho.map((nome) => linha[nome.trim().toLowerCase()] ?? '');
}
