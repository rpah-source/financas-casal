import { describe, expect, it } from 'vitest';
import { cabecalhos, NOMES_ABAS } from '../domain/schema';
import { MemoriaTabelas } from './memoria';
import { RepositorioPlanilha } from './repositorio';

const AGORA = '2026-11-19T12:00:00.000Z';
const HOJE = '2026-11-19';

function planilhaMinima() {
  return new MemoriaTabelas({
    Contas: [
      ['id', 'nome', 'apelidos', 'tipo', 'ativa'],
      ['cta_a', 'Conta Azul', 'azul, pix', 'corrente', 'TRUE'],
      ['cta_v', 'Cartão Verde', 'verde', 'cartao', 'sim'],
    ],
    Categorias: [
      ['categoria', 'subcategoria', 'natureza_padrao'],
      ['Assinaturas', '', 'fixa'],
      ['Alimentação', 'Delivery', 'variavel'],
    ],
  });
}

describe('Repositório sobre a planilha', () => {
  it('cria as abas e colunas que faltam', async () => {
    const fonte = new MemoriaTabelas({});
    await new RepositorioPlanilha(fonte, () => AGORA).carregar(HOJE);
    for (const nome of NOMES_ABAS) expect(fonte.abas[nome]![0]).toEqual(cabecalhos(nome));
  });

  it('localiza colunas pelo nome, mesmo reordenadas e com colunas extras', async () => {
    const fonte = planilhaMinima();
    fonte.abas.Lancamentos = [
      ['minha_nota', 'valor', 'id', 'data_competencia', 'conta_id', 'categoria', 'tipo'],
      ['lembrar', '68,9', 'lan_1', '18/11/2026', 'Cartão Verde', 'Assinaturas', 'despesa'],
    ];
    const repo = new RepositorioPlanilha(fonte, () => AGORA);
    const base = await repo.carregar(HOJE);
    const l = base.lancamentos[0];
    expect(l).toMatchObject({
      id: 'lan_1',
      valor: 68.9,
      data_competencia: '2026-11-18',
      data_caixa: '2026-11-18',
      conta_id: 'cta_v', // nome → id
      natureza: 'fixa', // vem da categoria
      status: 'agendado', // cartão (SPEC 6.1)
      quem: 'casal',
    });
    // Gravou de volta os valores normalizados e manteve a coluna extra do usuário.
    const cab = fonte.abas.Lancamentos![0] as string[];
    const linha = fonte.abas.Lancamentos![1];
    expect(linha[cab.indexOf('minha_nota')]).toBe('lembrar');
    expect(linha[cab.indexOf('conta_id')]).toBe('cta_v');
    expect(linha[cab.indexOf('valor')]).toBe(68.9);
    expect(linha[cab.indexOf('data_competencia')]).toBe('2026-11-18');
  });

  it('teste 12: linha com data inválida é ignorada, vira problema e o resto continua', async () => {
    const fonte = planilhaMinima();
    fonte.abas.Lancamentos = [
      ['id', 'valor', 'data_competencia', 'conta_id'],
      ['lan_ok', '10', '2026-11-18', 'cta_a'],
      ['lan_ruim', '20', '35/13/2026', 'cta_a'],
      ['lan_conta', '30', '2026-11-18', 'Conta Inexistente'],
    ];
    const base = await new RepositorioPlanilha(fonte, () => AGORA).carregar(HOJE);
    expect(base.lancamentos.map((l) => l.id)).toEqual(['lan_ok']);
    expect(base.problemas).toHaveLength(2);
    expect(base.problemas[0]).toMatchObject({ aba: 'Lancamentos', linha: 3 });
    expect(base.problemas[0].motivo).toMatch(/Data inválida/);
    expect(base.problemas[1].motivo).toMatch(/não encontrei "Conta Inexistente"/);
    // A linha com problema não é tocada.
    expect(fonte.abas.Lancamentos![2]).toEqual(['lan_ruim', '20', '35/13/2026', 'cta_a']);
  });

  it('gera id e criado_em para linhas escritas sem eles e grava de volta', async () => {
    const fonte = planilhaMinima();
    fonte.abas.Lancamentos = [
      ['id', 'valor', 'data_competencia', 'conta_id', 'criado_em'],
      ['', '45', '2026-11-19', 'azul', ''],
    ];
    // "azul" é apelido, não nome: não resolve. Usa o nome exato.
    fonte.abas.Lancamentos[1][3] = 'conta azul';
    const base = await new RepositorioPlanilha(fonte, () => AGORA).carregar(HOJE);
    const l = base.lancamentos[0];
    expect(l.id).toMatch(/^lan_[0-9A-Z]{26}$/);
    expect(l.criado_em).toBe(AGORA);
    expect(l.status).toBe('realizado');
    const cab = fonte.abas.Lancamentos![0] as string[];
    expect(fonte.abas.Lancamentos![1][cab.indexOf('id')]).toBe(l.id);
  });

  it('ignora linhas só com FALSE (caixinhas desmarcadas) sem virar problema', async () => {
    const fonte = planilhaMinima();
    fonte.abas.Lancamentos = [
      ['id', 'valor', 'data_competencia', 'conta_id', 'conciliado', 'excluido'],
      ['lan_1', 10, '2026-11-18', 'cta_a', false, false],
      ['', '', '', '', false, 'FALSE'],
      ['', '', '', '', false, false],
    ];
    const base = await new RepositorioPlanilha(fonte, () => AGORA).carregar(HOJE);
    expect(base.lancamentos).toHaveLength(1);
    expect(base.problemas).toEqual([]);
  });

  it('corrige id duplicado (linha copiada à mão)', async () => {
    const fonte = planilhaMinima();
    fonte.abas.Lancamentos = [
      ['id', 'valor', 'data_competencia', 'conta_id'],
      ['lan_x', '10', '2026-11-18', 'cta_a'],
      ['lan_x', '10', '2026-11-18', 'cta_a'],
    ];
    const base = await new RepositorioPlanilha(fonte, () => AGORA).carregar(HOJE);
    const ids = base.lancamentos.map((l) => l.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe('lan_x');
  });

  it('edita a linha certa mesmo depois de o usuário ordenar a planilha', async () => {
    const fonte = planilhaMinima();
    fonte.abas.Lancamentos = [
      ['id', 'valor', 'data_competencia', 'conta_id', 'descricao'],
      ['lan_1', '10', '2026-11-18', 'cta_a', 'Um'],
      ['lan_2', '20', '2026-11-18', 'cta_a', 'Dois'],
    ];
    const repo = new RepositorioPlanilha(fonte, () => AGORA);
    const base = await repo.carregar(HOJE);
    // O usuário inverte a ordem das linhas na planilha.
    const t = fonte.abas.Lancamentos!;
    [t[1], t[2]] = [t[2], t[1]];
    const l1 = base.lancamentos.find((l) => l.id === 'lan_1')!;
    await repo.atualizar('Lancamentos', { ...l1, descricao: 'Um editado' } as never);
    const cab = t[0] as string[];
    expect(t[2][cab.indexOf('descricao')]).toBe('Um editado');
    expect(t[1][cab.indexOf('descricao')]).toBe('Dois');
  });

  it('inserir é idempotente pelo id', async () => {
    const fonte = planilhaMinima();
    const repo = new RepositorioPlanilha(fonte, () => AGORA);
    await repo.carregar(HOJE);
    const reg = { id: 'lan_n', tipo: 'despesa', valor: 5, data_competencia: HOJE, conta_id: 'cta_a' };
    await repo.inserir('Lancamentos', [reg]);
    await repo.inserir('Lancamentos', [reg]);
    expect(fonte.abas.Lancamentos!.length).toBe(2); // cabeçalho + 1
  });
});
