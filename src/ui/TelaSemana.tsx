import { useState } from 'preact/hooks';
import { abertoNoCartao, proximoCiclo } from '../domain/cartao';
import { previstosVencidos } from '../domain/casamento';
import { ddmm, diasNoMes, diffDias, montarData, nomeMesCurto, nomeMesLongo, partesData, somarDias } from '../domain/dates';
import { fotografiaDoMes } from '../domain/fotografia';
import { formatarBRL } from '../domain/money';
import { lerParametro, lerParametroNumero, lerPessoas } from '../domain/parametros';
import { proximoCredito, reservado, saldoConta } from '../domain/saldos';
import { CORTES_PADRAO, gastoDaSemana, resumoSemana } from '../domain/semana';
import type { Lancamento } from '../domain/types';
import { PontoStatus } from './comum';
import { useApp } from './useApp';

const brl0 = (v: number) => formatarBRL(v, { semCentavos: true });

export function TelaSemana({ irPara }: { irPara: (aba: 'ajustes' | 'revisar' | 'fotografia') => void }) {
  const [mostrarConta, setMostrarConta] = useState(false);
  const [{ base, hoje, carregando, modo, ids }] = useApp();

  if (!base) {
    if (modo === 'google' && !ids?.planilha && !carregando) {
      return (
        <section>
          <h1 class="titulo-tela">Semana</h1>
          <div class="cartao">
            <p>Falta escolher onde ficam os seus dados no Google Drive.</p>
            <button type="button" class="botao-primario" onClick={() => irPara('ajustes')}>Ir para Ajustes</button>
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
  const janela = lerParametroNumero(base.parametros, 'conciliacao.janela_dias', hoje, 5);
  const pessoas = lerPessoas(base.parametros, hoje);
  const r = resumoSemana(base.lancamentos, hoje, semanada, cortes);
  const ini = partesData(r.semana.inicio);
  const fim = partesData(r.semana.fim);
  const acima = r.aindaPodemos < 0;
  const pct = Math.min(100, r.semanada > 0 ? (r.usado / r.semanada) * 100 : 100);
  const nomeConta = (id: string) => base.contas.find((c) => c.id === id)?.nome ?? '';
  const daSemana = base.lancamentos
    .filter((l) => gastoDaSemana([l], r.semana) > 0)
    .sort((a, b) => b.data_competencia.localeCompare(a.data_competencia));

  const pendencias = previstosVencidos(base.lancamentos, hoje, janela).length + base.caixaEntrada.filter((c) => (c.status ?? 'novo') === 'novo').length;

  const ativas = base.contas.filter((c) => c.ativa !== false && !c.excluido).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  const { ano, mes } = partesData(hoje);
  const fimDoMes = montarData(ano, mes, diasNoMes(ano, mes));

  const proximos = base.lancamentos
    .filter((l) => !l.excluido && (l.status === 'previsto' || l.status === 'agendado') && l.data_caixa >= hoje && l.data_caixa <= somarDias(hoje, 7))
    .filter((l) => base.contas.find((c) => c.id === l.conta_id)?.tipo !== 'cartao') // compras no cartão saem na fatura (M4)
    .sort((a, b) => a.data_caixa.localeCompare(b.data_caixa));

  const foto = fotografiaDoMes({ mes: hoje.slice(0, 7), lancamentos: base.lancamentos, recorrencias: base.recorrencias, parametros: base.parametros });

  return (
    <section>
      <h1 class="titulo-tela">
        Semana {r.semana.numero} · {ini.dia} a {fim.dia} {nomeMesCurto(fim.mes)}
      </h1>

      {semanada <= 0 && (
        <div class="cartao">
          <p><strong>A semanada ainda não foi definida.</strong></p>
          <p class="discreto">
            Ela é o valor por semana para os gastos do dia a dia. Pode ser definida na planilha (aba Parametros,
            chave semanada.valor) ou em Ajustes, numa próxima versão.
          </p>
        </div>
      )}

      {/* 2. Destaque */}
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
        <div class="barra" role="progressbar" aria-label="Quanto da semanada já foi usado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <div class="barra-preenchida" style={{ width: `${pct}%` }} />
        </div>
        <p class="destaque-rodape">Usado {brl0(r.usado)} · Semanada {brl0(r.semanada)}</p>
        <button type="button" class="botao-link" aria-expanded={mostrarConta} onClick={() => setMostrarConta(!mostrarConta)}>
          Como chegamos nesse número?
        </button>
        {mostrarConta && (
          <div class="conta-passo-a-passo">
            <p><strong>Semanada:</strong> {formatarBRL(r.semanada)} (valor por semana definido nos Ajustes).</p>
            <p><strong>Gastos do dia a dia de {ddmm(r.semana.inicio)} a {ddmm(r.semana.fim)}:</strong></p>
            <ul class="lista-conta">
              {daSemana.map((l) => (
                <li key={l.id}>
                  <span>{ddmm(l.data_competencia)} · {l.descricao} <span class="discreto">({nomeConta(l.conta_id)})</span></span>
                  <span>{formatarBRL(l.valor)}</span>
                </li>
              ))}
              <li class="total"><span>Total usado</span><span>{formatarBRL(r.usado)}</span></li>
            </ul>
            <p>{formatarBRL(r.semanada)} − {formatarBRL(r.usado)} = <strong>{formatarBRL(r.aindaPodemos)}</strong></p>
            {r.porDia !== null && (
              <p>
                Faltam {r.diasRestantes} {r.diasRestantes === 1 ? 'dia' : 'dias'} (contando hoje): {formatarBRL(r.aindaPodemos)} ÷ {r.diasRestantes} ≈ {formatarBRL(r.porDia)} por dia.
              </p>
            )}
            <p class="discreto">
              Entram só gastos variáveis (mercado, delivery, transporte…), pagos de qualquer jeito. Contas fixas,
              transferências e gastos ainda só previstos ficam de fora.
            </p>
          </div>
        )}
      </div>

      {/* 3. Pendências */}
      {pendencias > 0 && (
        <button type="button" class="aviso-pendencias" onClick={() => irPara('revisar')}>
          <span>{pendencias === 1 ? '1 pendência para revisar' : `${pendencias} pendências para revisar`}</span>
          <span aria-hidden="true">›</span>
        </button>
      )}

      {/* 4. Saldos */}
      <div class="grade-saldos">
        {ativas.filter((c) => c.tipo === 'prepago').map((c) => {
          const saldo = saldoConta(c, base.lancamentos, hoje);
          const prox = proximoCredito(c, base.recorrencias, hoje);
          return (
            <details key={c.id} class="cartao cartao-saldo">
              <summary>
                <span class="saldo-nome">{c.nome}</span>
                <span class={`saldo-valor${saldo < 0 ? ' atencao-texto' : ''}`}>{formatarBRL(saldo)}</span>
                <span class="discreto">{prox ? `até o crédito de ${ddmm(prox.data)}` : 'sem crédito previsto'}</span>
              </summary>
              <p class="discreto">
                Saldo informado em {c.data_saldo_inicial ? ddmm(c.data_saldo_inicial) : '—'}: {formatarBRL(c.saldo_inicial ?? 0)}, mais o que entrou e
                saiu (realizado) até hoje.{prox ? ` Próximo crédito: ${formatarBRL(Number(prox.rec.valor))} em ${ddmm(prox.data)}.` : ''}
              </p>
            </details>
          );
        })}
        {ativas.filter((c) => c.tipo === 'corrente').map((c) => {
          const saldo = saldoConta(c, base.lancamentos, hoje);
          const prox = proximoCredito(c, base.recorrencias, hoje);
          const ate = prox?.data ?? fimDoMes;
          const res = reservado(c, base.lancamentos, hoje, ate);
          return (
            <details key={c.id} class="cartao cartao-saldo">
              <summary>
                <span class="saldo-nome">{c.nome}</span>
                <span class={`saldo-valor${saldo < 0 ? ' atencao-texto' : ''}`}>{formatarBRL(saldo)}</span>
                <span class="discreto">{formatarBRL(res.total)} já reservados</span>
              </summary>
              <p class="discreto">
                Reservado = o que está previsto ou agendado para sair desta conta até {prox ? `o salário de ${ddmm(ate)}` : `o fim do mês (${ddmm(ate)})`}.
                Faturas de cartão entram aqui no marco M4.
              </p>
              {res.itens.length > 0 && (
                <ul class="lista-conta">
                  {res.itens.map((l) => (
                    <li key={l.id}><span>{ddmm(l.data_caixa)} · {l.descricao}</span><span>{formatarBRL(l.valor)}</span></li>
                  ))}
                </ul>
              )}
            </details>
          );
        })}
      </div>

      {/* 5. Faturas abertas */}
      {ativas.some((c) => c.tipo === 'cartao') && (
        <div class="cartao">
          <h2 class="titulo-cartao">Faturas abertas</h2>
          {ativas.filter((c) => c.tipo === 'cartao').map((c) => {
            const a = abertoNoCartao(c.id, base.lancamentos);
            const ciclo = proximoCiclo(c.id, base.parametros, hoje);
            const dias = ciclo ? diffDias(hoje, ciclo.fechamento) : null;
            const fatias = (['pessoa1', 'pessoa2', 'casal'] as const).filter((q) => a.porPessoa[q] > 0);
            return (
              <div key={c.id} class="fatura">
                <div class="fatura-topo">
                  <span class="saldo-nome">{c.nome}</span>
                  <span class="saldo-valor">{formatarBRL(a.total)}</span>
                </div>
                <p class="discreto">
                  {ciclo
                    ? `${dias === 0 ? 'fecha hoje' : `fecha em ${dias} ${dias === 1 ? 'dia' : 'dias'}`}${ciclo.vencimento ? ` · vence ${ddmm(ciclo.vencimento)}` : ''}`
                    : 'sem dia de fechamento cadastrado'}
                </p>
                {a.total > 0 && (
                  <>
                    <div class="barra barra-dividida" aria-hidden="true">
                      {fatias.map((q) => (
                        <div key={q} class={`fatia fatia-${q}`} style={{ width: `${(a.porPessoa[q] / a.total) * 100}%` }} />
                      ))}
                    </div>
                    <p class="legenda-fatura">
                      {fatias.map((q) => (
                        <span key={q}><span class={`bolinha fatia-${q}`} />{q === 'casal' ? 'Casal' : pessoas[q]} {brl0(a.porPessoa[q])}</span>
                      ))}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 6. Próximos 7 dias */}
      <div class="cartao">
        <h2 class="titulo-cartao">Próximos 7 dias</h2>
        {proximos.length === 0 ? (
          <p class="discreto">Nada previsto ou agendado.</p>
        ) : (
          <ul class="lista-proximos">
            {proximos.map((l) => <ItemProximo key={l.id} l={l} conta={nomeConta(l.conta_id)} hoje={hoje} />)}
          </ul>
        )}
      </div>

      {/* 7. Projeção do mês (9.5) */}
      <details class={`cartao projecao${foto.resultado < 0 ? ' atencao' : ''}`}>
        <summary>
          <span>
            {nomeMesLongo(mes).replace(/^./, (x) => x.toUpperCase())} deve fechar em <strong>{formatarBRL(foto.resultado)}</strong>
          </span>
          <span class="discreto">
            Fotografia {foto.completude.pct}% pronta{foto.completude.faltam.length ? ` — faltam: ${foto.completude.faltam.join(', ')}` : ''}
          </span>
        </summary>
        <ul class="lista-conta">
          <li><span>Entradas</span><span>{formatarBRL(foto.entradas.total)}</span></li>
          <li><span>− Fixas</span><span>{formatarBRL(foto.fixa.total)}</span></li>
          <li><span>− Variáveis {foto.variavel.projecao > foto.variavel.realizado + 0.001 && foto.variavel.pelaSemanada >= foto.variavel.projecao ? '(pela semanada)' : ''}</span><span>{formatarBRL(foto.variavel.projecao)}</span></li>
          <li><span>− Sazonais (no mês + provisão)</span><span>{formatarBRL(foto.sazonal.noMes + foto.sazonal.provisao)}</span></li>
          <li><span>− Dívidas/parcelas</span><span>{formatarBRL(foto.divida.total)}</span></li>
          <li><span>− Sonhos/projetos</span><span>{formatarBRL(foto.sonho.total)}</span></li>
          <li><span>− Margem ({foto.margemPct}%)</span><span>{formatarBRL(foto.margem)}</span></li>
          <li class="total"><span>Resultado</span><span>{formatarBRL(foto.resultado)}</span></li>
        </ul>
        {foto.resultado < 0 && (
          <button type="button" class="botao-link" onClick={() => irPara('fotografia')}>Veja onde dá para abrir espaço</button>
        )}
      </details>
    </section>
  );
}

function ItemProximo({ l, conta, hoje }: { l: Lancamento; conta: string; hoje: string }) {
  const dif = diffDias(hoje, l.data_caixa);
  const quando = dif === 0 ? 'hoje' : dif === 1 ? 'amanhã' : ddmm(l.data_caixa);
  const sinal = l.tipo === 'receita' ? '+' : l.tipo === 'despesa' ? '−' : '';
  return (
    <li>
      <PontoStatus status={l.status} />
      <span class="textos-linha">
        <span class="descricao-linha">{l.descricao || l.categoria || 'Sem descrição'}</span>
        <span class="detalhe-linha">{quando} · {conta}</span>
      </span>
      <span class={`valor-linha${l.tipo === 'receita' ? ' entrada' : ''}`}>{sinal}{formatarBRL(l.valor)}</span>
    </li>
  );
}
