import { novoId } from './ids';
import type { Aba, Coluna, NomeAba } from './schema';
import { lerBool, lerData, lerEnum, lerNumero, lerTexto, vazio, type Celula } from './valores';

/**
 * Leitura genérica de uma aba (SPEC 5 e 11b): localiza as colunas pelo
 * cabeçalho, converte com tolerância, gera o que falta (id, criado_em,
 * padrões) e separa as linhas com problema sem derrubar o app.
 */

export type ValorRegistro = string | number | boolean | null;
export type Registro = Record<string, ValorRegistro>;

export interface LinhaLida {
  /** Número da linha na planilha (1 = cabeçalho). */
  linha: number;
  registro: Registro;
  /** Células originais, na ordem do cabeçalho da planilha. */
  bruta: Celula[];
  /** O app completou ou normalizou algo e precisa gravar de volta. */
  alterada: boolean;
}

export interface Problema {
  aba: NomeAba;
  linha: number;
  motivo: string;
  /** Um resumo da linha para o usuário reconhecer qual é. */
  resumo: string;
}

export interface AbaLida {
  aba: NomeAba;
  cabecalho: string[];
  linhas: LinhaLida[];
  problemas: Problema[];
  /** Colunas da SPEC que não existem na planilha (o app acrescenta). */
  colunasFaltando: string[];
}

export class ErroLinha extends Error {}

export function lerAba(spec: Aba, valores: Celula[][], agoraISO: string = new Date().toISOString()): AbaLida {
  const cabecalho = (valores[0] ?? []).map((c) => lerTexto(c));
  const indice = new Map<string, number>();
  cabecalho.forEach((nome, i) => {
    const chave = nome.trim().toLowerCase();
    if (chave && !indice.has(chave)) indice.set(chave, i);
  });
  const colunasFaltando = spec.colunas.map((c) => c.nome).filter((nome) => !indice.has(nome));

  const linhas: LinhaLida[] = [];
  const problemas: Problema[] = [];

  for (let i = 1; i < valores.length; i++) {
    const bruta = valores[i] ?? [];
    if (bruta.every(vazio)) continue;
    const numeroLinha = i + 1;
    try {
      const { registro, alterada } = lerLinha(spec, bruta, indice, agoraISO);
      linhas.push({ linha: numeroLinha, registro, bruta, alterada: alterada || colunasFaltando.length > 0 });
    } catch (e) {
      problemas.push({
        aba: spec.nome,
        linha: numeroLinha,
        motivo: e instanceof ErroLinha ? e.message : 'Linha ilegível',
        resumo: resumir(bruta),
      });
    }
  }
  return { aba: spec.nome, cabecalho, linhas, problemas, colunasFaltando };
}

function lerLinha(
  spec: Aba,
  bruta: Celula[],
  indice: Map<string, number>,
  agoraISO: string,
): { registro: Registro; alterada: boolean } {
  const registro: Registro = {};
  let alterada = false;

  for (const col of spec.colunas) {
    const pos = indice.get(col.nome);
    const cel = pos === undefined ? undefined : bruta[pos];
    const valor = converter(col, cel);
    registro[col.nome] = valor;
    if (pos !== undefined && !mesmoValor(cel, paraCelula(valor))) alterada = true;
  }

  if (spec.prefixo && !registro.id) {
    registro.id = novoId(spec.prefixo);
    alterada = true;
  }
  if ('criado_em' in registro && !registro.criado_em) {
    registro.criado_em = agoraISO;
    alterada = true;
  }
  if ('atualizado_em' in registro && !registro.atualizado_em) {
    registro.atualizado_em = registro.criado_em;
    alterada = true;
  }
  return { registro, alterada };
}

function converter(col: Coluna, cel: Celula): ValorRegistro {
  const rotulo = `"${col.nome}"`;
  let valor: ValorRegistro;
  switch (col.tipo) {
    case 'numero': {
      const v = lerNumero(cel);
      if (v === null && !vazio(cel)) throw new ErroLinha(`Número inválido em ${rotulo}: "${cel}"`);
      valor = v ?? (col.padrao as number | undefined) ?? null;
      break;
    }
    case 'bool': {
      const v = lerBool(cel, (col.padrao as boolean | undefined) ?? false);
      if (v === null) throw new ErroLinha(`Valor inválido em ${rotulo}: "${cel}" (use sim/não)`);
      valor = v;
      break;
    }
    case 'data': {
      const v = lerData(cel);
      if (v === null && !vazio(cel)) throw new ErroLinha(`Data inválida em ${rotulo}: "${cel}"`);
      valor = v ?? (col.padrao as string | undefined) ?? null;
      break;
    }
    case 'enum': {
      const v = lerEnum(cel, col.valores ?? []);
      if (v === null && !vazio(cel)) {
        throw new ErroLinha(`Valor inválido em ${rotulo}: "${cel}" (aceitos: ${(col.valores ?? []).join(', ')})`);
      }
      valor = v ?? (col.padrao as string | undefined) ?? null;
      break;
    }
    default:
      valor = lerTexto(cel) || ((col.padrao as string | undefined) ?? null);
  }
  if (col.obrigatorio && (valor === null || valor === '')) {
    throw new ErroLinha(`Falta preencher ${rotulo}`);
  }
  return valor;
}

/** Valor do registro → célula para gravar (números e booleanos nativos, datas ISO). */
export function paraCelula(v: ValorRegistro): string | number | boolean {
  return v === null ? '' : v;
}

function mesmoValor(cel: Celula, nova: string | number | boolean): boolean {
  if (vazio(cel)) return nova === '';
  if (typeof cel === 'string' && typeof nova === 'string') return cel.trim() === nova;
  return cel === nova;
}

/**
 * Monta a linha para gravar, na ordem do cabeçalho da planilha. Colunas que
 * o app não conhece mantêm o valor original (o usuário pode ter criado).
 */
export function montarLinha(cabecalho: string[], registro: Registro, original: Celula[] = []): Celula[] {
  return cabecalho.map((nome, i) => {
    const chave = nome.trim().toLowerCase();
    if (chave in registro) return paraCelula(registro[chave]);
    return original[i] ?? '';
  });
}

function resumir(bruta: Celula[]): string {
  return bruta
    .filter((c) => !vazio(c))
    .slice(0, 5)
    .map((c) => String(c))
    .join(' · ')
    .slice(0, 120);
}
