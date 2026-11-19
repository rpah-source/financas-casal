import type { Aba, NomeAba } from '../domain/schema';
import type { Celula } from '../domain/valores';

/**
 * A planilha vista como tabelas cruas. Duas implementações:
 * `MemoriaTabelas` (demonstração e testes) e `SheetsTabelas` (Google Sheets).
 * As regras ficam no Repositório, igual para as duas.
 */
export interface FonteTabelas {
  /** Lê várias abas de uma vez (Sheets: uma chamada `values.batchGet`). */
  lerAbas(abas: NomeAba[]): Promise<Partial<Record<NomeAba, Celula[][]>>>;
  /** Lê só a coluna `id` (para achar a linha atual antes de editar). */
  lerColuna(aba: NomeAba, letraOuIndice: number): Promise<Celula[]>;
  /** Acrescenta linhas no fim da aba. */
  anexar(aba: NomeAba, linhas: Celula[][]): Promise<void>;
  /** Grava várias linhas inteiras (número da linha na planilha, 1 = cabeçalho). */
  gravarLinhas(aba: NomeAba, linhas: Array<{ linha: number; valores: Celula[] }>): Promise<void>;
  /** Cria as abas que faltam (com cabeçalho e validações) e acrescenta colunas que faltam. */
  garantirEstrutura(abas: Aba[], cabecalhosAtuais: Partial<Record<NomeAba, string[]>>): Promise<void>;
}

export class ErroSemConexao extends Error {
  constructor(msg = 'Sem conexão') {
    super(msg);
  }
}

export class ErroSessao extends Error {
  constructor(msg = 'Sessão do Google expirada') {
    super(msg);
  }
}

/** Erros que justificam guardar a escrita na fila e tentar depois. */
export const erroTemporario = (e: unknown) => e instanceof ErroSemConexao || e instanceof ErroSessao;
