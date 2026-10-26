# 16 — Distribuição pública (código privado)

O código-fonte do Ascend fica neste repositório **privado**. O público só acessa:

| O quê | Onde | Como chega lá |
|---|---|---|
| Site de apresentação | https://dracon-46.github.io/ascend/ | workflow `Site` publica o build de `apps/site` no branch `gh-pages` de [`Dracon-46/ascend`](https://github.com/Dracon-46/ascend) |
| APK Android | https://github.com/Dracon-46/ascend/releases (download direto: [`Ascend.apk`](https://github.com/Dracon-46/ascend/releases/latest/download/Ascend.apk)) | workflow `Android` cria a release `vX.Y.Z` no repositório público e anexa `Ascend-vX.Y.Z.apk` e a cópia fixa `Ascend.apk` |
| App web/PWA | https://falkyria-ascend.onrender.com | Render, a partir da `main` deste repositório |

Nada de código vai para o repositório público: o site sai compilado e sem source maps (o workflow recusa o build se encontrar `.map`, `.ts` ou `.tsx`), e as releases públicas levam só o APK e notas de instalação. As notas internas (CHANGELOG) ficam nas releases privadas.

O JavaScript que roda no navegador é sempre baixável pelo visitante, em forma minificada. Isso vale para qualquer site. As regras do jogo, a API, o banco e as integrações ficam só no servidor.

## Configuração (uma vez)

1. **Repositório público** `Dracon-46/ascend`, criado com um README (precisa ter ao menos um commit).
2. **Token fine-grained** (GitHub → Settings → Developer settings → Fine-grained tokens): acesso **só** ao repositório `Dracon-46/ascend`, permissão **Contents: Read and write**. Validade de até 1 ano; anote para renovar.
3. **Segredo** `ASCEND_DIST_TOKEN` neste repositório privado (Settings → Secrets and variables → Actions) com esse token.
4. Opcional: variável `ASCEND_DIST_REPO` para usar outro repositório público (padrão `Dracon-46/ascend`).
5. Depois da primeira publicação, no repositório público: **Settings → Pages → Source: Deploy from a branch → `gh-pages` / `(root)`**.
6. Por último, torne este repositório privado (Settings → General → Danger Zone → Change visibility).

## Republicar

- Site: **Actions → Site → Run workflow** (na `main`).
- APK de uma versão: **Actions → Android → Run workflow** informando a tag (ex.: `v0.4.3`).
