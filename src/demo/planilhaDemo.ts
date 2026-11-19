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
    Recorrencias: tab('Recorrencias', [
      { id: 'rec_demo_faxina', descricao: 'Faxina', tipo: 'despesa', valor: 180, conta_id: 'cta_demo_azul', categoria: 'Serviços', subcategoria: 'Faxina', natureza: 'fixa', quem: 'casal', frequencia: 'semanal', dia_semana: 5, inicio: '2026-01-01', ativa: true },
      { id: 'rec_demo_salario', descricao: 'Salário', tipo: 'receita', valor: 6000, conta_id: 'cta_demo_azul', categoria: 'Salário', natureza: 'nenhuma', quem: 'pessoa1', frequencia: 'mensal', dia_mes: 'primeiro_util', inicio: '2026-01-01', ativa: true },
      { id: 'rec_demo_vale', descricao: 'Crédito do vale', tipo: 'receita', valor: 900, conta_id: 'cta_demo_vale', categoria: 'Benefício', natureza: 'nenhuma', quem: 'pessoa1', frequencia: 'mensal', dia_mes: 'ultimo_util', inicio: '2026-01-01', ativa: true },
      { id: 'rec_demo_streaming', descricao: 'Streaming de vídeo', tipo: 'despesa', valor: 39.9, conta_id: 'cta_demo_verde', categoria: 'Assinaturas', subcategoria: 'Streaming de vídeo', natureza: 'fixa', quem: 'casal', frequencia: 'mensal', dia_mes: '12', inicio: '2026-01-01', ativa: true },
      { id: 'rec_demo_aluguel', descricao: 'Aluguel', tipo: 'despesa', valor: 2200, conta_id: 'cta_demo_azul', categoria: 'Moradia', subcategoria: 'Aluguel', natureza: 'fixa', quem: 'casal', frequencia: 'mensal', dia_mes: '5', inicio: '2026-01-01', ativa: true },
    ]),
    Parametros: tab('Parametros', [
      { chave: 'pessoa1.nome', valor: d.pessoas.pessoa1, vigente_desde: '2000-01-01' },
      { chave: 'pessoa2.nome', valor: d.pessoas.pessoa2, vigente_desde: '2000-01-01' },
      { chave: 'semanada.valor', valor: String(d.semanada), vigente_desde: '2000-01-01' },
      { chave: 'semana.cortes', valor: d.cortes, vigente_desde: '2000-01-01' },
      { chave: 'cartao.fechamento_dia', escopo: 'cta_demo_verde', valor: '28', vigente_desde: '2000-01-01' },
      { chave: 'cartao.vencimento_dia', escopo: 'cta_demo_verde', valor: '6', vigente_desde: '2000-01-01' },
    ]),
  };
}
