<p align="center"><img src="assets/icon.svg" alt="Logo do Player YouTube" width="128" height="128"></p>

# App Player YouTube

Toca vídeo/playlist do YouTube em um monitor secundário, controlado por uma janela na tela principal.

## Baixar

[![Baixar a última versão](https://img.shields.io/github/v/release/thiagovallory/app-player-youtube?label=%C3%BAltima%20vers%C3%A3o&style=for-the-badge)](https://github.com/thiagovallory/app-player-youtube/releases/latest)

Clique no arquivo do seu sistema (versão mais recente; o número da versão vai no nome do arquivo). Todas as versões ficam em [Releases](https://github.com/thiagovallory/app-player-youtube/releases).

<!-- downloads:start -->
| Sistema | Como usar | Download |
|---|---|---|
| macOS (Apple Silicon: M1, M2, M3…) | Instalar (abra o `.dmg` e arraste para Aplicativos) | [Player-YouTube-0.1.5-mac-arm64.dmg](https://github.com/thiagovallory/app-player-youtube/releases/download/v0.1.5/Player-YouTube-0.1.5-mac-arm64.dmg) |
| macOS (Intel) | Instalar (abra o `.dmg` e arraste para Aplicativos) | [Player-YouTube-0.1.5-mac-x64.dmg](https://github.com/thiagovallory/app-player-youtube/releases/download/v0.1.5/Player-YouTube-0.1.5-mac-x64.dmg) |
| macOS (Apple Silicon: M1, M2, M3…) | Executar (descompacte o `.zip`) | [Player-YouTube-0.1.5-mac-arm64.zip](https://github.com/thiagovallory/app-player-youtube/releases/download/v0.1.5/Player-YouTube-0.1.5-mac-arm64.zip) |
| macOS (Intel) | Executar (descompacte o `.zip`) | [Player-YouTube-0.1.5-mac-x64.zip](https://github.com/thiagovallory/app-player-youtube/releases/download/v0.1.5/Player-YouTube-0.1.5-mac-x64.zip) |
| Windows 10/11 (64 bits) | Instalar | [Player-YouTube-0.1.5-win-x64-setup.exe](https://github.com/thiagovallory/app-player-youtube/releases/download/v0.1.5/Player-YouTube-0.1.5-win-x64-setup.exe) |
| Windows 10/11 (64 bits) | Executar, sem instalar | [Player-YouTube-0.1.5-win-x64-portable.exe](https://github.com/thiagovallory/app-player-youtube/releases/download/v0.1.5/Player-YouTube-0.1.5-win-x64-portable.exe) |
| Windows 10/11 (ARM) | Instalar | [Player-YouTube-0.1.5-win-arm64-setup.exe](https://github.com/thiagovallory/app-player-youtube/releases/download/v0.1.5/Player-YouTube-0.1.5-win-arm64-setup.exe) |
| Windows 7 / 8 / 8.1 (64 bits) | Instalar (versão "legado") | [Player-YouTube-0.1.5-win7-x64-setup.exe](https://github.com/thiagovallory/app-player-youtube/releases/download/v0.1.5/Player-YouTube-0.1.5-win7-x64-setup.exe) |
| Windows 7 / 8 / 8.1 (32 bits) | Instalar (versão "legado") | [Player-YouTube-0.1.5-win7-ia32-setup.exe](https://github.com/thiagovallory/app-player-youtube/releases/download/v0.1.5/Player-YouTube-0.1.5-win7-ia32-setup.exe) |
<!-- downloads:end -->

Os apps não têm assinatura paga, então na primeira abertura o macOS e o Windows mostram um aviso de segurança: veja [Gerar executáveis](#gerar-executáveis) para saber como liberar. As versões "legado" usam o Electron 22 (sem correções de segurança): use-as só em Windows que não rodam as versões normais.

## Rodar

```bash
npm install
npm run dev        # desenvolvimento
npm run build && npm run preview   # build de produção local
npm test           # testes unitários
```

## Uso

1. Cole o link de um vídeo ou playlist e clique em **Adicionar à fila** (ou Enter). Adicionar não toca sozinho: se a fila estava vazia, o primeiro item fica apenas selecionado. Para tocar, use **Tocar agora** (substitui a fila inteira pelo link e toca), o botão ▶ ou clique no título de um item da fila. Se o vídeo já estiver na fila, o app pede confirmação antes de adicionar de novo.
2. Playlists entram com todos os vídeos (até 200); os títulos aparecem aos poucos.
3. Na fila: arraste para reordenar, ✕ remove, clique no título para tocar aquele item, **Limpar** esvazia. Clique com o botão direito num item (ou use a tecla de menu de contexto / Shift+F10) para **Copiar link do vídeo**.
4. O menu **☰** (canto superior esquerdo) abre em tela cheia sobre a janela de controle; feche com o botão **✕**, com Esc ou ao escolher Adicionar/Substituir numa fila salva. Ele reúne quatro blocos:
   - **Monitor**: escolha o monitor de reprodução (**Identificar** mostra o número em cada tela).
   - **Salvar fila**: guarda a fila atual com um nome.
   - **Filas salvas**: **Adicionar** acrescenta os itens ao fim da fila atual (sem tocar), **Substituir** troca a fila atual, seleciona o primeiro item e para o player (sem tocar) e **Excluir** apaga a fila salva. A fila ativa não é restaurada ao abrir o app.
   - **Reprodução e aparência**: **Mostrar legendas** (desligado por padrão), **Idioma das legendas (original)** (Automático usa o idioma do sistema, ou escolha um idioma da lista; os idiomas do vídeo atual aparecem na lista). As legendas automáticas do YouTube também funcionam: o idioma escolhido é pedido mesmo quando o vídeo não lista faixas, **Traduzir legendas para** ("Não traduzir" por padrão; escolha um idioma para o YouTube traduzir as legendas: o original continua sendo o de "Idioma das legendas", por exemplo vídeo em português com tradução para Inglês), **Velocidade** (0,25× a 2×) e **Tema** (Automático segue o claro/escuro do computador, ou escolha Claro/Escuro). As escolhas ficam salvas para as próximas vezes.
5. Use play/pause, anterior/próximo, seek e volume. **Parar** fecha o player e mantém a fila. O botão "Mais vídeos" e a logo do YouTube que aparecem sobre o vídeo são ocultados, e a janela do player não responde a cliques.
6. **Modo compacto**: o botão no canto do cartão "tocando agora" reduz a janela de controle a só esse cartão (título, status, posição e a linha de controles: parar, anterior, play/pause, próximo e volume). Clique de novo (**Expandir**) para voltar ao tamanho normal. O app sempre abre no modo normal. Quando a janela é larga, os controles ficam centralizados (o volume tem largura limitada), nos dois modos.
7. **Menu do app**: no Windows e no Linux o app não tem barra de menu. No macOS a barra do sistema não pode ser escondida, então o menu foi reduzido ao mínimo (app, Editar e Janela). Em desenvolvimento (`npm run dev`) o menu padrão, com as ferramentas de desenvolvedor, continua disponível.

## Gerar executáveis

Os arquivos saem em `dist/` (fora do git).

```bash
npm run dist:mac   # macOS: .dmg (instalador) e .zip com o Player YouTube.app (arm64 e x64)
npm run dist:win   # Windows 10/11: instaladores x64 e arm64 + .exe portátil x64
npm run dist:win-legacy   # Windows 7/8/8.1 (e 10/11 de 32 bits): instaladores x64 e 32 bits (Electron 22)
```

- **macOS:** há dois formatos. O `.zip` é para executar sem instalar (descompacte e abra o app). O `.dmg` é para instalar: abra-o e arraste o **Player YouTube** para a pasta **Aplicativos**. O app não é assinado com certificado de desenvolvedor (só assinatura ad-hoc), então na primeira vez o macOS bloqueia. Para liberar (escolha um):
  - **Terminal (mais simples):** `xattr -dr com.apple.quarantine "/caminho/para/Player YouTube.app"` (arraste o app para a janela do Terminal para preencher o caminho). Rode o comando **depois** de descompactar e **no app que você vai abrir**; se descompactar de novo, a marca volta. Se der "Operation not permitted", dê permissão ao Terminal em Ajustes do Sistema > Privacidade e Segurança > Gerenciamento de Apps (ou Acesso Total ao Disco).
  - **Ajustes do Sistema (macOS 15 Sequoia ou mais novo):** tente abrir o app, clique em "Concluído"/"OK", vá em Ajustes do Sistema > Privacidade e Segurança, role até "Segurança" e clique em **Abrir Mesmo Assim**.
  - **macOS 14 ou mais antigo:** botão direito no app > Abrir > Abrir.
- **Windows (Windows 10 ou 11):**
  - `...-win-x64-setup.exe`: instalador para PCs comuns (64 bits). Instala só para o usuário, sem pedir administrador, e cria atalhos e desinstalador.
  - `...-win-arm64-setup.exe`: instalador para Windows no ARM.
  - `...-win-x64-portable.exe`: roda direto, sem instalar (abre mais devagar, pois se descompacta a cada abertura).
  - O SmartScreen mostra "O Windows protegeu seu PC": clique em "Mais informações" > "Executar assim mesmo".
  - Windows de 32 bits não é suportado por esta versão (o Electron 44 não publica essa versão).
- **Windows 7, 8, 8.1 e Windows de 32 bits (versão "legado"):** `...-win7-x64-setup.exe` e `...-win7-ia32-setup.exe` (Electron 22, o último com esse suporte). Eles também funcionam no Windows 10/11, mas use os instaladores normais lá. Limitações: o Electron 22 não recebe mais correções de segurança e o Chromium dele é antigo, então o YouTube pode deixar de funcionar nele a qualquer momento. No Windows 7 instale antes as atualizações do sistema (SP1 e as de segurança). Esses instaladores foram verificados no Electron 22 (macOS) e não em um Windows 7/8 real.
- Sem certificado pago não há assinatura nem notarização; o app funciona igual depois dos avisos da primeira abertura. O build do Windows também pode ser gerado neste Mac.

### Publicar uma versão

Suba o `version` do `package.json` e envie uma tag `vX.Y.Z` (por exemplo `v0.1.5`). O GitHub Actions roda os testes, gera os instaladores do Mac e do Windows (com a versão no nome do arquivo), publica a Release e atualiza automaticamente a tabela de downloads deste README (um commit `docs: update download links`). Depois de uma release, rode `git pull` antes de continuar trabalhando no `main`.

## Limitações

- Anúncios do YouTube aparecem (limite da IFrame API).
- Alguns vídeos bloqueiam reprodução embutida; o app avisa e, em playlist, pula para o próximo.

## Licença

Uso **não comercial**: você pode usar, copiar e modificar o app livremente, mas **não pode vender**. Licença [PolyForm Noncommercial 1.0.0](LICENSE) (o código é público, mas não é "open source" no sentido da OSI).
