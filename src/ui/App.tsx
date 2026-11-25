import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { App as Controlador } from '../app/estado';
import { registrarServiceWorker } from '../pwa/registerSW';
import { BarraInferior, type Aba } from './BarraInferior';
import { EmBreve } from './EmBreve';
import { AvisoToast, ContextoToast, type Toast } from './comum';
import { TelaExtrato } from './TelaExtrato';
import { TelaLancar } from './TelaLancar';
import { TelaRevisar } from './TelaRevisar';
import { TelaImportar } from './TelaImportar';
import { TelaAjustes } from './TelaAjustes';
import { TelaSemana } from './TelaSemana';
import { PuxarParaAtualizar } from './PuxarParaAtualizar';
import { ContextoApp, useApp } from './useApp';

const ABAS: Aba[] = ['semana', 'extrato', 'lancar', 'fotografia', 'ajustes', 'revisar', 'importar'];

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
  const [toast, setToast] = useState<Toast | null>(null);
  const [anterior, setAnterior] = useState<Aba>('semana');
  const atualizar = useCallback(() => void app.recarregar(), [app]);

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
    if (nova === 'lancar' && aba !== 'lancar') setAnterior(aba);
    window.location.hash = `/${nova}`;
    setAba(nova);
    window.scrollTo(0, 0);
  }

  return (
    <ContextoToast.Provider value={setToast}>
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
      <PuxarParaAtualizar
        ativo={estado.modo === 'google' && Boolean(estado.ids?.planilha) && aba !== 'lancar'}
        carregando={estado.carregando && Boolean(estado.base)}
        aoAtualizar={atualizar}
      />
      <main class="conteudo">
        {aba === 'semana' && <TelaSemana irPara={irPara} />}
        {aba === 'revisar' && <TelaRevisar voltar={() => irPara('semana')} importar={() => irPara('importar')} />}
        {aba === 'importar' && <TelaImportar aoTerminar={() => irPara('revisar')} voltar={() => irPara('revisar')} />}
        {aba === 'extrato' && <TelaExtrato importar={() => irPara('importar')} />}
        {aba === 'lancar' && <TelaLancar aoTerminar={() => irPara(anterior)} />}
        {aba === 'fotografia' && <EmBreve titulo="Fotografia do mês" marco="M6" texto="Aqui vai aparecer o retrato do mês: quanto entra, quanto sai em cada tipo de gasto e como o mês deve fechar." />}
        {aba === 'ajustes' && <TelaAjustes />}
      </main>
      <AvisoToast toast={toast} fechar={() => setToast(null)} />
      <BarraInferior atual={aba} aoEscolher={irPara} />
    </div>
    </ContextoToast.Provider>
  );
}
