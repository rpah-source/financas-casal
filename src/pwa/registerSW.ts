/**
 * Registra o service worker (só no build) e avisa quando há versão nova
 * (SPEC 13: "Atualização disponível · Recarregar").
 */
export function registrarServiceWorker(aoTerAtualizacao: (aplicar: () => void) => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  const registrar = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });

      // Só recarrega quando o usuário tocou em "Recarregar". Na primeira
      // visita o service worker também assume a página, e aí não recarregamos.
      let pediuAtualizacao = false;
      const oferecer = (sw: ServiceWorker) =>
        aoTerAtualizacao(() => {
          pediuAtualizacao = true;
          sw.postMessage('SKIP_WAITING');
        });

      if (reg.waiting && navigator.serviceWorker.controller) oferecer(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const novo = reg.installing;
        if (!novo) return;
        novo.addEventListener('statechange', () => {
          if (novo.state === 'installed' && navigator.serviceWorker.controller) oferecer(novo);
        });
      });

      let recarregando = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (recarregando || !pediuAtualizacao) return;
        recarregando = true;
        window.location.reload();
      });

      // Ao voltar para o app (comum no iPhone), procura versão nova.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch {
      // Sem service worker o app continua funcionando, só não fica offline.
    }
  };

  if (document.readyState === 'complete') registrar();
  else window.addEventListener('load', registrar, { once: true });
}
