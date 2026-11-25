import type { Aba, NomeAba } from '../domain/schema';
import type { Celula } from '../domain/valores';
import type { CelulaParaGravar, FonteTabelas } from './fonte';

/** Planilha em memória: usada no modo demonstração e nos testes. */
export class MemoriaTabelas implements FonteTabelas {
  abas: Partial<Record<NomeAba, Celula[][]>>;
  /** Conta as escritas (faz o papel do `modifiedTime` do Drive). */
  revisao = 0;
  /** Células gravadas por `gravarCelulas` (para os testes conferirem). */
  gravadas: Array<CelulaParaGravar & { aba: NomeAba }> = [];

  constructor(inicial: Partial<Record<NomeAba, Celula[][]>> = {}) {
    this.abas = structuredClone(inicial);
  }

  async lerAbas(abas: NomeAba[]) {
    const r: Partial<Record<NomeAba, Celula[][]>> = {};
    for (const a of abas) if (this.abas[a]) r[a] = structuredClone(this.abas[a]);
    return r;
  }

  async lerColuna(aba: NomeAba, indice: number) {
    return (this.abas[aba] ?? []).map((l) => l[indice] ?? '');
  }

  async anexar(aba: NomeAba, linhas: Celula[][]) {
    (this.abas[aba] ??= []).push(...structuredClone(linhas));
    this.revisao++;
  }

  async gravarCelulas(aba: NomeAba, celulas: CelulaParaGravar[]) {
    if (!celulas.length) return;
    const t = (this.abas[aba] ??= []);
    for (const c of celulas) {
      const linha = (t[c.linha - 1] ??= []);
      while (linha.length < c.coluna) linha.push('');
      linha[c.coluna] = c.valor;
      this.gravadas.push({ ...c, aba });
    }
    this.revisao++;
  }

  async versao() {
    return String(this.revisao);
  }

  async garantirEstrutura(abas: Aba[]) {
    for (const spec of abas) {
      const t = (this.abas[spec.nome] ??= [[]]);
      const cab = (t[0] ??= []);
      for (const col of spec.colunas) if (!cab.includes(col.nome)) cab.push(col.nome);
    }
    this.revisao++;
  }
}
