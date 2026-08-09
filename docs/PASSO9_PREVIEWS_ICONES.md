# Passo 9 — WEB: previews, ícones e identidade

- A galeria prioriza `thumbnailUrl` retornada pelo Memora Server.
- Enquanto a miniatura é processada, aparece um placeholder leve.
- O WEB consulta novamente o álbum enquanto houver previews `pending` ou `processing`.
- Vídeos não são mais carregados inteiros dentro da grade da galeria.
- O original só é carregado quando o usuário abre o visualizador.
- Google Material Symbols Rounded ficam locais em `assets/icons/`.
- Os SVGs usam `currentColor` e são aplicados por CSS mask, permitindo mudar a cor pelo CSS.
- A identidade fornecida pelo proprietário fica em `assets/brand/`.
- O favicon fornecido substitui o favicon antigo.
- O visualizador ganhou navegação anterior/próximo e ações com ícones.
