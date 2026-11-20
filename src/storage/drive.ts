import type { ClienteGoogle } from '../google/http';

/**
 * Armazenamento de arquivos (SPEC 4.2). Neste marco: criar a planilha base
 * e pastas. Envio de faturas e comprovantes chega no M5/M7.
 * Tudo por ID, nunca por caminho (SPEC 4.4, item 6).
 */
export interface ArquivoEnviado {
  id: string;
  url: string;
}

export interface DriveStorage {
  criarPasta(nome: string, paiId: string): Promise<string>;
  criarPlanilha(nome: string, paiId: string): Promise<string>;
  /** Acha a subpasta pelo nome (só as que o app criou, por causa do drive.file) ou cria. */
  obterOuCriarPasta(nome: string, paiId: string): Promise<string>;
  enviarArquivo(p: { nome: string; mimeType: string; conteudo: Blob; paiId: string; descricao?: string }): Promise<ArquivoEnviado>;
}

export const urlArquivo = (id: string) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;

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

  async obterOuCriarPasta(nome: string, paiId: string) {
    const q = `'${paiId.replace(/'/g, "\\'")}' in parents and name = '${nome.replace(/'/g, "\\'")}' and mimeType = '${MIME_PASTA}' and trashed = false`;
    const r = await this.google.json<{ files: Array<{ id: string }> }>(
      `https://www.googleapis.com/drive/v3/files?fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&q=${encodeURIComponent(q)}`,
    );
    return r.files[0]?.id ?? this.criarPasta(nome, paiId);
  }

  /** Upload "multipart" da Drive API v3 (metadados + conteúdo numa chamada). */
  async enviarArquivo(p: { nome: string; mimeType: string; conteudo: Blob; paiId: string; descricao?: string }) {
    const fronteira = `fc${Math.random().toString(36).slice(2)}`;
    const meta = JSON.stringify({ name: p.nome, parents: [p.paiId], description: p.descricao, mimeType: p.mimeType });
    const corpo = new Blob([
      `--${fronteira}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
      `--${fronteira}\r\nContent-Type: ${p.mimeType}\r\n\r\n`,
      p.conteudo,
      `\r\n--${fronteira}--`,
    ]);
    const r = await this.google.enviar<{ id: string; webViewLink?: string }>(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true',
      corpo,
      `multipart/related; boundary=${fronteira}`,
    );
    return { id: r.id, url: r.webViewLink ?? urlArquivo(r.id) };
  }
}

export interface ArquivoMemoria {
  id: string;
  nome: string;
  mimeType: string;
  paiId: string;
  descricao?: string;
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

  async obterOuCriarPasta(nome: string, paiId: string) {
    return this.arquivos.find((a) => a.nome === nome && a.paiId === paiId && a.mimeType === MIME_PASTA)?.id ?? this.criarPasta(nome, paiId);
  }

  async enviarArquivo(p: { nome: string; mimeType: string; conteudo: Blob; paiId: string; descricao?: string }) {
    const id = await this.criar(p.nome, p.mimeType, p.paiId);
    this.arquivos[this.arquivos.length - 1].descricao = p.descricao;
    return { id, url: urlArquivo(id) };
  }
}
