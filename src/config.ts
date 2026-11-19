/**
 * Configuração pública do app (SPEC 11b).
 *
 * O Client ID do OAuth e a chave de API do Picker são PÚBLICOS por natureza
 * (aparecem no navegador de qualquer forma). Não são segredos.
 * A chave de API deve ser restrita ao domínio do site no Google Cloud.
 *
 * Ficam vazios até o usuário seguir o SETUP.md e colar os valores no chat.
 * Enquanto estiverem vazios, o app roda só em modo demonstração.
 */
export const config = {
  googleClientId: '385365135855-6d60p4pari7n8imhoo1rpctabhj33gs2.apps.googleusercontent.com',
  googleApiKey: 'AIzaSyDYkkqBTpkJiAEO-ROldH9RF6EmWT-C2Uc',
  /** Número do projeto no Google Cloud (usado como `appId` do Picker). */
  googleAppId: '385365135855',
  /** Único escopo permitido (SPEC 4.1). */
  oauthScope: 'https://www.googleapis.com/auth/drive.file',
} as const;

export const googleConfigurado = () => Boolean(config.googleClientId && config.googleApiKey);
