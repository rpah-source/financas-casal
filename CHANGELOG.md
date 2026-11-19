# Changelog

## M1 · Conexão com o Google e a planilha — 19/11/2026
**O que dá para testar no celular**
- Sem configurar nada: o modo demonstração continua igual.
- Depois da Parte 3 do SETUP.md (Google Cloud): **Ajustes › Entrar com Google**, escolher a pasta de Finanças e ver a planilha "Finanças do Casal — Base" aparecer no seu Drive, com as 12 abas, as listas suspensas e as categorias padrão.
- Escrever uma linha à mão na planilha (ex.: em Lancamentos, valor `45,90`, data `19/11/2026`, conta pelo nome) e tocar em **Atualizar dados**: o app completa id, status e natureza na planilha.
- Escrever uma data errada de propósito: a linha aparece em **Ajustes › Linhas com problema** e o resto continua funcionando.
- Fechar e reabrir o app: abre direto com os seus dados (do cache), mesmo sem internet.

Por dentro: leitura por nome de coluna, referências por nome, fila offline (IndexedDB), cache, login com Google (escopo drive.file) e Picker.

## M0 · Base do app — 19/11/2026
**O que dá para testar no celular** (modo demonstração, com dados fictícios):
- Abrir o site no Safari e ver a tela **Semana** com "Ainda podemos gastar", a barra de progresso e o "por dia".
- Tocar em **"Como chegamos nesse número?"** e ver a conta passo a passo.
- Tocar nos 5 botões da barra de baixo (as outras telas mostram o que vem em cada marco).
- **Compartilhar › Adicionar à Tela de Início**: o app abre em tela cheia, com ícone próprio, e abre mesmo sem internet.

Por dentro: projeto Vite + TypeScript + Preact, PWA (manifesto, ícones, service worker com aviso de atualização), testes automáticos (Vitest) e publicação automática no GitHub Pages.
