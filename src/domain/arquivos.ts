import type { Conta, DataISO } from './types';

/**
 * Nomes e descrições dos arquivos no Drive (SPEC 4.5 b, ajustada pelo
 * segundo cérebro em 20/11/2026 — DECISIONS D68 a D70).
 * Separador " – " (travessão com espaços).
 */
export function nomeArquivoImportado(p: { conta: Pick<Conta, 'nome' | 'tipo'>; competencia?: string; periodo?: string; hoje: DataISO; ext: string }): string {
  const mes = (p.conta.tipo === 'cartao' ? p.competencia : p.periodo) ?? p.hoje.slice(0, 7);
  const tipo = p.conta.tipo === 'cartao' ? 'Fatura' : 'Extrato';
  return `${mes} – ${tipo} – ${limparNome(p.conta.nome)}.${p.ext}`;
}

/** Comprovante (M7): "AAAA-MM-DD – Comprovante – <Descrição> – R$ <valor>". */
export function nomeComprovante(p: { data: DataISO; descricao: string; valor: number; ext: string }): string {
  const valor = p.valor.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${p.data} – Comprovante – ${limparNome(p.descricao) || 'Sem descrição'} – R$ ${valor}.${p.ext}`;
}

/** Destino padrão quando não há projeto ou área específica. */
export const DESTINO_PADRAO = 'Finanças Pessoais - Comprovantes';

/**
 * Bloco lido pela rotina do segundo cérebro na descrição do arquivo do Drive.
 * `destino` = nome exato da pasta (coluna Projeto ou Área do Índice).
 */
export function descricaoParaSegundoCerebro(p: { destino?: string | null; pastaId?: string | null; lancamentoId?: string; importacaoId?: string; tipo: 'comprovante' | 'fatura' | 'extrato' }): string {
  const partes = [`[financas] destino: ${p.destino || DESTINO_PADRAO}`];
  if (p.pastaId) partes.push(`pasta_id: ${p.pastaId}`);
  if (p.lancamentoId) partes.push(`lancamento: ${p.lancamentoId}`);
  if (p.importacaoId) partes.push(`importacao: ${p.importacaoId}`);
  partes.push(`tipo: ${p.tipo}`);
  return partes.join(' | ');
}

const limparNome = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
