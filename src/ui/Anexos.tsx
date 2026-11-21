import { useState } from 'preact/hooks';
import type { Lancamento } from '../domain/types';
import { useToast } from './comum';
import { useApp } from './useApp';

/** Documentos de um lançamento (SPEC 8.6): ver os anexos e anexar foto ou arquivo. */
export function Anexos({ l }: { l: Lancamento }) {
  const [, app] = useApp();
  const toast = useToast();
  const [enviando, setEnviando] = useState(false);
  const links = (l.docs ?? '').split(/\s+/).filter(Boolean);

  async function enviar(e: Event) {
    const input = e.target as HTMLInputElement;
    const arq = input.files?.[0];
    input.value = '';
    if (!arq) return;
    setEnviando(true);
    try {
      await app.anexar(l, arq);
      toast({ texto: 'Documento anexado e salvo no Drive' });
    } catch (err) {
      toast({ texto: err instanceof Error ? err.message : 'Não consegui anexar.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div class="cartao">
      <h3 class="titulo-cartao">Documentos</h3>
      {links.length === 0 ? (
        <p class="discreto">Nenhum documento anexado.</p>
      ) : (
        <ul class="lista-links">
          {links.map((u, i) => (
            <li key={u}><a href={u} target="_blank" rel="noopener">Documento {i + 1} (abrir no Drive)</a></li>
          ))}
        </ul>
      )}
      <label class={`botao-secundario botao-arquivo${enviando ? ' desativado' : ''}`}>
        {enviando ? 'Enviando…' : 'Anexar documento ou foto'}
        <input type="file" accept="image/*,application/pdf,.pdf,.doc,.docx,.txt" disabled={enviando} onChange={enviar} />
      </label>
      <p class="discreto">Contrato, comprovante, recibo… O arquivo vai para o seu Drive e o link fica guardado no lançamento.</p>
    </div>
  );
}
