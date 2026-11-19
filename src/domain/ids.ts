/**
 * IDs no formato prefixo + ULID (SPEC 5): `lan_01JD…`.
 * ULID = 48 bits de tempo + 80 bits aleatórios, em base32 de Crockford.
 */
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(agora: number = Date.now(), aleatorio: (n: number) => Uint8Array = bytesAleatorios): string {
  let tempo = '';
  let t = agora;
  for (let i = 0; i < 10; i++) {
    tempo = ALFABETO[t % 32] + tempo;
    t = Math.floor(t / 32);
  }
  const bytes = aleatorio(16);
  let resto = '';
  for (let i = 0; i < 16; i++) resto += ALFABETO[bytes[i] % 32];
  return tempo + resto;
}

function bytesAleatorios(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export const novoId = (prefixo: string) => `${prefixo}_${ulid()}`;
