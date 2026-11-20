import { useState } from 'preact/hooks';
import { urlPasta, urlPlanilha } from '../storage/drive';
import { useApp } from './useApp';

export function TelaAjustes() {
  const [estado, app] = useApp();
  const { modo, ids, base, carregando } = estado;
  const [ocupado, setOcupado] = useState(false);

  const rodar = (f: () => Promise<void>) => async () => {
    setOcupado(true);
    try {
      await f();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section>
      <h1 class="titulo-tela">Ajustes</h1>

      {/* Conta Google */}
      <div class="cartao">
        <h2 class="titulo-cartao">Conta Google</h2>
        {!app.podeUsarGoogle ? (
          <p class="discreto">
            O login com Google ainda não foi configurado neste site. Siga a Parte 3 do guia SETUP.md e mande
            os 3 valores para o Claude. Enquanto isso, o app mostra só dados fictícios.
          </p>
        ) : modo === 'demo' ? (
          <>
            <p>Entre com o Google para usar os seus dados de verdade. Eles ficam numa planilha no seu Drive.</p>
            <button type="button" class="botao-primario" disabled={ocupado} onClick={rodar(() => app.entrar())}>
              Entrar com Google
            </button>
            <p class="discreto">
              O Google pode avisar que o app "não foi verificado". É normal: o app é só seu. Toque em
              Avançado › Acessar.
            </p>
          </>
        ) : (
          <>
            <p>Conectado ao Google.</p>
            <button type="button" class="botao-secundario" onClick={() => app.sair()}>Sair</button>
          </>
        )}
      </div>

      {/* Assistente de primeira execução (SPEC 4.4) */}
      {modo === 'google' && !ids?.planilha && (
        <div class="cartao">
          <h2 class="titulo-cartao">Primeiro passo: onde guardar os dados</h2>
          <ol class="passos">
            <li>
              <strong>Escolha a pasta da sua área Finanças</strong> (do sistema PARA). O app cria ali a planilha
              "Finanças do Casal — Base".
            </li>
          </ol>
          <button type="button" class="botao-primario" disabled={ocupado} onClick={rodar(() => app.criarPlanilhaNaPasta())}>
            {ocupado ? 'Criando a planilha…' : 'Escolher a pasta de Finanças'}
          </button>
          <button type="button" class="botao-link" disabled={ocupado} onClick={rodar(() => app.usarPlanilhaExistente())}>
            Já tenho a planilha base
          </button>
        </div>
      )}

      {modo === 'google' && ids?.planilha && (
        <>
          {estado.base && !ids.pasta_entrada && !ids.indice && (
            <div class="cartao atencao-suave">
              <p>
                <strong>Planilha pronta.</strong> Complete contas, cartões e salário para a semana ficar certa: o
                assistente Claude pode fazer a carga inicial direto na planilha.
              </p>
            </div>
          )}
          <div class="cartao">
            <h2 class="titulo-cartao">Segundo cérebro</h2>
            <ItemConfig
              rotulo="Pasta de Finanças"
              valor={ids.pasta_financas ? 'Escolhida' : 'Não informada'}
              link={ids.pasta_financas ? urlPasta(ids.pasta_financas) : undefined}
            />
            <ItemConfig
              rotulo="Pasta de faturas e comprovantes"
              descricao="Onde o app guarda faturas, extratos e comprovantes sem área específica (sem subpastas)."
              valor={ids.pasta_faturas ? 'Escolhida' : 'Ainda não'}
              acao={ids.pasta_faturas ? 'Trocar' : 'Escolher'}
              aoTocar={rodar(() => app.escolherPastaFaturas())}
              ocupado={ocupado}
            />
            <ItemConfig
              rotulo="Pasta de Entrada"
              descricao="Para onde vão comprovantes de outras áreas e projetos."
              valor={ids.pasta_entrada ? 'Escolhida' : 'Ainda não'}
              acao={ids.pasta_entrada ? 'Trocar' : 'Escolher'}
              aoTocar={rodar(() => app.escolherPastaEntrada())}
              ocupado={ocupado}
            />
            <ItemConfig
              rotulo="Planilha-índice"
              descricao="De onde vêm as listas de projetos e áreas (só leitura)."
              valor={ids.indice ? 'Escolhida' : 'Ainda não'}
              acao={ids.indice ? 'Trocar' : 'Escolher'}
              aoTocar={rodar(() => app.escolherIndice())}
              ocupado={ocupado}
            />
            {ids.indice && (
              <>
                <p class="discreto">
                  {estado.projetosAreas.length
                    ? `${estado.projetosAreas.filter((x) => x.tipo === 'projeto').length} projetos e ${estado.projetosAreas.filter((x) => x.tipo === 'area').length} áreas ativos.`
                    : 'Listas ainda não lidas.'}
                </p>
                <button type="button" class="botao-secundario" disabled={ocupado} onClick={rodar(() => app.atualizarListas())}>
                  Atualizar listas
                </button>
              </>
            )}
          </div>

          <div class="cartao">
            <h2 class="titulo-cartao">Dados</h2>
            <ul class="lista-links">
              <li>
                <a href={urlPlanilha(ids.planilha)} target="_blank" rel="noopener">Abrir a planilha no Google Sheets</a>
              </li>
              {ids.pasta_faturas && (
                <li>
                  <a href={urlPasta(ids.pasta_faturas)} target="_blank" rel="noopener">Abrir a pasta de faturas e comprovantes</a>
                </li>
              )}
            </ul>
            <button type="button" class="botao-secundario" disabled={carregando} onClick={() => app.carregar()}>
              {carregando ? 'Atualizando…' : 'Atualizar dados da planilha'}
            </button>
          </div>
        </>
      )}

      {base && <LinhasComProblema />}

      <div class="cartao">
        <h2 class="titulo-cartao">Mais ajustes</h2>
        <p class="discreto">
          Contas, cartões, salário, semanada, categorias e regras chegam aqui nos próximos marcos. Por enquanto,
          dá para editar direto na planilha: o app lê as mudanças ao abrir.
        </p>
      </div>
    </section>
  );
}

function ItemConfig(p: {
  rotulo: string;
  descricao?: string;
  valor: string;
  acao?: string;
  aoTocar?: () => void;
  link?: string;
  ocupado?: boolean;
}) {
  return (
    <div class="item-config">
      <div>
        <p class="item-rotulo">{p.rotulo}</p>
        {p.descricao && <p class="discreto">{p.descricao}</p>}
        <p class="discreto">{p.valor}</p>
      </div>
      {p.acao && p.aoTocar && (
        <button type="button" class="botao-link" disabled={p.ocupado} onClick={p.aoTocar}>{p.acao}</button>
      )}
      {p.link && (
        <a class="botao-link" href={p.link} target="_blank" rel="noopener">Abrir</a>
      )}
    </div>
  );
}

function LinhasComProblema() {
  const [{ base }] = useApp();
  const [aberto, setAberto] = useState(false);
  const problemas = base?.problemas ?? [];
  return (
    <div class="cartao">
      <h2 class="titulo-cartao">Linhas com problema</h2>
      {problemas.length === 0 ? (
        <p class="discreto">Nenhuma. Todas as linhas da planilha foram lidas.</p>
      ) : (
        <>
          <p>
            {problemas.length === 1 ? '1 linha da planilha não foi lida' : `${problemas.length} linhas da planilha não foram lidas`}.
            O resto do app funciona normalmente. Corrija na planilha e toque em "Atualizar dados".
          </p>
          <button type="button" class="botao-link" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
            {aberto ? 'Esconder' : 'Ver quais'}
          </button>
          {aberto && (
            <ul class="lista-problemas">
              {problemas.map((p) => (
                <li key={`${p.aba}-${p.linha}`}>
                  <p><strong>Aba {p.aba}, linha {p.linha}</strong></p>
                  <p>{p.motivo}</p>
                  {p.resumo && <p class="discreto">{p.resumo}</p>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
