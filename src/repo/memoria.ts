import type { Aba, NomeAba } from '../domain/schema';
import type { Celula } from '../domain/valores';
import type { FonteTabelas } from './fonte';

/** Planilha em memória: usada no modo demonstração e nos testes. */
export class MemoriaTabelas implements FonteTabelas {
  abas: Partial<Record<NomeAba, Celula[][]>>;

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
  }

  async gravarLinhas(aba: NomeAba, linhas: Array<{ linha: number; valores: Celula[] }>) {
    const t = (this.abas[aba] ??= []);
    for (const { linha, valores } of linhas) t[linha - 1] = structuredClone(valores);
  }

  async garantirEstrutura(abas: Aba[]) {
    for (const spec of abas) {
      const t = (this.abas[spec.nome] ??= [[]]);
      const cab = (t[0] ??= []);
      for (const col of spec.colunas) if (!cab.includes(col.nome)) cab.push(col.nome);
    }
  }
}
