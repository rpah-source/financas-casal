# Decisões

Registro de escolhas não especificadas no SPEC (SPEC, cabeçalho: "registre a opção mais simples").

## M0
- **D1 · Preact** em vez de React: mais leve (~10 kB), mesma API. SPEC 4.1 permite os dois.
- **D2 · Versões das ferramentas:** Vite 8, Vitest 5, TypeScript 5.8. As versões anteriores do Vitest tinham alertas de segurança críticos (`npm audit`).
- **D3 · Service worker escrito à mão** (gerado no build por um plugin de 60 linhas em `vite.config.ts`) em vez de `vite-plugin-pwa`: menos dependências (SPEC 11). Estratégia: app shell em cache; navegação tenta a rede e cai no cache sem internet; APIs do Google nunca passam pelo cache.
- **D4 · Aviso de atualização:** quando há versão nova, aparece "Atualização disponível · Recarregar". Só recarrega quando o usuário toca. O app também procura versão nova ao voltar para a tela (comum no iPhone).
- **D5 · `base: './'`** (caminhos relativos) para o mesmo build funcionar no GitHub Pages (`/financas-casal/`) e no Cloudflare Pages (`/`).
- **D6 · Fonte do sistema** (San Francisco no iPhone) em vez de baixar a Inter: evita carregar arquivos de terceiros e funciona offline. A pilha de fontes já começa por Inter, caso esteja instalada.
- **D7 · CSP só no build:** o servidor de desenvolvimento do Vite usa scripts inline, incompatíveis com a política.
- **D8 · Navegação por hash** (`#/semana`, `#/extrato`…): funciona no GitHub Pages sem configuração de servidor.
- **D9 · No M0 o app roda sempre em modo demonstração**, porque o login Google só chega no M1. Os dados fictícios usam datas relativas a "hoje" para a demonstração parecer viva.
- **D10 · Valores arredondados no destaque:** o "Ainda podemos gastar" e o "por dia" arredondam **para baixo** (nunca mostram mais do que existe); "acima da semanada" arredonda para cima. A conta detalhada mostra os centavos.
- **D11 · Cortes de semana inválidos** em `semana.cortes` voltam ao padrão `1-8,9-15,16-22,23-fim`, sem travar (princípio 5).
- **D12 · Publicação:** o GitHub Actions publica a cada push na `main` (SPEC 4.1). O trabalho de cada marco é feito num ramo próprio e chega à `main` com a autorização do usuário.
