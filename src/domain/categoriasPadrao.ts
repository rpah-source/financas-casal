import type { Natureza, TipoCategoria } from './types';

/**
 * Categorias genéricas criadas no bootstrap (SPEC 12), separadas por tipo
 * (DECISIONS D79): gasto, entrada e transferência gerencial.
 */
const LISTA: Array<[string, string[], Natureza | '', TipoCategoria]> = [
  // Gastos
  ['Moradia', ['Aluguel', 'Condomínio', 'IPTU', 'Contas da casa', 'Manutenção'], 'fixa', 'despesa'],
  ['Alimentação', ['Supermercado', 'Feira', 'Delivery', 'Restaurante/Bar', 'Padaria'], 'variavel', 'despesa'],
  ['Transporte', ['Aplicativo', 'Público', 'Combustível'], 'variavel', 'despesa'],
  ['Saúde', ['Farmácia', 'Consultas', 'Terapia', 'Academia'], '', 'despesa'],
  ['Assinaturas', ['Streaming de vídeo', 'Streaming de áudio', 'Software/apps', 'Armazenamento em nuvem'], 'fixa', 'despesa'],
  ['Serviços', ['Faxina', 'Outros'], '', 'despesa'],
  ['Lazer', [], 'variavel', 'despesa'],
  ['Compras', [], '', 'despesa'],
  ['Educação', [], '', 'despesa'],
  ['Pets', [], '', 'despesa'],
  ['Presentes', [], '', 'despesa'],
  ['Doações', [], '', 'despesa'],
  ['Taxas/Impostos', [], 'sazonal', 'despesa'],
  ['Dívidas', ['Parcela de empréstimo', 'Juros'], 'divida', 'despesa'],
  ['Sem categoria', [], '', 'despesa'],
  // Entradas
  ['Salário', [], 'nenhuma', 'receita'],
  ['Benefício', [], 'nenhuma', 'receita'],
  ['Rendimentos', [], 'nenhuma', 'receita'],
  ['Estorno', [], 'nenhuma', 'receita'],
  ['Outras entradas', [], 'nenhuma', 'receita'],
  // Transferências gerenciais (não são gasto nem renda, SPEC 7)
  ['Transferências', ['Pagamento de fatura', 'Entre contas próprias'], 'nenhuma', 'transferencia'],
];

export interface CategoriaPadrao {
  categoria: string;
  subcategoria: string;
  natureza_padrao: Natureza | '';
  ativa: boolean;
  ordem: number;
  tipo: TipoCategoria;
}

export function categoriasPadrao(): CategoriaPadrao[] {
  const r: CategoriaPadrao[] = [];
  for (const [categoria, subs, natureza, tipo] of LISTA) {
    r.push({ categoria, subcategoria: '', natureza_padrao: natureza, ativa: true, ordem: r.length + 1, tipo });
    for (const s of subs) r.push({ categoria, subcategoria: s, natureza_padrao: natureza, ativa: true, ordem: r.length + 1, tipo });
  }
  return r;
}

export const CATEGORIA_TRANSFERENCIA = 'Transferências';
export const SUB_PAGAMENTO_FATURA = 'Pagamento de fatura';
export const SUB_ENTRE_CONTAS = 'Entre contas próprias';
