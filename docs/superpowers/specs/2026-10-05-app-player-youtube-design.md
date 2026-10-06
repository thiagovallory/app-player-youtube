# App Player YouTube Multi-Monitor — Design

Data: 2026-10-05

## Objetivo

App desktop (Electron) para carregar um vídeo ou playlist do YouTube e, ao clicar em play, reproduzir em um monitor secundário/terciário, controlado a partir de uma janela de controle na tela principal.

## Decisões

- Formato: app desktop Electron (TypeScript, Vite).
- Fluxo: janela de controle + janela player separada.
- Reprodução: YouTube IFrame API (oficial).

## Arquitetura

Três partes: main process, renderer de controle, renderer de player.

### Main process
- Cria a janela de controle na tela principal.
- Cria a janela player sem borda, em tela cheia, no display escolhido (`screen.getAllDisplays()`, `setBounds` com os bounds do display).
- Move/recria o player ao trocar de monitor.
- Escuta eventos `display-added` / `display-removed` / `display-metrics-changed`.
- Faz a ponte de IPC entre as duas janelas.

### Renderer de controle
- Campo de URL (vídeo ou playlist).
- Lista de monitores (rótulo + resolução) e botão "identificar" que exibe o número do monitor em cada tela por alguns segundos.
- Controles: play/pause, anterior/próximo, volume, seek.
- Exibe título atual e estado.

### Renderer de player
- Apenas o player YouTube (IFrame API) ocupando a tela, fundo preto.
- Recebe comandos do main; reporta estado (título, tempo, duração, estado do player, erros) de volta.

### IPC e segurança
- `contextBridge` no preload expondo API mínima e tipada.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Canais: `player:command` (controle → main → player), `player:state` (player → main → controle), `displays:list`, `displays:select`, `displays:identify`.

## Dados

- Parser de URL: aceita `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/playlist?list=`, `youtube.com/shorts/`, e URLs com `v` e `list` juntos. Retorna `{ type: 'video' | 'playlist', id, listId? }` ou erro.
- Persistência (`electron-store`): último monitor escolhido (por id/posição do display), volume, histórico recente de URLs.

## Tratamento de erros

- URL inválida: mensagem inline no controle.
- Embed bloqueado (erros 101/150): aviso no controle; em playlist, avança para o próximo item.
- Vídeo indisponível/removido (erros 100/5): aviso e avanço em playlist.
- Monitor removido durante reprodução: player volta para a tela principal e o controle avisa.
- Apenas um monitor disponível: o app funciona, player abre em janela comum na tela única, com aviso.

## Testes

- Unitários: parser de URL; seleção/matching de display salvo contra displays atuais.
- Manual (multi-monitor real): play envia ao monitor correto, troca de monitor com vídeo tocando, desconectar monitor, playlist com item bloqueado.

## Fora de escopo

Busca no YouTube, login/conta, download, bloqueio de anúncios, múltiplos players simultâneos.

## Riscos

- Anúncios do YouTube aparecem (limite da IFrame API).
- Alguns vídeos bloqueiam embed; mitigado com aviso + pular.
- Fullscreen em macOS Spaces pode se comportar diferente por monitor; validar manualmente (usar `simpleFullScreen` ou janela sem borda com bounds do display).
