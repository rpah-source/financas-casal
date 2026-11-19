import { previstosVencidos } from '../domain/casamento';
import { ddmm } from '../domain/dates';
import { formatarBRL } from '../domain/money';
import { lerParametroNumero } from '../domain/parametros';
import type { Lancamento } from '../domain/types';
import { useToast } from './comum';
import { useApp } from './useApp';

/**
 * Revisar (SPEC 10.4). Neste marco: previstos vencidos ("Isso aconteceu?")
 * e itens da caixa de entrada. Conciliação de fatura/extrato chega no M5.
 */
export function TelaRevisar({ voltar }: { voltar: () => void }) {
  const [{ base, hoje }, app] = useApp();
  const toast = useToast();
  if (!base) return <p class="discreto">Carregando…</p>;
  const janela = lerParametroNumero(base.parametros, 'conciliacao.janela_dias', hoje, 5);
  const vencidos = previstosVencidos(base.lancamentos, hoje, janela);
  const caixa = base.caixaEntrada.filter((c) => (c.status ?? 'novo') === 'novo');
  const nomeConta = (id: string) => base.contas.find((c) => c.id === id)?.nome ?? '';

  async function responder(l: Lancamento, r: 'sim' | 'nao' | 'adiar') {
    try {
      await app.resolverVencido(l, r);
      const texto = r === 'sim' ? 'Lançado como realizado' : r === 'nao' ? 'Marcado como não aconteceu' : 'Adiado';
      toast({ texto, acao: { rotulo: 'Desfazer', f: () => void app.editar(l) } });
    } catch {
      // o aviso já aparece no topo
    }
  }

  return (
    <section>
      <div class="topo-tela">
        <h1 class="titulo-tela">Revisar</h1>
        <button type="button" class="botao-link" onClick={voltar}>Voltar</button>
      </div>

      {vencidos.length === 0 && caixa.length === 0 && (
        <div class="cartao"><p>Nada para revisar agora.</p></div>
      )}

      {vencidos.length > 0 && (
        <>
          <h2 class="titulo-dia">Isso aconteceu?</h2>
          {vencidos.map((l) => (
            <div key={l.id} class="cartao">
              <p><strong>{l.descricao || l.categoria}</strong> · {formatarBRL(l.valor)}</p>
              <p class="discreto">Previsto para {ddmm(l.data_competencia)} · {nomeConta(l.conta_id)}</p>
              <div class="linha-botoes tres">
                <button type="button" class="botao-primario" onClick={() => responder(l, 'sim')}>Sim</button>
                <button type="button" class="botao-secundario" onClick={() => responder(l, 'nao')}>Não</button>
                <button type="button" class="botao-secundario" onClick={() => responder(l, 'adiar')}>Adiar</button>
              </div>
              <p class="discreto">Sim = lança com o valor previsto (dá para editar depois no Extrato). Adiar = pergunta de novo daqui a alguns dias.</p>
            </div>
          ))}
        </>
      )}

      {caixa.length > 0 && (
        <>
          <h2 class="titulo-dia">Caixa de entrada</h2>
          <div class="cartao">
            <p>{caixa.length === 1 ? '1 item chegou' : `${caixa.length} itens chegaram`} pela aba CaixaEntrada da planilha.</p>
            <p class="discreto">Aceitar ou descartar esses itens chega no marco M5.</p>
            <ul class="lista-conta">
              {caixa.slice(0, 10).map((c) => (
                <li key={String(c.id)}><span>{String(c.texto ?? '')}</span><span>{c.valor ? formatarBRL(Number(c.valor)) : ''}</span></li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}
