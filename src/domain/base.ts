import { novoId } from './ids';
import { ErroLinha, type AbaLida, type LinhaLida, type Problema, type Registro } from './linhas';
import { aba as specAba, NOMES_ABAS, type NomeAba } from './schema';
import { statusInicial } from './status';
import type { Categoria, Conta, Lancamento, Natureza, Parametro, RegistroGenerico, TipoConta } from './types';
import { normalizar } from './valores';
import type { Fatura } from './faturas';

/**
 * Junta as abas lidas num modelo coerente (SPEC 5):
 * - resolve referências escritas por nome (ex.: "Conta Azul" → `cta_…`);
 * - aplica padrões que dependem de outras abas (natureza da categoria, status 6.1);
 * - corrige ids duplicados (linha copiada à mão) com um id novo;
 * - devolve as linhas que precisam ser gravadas de volta.
 */

export interface Base {
  contas: Conta[];
  lancamentos: Lancamento[];
  categorias: Categoria[];
  parametros: Parametro[];
  recorrencias: RegistroGenerico[];
  faturas: Fatura[];
  parcelamentos: RegistroGenerico[];
  dividas: RegistroGenerico[];
  regras: RegistroGenerico[];
  projetosAreas: RegistroGenerico[];
  caixaEntrada: RegistroGenerico[];
  importacoes: RegistroGenerico[];
  problemas: Problema[];
}

export interface Regravacao {
  aba: NomeAba;
  linha: number;
  registro: Registro;
  bruta: LinhaLida['bruta'];
}

/** Coluna que serve de "nome" para resolver referências escritas à mão. */
const COLUNA_NOME: Partial<Record<NomeAba, string>> = {
  Contas: 'nome',
  Recorrencias: 'descricao',
  Dividas: 'credor',
  Parcelamentos: 'descricao',
};

export function montarBase(lidas: Partial<Record<NomeAba, AbaLida>>, hoje: string): { base: Base; regravar: Regravacao[] } {
  const problemas: Problema[] = [];
  const validas = new Map<NomeAba, LinhaLida[]>();
  for (const nome of NOMES_ABAS) {
    const l = lidas[nome];
    problemas.push(...(l?.problemas ?? []));
    validas.set(nome, l ? corrigirIdsDuplicados(nome, l.linhas) : []);
  }

  // 1) Referências: id ou nome exato do registro.
  for (const nome of NOMES_ABAS) {
    const refs = specAba(nome).colunas.filter((c) => c.tipo === 'ref');
    if (!refs.length) continue;
    validas.set(
      nome,
      filtrarComProblemas(nome, validas.get(nome)!, problemas, (linha) => {
        for (const col of refs) {
          const valor = linha.registro[col.nome];
          if (valor === null || valor === '') continue;
          const resolvido = resolverRef(String(valor), validas.get(col.ref!)!, COLUNA_NOME[col.ref!]);
          if (resolvido === undefined) throw new ErroLinha(`"${col.nome}": não encontrei "${valor}" na aba ${col.ref}`);
          if (resolvido === null) throw new ErroLinha(`"${col.nome}": há mais de um registro chamado "${valor}" na aba ${col.ref}`);
          if (resolvido !== valor) {
            linha.registro[col.nome] = resolvido;
            linha.alterada = true;
          }
        }
      }),
    );
  }

  const categorias = (validas.get('Categorias') ?? []).map((l) => l.registro as unknown as Categoria);
  const contas = (validas.get('Contas') ?? []).map((l) => paraConta(l.registro));
  const tipoDaConta = new Map<string, TipoConta>(contas.map((c) => [c.id, c.tipo]));

  // 2) Padrões dos lançamentos.
  validas.set(
    'Lancamentos',
    filtrarComProblemas('Lancamentos', validas.get('Lancamentos')!, problemas, (linha) => {
      const r = linha.registro;
      const antes = JSON.stringify(r);
      if ((r.valor as number) <= 0) throw new ErroLinha('"valor" precisa ser maior que zero (o sinal vem do "tipo")');
      r.data_competencia ??= r.data_caixa;
      r.data_caixa ??= r.data_competencia;
      if (!r.data_competencia) throw new ErroLinha('Falta a data ("data_competencia")');
      if (r.tipo === 'transferencia' && !r.conta_destino_id) throw new ErroLinha('Transferência sem "conta_destino_id"');
      if (r.tipo === 'ajuste' && !r.sinal) throw new ErroLinha('Ajuste sem "sinal" (+ ou -)');
      r.natureza ??= naturezaPadrao(categorias, r.categoria as string | null, r.subcategoria as string | null, r.tipo as string);
      r.status ??= statusInicial({
        tipo: r.tipo as Lancamento['tipo'],
        tipoConta: tipoDaConta.get(r.conta_id as string),
        data: r.data_caixa as string,
        hoje,
        origem: r.origem as string,
      });
      if (JSON.stringify(r) !== antes) linha.alterada = true;
    }),
  );

  validas.set(
    'Recorrencias',
    (validas.get('Recorrencias') ?? []).map((linha) => {
      const r = linha.registro;
      if (!r.natureza) {
        r.natureza = naturezaPadrao(categorias, r.categoria as string | null, r.subcategoria as string | null, r.tipo as string);
        linha.alterada = true;
      }
      return linha;
    }),
  );

  const regravar: Regravacao[] = [];
  for (const nome of NOMES_ABAS) {
    for (const l of validas.get(nome)!) {
      if (l.alterada) regravar.push({ aba: nome, linha: l.linha, registro: l.registro, bruta: l.bruta });
    }
  }

  const registros = (nome: NomeAba) => (validas.get(nome) ?? []).map((l) => l.registro);
  const base: Base = {
    contas,
    lancamentos: registros('Lancamentos') as unknown as Lancamento[],
    categorias,
    parametros: registros('Parametros') as unknown as Parametro[],
    recorrencias: registros('Recorrencias'),
    faturas: registros('Faturas') as unknown as Fatura[],
    parcelamentos: registros('Parcelamentos'),
    dividas: registros('Dividas'),
    regras: registros('Regras'),
    projetosAreas: registros('ProjetosAreas'),
    caixaEntrada: registros('CaixaEntrada'),
    importacoes: registros('Importacoes'),
    problemas: problemas.sort((a, b) => a.aba.localeCompare(b.aba) || a.linha - b.linha),
  };
  return { base, regravar };
}

function paraConta(r: Registro): Conta {
  return {
    ...(r as unknown as Conta),
    apelidos: String(r.apelidos ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean),
  };
}

function filtrarComProblemas(
  aba: NomeAba,
  linhas: LinhaLida[],
  problemas: Problema[],
  ajustar: (l: LinhaLida) => void,
): LinhaLida[] {
  return linhas.filter((l) => {
    try {
      ajustar(l);
      return true;
    } catch (e) {
      problemas.push({
        aba,
        linha: l.linha,
        motivo: e instanceof Error ? e.message : 'Linha ilegível',
        resumo: Object.values(l.registro).filter((v) => v !== null && v !== '' && v !== false).slice(1, 6).join(' · ').slice(0, 120),
      });
      return false;
    }
  });
}

function corrigirIdsDuplicados(aba: NomeAba, linhas: LinhaLida[]): LinhaLida[] {
  const prefixo = specAba(aba).prefixo;
  if (!prefixo) return linhas;
  const vistos = new Set<string>();
  for (const l of linhas) {
    const id = String(l.registro.id);
    if (vistos.has(id)) {
      l.registro.id = novoId(prefixo);
      l.alterada = true;
    }
    vistos.add(String(l.registro.id));
  }
  return linhas;
}

/**
 * id existente → o próprio id; nome único → id; nome ambíguo → null;
 * inexistente → undefined.
 */
function resolverRef(valor: string, alvo: LinhaLida[], colunaNome?: string): string | null | undefined {
  if (alvo.some((l) => l.registro.id === valor)) return valor;
  if (!colunaNome) return undefined;
  const chave = normalizar(valor);
  const achados = alvo.filter((l) => normalizar(String(l.registro[colunaNome] ?? '')) === chave);
  if (achados.length === 1) return String(achados[0].registro.id);
  return achados.length > 1 ? null : undefined;
}

export function naturezaPadrao(
  categorias: Categoria[],
  categoria: string | null,
  subcategoria: string | null,
  tipo: string,
): Natureza {
  if (tipo !== 'despesa') return 'nenhuma';
  if (categoria) {
    const cat = normalizar(categoria);
    const sub = normalizar(subcategoria ?? '');
    const exata = categorias.find((c) => normalizar(c.categoria) === cat && normalizar(c.subcategoria ?? '') === sub);
    const geral = categorias.find((c) => normalizar(c.categoria) === cat && !c.subcategoria);
    const n = exata?.natureza_padrao ?? geral?.natureza_padrao;
    if (n) return n;
  }
  return 'variavel';
}
