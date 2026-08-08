# Firebase no GuiaSys Memora

O frontend usa **Firebase Authentication**. As fotos e vídeos não serão armazenados no Firebase.

## Provedores usados

- Google;
- E-mail e senha.

Para e-mail/senha funcionar, habilite o provedor **Email/Senha** em `Authentication > Sign-in method` no Firebase Console.

O domínio oficial do site é `https://memora.guiasys.online` e deve permanecer na lista de domínios autorizados do Firebase Authentication.

## O que fica no frontend

A configuração pública do aplicativo Web (`apiKey`, `authDomain`, `projectId`, `appId` etc.) fica em `js/firebase-config.js`.

## O que NÃO deve ir para o GitHub

- JSON de conta de serviço Firebase Admin;
- chave privada;
- senha do PostgreSQL;
- `.env` do servidor;
- qualquer secret do backend.

## Fluxo previsto

1. O usuário entra com Google ou e-mail/senha.
2. O Firebase gera um ID Token.
3. O frontend inclui esse token nas chamadas para a API própria.
4. O Memora Server valida o token com Firebase Admin.
5. A API autoriza a operação.
6. Metadados vão para PostgreSQL e fotos/vídeos vão para o disco do servidor.
