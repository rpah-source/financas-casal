import { describe, expect, it } from 'vitest';
import { ArmazemMemoria } from './armazem';
import { ErroSemConexao, ErroSessao } from './fonte';
import { RepositorioComFila } from './fila';
import type { Repositorio } from './repositorio';
import type { Registro } from '../domain/linhas';

function repoFalso() {
  const gravados: Registro[] = [];
  let falha: Error | null = null;
  const repo: Repositorio = {
    carregar: async () => ({}) as never,
    inserir: async (_aba, regs) => {
      if (falha) throw falha;
      gravados.push(...regs);
    },
    atualizar: async (_aba, reg) => {
      if (falha) throw falha;
      gravados.push(reg);
    },
  };
  return { repo, gravados, falhar: (e: Error | null) => (falha = e) };
}

describe('fila offline', () => {
  it('guarda escritas sem conexão e reenvia na ordem', async () => {
    const f = repoFalso();
    const armazem = new ArmazemMemoria();
    const fila = new RepositorioComFila(f.repo, armazem);
    f.falhar(new ErroSemConexao());
    await fila.inserir('Lancamentos', [{ id: 'a' }]);
    await fila.inserir('Lancamentos', [{ id: 'b' }]);
    expect(fila.pendentes).toBe(2);
    expect(f.gravados).toEqual([]);

    f.falhar(null);
    await fila.reenviar();
    expect(fila.pendentes).toBe(0);
    expect(f.gravados.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('sobrevive a fechar o app (fila persistida)', async () => {
    const f = repoFalso();
    const armazem = new ArmazemMemoria();
    f.falhar(new ErroSessao());
    await new RepositorioComFila(f.repo, armazem).inserir('Lancamentos', [{ id: 'x' }]);
    const reaberta = new RepositorioComFila(f.repo, armazem);
    f.falhar(null);
    await reaberta.reenviar();
    expect(f.gravados.map((r) => r.id)).toEqual(['x']);
  });

  it('erro que não é de conexão aparece para o usuário (não vai para a fila)', async () => {
    const f = repoFalso();
    const fila = new RepositorioComFila(f.repo, new ArmazemMemoria());
    f.falhar(new Error('dado inválido'));
    await expect(fila.inserir('Lancamentos', [{ id: 'z' }])).rejects.toThrow('dado inválido');
    expect(fila.pendentes).toBe(0);
  });

  it('nova escrita espera as anteriores da fila', async () => {
    const f = repoFalso();
    const fila = new RepositorioComFila(f.repo, new ArmazemMemoria());
    f.falhar(new ErroSemConexao());
    await fila.inserir('Lancamentos', [{ id: '1' }]);
    f.falhar(null);
    await fila.inserir('Lancamentos', [{ id: '2' }]);
    expect(f.gravados.map((r) => r.id)).toEqual(['1', '2']);
    expect(fila.pendentes).toBe(0);
  });
});
