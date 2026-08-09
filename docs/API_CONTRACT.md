# Contrato da API Memora

Este contrato mantém a mesma estrutura de endpoints observada no Memora original, com a adição recomendada do token Firebase no cabeçalho `Authorization`.

Base sugerida: `https://api.seudominio.com`

## Autenticação

Quando o usuário estiver logado, o frontend envia:

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

O servidor deve validar o token usando Firebase Admin.

## Criar álbum

`POST /api/albums`

```json
{
  "title": "Álbum Teste",
  "description": "Mensagem para os convidados"
}
```

Resposta `201`:

```json
{
  "album": {
    "slug": "4672781edfbe9844",
    "title": "Álbum Teste",
    "description": "Mensagem para os convidados",
    "allowDownload": true,
    "createdAt": "2026-08-08T03:43:40Z"
  },
  "ownerToken": "TOKEN_PRIVADO_DO_PROPRIETARIO"
}
```

## Carregar álbum

Convidado:

`GET /api/albums/:slug`

Proprietário:

`GET /api/albums/:slug?owner=:ownerToken`

Resposta:

```json
{
  "album": {
    "slug": "...",
    "title": "...",
    "description": "...",
    "allowDownload": true,
    "createdAt": "..."
  },
  "media": [],
  "viewerIsOwner": true
}
```

Cada mídia:

```json
{
  "id": "uuid",
  "name": "foto.jpg",
  "mimeType": "image/jpeg",
  "sizeBytes": 47435,
  "uploaderName": "Andrew",
  "createdAt": "2026-08-08T03:45:13Z",
  "kind": "image",
  "url": "/api/media/uuid/file"
}
```

`kind` pode ser `image` ou `video`.

## Upload

`POST /api/albums/:slug/media`

`multipart/form-data`:

- `file`: arquivo original;
- `uploaderName`: nome de quem enviou.

Resposta `201`:

```json
{
  "media": {
    "id": "uuid",
    "name": "foto.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": 47435,
    "uploaderName": "Andrew",
    "createdAt": "2026-08-08T03:45:13Z",
    "kind": "image",
    "url": "/api/media/uuid/file",
    "thumbnailUrl": "/api/media/uuid/thumbnail",
    "previewStatus": "ready"
  }
}
```


## Miniatura / preview

`GET /api/media/:id/thumbnail`

A API retorna este endereço em `thumbnailUrl` somente quando `previewStatus` for `ready`.

Estados possíveis:

- `pending`: aguardando processamento;
- `processing`: FFmpeg gerando a miniatura;
- `ready`: miniatura pronta;
- `error`: houve falha no processamento.

A galeria deve carregar `thumbnailUrl` e deixar o arquivo original para o visualizador/download.

## Servir foto/vídeo

`GET /api/media/:id/file`

Para download:

`GET /api/media/:id/file?download=1`

Para vídeos, o servidor deve responder corretamente a `Range` / `Accept-Ranges: bytes`, permitindo reprodução e avanço no player.

## Remover mídia

`DELETE /api/media/:id?owner=:ownerToken`

Somente o proprietário deve poder remover.

## CORS

A API precisa permitir o domínio público do Memora, métodos `GET, POST, DELETE, OPTIONS` e cabeçalhos `Authorization, Content-Type`.

## Segurança recomendada

O `ownerToken` não substitui o Firebase. Na implementação final, o ideal é vincular o álbum ao `uid` do Firebase no banco e usar o token privado apenas como compatibilidade/convite administrativo. Nunca exponha caminhos reais do disco do servidor ao navegador.
