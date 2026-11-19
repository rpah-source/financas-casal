import { somarDias, partesData, montarData, diasNoMes } from './dates';
import type { Conta, DataISO, Pessoa } from './types';
import { normalizar } from './valores';

/**
 * Texto livre curto, sem IA (SPEC 8.1). Ordem livre. Primeiro os tokens
 * especiais (parcelas, data, hoje/ontem), depois o valor, a conta, a pessoa;
 * o que sobra é a descrição.
 */
export interface ResultadoTexto {
  valor: number | null;
  contaId: string | null;
  data: DataISO;
  quem: Pessoa | null;
  parcelas: number | null;
  descricao: string;
}

export interface ContextoTexto {
  contas: Pick<Conta, 'id' | 'nome' | 'apelidos' | 'ativa'>[];
  pessoas: { pessoa1: string; pessoa2: string };
  hoje: DataISO;
}

const RE_VALOR = /^(?:r\$)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)$/i;

export function interpretarTexto(texto: string, ctx: ContextoTexto): ResultadoTexto {
  let tokens = texto.trim().split(/\s+/).filter(Boolean);
  const r: ResultadoTexto = { valor: null, contaId: null, data: ctx.hoje, quem: null, parcelas: null, descricao: '' };

  // 1) Especiais.
  tokens = tokens.filter((t) => {
    const n = normalizar(t);
    let m: RegExpMatchArray | null;
    if (r.parcelas === null && (m = n.match(/^(\d{1,2})x$/))) {
      r.parcelas = Number(m[1]);
      return false;
    }
    if ((m = n.match(/^(\d{1,2})\/(\d{1,2})$/))) {
      const d = dataDdMm(Number(m[1]), Number(m[2]), ctx.hoje);
      if (d) {
        r.data = d;
        return false;
      }
    }
    if (n === 'hoje') return false;
    if (n === 'ontem') {
      r.data = somarDias(ctx.hoje, -1);
      return false;
    }
    if (n === 'anteontem') {
      r.data = somarDias(ctx.hoje, -2);
      return false;
    }
    return true;
  });

  // 2) Valor: o primeiro número ("R$" pode vir separado).
  const iValor = tokens.findIndex((t, i) => RE_VALOR.test(t) || (/^r\$$/i.test(t) && RE_VALOR.test(tokens[i + 1] ?? '')));
  if (iValor >= 0) {
    const tirar = /^r\$$/i.test(tokens[iValor]) ? 2 : 1;
    r.valor = lerValor(tokens.slice(iValor, iValor + tirar).join('').replace(/^r\$/i, ''));
    tokens.splice(iValor, tirar);
  }

  // 3) Conta: nome inteiro (pode ter várias palavras) ou um apelido.
  const ativas = ctx.contas.filter((c) => c.ativa !== false);
  const textoNorm = () => tokens.map(normalizar).join(' ');
  for (const c of [...ativas].sort((a, b) => b.nome.length - a.nome.length)) {
    const nome = normalizar(c.nome);
    const idx = indiceSequencia(tokens.map(normalizar), nome.split(' '));
    if (nome && idx >= 0 && textoNorm().includes(nome)) {
      r.contaId = c.id;
      tokens.splice(idx, nome.split(' ').length);
      break;
    }
  }
  if (!r.contaId) {
    const i = tokens.findIndex((t) => ativas.some((c) => c.apelidos.some((a) => normalizar(a) === normalizar(t))));
    if (i >= 0) {
      r.contaId = ativas.find((c) => c.apelidos.some((a) => normalizar(a) === normalizar(tokens[i])))!.id;
      tokens.splice(i, 1);
    }
  }

  // 4) Pessoa: o nome da pessoa 1 ou 2 (ou "pessoa1"/"pessoa2").
  const nomes: Array<[Pessoa, string[]]> = [
    ['pessoa1', [normalizar(ctx.pessoas.pessoa1), 'pessoa1']],
    ['pessoa2', [normalizar(ctx.pessoas.pessoa2), 'pessoa2']],
  ];
  const iPessoa = tokens.findIndex((t) => nomes.some(([, ns]) => ns.includes(normalizar(t))));
  if (iPessoa >= 0) {
    r.quem = nomes.find(([, ns]) => ns.includes(normalizar(tokens[iPessoa])))![0];
    tokens.splice(iPessoa, 1);
  }

  r.descricao = tokens.join(' ');
  return r;
}

function lerValor(s: string): number {
  if (s.includes(',')) return Number(s.replace(/\./g, '').replace(',', '.'));
  // "1.234" com 3 casas depois do ponto é milhar; "45.90" é decimal.
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  return Number(s);
}

function indiceSequencia(tokens: string[], seq: string[]): number {
  for (let i = 0; i + seq.length <= tokens.length; i++) {
    if (seq.every((s, j) => tokens[i + j] === s)) return i;
  }
  return -1;
}

/** dd/mm no ano corrente; se cair mais de 2 meses no futuro, entende como ano passado. */
function dataDdMm(dia: number, mes: number, hoje: DataISO): DataISO | null {
  if (mes < 1 || mes > 12 || dia < 1) return null;
  const { ano } = partesData(hoje);
  const tentar = (a: number) => (dia <= diasNoMes(a, mes) ? montarData(a, mes, dia) : null);
  const d = tentar(ano);
  if (d && d > somarDias(hoje, 60)) return tentar(ano - 1);
  return d;
}
