import { useState } from 'preact/hooks';
import { ddmm, nomeMesCurto, partesData } from '../domain/dates';
import { formatarBRL } from '../domain/money';
import { gastoDaSemana, resumoSemana } from '../domain/semana';
import { lerParametro, lerParametroNumero } from '../domain/parametros';
import { CORTES_PADRAO } from '../domain/semana';
import { useApp } from './useApp';

export function TelaSemana({ irParaAjustes }: { irParaAjustes: () => void }) {
  const [mostrarConta, setMostrarConta] = useState(false);
  const [{ base, hoje, carregando, modo, ids }] = useApp();

  if (!base) {
    if (modo === 'google' && !ids?.planilha && !carregando) {
      return (
        <section>
          <h1 class="titulo-tela">Semana</h1>
          <div class="cartao">
            <p>Falta escolher onde ficam os seus dados no Google Drive.</p>
            <button type="button" class="botao-primario" onClick={irParaAjustes}>Ir para Ajustes</button>
          </div>
        </section>
      );
    }
    return (
      <section aria-busy="true">
        <h1 class="titulo-tela">Semana</h1>
        <div class="cartao destaque"><p class="destaque-rotulo">Carregando…</p></div>
      </section>
    );
  }

  const semanada = lerParametroNumero(base.parametros, 'semanada.valor', hoje, 0);
  const cortes = lerParametro(base.parametros, 'semana.cortes', hoje) || CORTES_PADRAO;
  const dados = { contas: base.contas, lancamentos: base.lancamentos };
  const r = resumoSemana(dados.lancamentos, hoje, semanada, cortes);
  const ini = partesData(r.semana.inicio);
  const fim = partesData(r.semana.fim);
  const acima = r.aindaPodemos < 0;
  const pct = Math.min(100, r.semanada > 0 ? (r.usado / r.semanada) * 100 : 100);

  const nomeConta = (id: string) => dados.contas.find((c) => c.id === id)?.nome ?? '';
  const daSemana = dados.lancamentos
    .filter((l) => gastoDaSemana([l], r.semana) > 0)
    .sort((a, b) => b.data_competencia.localeCompare(a.data_competencia));

  return (
    <section>
      <h1 class="titulo-tela">
        Semana {r.semana.numero} · {ini.dia} a {fim.dia} {nomeMesCurto(fim.mes)}
      </h1>

      {semanada <= 0 && (
        <div class="cartao">
          <p><strong>A semanada ainda não foi definida.</strong></p>
          <p class="discreto">
            Ela é o valor por semana para os gastos do dia a dia. Pode ser definida na carga inicial da
            planilha (aba Parametros, chave semanada.valor) ou em Ajustes, numa próxima versão.
          </p>
        </div>
      )}

      <div class={`cartao destaque${acima ? ' atencao' : ''}`}>
        {acima ? (
          <>
            <p class="destaque-rotulo">Nesta semana</p>
            <p class="destaque-valor">{formatarBRL(Math.ceil(-r.aindaPodemos), { semCentavos: true })} acima da semanada</p>
          </>
        ) : (
          <>
            <p class="destaque-rotulo">Ainda podemos gastar</p>
            <p class="destaque-valor">{formatarBRL(Math.floor(r.aindaPodemos), { semCentavos: true })}</p>
          </>
        )}
        <p class="destaque-sub">
          até dia {fim.dia}
          {r.porDia !== null && <> · cerca de {formatarBRL(Math.floor(r.porDia), { semCentavos: true })} por dia</>}
        </p>
        <div
          class="barra"
          role="progressbar"
          aria-label="Quanto da semanada já foi usado"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <div class="barra-preenchida" style={{ width: `${pct}%` }} />
        </div>
        <p class="destaque-rodape">
          Usado {formatarBRL(r.usado, { semCentavos: true })} · Semanada {formatarBRL(r.semanada, { semCentavos: true })}
        </p>
        <button
          type="button"
          class="botao-link"
          aria-expanded={mostrarConta}
          onClick={() => setMostrarConta(!mostrarConta)}
        >
          Como chegamos nesse número?
        </button>

        {mostrarConta && (
          <div class="conta-passo-a-passo">
            <p>
              <strong>Semanada:</strong> {formatarBRL(r.semanada)} (valor por semana definido nos Ajustes).
            </p>
            <p>
              <strong>Gastos do dia a dia de {ddmm(r.semana.inicio)} a {ddmm(r.semana.fim)}:</strong>
            </p>
            <ul class="lista-conta">
              {daSemana.map((l) => (
                <li key={l.id}>
                  <span>{ddmm(l.data_competencia)} · {l.descricao} <span class="discreto">({nomeConta(l.conta_id)})</span></span>
                  <span>{formatarBRL(l.valor)}</span>
                </li>
              ))}
              <li class="total"><span>Total usado</span><span>{formatarBRL(r.usado)}</span></li>
            </ul>
            <p>
              {formatarBRL(r.semanada)} − {formatarBRL(r.usado)} = <strong>{formatarBRL(r.aindaPodemos)}</strong>
            </p>
            {r.porDia !== null && (
              <p>
                Faltam {r.diasRestantes} {r.diasRestantes === 1 ? 'dia' : 'dias'} (contando hoje):{' '}
                {formatarBRL(r.aindaPodemos)} ÷ {r.diasRestantes} ≈ {formatarBRL(r.porDia)} por dia.
              </p>
            )}
            <p class="discreto">
              Entram só gastos variáveis (mercado, delivery, transporte…), pagos de qualquer jeito. Contas
              fixas, transferências e gastos ainda só previstos ficam de fora.
            </p>
          </div>
        )}
      </div>

      <div class="cartao">
        <p class="selo">Em breve</p>
        <p>
          Saldos da conta e do vale, faturas abertas, próximos 7 dias e a previsão de como o mês vai
          fechar chegam nos próximos marcos.
        </p>
      </div>
    </section>
  );
}
