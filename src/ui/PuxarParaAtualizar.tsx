import { useEffect, useRef, useState } from 'preact/hooks';

/** Distância (px) que o dedo precisa puxar, no topo da tela, para atualizar. */
const LIMIAR = 70;

/**
 * "Puxar para atualizar": o app instalado na Tela de Início (PWA) não tem o gesto
 * do Safari, então fazemos o nosso. Só começa com a página no topo e o dedo
 * descendo; solto depois do limiar, chama `aoAtualizar`.
 */
export function PuxarParaAtualizar({ ativo, carregando, aoAtualizar }: { ativo: boolean; carregando: boolean; aoAtualizar: () => void }) {
  const [puxado, setPuxado] = useState(0);
  const inicio = useRef<number | null>(null);
  const atual = useRef(0);

  useEffect(() => {
    if (!ativo) return;
    const comecar = (e: TouchEvent) => {
      inicio.current = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
      atual.current = 0;
    };
    const mover = (e: TouchEvent) => {
      if (inicio.current === null) return;
      const dy = e.touches[0].clientY - inicio.current;
      if (dy <= 0 || window.scrollY > 0) {
        atual.current = 0;
        setPuxado(0);
        return;
      }
      atual.current = Math.min(dy * 0.5, LIMIAR * 1.4); // resistência, como no iOS
      setPuxado(atual.current);
    };
    const soltar = () => {
      if (inicio.current !== null && atual.current >= LIMIAR) aoAtualizar();
      inicio.current = null;
      atual.current = 0;
      setPuxado(0);
    };
    window.addEventListener('touchstart', comecar, { passive: true });
    window.addEventListener('touchmove', mover, { passive: true });
    window.addEventListener('touchend', soltar);
    window.addEventListener('touchcancel', soltar);
    return () => {
      window.removeEventListener('touchstart', comecar);
      window.removeEventListener('touchmove', mover);
      window.removeEventListener('touchend', soltar);
      window.removeEventListener('touchcancel', soltar);
    };
  }, [ativo, aoAtualizar]);

  if (!ativo || (puxado <= 0 && !carregando)) return null;
  const texto = carregando ? 'Atualizando…' : puxado >= LIMIAR ? 'Solte para atualizar' : 'Puxe para atualizar';
  return (
    <div class="puxar-atualizar" role="status" aria-live="polite" style={{ height: `${carregando ? 36 : puxado}px` }}>
      <span>{texto}</span>
    </div>
  );
}
