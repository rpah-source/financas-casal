import { describe, expect, it } from 'vitest';
import { categoriasPadrao } from './categoriasPadrao';
import { agruparPorDia, filtrarLancamentos, totalFiltro } from './filtros';
import { idPasta, lerGradeIndice, type Grade } from './indice';
import { criarLancamento, duplicarLancamento } from './lancamento';
import type { Categoria, Conta } from './types';

const contas = [
  { id: 'cta_azul', nome: 'Conta Azul', tipo: 'corrente' },
  { id: 'cta_verde', nome: 'Cartão Verde', tipo: 'cartao' },
] as Conta[];
const categorias = categoriasPadrao() as unknown as Categoria[];
const ctx = { contas, categorias, hoje: '2026-11-19', agoraISO: '2026-11-19T12:00:00Z' };

describe('criar lançamento', () => {
  it('gasto no cartão entra agendado; natureza vem da categoria', () => {
    const l = criarLancamento(
      { tipo: 'despesa', valor: 39.9, descricao: 'Streaming', contaId: 'cta_verde', data: '2026-11-19', quem: 'casal', categoria: 'Assinaturas' },
      ctx,
    );
    expect(l).toMatchObject({ status: 'agendado', natureza: 'fixa', origem: 'manual', excluido: false });
    expect(l.id).toMatch(/^lan_/);
  });

  it('gasto na conta hoje = realizado; no futuro = agendado', () => {
    const base = { tipo: 'despesa' as const, valor: 10, descricao: 'x', contaId: 'cta_azul', quem: 'casal' as const };
    expect(criarLancamento({ ...base, data: '2026-11-19' }, ctx).status).toBe('realizado');
    expect(criarLancamento({ ...base, data: '2026-11-25' }, ctx).status).toBe('agendado');
  });

  it('transferência fica fora das categorias', () => {
    const l = criarLancamento(
      { tipo: 'transferencia', valor: 100, descricao: '', contaId: 'cta_azul', contaDestinoId: 'cta_verde', data: '2026-11-19', quem: 'casal', categoria: 'Lazer' },
      ctx,
    );
    expect(l).toMatchObject({ natureza: 'nenhuma', categoria: null, conta_destino_id: 'cta_verde' });
  });

  it('recusa valor zero e transferência sem destino', () => {
    expect(() => criarLancamento({ tipo: 'despesa', valor: 0, descricao: '', contaId: 'cta_azul', data: '2026-11-19', quem: 'casal' }, ctx)).toThrow();
    expect(() => criarLancamento({ tipo: 'transferencia', valor: 5, descricao: '', contaId: 'cta_azul', data: '2026-11-19', quem: 'casal' }, ctx)).toThrow();
  });

  it('duplicar cria outro id com a data de hoje', () => {
    const l = criarLancamento({ tipo: 'despesa', valor: 10, descricao: 'x', contaId: 'cta_azul', data: '2026-11-10', quem: 'casal' }, ctx);
    const d = duplicarLancamento(l, ctx);
    expect(d.id).not.toBe(l.id);
    expect(d.data_competencia).toBe('2026-11-19');
  });
});

describe('filtros do Extrato', () => {
  const mk = (o: object) =>
    criarLancamento({ tipo: 'despesa', valor: 10, descricao: 'x', contaId: 'cta_azul', data: '2026-11-10', quem: 'casal', ...o }, ctx);
  const lancs = [
    mk({ descricao: 'Farmácia', categoria: 'Saúde', quem: 'pessoa1' }),
    mk({ descricao: 'Mercado', categoria: 'Alimentação', valor: 100 }),
    mk({ descricao: 'Sem cat' }),
    mk({ data: '2026-10-30', descricao: 'Outubro' }),
    { ...mk({ descricao: 'Apagado' }), excluido: true },
    mk({ tipo: 'receita', valor: 50, descricao: 'Reembolso' }),
  ];

  it('filtra por mês, pessoa, busca e sem categoria', () => {
    expect(filtrarLancamentos(lancs, { mes: '2026-11' }).length).toBe(4);
    expect(filtrarLancamentos(lancs, { mes: '2026-11', quem: 'pessoa1' }).map((l) => l.descricao)).toEqual(['Farmácia']);
    expect(filtrarLancamentos(lancs, { mes: '2026-11', busca: 'farmacia' }).length).toBe(1);
    expect(filtrarLancamentos(lancs, { mes: '2026-11', semCategoria: true }).map((l) => l.descricao)).toEqual(['Sem cat', 'Reembolso']);
  });

  it('soma com sinal e agrupa por dia', () => {
    const f = filtrarLancamentos(lancs, { mes: '2026-11' });
    expect(totalFiltro(f)).toEqual({ total: -70, itens: 4 });
    expect(agruparPorDia(f)).toHaveLength(1);
  });
});

describe('planilha-índice do segundo cérebro (teste de aceitação 18)', () => {
  const link = (id: string) => ({ formattedValue: 'Pasta', hyperlink: `https://drive.google.com/drive/folders/${id}` });
  const projetos: Grade = [
    { values: [{ formattedValue: 'ID' }, { formattedValue: 'Nome' }, { formattedValue: 'Status' }, { formattedValue: 'Pasta' }] },
    { values: [{ formattedValue: 'P-0001' }, { formattedValue: 'Reforma fictícia' }, { formattedValue: 'Ativo' }, link('PASTA_PROJ_0001')] },
    { values: [{ formattedValue: 'P-0002' }, { formattedValue: 'Ideia futura' }, { formattedValue: 'Incubado' }, {}] },
    { values: [{ formattedValue: 'P-0003' }, { formattedValue: 'Projeto antigo' }, { formattedValue: 'Concluído' }, {}] },
  ];
  const areas: Grade = [
    { values: [{ formattedValue: 'Nome' }, { formattedValue: 'Status' }, { formattedValue: 'Pasta' }] },
    {
      values: [
        { formattedValue: 'Pets' },
        { formattedValue: 'Ativa' },
        { userEnteredValue: { formulaValue: '=HYPERLINK("https://drive.google.com/drive/folders/PASTA_AREA_PETS";"Pets")' } },
      ],
    },
    { values: [{ formattedValue: 'Área arquivada' }, { formattedValue: 'Inativa' }, {}] },
  ];

  it('mostra só projetos ativos e incubados e áreas ativas, com ID do projeto e da pasta', () => {
    const p = lerGradeIndice(projetos, 'projeto', { nome: 'Nome', id: 'ID', status: 'Status', pasta: 'Pasta' });
    expect(p).toEqual([
      { nome: 'Reforma fictícia', tipo: 'projeto', id: 'P-0001', pastaId: 'PASTA_PROJ_0001' },
      { nome: 'Ideia futura', tipo: 'projeto', id: 'P-0002', pastaId: null },
    ]);
    const a = lerGradeIndice(areas, 'area', { nome: 'nome', status: 'status', pasta: 'pasta' });
    expect(a).toEqual([{ nome: 'Pets', tipo: 'area', id: null, pastaId: 'PASTA_AREA_PETS' }]);
  });

  it('o lançamento guarda o nome e o projeto_id', () => {
    const l = criarLancamento(
      { tipo: 'despesa', valor: 10, descricao: 'x', contaId: 'cta_azul', data: '2026-11-19', quem: 'casal', projetoArea: 'Reforma fictícia', projetoId: 'P-0001' },
      ctx,
    );
    expect(l).toMatchObject({ projeto_area: 'Reforma fictícia', projeto_id: 'P-0001' });
  });

  it('extrai o ID da pasta de vários formatos de link', () => {
    expect(idPasta({ formattedValue: 'https://drive.google.com/open?id=ABCDEFGHIJ12' })).toBe('ABCDEFGHIJ12');
    expect(idPasta({ formattedValue: 'sem link' })).toBeNull();
  });
});
