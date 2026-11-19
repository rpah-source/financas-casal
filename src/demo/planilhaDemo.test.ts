import { describe, expect, it } from 'vitest';
import { MemoriaTabelas } from '../repo/memoria';
import { RepositorioPlanilha } from '../repo/repositorio';
import { planilhaDemo } from './planilhaDemo';
import { gerarDadosDemo } from './demoData';

describe('planilha de demonstração', () => {
  it('é lida sem problemas e preserva os lançamentos fictícios', async () => {
    const hoje = '2026-11-19';
    const base = await new RepositorioPlanilha(new MemoriaTabelas(planilhaDemo(hoje))).carregar(hoje);
    expect(base.problemas).toEqual([]);
    expect(base.lancamentos).toHaveLength(gerarDadosDemo(hoje).lancamentos.length);
    expect(base.contas.find((c) => c.id === 'cta_demo_azul')?.apelidos).toEqual(['azul', 'pix']);
  });
});
