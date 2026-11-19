# CLAUDE.md — convenções do projeto

Fonte da verdade: `SPEC.md`. Decisões não especificadas: `DECISIONS.md`. Histórico por marco: `CHANGELOG.md`.

## Regras inegociáveis
- **Nenhum dado pessoal** em código, testes, seeds, exemplos ou commits: nada de nomes reais, valores reais, bancos ligados a pessoas ou categorias pessoais. Use dados fictícios (contas "Conta Azul", "Cartão Verde", "Vale"; pessoas "Alex" e "Sam"). O repositório e o site são públicos.
- O usuário **não é desenvolvedor e não tem computador**: só iPhone/Safari. Nunca peça terminal. Tudo que ele fizer vai passo a passo em `SETUP.md`. Fale com ele em português simples.
- Um marco por vez (SPEC 13). Cada marco termina com testes passando, deploy e nota no `CHANGELOG.md` dizendo o que testar no celular.
- Escopo OAuth único: `https://www.googleapis.com/auth/drive.file`.
- Sem analytics, sem logs remotos, sem scripts de CDN (exceto GIS e Picker do Google).

## Stack
Vite + TypeScript + Preact, sem back-end. Testes com Vitest. Deploy no GitHub Pages via GitHub Actions (push na `main`). Build com `base: './'` (funciona em qualquer subcaminho; pronto para Cloudflare Pages). Service worker gerado no build (`vite.config.ts`) faz cache só do app shell. CSP via meta tag, só no build.

## Camadas
```
src/ui/        telas (Preact)              → só apresentação
src/app/       estado do app (modo demo/Google, carregar, assistente)
src/domain/    regras puras, testadas      → sem UI, sem Google
               schema.ts = abas e colunas (fonte única); linhas.ts = leitura tolerante;
               base.ts = referências por nome, padrões, problemas
src/repo/      FonteTabelas (MemoriaTabelas | SheetsTabelas) + RepositorioPlanilha + fila offline
src/storage/   DriveStorage: MemoryStorage | GoogleDriveStorage
src/google/    login (GIS), Picker, cliente HTTP
src/bootstrap/ criação da planilha base
src/demo/      dados fictícios do modo demonstração (viram uma planilha em memória)
src/pwa/       registro do service worker
src/config.ts  Client ID e chave de API (públicos)
```
Modo demonstração: `?demo=1` ou sem login → MemoryRepository com dados fictícios.

## Planilha (nomes exatos das abas)
`Contas`, `Lancamentos`, `Recorrencias`, `Faturas`, `Parcelamentos`, `Dividas`, `Categorias`, `Regras`, `Parametros`, `ProjetosAreas`, `CaixaEntrada`, `Importacoes`.
Linha 1 = cabeçalho em `snake_case`; colunas localizadas **pelo nome**, nunca pela posição. Datas `AAAA-MM-DD`; valores positivos em reais (sinal vem do `tipo`); fuso America/Sao_Paulo; exclusão lógica (`excluido`). IDs com prefixo + ULID.

## Visual
Fundo `#F6F5F1`, cartões brancos com borda `#E6E3DB`, destaque `#2E6B5A`, atenção `#9A5B00` sobre `#FBEFD9`. **Nunca vermelho.** Toque mínimo 44×44 px, largura de referência 390 px, barra inferior com 5 itens.

## Comandos (para o Claude Code, não para o usuário)
- `npm ci` — instalar
- `npm test` — testes (Vitest)
- `npm run build` — checagem de tipos + build em `dist/`
- `npm run dev` — servidor local
- `scripts/e2e-google-falso.cjs` — teste de ponta a ponta com Google simulado (instruções no topo do arquivo)
- `node scripts/gerar-icones.mjs` (com `NODE_PATH=$(npm root -g)`) — regerar ícones PNG
