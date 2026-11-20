import { describe, expect, it } from 'vitest';
import { lerParametro } from '../domain/parametros';
import { NOMES_ABAS } from '../domain/schema';
import { MemoriaTabelas } from '../repo/memoria';
import { RepositorioPlanilha } from '../repo/repositorio';
import { MemoryStorage } from '../storage/drive';
import { criarBase, NOME_PLANILHA } from './bootstrap';

describe('bootstrap da planilha (SPEC 4.4)', () => {
  it('cria planilha, pasta de faturas, abas, categorias padrão e parâmetros com os ids', async () => {
    const storage = new MemoryStorage();
    const planilhas = new Map<string, MemoriaTabelas>();
    const ids = await criarBase({
      storage,
      pastaFinancasId: 'pasta_fin',
      fontePara: (id) => {
        const f = new MemoriaTabelas();
        planilhas.set(id, f);
        return f;
      },
    });

    expect(storage.arquivos.map((a) => [a.nome, a.paiId])).toEqual([[NOME_PLANILHA, 'pasta_fin']]);
    expect(ids.pasta_faturas).toBe('pasta_fin');
    const fonte = planilhas.get(ids.planilha)!;
    expect(Object.keys(fonte.abas).sort()).toEqual([...NOMES_ABAS].sort());

    const base = await new RepositorioPlanilha(fonte).carregar('2026-11-19');
    expect(base.problemas).toEqual([]);
    expect(base.categorias.find((c) => c.categoria === 'Assinaturas' && !c.subcategoria)?.natureza_padrao).toBe('fixa');
    expect(base.categorias.some((c) => c.subcategoria === 'Delivery')).toBe(true);
    expect(lerParametro(base.parametros, 'margem.pct', '2026-11-19')).toBe('15');
    expect(lerParametro(base.parametros, 'ids.planilha', '2026-11-19')).toBe(ids.planilha);
    expect(lerParametro(base.parametros, 'ids.pasta_faturas', '2026-11-19')).toBe(ids.pasta_faturas);
  });
});
