import { useState } from 'preact/hooks';
import { formatarBRL } from '../domain/money';
import { lerPessoas } from '../domain/parametros';
import type { Lancamento, Natureza, Pessoa, StatusLancamento } from '../domain/types';
import { lerNumero } from '../domain/valores';
import { EscolherCategoria, Folha, NOME_NATUREZA, NOME_ORIGEM, NOME_STATUS, useToast } from './comum';
import { useApp } from './useApp';

/** Detalhe e edição de um lançamento (SPEC 10.3). */
export function DetalheLancamento({ l, fechar }: { l: Lancamento; fechar: () => void }) {
  const [estado, app] = useApp();
  const base = estado.base!;
  const toast = useToast();
  const pessoas = lerPessoas(base.parametros, estado.hoje);
  const [e, setE] = useState<Lancamento>(l);
  const [valorTexto, setValorTexto] = useState(String(l.valor).replace('.', ','));
  const [escolhendoCat, setEscolhendoCat] = useState(false);
  const [erro, setErro] = useState('');
  const mudar = (p: Partial<Lancamento>) => setE({ ...e, ...p });

  async function salvar() {
    const valor = lerNumero(valorTexto);
    if (!valor || valor <= 0) return setErro('Valor inválido.');
    if (e.tipo === 'transferencia' && (!e.conta_destino_id || e.conta_destino_id === e.conta_id)) {
      return setErro('Escolha a conta de destino.');
    }
    const proj = estado.projetosAreas.find((x) => x.nome === e.projeto_area);
    try {
      await app.editar({
        ...e,
        valor,
        data_caixa: e.data_caixa === l.data_competencia ? e.data_competencia : e.data_caixa,
        projeto_id: proj?.tipo === 'projeto' ? proj.id : null,
      });
      toast({ texto: 'Alterações salvas' });
      fechar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não consegui salvar.');
    }
  }

  const campo = (id: string, rotulo: string, filho: preact.JSX.Element) => (
    <div class="campo">
      <label for={id}>{rotulo}</label>
      {filho}
    </div>
  );

  return (
    <Folha titulo={l.descricao || 'Lançamento'} fechar={fechar}>
      <p class="discreto">
        {NOME_ORIGEM[l.origem ?? 'manual']}
        {l.criado_em ? ` · criado em ${new Date(l.criado_em).toLocaleDateString('pt-BR')}` : ''}
        {l.conciliado ? ' · conciliado' : ''}
        {l.descricao_original ? ` · no banco: "${l.descricao_original}"` : ''}
      </p>

      {campo('d-desc', 'Descrição', <input id="d-desc" type="text" value={e.descricao ?? ''} onInput={(ev) => mudar({ descricao: (ev.target as HTMLInputElement).value })} />)}
      {campo('d-valor', 'Valor (R$)', <input id="d-valor" type="text" inputMode="decimal" value={valorTexto} onInput={(ev) => setValorTexto((ev.target as HTMLInputElement).value)} />)}
      {campo('d-data', 'Data da compra', <input id="d-data" type="date" value={e.data_competencia} onChange={(ev) => { const v = (ev.target as HTMLInputElement).value; if (v) mudar({ data_competencia: v }); }} />)}
      {campo(
        'd-conta',
        e.tipo === 'receita' ? 'Entrou em' : 'Conta',
        <select id="d-conta" value={e.conta_id} onChange={(ev) => mudar({ conta_id: (ev.target as HTMLSelectElement).value })}>
          {base.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>,
      )}
      {e.tipo === 'transferencia' &&
        campo(
          'd-destino',
          'Vai para',
          <select id="d-destino" value={e.conta_destino_id ?? ''} onChange={(ev) => mudar({ conta_destino_id: (ev.target as HTMLSelectElement).value })}>
            <option value="">Escolha</option>
            {base.contas.filter((c) => c.id !== e.conta_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>,
        )}
      {e.tipo !== 'transferencia' && (
        <div class="campo">
          <span class="rotulo">Categoria</span>
          <button type="button" class="botao-campo" onClick={() => setEscolhendoCat(true)}>
            {e.categoria ? `${e.categoria}${e.subcategoria ? ` › ${e.subcategoria}` : ''}` : 'Escolher'}
          </button>
        </div>
      )}
      {e.tipo !== 'transferencia' &&
        campo(
          'd-nat',
          'Natureza',
          <select id="d-nat" value={e.natureza} onChange={(ev) => mudar({ natureza: (ev.target as HTMLSelectElement).value as Natureza })}>
            {Object.entries(NOME_NATUREZA).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>,
        )}
      {campo(
        'd-quem',
        'Quem',
        <select id="d-quem" value={e.quem} onChange={(ev) => mudar({ quem: (ev.target as HTMLSelectElement).value as Pessoa })}>
          <option value="pessoa1">{pessoas.pessoa1}</option>
          <option value="pessoa2">{pessoas.pessoa2}</option>
          <option value="casal">Casal</option>
        </select>,
      )}
      {campo(
        'd-status',
        'Status',
        <select id="d-status" value={e.status} onChange={(ev) => mudar({ status: (ev.target as HTMLSelectElement).value as StatusLancamento })}>
          {Object.entries(NOME_STATUS).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>,
      )}
      {campo(
        'd-proj',
        'Projeto ou área',
        <select id="d-proj" value={e.projeto_area ?? ''} onChange={(ev) => mudar({ projeto_area: (ev.target as HTMLSelectElement).value || null })}>
          <option value="">Nenhum</option>
          {e.projeto_area && !estado.projetosAreas.some((x) => x.nome === e.projeto_area) && <option value={e.projeto_area}>{e.projeto_area}</option>}
          {estado.projetosAreas.map((x) => <option key={x.nome} value={x.nome}>{x.nome}</option>)}
        </select>,
      )}
      {campo('d-tags', 'Tags', <input id="d-tags" type="text" value={e.tags ?? ''} onInput={(ev) => mudar({ tags: (ev.target as HTMLInputElement).value })} />)}
      {campo('d-obs', 'Observação', <input id="d-obs" type="text" value={e.observacao ?? ''} onInput={(ev) => mudar({ observacao: (ev.target as HTMLInputElement).value })} />)}

      {erro && <p class="erro-campo" role="alert">{erro}</p>}
      <button type="button" class="botao-primario" onClick={salvar}>Salvar alterações</button>
      <div class="linha-botoes">
        <button
          type="button"
          class="botao-secundario"
          onClick={async () => {
            const d = await app.duplicar(l).catch(() => null);
            if (d) toast({ texto: `Duplicado para hoje (${formatarBRL(d.valor)})`, acao: { rotulo: 'Desfazer', f: () => void app.excluir(d) } });
            fechar();
          }}
        >
          Duplicar
        </button>
        <button
          type="button"
          class="botao-secundario"
          onClick={async () => {
            await app.excluir(l).catch(() => {});
            toast({ texto: 'Excluído', acao: { rotulo: 'Desfazer', f: () => void app.desfazerExclusao(l) } });
            fechar();
          }}
        >
          Excluir
        </button>
      </div>

      {escolhendoCat && (
        <EscolherCategoria
          categorias={base.categorias}
          fechar={() => setEscolhendoCat(false)}
          aoEscolher={(cat, sub) => {
            const c = base.categorias.find((x) => x.categoria === cat && (x.subcategoria ?? null) === sub);
            const geral = base.categorias.find((x) => x.categoria === cat && !x.subcategoria);
            mudar({ categoria: cat, subcategoria: sub, natureza: c?.natureza_padrao || geral?.natureza_padrao || e.natureza });
            setEscolhendoCat(false);
          }}
        />
      )}
    </Folha>
  );
}
