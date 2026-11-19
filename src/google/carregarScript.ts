const carregados = new Map<string, Promise<void>>();

/** Carrega um script oficial do Google uma única vez (SPEC 11: só GIS e Picker). */
export function carregarScript(src: string): Promise<void> {
  let p = carregados.get(src);
  if (!p) {
    p = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => {
        carregados.delete(src);
        falha(new Error('Não consegui carregar o Google. Verifique a internet.'));
      };
      document.head.appendChild(s);
    });
    carregados.set(src, p);
  }
  return p;
}
