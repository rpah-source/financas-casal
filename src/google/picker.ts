import { config } from '../config';
import { carregarScript } from './carregarScript';

/**
 * Google Picker (SPEC 4.4): o usuário escolhe uma pasta ou planilha e o app
 * ganha acesso (drive.file) só ao que foi escolhido.
 */
export type TipoEscolha = 'pasta' | 'planilha';

export interface Escolhido {
  id: string;
  nome: string;
  url?: string;
}

let apiPronta: Promise<void> | null = null;

function carregarPicker(): Promise<void> {
  apiPronta ??= carregarScript('https://apis.google.com/js/api.js').then(
    () => new Promise<void>((ok) => (window as any).gapi.load('picker', { callback: ok })),
  );
  return apiPronta;
}

/** Abre o seletor. Resolve com o item escolhido ou `null` se o usuário cancelar. */
export async function escolherNoDrive(tipo: TipoEscolha, token: string, titulo: string): Promise<Escolhido | null> {
  await carregarPicker();
  const g = (window as any).google.picker;
  const visao =
    tipo === 'pasta'
      ? new g.DocsView(g.ViewId.FOLDERS)
          .setIncludeFolders(true)
          .setSelectFolderEnabled(true)
          .setMimeTypes('application/vnd.google-apps.folder')
      : new g.DocsView(g.ViewId.SPREADSHEETS);

  return new Promise((ok) => {
    const picker = new g.PickerBuilder()
      .setTitle(titulo)
      .setLocale('pt-BR')
      .addView(visao)
      .setOAuthToken(token)
      .setDeveloperKey(config.googleApiKey)
      .setAppId(config.googleAppId)
      .setCallback((dados: any) => {
        if (dados.action === g.Action.PICKED) {
          const d = dados.docs[0];
          ok({ id: d.id, nome: d.name, url: d.url });
        } else if (dados.action === g.Action.CANCEL) {
          ok(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
