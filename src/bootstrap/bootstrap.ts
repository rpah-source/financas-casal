import { categoriasPadrao } from '../domain/categoriasPadrao';
import { montarLinha } from '../domain/linhas';
import { PARAMETROS_PADRAO, VIGENCIA_INICIAL } from '../domain/parametros';
import { ABAS, cabecalhos, NOMES_ABAS } from '../domain/schema';
import type { FonteTabelas } from '../repo/fonte';
import type { DriveStorage } from '../storage/drive';

/**
 * Primeira execução (SPEC 4.4): cria a planilha base e a pasta
 * "Faturas e extratos" dentro da pasta de Finanças escolhida no Picker.
 */
export const NOME_PLANILHA = 'Finanças do Casal — Base';
export const NOME_PASTA_FATURAS = 'Faturas e extratos';

export interface IdsBase {
  planilha: string;
  pasta_financas: string;
  pasta_faturas: string;
  pasta_comprovantes?: string;
  pasta_entrada?: string;
  indice?: string;
}

export async function criarBase(p: {
  storage: DriveStorage;
  fontePara: (planilhaId: string) => FonteTabelas & { removerAbasPadrao?: (nossas: string[]) => Promise<void> };
  pastaFinancasId: string;
}): Promise<IdsBase> {
  const planilha = await p.storage.criarPlanilha(NOME_PLANILHA, p.pastaFinancasId);
  const pastaFaturas = await p.storage.criarPasta(NOME_PASTA_FATURAS, p.pastaFinancasId);
  const fonte = p.fontePara(planilha);

  await fonte.garantirEstrutura(ABAS, {});
  await fonte.removerAbasPadrao?.(NOMES_ABAS);

  await fonte.anexar(
    'Categorias',
    categoriasPadrao().map((c) => montarLinha(cabecalhos('Categorias'), { ...c })),
  );

  const ids: IdsBase = { planilha, pasta_financas: p.pastaFinancasId, pasta_faturas: pastaFaturas };
  await fonte.anexar('Parametros', linhasParametros([...PARAMETROS_PADRAO, ...paresIds(ids)], VIGENCIA_INICIAL));
  return ids;
}

export function paresIds(ids: Partial<IdsBase>): Array<[string, string]> {
  return Object.entries(ids)
    .filter(([, v]) => v)
    .map(([k, v]) => [`ids.${k}`, String(v)]);
}

export function linhasParametros(pares: Array<[string, string]>, vigenteDesde: string) {
  return pares.map(([chave, valor]) =>
    montarLinha(cabecalhos('Parametros'), { chave, escopo: '', valor, vigente_desde: vigenteDesde }),
  );
}
