/**
 * Armazenamento local chave → valor. No navegador usa IndexedDB
 * (fila offline e cache, SPEC 4.3 e 11b); nos testes, memória.
 */
export interface Armazem {
  ler<T>(chave: string): Promise<T | undefined>;
  gravar<T>(chave: string, valor: T): Promise<void>;
  apagar(chave: string): Promise<void>;
}

export class ArmazemMemoria implements Armazem {
  private m = new Map<string, unknown>();
  async ler<T>(chave: string) {
    return structuredClone(this.m.get(chave)) as T | undefined;
  }
  async gravar<T>(chave: string, valor: T) {
    this.m.set(chave, structuredClone(valor));
  }
  async apagar(chave: string) {
    this.m.delete(chave);
  }
}

export class ArmazemIndexedDB implements Armazem {
  private db: Promise<IDBDatabase>;

  constructor(nome = 'financas-casal') {
    this.db = new Promise((ok, falha) => {
      const req = indexedDB.open(nome, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => ok(req.result);
      req.onerror = () => falha(req.error);
    });
  }

  private async op<T>(modo: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.db;
    return new Promise((ok, falha) => {
      const req = f(db.transaction('kv', modo).objectStore('kv'));
      req.onsuccess = () => ok(req.result as T);
      req.onerror = () => falha(req.error);
    });
  }

  ler<T>(chave: string) {
    return this.op<T | undefined>('readonly', (s) => s.get(chave));
  }
  async gravar<T>(chave: string, valor: T) {
    await this.op('readwrite', (s) => s.put(valor, chave));
  }
  async apagar(chave: string) {
    await this.op('readwrite', (s) => s.delete(chave));
  }
}

/** IndexedDB quando existe; senão memória (o app funciona, só sem persistência). */
export function criarArmazem(): Armazem {
  try {
    if (typeof indexedDB !== 'undefined') return new ArmazemIndexedDB();
  } catch {
    // Safari em modo privado antigo pode recusar IndexedDB.
  }
  return new ArmazemMemoria();
}
