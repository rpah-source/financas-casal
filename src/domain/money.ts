/** Formata um valor em reais: `1234.5` → `R$ 1.234,50` (SPEC 5). */
export function formatarBRL(valor: number, opcoes: { semCentavos?: boolean } = {}): string {
  const casas = opcoes.semCentavos ? 0 : 2;
  const abs = Math.abs(valor);
  const [inteiro, dec] = abs.toFixed(casas).split('.');
  const milhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sinal = valor < 0 && Number(abs.toFixed(casas)) !== 0 ? '−' : '';
  return `${sinal}R$ ${milhar}${dec ? ',' + dec : ''}`;
}

/** Converte reais em centavos inteiros, sem erro de ponto flutuante. */
export const emCentavos = (valor: number) => Math.round(valor * 100);
