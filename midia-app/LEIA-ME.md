# Telas e animações do Ampara para o site

Geradas a partir do código do app (`mobile/`), rodando o app de verdade no navegador
em tamanho de iPhone (390 × 844). **Os dados são de demonstração**: usuária "Juliana",
contatos com telefones fictícios (+55 11 90000-000X), rotina, histórico e mapa de calor
inventados. O fundo dos mapas também é uma ilustração (não é o mapa real de São Paulo).
Nada saiu do banco real.

## Pastas

- `telas/` — capturas da tela inteira, 1170 × 2532 (PNG e WebP). Encaixam direto no
  `.phone-frame` que o site já tem (`object-fit: cover` corta só um pouquinho em cima/embaixo).
- `telas-com-moldura/` — as mesmas telas dentro de um celular azul-marinho, fundo transparente.
- `composicao-3-telas.png/.webp` — Mapa + Proteção + Lia lado a lado, fundo transparente.
- `animacoes/` — vídeos só da tela (780 × 1688, MP4, sem som, ~10–17 s) + pôster JPG:
  - `alerta.mp4` — movimento brusco → "Confirma bem-estar?" com contagem → "Estou bem — Cancelar"
  - `sos.mp4` — segurar o SOS por 3 s → "Alerta Enviado" com a localização
  - `lia.mp4` — duas perguntas para a Lia e as respostas
  - `tour.mp4` — Proteção → Mapa → Dashboard → Perfil → Minha rotina
- `animacoes-com-moldura/` — os mesmos vídeos dentro do celular, 1080 × 1350 em fundo creme
  (servem também para Instagram/LinkedIn).

## Como trocar a imagem do hero por um vídeo

No `site/src/pages/index.astro`, troque o `<img src="/app.png" …>` dentro do `.phone-frame` por:

```html
<video src="/animacoes/alerta.mp4" poster="/animacoes/alerta-poster.jpg"
       autoplay muted loop playsinline preload="metadata"
       aria-label="Demonstração do Ampara: o app pergunta se a usuária está bem antes de avisar os contatos"></video>
```

e acrescente no CSS:

```css
.phone-frame video{width:100%;height:100%;display:block;object-fit:cover;border-radius:23px}
```

(copie a pasta `animacoes/` para `site/public/animacoes/`.)
