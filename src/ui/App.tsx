import { useEffect, useMemo, useState } from 'preact/hooks';
import { hojeSP } from '../domain/dates';
import { gerarDadosDemo } from '../demo/demoData';
import { registrarServiceWorker } from '../pwa/registerSW';
import { BarraInferior, type Aba } from './BarraInferior';
import { TelaSemana } from './TelaSemana';
import { EmBreve } from './EmBreve';

const ABAS: Aba[] = ['semana', 'extrato', 'lancar', 'fotografia', 'ajustes'];

function abaDaUrl(): Aba {
  const h = window.location.hash.replace(/^#\/?/, '');
  return (ABAS as string[]).includes(h) ? (h as Aba) : 'semana';
}

export function App() {
  const [aba, setAba] = useState<Aba>(abaDaUrl);
  const [aplicarAtualizacao, setAplicarAtualizacao] = useState<(() => void) | null>(null);

  // M0: sem login Google ainda, então o app roda sempre em modo demonstração
  // (SPEC 4.2: "ativado por ?demo=1 ou quando não há login").
  const hoje = hojeSP();
  const dados = useMemo(() => gerarDadosDemo(hoje), [hoje]);

  useEffect(() => {
    const aoMudar = () => setAba(abaDaUrl());
    window.addEventListener('hashchange', aoMudar);
    registrarServiceWorker((aplicar) => setAplicarAtualizacao(() => aplicar));
    return () => window.removeEventListener('hashchange', aoMudar);
  }, []);

  const irPara = (nova: Aba) => {
    window.location.hash = `/${nova}`;
    setAba(nova);
    window.scrollTo(0, 0);
  };

  return (
    <div class="app">
      <div class="faixa-demo" role="status">Modo demonstração · dados fictícios</div>
      {aplicarAtualizacao && (
        <div class="faixa-atualizacao" role="status">
          <span>Atualização disponível</span>
          <button type="button" class="botao-link" onClick={aplicarAtualizacao}>Recarregar</button>
        </div>
      )}
      <main class="conteudo">
        {aba === 'semana' && <TelaSemana dados={dados} hoje={hoje} />}
        {aba === 'extrato' && <EmBreve titulo="Extrato" marco="M2" texto="Aqui vai aparecer a lista de todos os lançamentos, com busca e filtros por mês, pessoa, conta e categoria." />}
        {aba === 'lancar' && <EmBreve titulo="Lançar" marco="M2" texto="Aqui você vai lançar um gasto em até 4 toques: valor, onde, com o que pagou e quem." />}
        {aba === 'fotografia' && <EmBreve titulo="Fotografia do mês" marco="M6" texto="Aqui vai aparecer o retrato do mês: quanto entra, quanto sai em cada tipo de gasto e como o mês deve fechar." />}
        {aba === 'ajustes' && <EmBreve titulo="Ajustes" marco="M1 e M7" texto="Aqui você vai entrar com o Google, escolher as pastas do Drive e configurar contas, cartões, salário e a semanada." />}
      </main>
      <BarraInferior atual={aba} aoEscolher={irPara} />
    </div>
  );
}
