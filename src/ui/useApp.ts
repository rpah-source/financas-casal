import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { App, Estado } from '../app/estado';

export const ContextoApp = createContext<App | null>(null);

/** Estado do app, re-renderizando a tela quando muda. */
export function useApp(): [Estado, App] {
  const app = useContext(ContextoApp)!;
  const [estado, setEstado] = useState(app.estado);
  useEffect(() => {
    setEstado(app.estado);
    return app.assinar(() => setEstado(app.estado));
  }, [app]);
  return [estado, app];
}
