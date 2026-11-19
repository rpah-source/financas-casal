import type { Natureza } from './types';

/** Categorias genéricas criadas no bootstrap (SPEC 12). */
const LISTA: Array<[string, string[], Natureza | '']> = [
  ['Moradia', ['Aluguel', 'Condomínio', 'IPTU', 'Contas da casa', 'Manutenção'], 'fixa'],
  ['Alimentação', ['Supermercado', 'Feira', 'Delivery', 'Restaurante/Bar', 'Padaria'], 'variavel'],
  ['Transporte', ['Aplicativo', 'Público', 'Combustível'], 'variavel'],
  ['Saúde', ['Farmácia', 'Consultas', 'Terapia', 'Academia'], ''],
  ['Assinaturas', ['Streaming de vídeo', 'Streaming de áudio', 'Software/apps', 'Armazenamento em nuvem'], 'fixa'],
  ['Serviços', ['Faxina', 'Outros'], ''],
  ['Lazer', [], 'variavel'],
  ['Compras', [], ''],
  ['Educação', [], ''],
  ['Pets', [], ''],
  ['Presentes/Doações', [], ''],
  ['Taxas/Impostos', [], 'sazonal'],
  ['Dívidas', ['Parcela de empréstimo', 'Juros'], 'divida'],
  ['Benefício', [], 'nenhuma'],
  ['Salário', [], 'nenhuma'],
  ['Estorno', [], 'nenhuma'],
  ['Sem categoria', [], ''],
];

export interface CategoriaPadrao {
  categoria: string;
  subcategoria: string;
  natureza_padrao: Natureza | '';
  ativa: boolean;
  ordem: number;
}

export function categoriasPadrao(): CategoriaPadrao[] {
  const r: CategoriaPadrao[] = [];
  for (const [categoria, subs, natureza] of LISTA) {
    r.push({ categoria, subcategoria: '', natureza_padrao: natureza, ativa: true, ordem: r.length + 1 });
    for (const s of subs) r.push({ categoria, subcategoria: s, natureza_padrao: natureza, ativa: true, ordem: r.length + 1 });
  }
  return r;
}
