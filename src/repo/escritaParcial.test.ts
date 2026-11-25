import { describe, expect, it } from 'vitest';
import { ArmazemMemoria } from './armazem';
import { ErroSemConexao } from './fonte';
import { RepositorioComFila } from './fila';
import { MemoriaTabelas } from './memoria';
import { celulasAlteradas, RepositorioPlanilha } from './repositorio';
import { agruparCelulas } from './sheets';

const AGORA = '2026-11-19T12:00:00.000Z';
const HOJE = '2026-11-19';

function planilha() {
  return new MemoriaTabelas({
    Contas: [
      ['id', 'nome', 'tipo', 'ativa'],
      ['cta_a', 'Conta Azul', 'corrente', 'TRUE'],
    ],
    Categorias: [
      ['categoria', 'subcategoria', 'natureza_padrao'],
      ['Comida', '', 'variavel'],
      ['Lazer', '', 'variavel'],
    ],
    Lancamentos: [
      ['id', 'tipo', 'status', 'descricao', 'valor', 'data_competencia', 'conta_id', 'categoria', 'projeto_area', 'observacao'],
      ['lan_1', 'despesa', 'realizado', 'Padaria Exemplo', 12, '2026-11-18', 'cta_a', 'Comida', '', ''],
    ],
  });
}

/** Simula outra fonte (segundo cérebro, edição à mão) mudando uma célula da planilha. */
function editarPorFora(fonte: MemoriaTabelas, id: string, coluna: string, valor: string) {
  const t = fonte.abas.Lancamentos!;
  const cab = t[0] as string[];
  const linha = t.find((l) => l[cab.indexOf('id')] === id)!;
  linha[cab.indexOf(coluna)] = valor;
  fonte.revisao++;
}

const valorEm = (fonte: MemoriaTabelas, id: string, coluna: string) => {
  const t = fonte.abas.Lancamentos!;
  const cab = t[0] as string[];
  return t.find((l) => l[cab.indexOf('id')] === id)![cab.indexOf(coluna)];
};

describe('escrita só das células alteradas', () => {
  it('editar um lançamento não desfaz a correção feita por fora em outra coluna', async () => {
    const fonte = planilha();
    const repo = new RepositorioPlanilha(fonte, () => AGORA);
    const base = await repo.carregar(HOJE);
    const l = base.lancamentos[0];

    // O segundo cérebro corrige categoria e projeto depois que o app leu a planilha.
    editarPorFora(fonte, 'lan_1', 'categoria', 'Lazer');
    editarPorFora(fonte, 'lan_1', 'projeto_area', 'Projeto Exemplo');

    // O app, com os dados antigos na memória, edita só a observação.
    await repo.atualizar('Lancamentos', { ...l, observacao: 'nota', atualizado_em: AGORA });

    expect(valorEm(fonte, 'lan_1', 'observacao')).toBe('nota');
    expect(valorEm(fonte, 'lan_1', 'categoria')).toBe('Lazer');
    expect(valorEm(fonte, 'lan_1', 'projeto_area')).toBe('Projeto Exemplo');
    const colunas = fonte.gravadas.filter((g) => g.aba === 'Lancamentos').map((g) => (fonte.abas.Lancamentos![0] as string[])[g.coluna]);
    expect(colunas).toContain('observacao');
    expect(colunas).not.toContain('categoria');
    expect(colunas).not.toContain('projeto_area');
  });

  it('escrita que ficou na fila sem internet também preserva a correção, mesmo depois de recarregar', async () => {
    const fonte = planilha();
    const armazem = new ArmazemMemoria();
    const repo = new RepositorioPlanilha(fonte, () => AGORA);
    const base = await repo.carregar(HOJE);
    const l = base.lancamentos[0];

    // Sem internet: a edição vai para a fila, junto com a linha como o app a conhecia.
    const gravarCelulas = fonte.gravarCelulas.bind(fonte);
    fonte.gravarCelulas = async () => {
      throw new ErroSemConexao();
    };
    const fila = new RepositorioComFila(repo, armazem);
    await fila.atualizar('Lancamentos', { ...l, observacao: 'offline', atualizado_em: AGORA });
    expect(fila.pendentes).toBe(1);

    // Enquanto isso, o segundo cérebro corrige a categoria.
    editarPorFora(fonte, 'lan_1', 'categoria', 'Lazer');

    // O app é reaberto (repositório novo, sem memória da leitura antiga) e a internet volta.
    fonte.gravarCelulas = gravarCelulas;
    const fila2 = new RepositorioComFila(new RepositorioPlanilha(fonte, () => AGORA), armazem);
    await fila2.carregar(HOJE);

    expect(fila2.pendentes).toBe(0);
    expect(valorEm(fonte, 'lan_1', 'observacao')).toBe('offline');
    expect(valorEm(fonte, 'lan_1', 'categoria')).toBe('Lazer');
  });

  it('a versão da planilha muda quando alguém escreve', async () => {
    const fonte = planilha();
    const repo = new RepositorioPlanilha(fonte, () => AGORA);
    await repo.carregar(HOJE);
    const v1 = await repo.versao();
    editarPorFora(fonte, 'lan_1', 'categoria', 'Lazer');
    expect(await repo.versao()).not.toBe(v1);
  });

  it('celulasAlteradas ignora diferenças só de formato', () => {
    const cab = ['id', 'valor', 'conciliado', 'categoria'];
    const conhecida = ['lan_1', '68.9', true, ' Comida '];
    const r = celulasAlteradas(cab, { id: 'lan_1', valor: 68.9, conciliado: 'TRUE', categoria: 'Comida' }, 2, conhecida);
    expect(r).toEqual([]);
  });

  it('agrupa células vizinhas da mesma linha num só intervalo', () => {
    const g = agruparCelulas([
      { linha: 3, coluna: 2, valor: 'b' },
      { linha: 3, coluna: 1, valor: 'a' },
      { linha: 3, coluna: 5, valor: 'x' },
      { linha: 4, coluna: 1, valor: 'y' },
    ]);
    expect(g).toEqual([
      { linha: 3, coluna: 1, valores: ['a', 'b'] },
      { linha: 3, coluna: 5, valores: ['x'] },
      { linha: 4, coluna: 1, valores: ['y'] },
    ]);
  });
});
