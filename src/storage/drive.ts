import type { ClienteGoogle } from '../google/http';

/**
 * Armazenamento de arquivos (SPEC 4.2). Neste marco: criar a planilha base
 * e pastas. Envio de faturas e comprovantes chega no M5/M7.
 * Tudo por ID, nunca por caminho (SPEC 4.4, item 6).
 */
export interface DriveStorage {
  criarPasta(nome: string, paiId: string): Promise<string>;
  criarPlanilha(nome: string, paiId: string): Promise<string>;
}

export const MIME_PASTA = 'application/vnd.google-apps.folder';
export const MIME_PLANILHA = 'application/vnd.google-apps.spreadsheet';

export const urlPasta = (id: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;
export const urlPlanilha = (id: string) => `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit`;

export class GoogleDriveStorage implements DriveStorage {
  constructor(private google: ClienteGoogle) {}

  private async criar(nome: string, mimeType: string, paiId: string) {
    const r = await this.google.json<{ id: string }>(
      'https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true',
      { corpo: { name: nome, mimeType, parents: [paiId] } },
    );
    return r.id;
  }

  criarPasta(nome: string, paiId: string) {
    return this.criar(nome, MIME_PASTA, paiId);
  }

  criarPlanilha(nome: string, paiId: string) {
    return this.criar(nome, MIME_PLANILHA, paiId);
  }
}

export interface ArquivoMemoria {
  id: string;
  nome: string;
  mimeType: string;
  paiId: string;
}

export class MemoryStorage implements DriveStorage {
  arquivos: ArquivoMemoria[] = [];
  private n = 0;

  private async criar(nome: string, mimeType: string, paiId: string) {
    const id = `mem_${++this.n}`;
    this.arquivos.push({ id, nome, mimeType, paiId });
    return id;
  }

  criarPasta(nome: string, paiId: string) {
    return this.criar(nome, MIME_PASTA, paiId);
  }

  criarPlanilha(nome: string, paiId: string) {
    return this.criar(nome, MIME_PLANILHA, paiId);
  }
}
