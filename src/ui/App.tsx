import { useEffect, useMemo, useState } from 'preact/hooks';
import { App as Controlador } from '../app/estado';
import { registrarServiceWorker } from '../pwa/registerSW';
import { BarraInferior, type Aba } from './BarraInferior';
import { EmBreve } from './EmBreve';
import { TelaAjustes } from './TelaAjustes';
import { TelaSemana } from './TelaSemana';
import { ContextoApp, useApp } from './useApp';

const ABAS: Aba[] = ['semana', 'extrato', 'lancar', 'fotografia', 'ajustes'];

function abaDaUrl(): Aba {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (ABAS as string[]).includes(h) ? (h as Aba) : 'semana';
}

export function App() {
  const controlador = useMemo(() => new Controlador(), []);
  useEffect(() => {
    void controlador.iniciar();
  }, [controlador]);
  return (
    <ContextoApp.Provider value={controlador}>
      <Casca />
    </ContextoApp.Provider>
  );
}

function Casca() {
  const [estado, app] = useApp();
  const [aba, setAba] = useState<Aba>(abaDaUrl);
  const [aplicarAtualizacao, setAplicarAtualizacao] = useState<(() => void) | null>(null);

  useEffect(() => {
    const aoMudar = () => setAba(abaDaUrl());
    window.addEventListener('hashchange', aoMudar);
    registrarServiceWorker((aplicar) => setAplicarAtualizacao(() => aplicar));
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);

  // Sem planilha configurada, o primeiro lugar a visitar é Ajustes (SPEC 4.4, item 5).
  useEffect(() => {
    if (estado.modo === 'google' && !estado.ids?.planilha && !estado.carregando) irPara('ajustes');
  }, [estado.modo, estado.ids?.planilha, estado.carregando]);

  function irPara(nova: Aba) {
    window.location.hash = `/${nova}`;
    setAba(nova);
    window.scrollTo(0, 0);
  }

  return (
    <div class="app">
      {estado.modo === 'demo' && (
        <div class="faixa-demo" role="status">Modo demonstração · dados fictícios</div>
      )}
      {aplicarAtualizacao && (
        <div class="faixa-atualizacao" role="status">
          <span>Atualização disponível</span>
          <button type="button" class="botao-link" onClick={aplicarAtualizacao}>Recarregar</button>
        </div>
      )}
      {estado.precisaEntrarDeNovo && (
        <div class="faixa-atencao" role="status">
          <span>A sessão do Google expirou.</span>
          <button type="button" class="botao-link" onClick={() => app.entrar()}>Entrar de novo</button>
        </div>
      )}
      {estado.aviso && (
        <div class="faixa-atencao" role="status">
          <span>{estado.aviso}</span>
        </div>
      )}
      {estado.pendentes > 0 && (
        <div class="faixa-discreta" role="status">
          {estado.pendentes === 1 ? '1 item aguardando envio' : `${estado.pendentes} itens aguardando envio`}
        </div>
      )}
      <main class="conteudo">
        {aba === 'semana' && <TelaSemana irParaAjustes={() => irPara('ajustes')} />}
        {aba === 'extrato' && <EmBreve titulo="Extrato" marco="M2" texto="Aqui vai aparecer a lista de todos os lançamentos, com busca e filtros por mês, pessoa, conta e categoria." />}
        {aba === 'lancar' && <EmBreve titulo="Lançar" marco="M2" texto="Aqui você vai lançar um gasto em até 4 toques: valor, onde, com o que pagou e quem." />}
        {aba === 'fotografia' && <EmBreve titulo="Fotografia do mês" marco="M6" texto="Aqui vai aparecer o retrato do mês: quanto entra, quanto sai em cada tipo de gasto e como o mês deve fechar." />}
        {aba === 'ajustes' && <TelaAjustes />}
      </main>
      <BarraInferior atual={aba} aoEscolher={irPara} />
    </div>
  );
}
