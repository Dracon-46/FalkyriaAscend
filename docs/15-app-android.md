# 15 — App Android

O app Android (`apps/mobile`) é uma casca nativa feita com [Capacitor](https://capacitorjs.com): abre a interface publicada do Ascend num WebView, com ícone, nome e tela de abertura próprios, e mostra uma tela local quando não há conexão.

```
APK (Capacitor) ──HTTPS──▶ https://<seu serviço no Render>  (mesma interface e mesma API do navegador)
       └── sem conexão → www/offline.html (local)
```

## Por que esse formato

- **Uma interface só.** O app usa exatamente a interface publicada; toda release do servidor já chega ao celular, sem reinstalar o APK.
- **Sessão segura sem mudanças na API.** A interface e a API ficam na mesma origem, então o cookie `httpOnly` + `SameSite=Lax` e a proteção CSRF continuam valendo como no navegador.
- **Regras só no servidor.** O app não calcula XP nem saldo; tudo vem da API, como na web.

Alternativa futura: para publicar na Play Store, uma *Trusted Web Activity* (Bubblewrap) com `assetlinks.json` é o caminho recomendado pelo Google para PWAs.

## Instalar

1. Baixe `Ascend-vX.Y.Z.apk` na [última release](https://github.com/Dracon-46/Sistema-Gameficado/releases/latest).
2. No Android, permita **Instalar apps desconhecidos** para o navegador ou gerenciador de arquivos.
3. Abra o APK e instale. Novas versões assinadas com a mesma chave atualizam por cima, sem perder o login.

O app precisa que o servidor esteja publicado (ver [14 — Deploy](14-deploy.md)). Sem ele, abre a tela "Sem conexão com o reino".

## Configuração

| Item | Onde | Padrão |
|---|---|---|
| URL aberta pelo app | Variável do repositório `ASCEND_APP_URL` (Settings → Secrets and variables → Actions → Variables) ou variável de ambiente no build local | `https://falkyria-ascend.onrender.com` |
| Pacote | `apps/mobile/scripts/prepare-www.mjs` | `com.falkyria.ascend` |
| Versão | `package.json` (a mesma do monorepo) | `versionCode` = `MMmmpp` (ex.: 0.3.0 → 300) |

A URL precisa ser `https`. Se o Render der outro endereço ao serviço (por exemplo, com sufixo), configure `ASCEND_APP_URL` antes da próxima release.

## Assinatura

Releases assinadas com a mesma chave são necessárias para atualizar o app sem desinstalar. A chave **nunca** entra no repositório; a CI a recebe por segredos (Settings → Secrets and variables → Actions → Secrets):

| Segredo | Conteúdo |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | o arquivo `.jks` em base64 (`base64 -w0 ascend-release.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | senha do keystore |
| `ANDROID_KEY_ALIAS` | alias da chave (`ascend`) |
| `ANDROID_KEY_PASSWORD` | senha da chave |

Sem os segredos, a release recebe um APK de **debug** (`-debug.apk`), que instala mas não atualiza uma versão assinada. Guarde o `.jks` e as senhas num gerenciador de senhas: **perder a chave impede atualizar o app** sem desinstalar.

Para criar uma chave nova:

```bash
keytool -genkeypair -v -keystore ascend-release.jks -alias ascend -keyalg RSA -keysize 4096 -validity 10000
```

## Pipeline

- **CI:** todo PR compila o APK de debug (job *App Android*).
- **Release:** depois que a tag `vX.Y.Z` é publicada, o workflow `Android` gera o APK e o anexa à release. Ele também pode ser disparado à mão (Actions → Android → Run workflow, informando a tag).

## Desenvolvimento

Pré-requisitos: JDK 21 e Android SDK (platform 36). O Android Studio instala os dois.

```bash
npm install
npm run apk:debug -w @rpg/mobile          # gera apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
ASCEND_APP_URL=https://meu-servidor.exemplo npm run sync -w @rpg/mobile   # aponta para outro servidor
npm run icons -w @rpg/mobile              # regera ícones e splash a partir de apps/web/public/icons/icon.svg
```

`npm run sync` gera `capacitor.config.json` e `www/` (ambos fora do git) e copia tudo para o projeto Android. Para abrir no Android Studio: `npx cap open android` dentro de `apps/mobile`.

## Limitações conhecidas

- Não foi testado num aparelho físico pela CI; teste cada release instalando o APK.
- Login com o Strava abre o navegador do sistema (outro domínio), então a conexão com o Strava deve ser feita pela versão web.
- Não há notificações push nativas (ver roadmap).
