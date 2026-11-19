import { categoriasPadrao } from '../domain/categoriasPadrao';
import { montarLinha } from '../domain/linhas';
import { cabecalhos, type NomeAba } from '../domain/schema';
import type { Celula } from '../domain/valores';
import { gerarDadosDemo } from './demoData';

/**
 * Monta uma planilha fictícia em memória (mesmo formato da real) para o
 * modo demonstração. Assim a demonstração passa pelo mesmo caminho de
 * leitura que os dados de verdade.
 */
export function planilhaDemo(hoje: string): Partial<Record<NomeAba, Celula[][]>> {
  const d = gerarDadosDemo(hoje);
  const tab = (aba: NomeAba, regs: Array<Record<string, any>>) => [
    cabecalhos(aba),
    ...regs.map((r) => montarLinha(cabecalhos(aba), { ...r })),
  ];
  return {
    Contas: tab('Contas', d.contas.map((c) => ({ ...c, apelidos: c.apelidos.join(', ') }))),
    Lancamentos: tab('Lancamentos', d.lancamentos),
    Categorias: tab('Categorias', categoriasPadrao()),
    ProjetosAreas: tab('ProjetosAreas', [
      { nome: 'Reforma da varanda (exemplo)', tipo: 'projeto', id_indice: 'P-0001', ativo: true },
      { nome: 'Pets (exemplo)', tipo: 'area', ativo: true },
      { nome: 'Saúde (exemplo)', tipo: 'area', ativo: true },
    ]),
    Regras: tab('Regras', [
      { id: 'reg_demo_1', padrao: 'ifood', descricao: 'iFood', categoria: 'Alimentação', subcategoria: 'Delivery', prioridade: 0, vezes_usada: 3, ativa: true },
      { id: 'reg_demo_2', padrao: 'uber', descricao: 'Uber', categoria: 'Transporte', subcategoria: 'Aplicativo', prioridade: 0, vezes_usada: 2, ativa: true },
    ]),
    Parametros: tab('Parametros', [
      { chave: 'pessoa1.nome', valor: d.pessoas.pessoa1, vigente_desde: '2000-01-01' },
      { chave: 'pessoa2.nome', valor: d.pessoas.pessoa2, vigente_desde: '2000-01-01' },
      { chave: 'semanada.valor', valor: String(d.semanada), vigente_desde: '2000-01-01' },
      { chave: 'semana.cortes', valor: d.cortes, vigente_desde: '2000-01-01' },
    ]),
  };
}
