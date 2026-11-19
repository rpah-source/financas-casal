import { IconeAjustes, IconeExtrato, IconeFotografia, IconeMais, IconeSemana } from './icons';

export type Aba = 'semana' | 'extrato' | 'lancar' | 'fotografia' | 'ajustes';

const ITENS: Array<{ aba: Aba; rotulo: string; Icone: () => preact.JSX.Element }> = [
  { aba: 'semana', rotulo: 'Semana', Icone: IconeSemana },
  { aba: 'extrato', rotulo: 'Extrato', Icone: IconeExtrato },
  { aba: 'lancar', rotulo: 'Lançar', Icone: IconeMais },
  { aba: 'fotografia', rotulo: 'Fotografia', Icone: IconeFotografia },
  { aba: 'ajustes', rotulo: 'Ajustes', Icone: IconeAjustes },
];

export function BarraInferior({ atual, aoEscolher }: { atual: Aba; aoEscolher: (a: Aba) => void }) {
  return (
    <nav class="barra-inferior" aria-label="Navegação principal">
      {ITENS.map(({ aba, rotulo, Icone }) => (
        <button
          key={aba}
          type="button"
          class={`item-barra${aba === 'lancar' ? ' item-mais' : ''}${atual === aba ? ' ativo' : ''}`}
          aria-current={atual === aba ? 'page' : undefined}
          aria-label={aba === 'lancar' ? 'Lançar (novo gasto)' : undefined}
          onClick={() => aoEscolher(aba)}
        >
          <span class="icone"><Icone /></span>
          {aba !== 'lancar' && <span class="rotulo">{rotulo}</span>}
        </button>
      ))}
    </nav>
  );
}
