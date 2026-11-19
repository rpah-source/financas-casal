# Configuração pelo celular (passo a passo)

Tudo aqui funciona no **Safari do iPhone**. Você não precisa de computador nem de terminal.

> **Dica para sites "de computador" no iPhone:** se um menu não aparecer no GitHub ou no Google Cloud, toque em **aA** (na barra de endereço) › **Solicitar Site para Computador**. Dá para dar zoom com dois dedos.

Antes de tudo, por segurança:
- **Ative a verificação em duas etapas** no GitHub (github.com › foto › Settings › Password and authentication › Two-factor authentication) e no Google (myaccount.google.com › Segurança › Verificação em duas etapas).
- **Nunca compartilhe** a planilha "Finanças do Casal — Base" com ninguém (deixe o acesso como "Restrito").

---

## Parte 1 · GitHub: ligar o site (5 min) — *já dá para fazer agora*

1. No Safari, abra **github.com/rpah-source/financas-casal** e entre na sua conta.
2. O site gratuito do GitHub exige que o repositório seja **público**. Isso é seguro: o código não tem nenhum dado seu (os dados ficam só no seu Google Drive).
   - Se aparecer a etiqueta **Private** ao lado do nome: toque em **Settings** (aba no topo; role para o lado se não aparecer) › role até o fim › **Danger Zone** › **Change visibility** › **Make public** › confirme.
3. Ainda em **Settings**, no menu da esquerda, toque em **Pages**.
4. Em **Build and deployment › Source**, escolha **GitHub Actions**. (Não precisa salvar; muda na hora.)
5. Anote o endereço do site: **https://rpah-source.github.io/financas-casal/**
   - Ele só funciona depois que a primeira versão for publicada (o Claude avisa quando).

## Parte 2 · Testar o modo demonstração

1. Abra **https://rpah-source.github.io/financas-casal/** no Safari.
2. Você verá a tela **Semana** com dados fictícios (faixa verde "Modo demonstração" no topo).
3. Toque no botão **Compartilhar** (quadrado com seta para cima) › **Adicionar à Tela de Início** › **Adicionar**.
4. Abra pelo ícone novo: o app abre em tela cheia.

Quando sair uma versão nova, aparece no topo **"Atualização disponível · Recarregar"**. Toque em **Recarregar**.

---

## Parte 3 · Google Cloud: permitir o login (15–20 min) — *já dá para fazer (marco M1)*

> Os nomes dos botões podem variar um pouco; o Google muda a tela de vez em quando. Se travar, mande um print para o Claude.

1. Abra **console.cloud.google.com** no Safari e entre com a sua conta Google. Aceite os termos, se pedir.
2. **Criar o projeto:** no topo, toque no seletor de projeto › **Novo projeto** › nome: `Finanças do Casal` › **Criar**. Confira que ele ficou selecionado no topo.
3. **Ativar as APIs:** menu ☰ › **APIs e serviços** › **Biblioteca**. Procure e toque em **Ativar** em cada uma:
   - Google Sheets API
   - Google Drive API
   - Google Picker API
4. **Tela de consentimento:** menu ☰ › **APIs e serviços** › **Tela de consentimento OAuth** (pode aparecer como **Google Auth Platform**) › **Começar**.
   - Nome do app: `Finanças do Casal`. E-mail de suporte: o seu.
   - Público: **Externo**.
   - Contato: o seu e-mail. Aceite e **Criar**.
   - Em **Público** (ou **Usuários de teste**): deixe o status em **Teste** e toque em **Adicionar usuários** › coloque **o seu e-mail** › Salvar.
   - **Não** clique em "Publicar app". Em modo Teste, só você consegue usar.
5. **ID do cliente:** em **Clientes** (ou **Credenciais › Criar credenciais › ID do cliente OAuth**):
   - Tipo: **Aplicativo da Web**. Nome: `Site`.
   - **Origens JavaScript autorizadas** › Adicionar URI: `https://rpah-source.github.io`
   - Não precisa preencher "URIs de redirecionamento". **Criar**.
   - Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).
6. **Chave de API (para o seletor de arquivos):** **Credenciais** › **Criar credenciais** › **Chave de API**. Depois toque nela para editar:
   - **Restrições de aplicativo:** Sites (referenciadores HTTP) › adicione `https://rpah-source.github.io/*`
   - **Restrições de API:** Restringir chave › marque só **Google Picker API** › Salvar.
   - Copie a **chave** (começa com `AIza`).
7. **Número do projeto:** menu ☰ › **Visão geral do Cloud** (ou ⚙ Configurações do projeto). Copie o **Número do projeto** (só algarismos).

## Parte 4 · Mandar os 3 valores para o Claude

Cole no chat com o Claude:
- o **ID do cliente**,
- a **chave de API**,
- o **número do projeto**.

Esses três valores **não são senhas**: eles aparecem no navegador de qualquer forma e só funcionam no endereço do seu site. O Claude coloca no arquivo `src/config.ts` e publica uma versão nova.

## Parte 5 · Primeiro acesso com seus dados — *depois que o Claude confirmar a Parte 4*

1. Abra o app pelo ícone › **Ajustes** › **Entrar com Google**.
2. O Google vai mostrar avisos. É normal:
   - **"O Google não verificou este app"**: normal em modo Teste, porque o app é só seu. Toque em **Avançado** › **Acessar Finanças do Casal (não seguro)**.
   - **"Finanças do Casal quer acessar sua Conta do Google"**: o app só enxerga os arquivos que ele mesmo criar ou que você escolher. Toque em **Continuar**.
3. Assistente de 3 passos (cada um abre o seletor do Google Drive):
   1. Escolha a **pasta da área Finanças** do seu sistema PARA. O app cria ali a planilha `Finanças do Casal — Base` e a pasta `Faturas e extratos`.
   2. Escolha a **pasta de Entrada** do PARA (pode pular e fazer depois).
   3. Escolha a **planilha-índice** do segundo cérebro (pode pular e fazer depois).
   - Se a planilha base já existir, toque em **"Já tenho a planilha base"** e escolha-a.
4. Avise o Claude no chat que a planilha foi criada, para ele fazer a carga inicial (contas, categorias, fixos, dívidas).

---

### Se algo der errado
- **"Erro 400: redirect_uri_mismatch" ou "origin not allowed"**: confira a origem do passo 3.5 (`https://rpah-source.github.io`, sem barra no final).
- **"Acesso bloqueado: app não concluiu a verificação"**: seu e-mail não está na lista de usuários de teste (passo 3.4).
- **Site não abre (erro 404)**: confira a Parte 1 e espere alguns minutos depois da publicação.
- Mande um print para o Claude: ele explica o que fazer.
