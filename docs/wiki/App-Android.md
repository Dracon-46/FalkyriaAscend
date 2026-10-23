# App Android

O Ascend tem um app Android que abre a mesma interface da versão web, com ícone, tela de abertura e uma tela própria quando não há internet. Seu progresso é o mesmo nos dois: tudo fica no servidor.

## Instalar

1. Baixe o arquivo `Ascend-vX.Y.Z.apk` na [última release](https://github.com/Dracon-46/FalkyriaAscend/releases/latest).
2. Abra o arquivo no celular. Se o Android pedir, permita **Instalar apps desconhecidos** para o navegador ou o gerenciador de arquivos.
3. Toque em **Instalar** e abra o Ascend. Entre com a mesma conta da versão web.

## Atualizar

Instale o APK da versão nova por cima da antiga: o login e o progresso continuam. Se a release trouxer um arquivo terminado em `-debug.apk`, ele não atualiza por cima de uma versão assinada; nesse caso, desinstale a anterior antes.

## Sem internet

O app precisa de conexão para registrar atividades e mostrar o progresso, porque as regras do jogo rodam só no servidor. Sem internet, ele mostra a tela **Sem conexão com o reino**; toque em **Tentar de novo** quando a conexão voltar.

## Perguntas

**O app é diferente da versão web?**
Não. É a mesma interface; toda melhoria publicada no servidor aparece no app sem precisar reinstalar.

**Tem na Play Store?**
Ainda não. Por enquanto a instalação é pelo APK das releases.

**E no iPhone?**
Use o PWA: abra o endereço do Ascend no Safari e escolha **Adicionar à Tela de Início**.

Detalhes técnicos (assinatura, CI e configuração): [docs/15-app-android.md](https://github.com/Dracon-46/FalkyriaAscend/blob/main/docs/15-app-android.md).
