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
  /**
   * Grava só as células indicadas (linha na planilha, 1 = cabeçalho; coluna a partir de 0).
   * Gravar célula a célula evita desfazer o que outra fonte (o usuário ou o segundo
   * cérebro) mudou em outras colunas da mesma linha depois da última leitura.
   */
  gravarCelulas(aba: NomeAba, celulas: CelulaParaGravar[]): Promise<void>;
  /**
   * Versão da planilha (Drive: `modifiedTime`). Muda a cada escrita, de qualquer fonte.
   * Serve para saber se o que está no aparelho ficou velho. `null` = não dá para saber.
   */
  versao(): Promise<string | null>;
  /** Cria as abas que faltam (com cabeçalho e validações) e acrescenta colunas que faltam. */
  garantirEstrutura(abas: Aba[], cabecalhosAtuais: Partial<Record<NomeAba, string[]>>): Promise<void>;
}

export interface CelulaParaGravar {
  linha: number;
  coluna: number;
  valor: Celula;
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
