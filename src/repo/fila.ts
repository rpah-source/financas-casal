import type { Base } from '../domain/base';
import type { Registro } from '../domain/linhas';
import type { NomeAba } from '../domain/schema';
import type { Armazem } from './armazem';
import { erroTemporario } from './fonte';
import type { Repositorio } from './repositorio';

/**
 * Fila offline (SPEC 4.3): escritas que falham por falta de conexão ou
 * sessão expirada ficam guardadas no aparelho e são reenviadas depois,
 * na mesma ordem. A tela mostra "N itens aguardando envio".
 */
export interface Escrita {
  op: 'inserir' | 'atualizar';
  aba: NomeAba;
  registros: Registro[];
  em: string;
}

const CHAVE = 'fila-escritas';

export class RepositorioComFila implements Repositorio {
  private fila: Escrita[] = [];
  private pronta: Promise<void>;
  private ouvintes = new Set<(n: number) => void>();

  constructor(private repo: Repositorio, private armazem: Armazem) {
    this.pronta = armazem.ler<Escrita[]>(CHAVE).then((f) => {
      this.fila = f ?? [];
      this.avisar();
    });
  }

  get pendentes() {
    return this.fila.length;
  }

  aoMudarPendentes(f: (n: number) => void) {
    this.ouvintes.add(f);
    f(this.fila.length);
    return () => this.ouvintes.delete(f);
  }

  async carregar(hoje: string): Promise<Base> {
    await this.pronta;
    await this.reenviar().catch(() => {});
    return this.repo.carregar(hoje);
  }

  inserir(aba: NomeAba, registros: Registro[]) {
    return this.escrever({ op: 'inserir', aba, registros, em: new Date().toISOString() });
  }

  atualizar(aba: NomeAba, registro: Registro) {
    return this.escrever({ op: 'atualizar', aba, registros: [registro], em: new Date().toISOString() });
  }

  /** Envia o que está na fila, em ordem. Para no primeiro erro temporário. */
  async reenviar(): Promise<void> {
    await this.pronta;
    while (this.fila.length) {
      await this.executar(this.fila[0]);
      this.fila.shift();
      await this.salvar();
    }
  }

  private async escrever(e: Escrita) {
    await this.pronta;
    if (this.fila.length) {
      // Já há itens esperando: entra no fim para manter a ordem.
      this.fila.push(e);
      await this.salvar();
      await this.reenviar().catch((err) => {
        if (!erroTemporario(err)) throw err;
      });
      return;
    }
    try {
      await this.executar(e);
    } catch (err) {
      if (!erroTemporario(err)) throw err;
      this.fila.push(e);
      await this.salvar();
    }
  }

  private async executar(e: Escrita) {
    if (e.op === 'inserir') await this.repo.inserir(e.aba, e.registros);
    else for (const r of e.registros) await this.repo.atualizar(e.aba, r);
  }

  private async salvar() {
    await this.armazem.gravar(CHAVE, this.fila);
    this.avisar();
  }

  private avisar() {
    for (const f of this.ouvintes) f(this.fila.length);
  }
}
