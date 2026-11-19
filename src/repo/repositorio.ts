import { montarBase, type Base, type Regravacao } from '../domain/base';
import { lerAba, montarLinha, type AbaLida, type Registro } from '../domain/linhas';
import { aba as specAba, ABAS, NOMES_ABAS, type NomeAba } from '../domain/schema';
import type { Celula } from '../domain/valores';
import type { FonteTabelas } from './fonte';

/**
 * Repositório (SPEC 4.2): carrega a planilha inteira, devolve o modelo e
 * faz as escritas (append para novos, regravação localizada por id para edições).
 */
export interface Repositorio {
  carregar(hoje: string): Promise<Base>;
  inserir(aba: NomeAba, registros: Registro[]): Promise<void>;
  atualizar(aba: NomeAba, registro: Registro): Promise<void>;
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
    const cab = await this.cabecalho(aba);
    // SPEC 5: relê a coluna id antes de editar, porque o usuário pode ter ordenado a planilha.
    const ids = await this.fonte.lerColuna(aba, cab.indexOf('id'));
    const pos = ids.findIndex((v, i) => i > 0 && String(v) === String(registro.id));
    if (pos < 0) throw new Error(`Não achei o registro ${registro.id} na aba ${aba}`);
    const linha = montarLinha(cab, registro, this.brutas.get(String(registro.id)));
    await this.fonte.gravarLinhas(aba, [{ linha: pos + 1, valores: linha }]);
    this.brutas.set(String(registro.id), linha);
  }

  private async regravar(itens: Regravacao[]) {
    const porAba = new Map<NomeAba, Regravacao[]>();
    for (const it of itens) porAba.set(it.aba, [...(porAba.get(it.aba) ?? []), it]);
    for (const [aba, lista] of porAba) {
      const cab = this.cabecalhos[aba]!;
      // Linhas que já tinham id: confirma a posição relendo a coluna id.
      const idxId = cab.indexOf('id');
      const ids = idxId >= 0 ? await this.fonte.lerColuna(aba, idxId) : [];
      const gravar = lista.map((it) => {
        const idOriginal = idxId >= 0 ? String(it.bruta[idxId] ?? '') : '';
        let linha = it.linha;
        if (idOriginal) {
          const pos = ids.findIndex((v, i) => i > 0 && String(v) === idOriginal);
          if (pos >= 0) linha = pos + 1;
        }
        return { linha, valores: montarLinha(cab, it.registro, it.bruta) };
      });
      await this.fonte.gravarLinhas(aba, gravar);
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
