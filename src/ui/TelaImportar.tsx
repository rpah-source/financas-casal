import { useState } from 'preact/hooks';
import type { ArquivoLido } from '../domain/importacao/tipos';
import type { PerfilCSV } from '../domain/importacao/csv';
import { cicloDaImportacao } from '../domain/faturas';
import { ddmm, nomeMesLongo, partesData } from '../domain/dates';
import { formatarBRL } from '../domain/money';
import { ehPagamentoFatura } from '../domain/importacao/conciliacao';
import { Chips, useToast } from './comum';
import { useApp } from './useApp';

type Original = { nome: string; ext: string; mimeType: string; conteudo: Blob };

/** Lê o arquivo como texto; OFX antigo costuma vir em Windows-1252. */
async function lerComoTexto(arq: File): Promise<string> {
  const buf = await arq.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1252').decode(buf);
}

/** Importar extrato ou fatura (SPEC 8.2): arquivo do app Arquivos ou texto colado. */
export function TelaImportar({ aoTerminar, voltar }: { aoTerminar: () => void; voltar: () => void }) {
  const [{ base, hoje }, app] = useApp();
  const toast = useToast();
  const [contaId, setContaId] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [lido, setLido] = useState<ArquivoLido | null>(null);
  const [original, setOriginal] = useState<Original | null>(null);
  const [pdf, setPdf] = useState(false);
  const [csvSemPerfil, setCsvSemPerfil] = useState<{ linhas: string[][]; texto: string } | null>(null);
  const [vencimento, setVencimento] = useState('');
  const [lembrar, setLembrar] = useState(true);
  const [jaPaga, setJaPaga] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  if (!base) return <p class="discreto">Carregando…</p>;

  const contas = base.contas.filter((c) => c.ativa !== false && !c.excluido).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  const conta = contas.find((c) => c.id === contaId);
  const tipoConta = conta?.tipo === 'cartao' ? 'cartao' : 'corrente';

  function aplicarLeitura(l: ArquivoLido) {
    setLido(l);
    const lembrada = app.contaLembrada(l.contaExterna);
    if (lembrada) setContaId(lembrada);
    if (l.vencimento) setVencimento(l.vencimento);
  }

  async function escolherArquivo(e: Event) {
    setErro('');
    const arq = (e.target as HTMLInputElement).files?.[0];
    if (!arq) return;
    const ext = (arq.name.split('.').pop() ?? '').toLowerCase();
    setOriginal({ nome: arq.name, ext, mimeType: arq.type || 'application/octet-stream', conteudo: arq });
    if (ext === 'pdf' || arq.type === 'application/pdf') {
      setPdf(true);
      return;
    }
    const t = await lerComoTexto(arq);
    const r = app.lerConteudo({ nome: arq.name, texto: t, tipoConta });
    if (r.tipo === 'csv-sem-perfil') setCsvSemPerfil({ linhas: r.linhas, texto: t });
    else aplicarLeitura(r.lido);
  }

  function lerTextoColado() {
    setErro('');
    if (!conta) return setErro('Escolha primeiro de qual conta ou cartão é o texto.');
    const r = app.lerConteudo({ nome: 'texto.txt', texto, tipoConta });
    if (r.tipo === 'lido') {
      if (!r.lido.linhas.length) return setErro('Não encontrei lançamentos nesse texto. Confira se copiou as linhas com data, descrição e valor.');
      setOriginal({ nome: 'texto-colado.txt', ext: 'txt', mimeType: 'text/plain', conteudo: new Blob([texto], { type: 'text/plain' }) });
      aplicarLeitura(r.lido);
    }
  }

  async function importar() {
    setErro('');
    if (!conta) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return setErro('Toque lá em cima na conta ou no cartão deste arquivo.');
    }
    if (!original) return;
    setOcupado(true);
    try {
      const r = await app.importar({
        lido: pdf ? null : lido,
        contaId: conta.id,
        vencimento: vencimento || null,
        original,
        lembrarContaExterna: lembrar && lido?.contaExterna && app.contaLembrada(lido.contaExterna) !== conta.id ? lido.contaExterna : undefined,
        jaPaga: faturaAntiga && jaPaga,
      });
      toast({
        texto: pdf
          ? 'PDF salvo no Drive'
          : `${r.linhas} linhas: ${r.casados} já batiam, ${r.sugeridos} para confirmar, ${r.novos} novas${r.ignorados ? `, ${r.ignorados} já importadas` : ''}`,
      });
      aoTerminar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui importar.');
    } finally {
      setOcupado(false);
    }
  }

  const ciclo =
    conta?.tipo === 'cartao' && (lido || pdf)
      ? cicloDaImportacao(conta.id, { vencimento: vencimento || lido?.vencimento, fim: lido?.fim, datas: lido?.linhas.map((l) => l.data) ?? [] }, base.parametros)
      : null;
  // Para conferir com o total do banco: compras − créditos, sem os pagamentos de fatura.
  const faturaAntiga = Boolean(ciclo && ciclo.data_vencimento < hoje);
  const soma = lido
    ? lido.linhas.filter((l) => !ehPagamentoFatura(l.descricao)).reduce((s, l) => s + (l.sentido === 'saida' ? 1 : -1) * Math.round(l.valor * 100), 0) / 100
    : 0;

  return (
    <section>
      <div class="topo-tela">
        <h1 class="titulo-tela">Importar</h1>
        <button type="button" class="botao-link" onClick={voltar}>Voltar</button>
      </div>

      <Chips
        rotulo="De qual conta ou cartão?"
        opcoes={contas.map((c) => ({ valor: c.id, texto: c.nome, cor: c.cor }))}
        valor={contaId}
        aoEscolher={setContaId}
      />

      {!lido && !pdf && !csvSemPerfil && (
        <>
          <div class="cartao">
            <h2 class="titulo-cartao">Arquivo (OFX, CSV ou PDF)</h2>
            <p class="discreto">Salve o arquivo no app Arquivos (ex.: anexo do e-mail › Salvar em Arquivos) e escolha aqui.</p>
            <label class="botao-primario botao-arquivo">
              Escolher arquivo
              <input type="file" accept=".ofx,.csv,.txt,.pdf,application/pdf,text/plain,text/csv,application/x-ofx" onChange={escolherArquivo} />
            </label>
          </div>
          <div class="cartao">
            <h2 class="titulo-cartao">Ou cole o texto</h2>
            <p class="discreto">Abra a fatura (PDF ou app do banco), selecione tudo, copie e cole aqui.</p>
            <textarea class="campo-texto" rows={6} aria-label="Texto da fatura ou extrato" value={texto} onInput={(e) => setTexto((e.target as HTMLTextAreaElement).value)} />
            <button type="button" class="botao-secundario" disabled={!texto.trim()} onClick={lerTextoColado}>Ler o texto</button>
          </div>
        </>
      )}

      {csvSemPerfil && <MapearCSV linhas={csvSemPerfil.linhas} tipoConta={tipoConta} aoSalvar={async (perfil) => {
        await app.salvarPerfilCSV(perfil);
        const r = app.lerConteudo({ nome: 'arquivo.csv', texto: csvSemPerfil.texto, tipoConta, perfil });
        if (r.tipo === 'lido') {
          setCsvSemPerfil(null);
          aplicarLeitura(r.lido);
        }
      }} />}

      {pdf && (
        <div class="cartao">
          <p><strong>PDF recebido.</strong> Leitura automática de PDF chega numa próxima versão; cole o texto ou importe CSV/OFX.</p>
          <p class="discreto">Dá para salvar o PDF no Drive agora e ligar à fatura.</p>
        </div>
      )}

      {lido && (
        <div class="cartao">
          <h2 class="titulo-cartao">O que encontrei</h2>
          <ul class="lista-conta">
            <li><span>Formato</span><span>{lido.formato.toUpperCase()}{lido.banco ? ` · ${lido.banco}` : ''}</span></li>
            <li><span>Lançamentos lidos</span><span>{lido.linhas.length}</span></li>
            {lido.ignoradas > 0 && <li><span>Linhas sem dados suficientes (ignoradas)</span><span>{lido.ignoradas}</span></li>}
            {lido.inicio && lido.fim && <li><span>Período</span><span>{ddmm(lido.inicio)} a {ddmm(lido.fim)}</span></li>}
            {lido.total !== undefined && <li><span>Total informado pelo banco</span><span>{formatarBRL(lido.total)}</span></li>}
            <li><span>{conta?.tipo === 'cartao' ? 'Compras − créditos lidos (sem pagamentos)' : 'Saídas − entradas lidas (sem pagamentos de fatura)'}</span><span>{formatarBRL(soma)}</span></li>
          </ul>
          {lido.tipoConta === 'cartao' && conta && conta.tipo !== 'cartao' && (
            <p class="alerta-ambar">O arquivo parece ser de cartão, mas você escolheu uma conta. Confira.</p>
          )}
        </div>
      )}

      {(lido || pdf) && conta?.tipo === 'cartao' && (
        <div class="cartao">
          <div class="campo">
            <label for="imp-venc">Vencimento da fatura</label>
            <input id="imp-venc" type="date" value={vencimento || ciclo?.data_vencimento || ''} onChange={(e) => setVencimento((e.target as HTMLInputElement).value)} />
          </div>
          {ciclo && <p class="discreto">Fatura de {nomeMesLongo(partesData(`${ciclo.competencia}-01`).mes)}/{ciclo.competencia.slice(2, 4)} (fecha {ddmm(ciclo.data_fechamento)}, vence {ddmm(ciclo.data_vencimento)}).</p>}
          {faturaAntiga && (
            <label class="caixa">
              <input type="checkbox" checked={jaPaga} onChange={(e) => setJaPaga((e.target as HTMLInputElement).checked)} />
              Esta fatura já foi paga (as compras entram como realizadas e ela não aparece como aberta)
            </label>
          )}
        </div>
      )}

      {lido?.contaExterna && conta && (
        <label class="caixa">
          <input type="checkbox" checked={lembrar} onChange={(e) => setLembrar((e.target as HTMLInputElement).checked)} />
          Lembrar que arquivos desta conta do banco são de "{conta.nome}"
        </label>
      )}

      {(lido || pdf) && !conta && <p class="alerta-ambar">Falta escolher, lá em cima, de qual conta ou cartão é este arquivo.</p>}
      {erro && <p class="erro-campo" role="alert">{erro}</p>}

      {(lido || pdf) && (
        <>
          <button type="button" class="botao-primario" disabled={ocupado} onClick={importar}>
            {ocupado ? 'Importando…' : pdf ? 'Salvar PDF no Drive' : 'Importar e revisar'}
          </button>
          <button type="button" class="botao-link" onClick={() => { setLido(null); setPdf(false); setOriginal(null); setVencimento(''); }}>
            Escolher outro arquivo
          </button>
          <p class="discreto">
            O original vai para a pasta de faturas e comprovantes no seu Drive, com o nome "AAAA-MM – Fatura (ou Extrato) – conta". Nada entra no extrato sem você confirmar, a não ser o que já batia
            com um lançamento existente.
          </p>
        </>
      )}
    </section>
  );
}

/** Assistente de mapeamento de colunas para CSV desconhecido (SPEC 8.2). */
function MapearCSV({ linhas, tipoConta, aoSalvar }: { linhas: string[][]; tipoConta: 'cartao' | 'corrente'; aoSalvar: (p: PerfilCSV) => void }) {
  const cab = linhas[0] ?? [];
  const exemplo = linhas[1] ?? [];
  const [data, setData] = useState(0);
  const [desc, setDesc] = useState(Math.min(1, cab.length - 1));
  const [valor, setValor] = useState(Math.min(2, cab.length - 1));
  const [sinal, setSinal] = useState<PerfilCSV['sinal']>(tipoConta === 'cartao' ? 'positivo_saida' : 'negativo_saida');
  const [nome, setNome] = useState('Meu banco');
  const opcoes = cab.map((c, i) => <option key={i} value={i}>{c || `Coluna ${i + 1}`}{exemplo[i] ? ` (ex.: ${exemplo[i].slice(0, 20)})` : ''}</option>);
  return (
    <div class="cartao">
      <h2 class="titulo-cartao">Não reconheci este CSV</h2>
      <p class="discreto">Diga qual coluna é qual. O app lembra para as próximas vezes.</p>
      <div class="campo"><label for="m-data">Data</label><select id="m-data" value={data} onChange={(e) => setData(Number((e.target as HTMLSelectElement).value))}>{opcoes}</select></div>
      <div class="campo"><label for="m-desc">Descrição</label><select id="m-desc" value={desc} onChange={(e) => setDesc(Number((e.target as HTMLSelectElement).value))}>{opcoes}</select></div>
      <div class="campo"><label for="m-valor">Valor</label><select id="m-valor" value={valor} onChange={(e) => setValor(Number((e.target as HTMLSelectElement).value))}>{opcoes}</select></div>
      <div class="campo">
        <label for="m-sinal">Como o arquivo mostra uma compra/saída?</label>
        <select id="m-sinal" value={sinal} onChange={(e) => setSinal((e.target as HTMLSelectElement).value as PerfilCSV['sinal'])}>
          <option value="negativo_saida">Com sinal de menos (−45,90)</option>
          <option value="positivo_saida">Sem sinal (45,90)</option>
        </select>
      </div>
      <div class="campo"><label for="m-nome">Nome do perfil</label><input id="m-nome" type="text" value={nome} onInput={(e) => setNome((e.target as HTMLInputElement).value)} /></div>
      <button type="button" class="botao-primario" onClick={() => aoSalvar({ nome, data: cab[data] || data, descricao: cab[desc] || desc, valor: cab[valor] || valor, sinal, tipoConta })}>
        Salvar e ler
      </button>
    </div>
  );
}
